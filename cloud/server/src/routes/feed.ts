import type { FastifyInstance } from "fastify";
import { isDiscoveryKind, type DiscoveryKind, type LikeRequestItem, type ProfileCard, type Review, type SwipeResult } from "@unishare/shared";
import { query, queryOne, transaction } from "../db";
import { requireSession } from "../auth/session";
import { badRequest, notFound } from "../lib/errors";
import { assertRateLimit } from "../lib/moderation";
import { USER_COLUMNS, toProfileCard, type UserRow } from "../lib/profiles";
import { blockedPair } from "../lib/sql";
import { publish } from "../realtime";
import { notifyMatch, notifyRequest } from "../notify";
import { chatSummary, getOrCreateChat } from "./chats";

function kindParam(value: unknown): DiscoveryKind {
  if (!isDiscoveryKind(value)) throw badRequest("kind must be 'teammates' or 'skills'");
  return value;
}

export async function loadCard(uid: string): Promise<ProfileCard | null> {
  const row = await queryOne<UserRow>(`select ${USER_COLUMNS} from users u where u.uid = $1`, [uid]);
  return row ? toProfileCard(row) : null;
}

/**
 * Compatibility-ranked feed (port of get_feed_profiles): shared platforms,
 * games the candidate owns that I want (and vice versa), then activity.
 */
async function feedProfiles(me: string, kind: DiscoveryKind, limit: number, excludeIds: string[]): Promise<ProfileCard[]> {
  const rows = await query<UserRow>(
    `with mine as (select platforms, games, wanted_games from users where uid = $1)
     select ${USER_COLUMNS}
     from users u, mine m
     where u.uid <> $1
       and u.onboarding_complete
       and u.account_state = 'active'
       and ($2 = 'teammates' or u.has_skills_profile)
       and not (u.uid = any($4::uuid[]))
       and not ${blockedPair("$1", "u.uid")}
       and not exists (
         select 1 from swipe_decisions d
         where d.user_id = $1 and d.target_id = u.uid and d.context = $2
           and (d.decision = 'like' or d.updated_at >= now() - interval '30 days')
       )
       and not exists (
         select 1 from chats c
         where c.user_low = least($1::uuid, u.uid) and c.user_high = greatest($1::uuid, u.uid) and c.chat_type = $2
       )
     order by
       (cardinality(array(select unnest(u.platforms) intersect select unnest(m.platforms))) * 2
        + cardinality(array(select unnest(u.games) intersect select unnest(m.wanted_games))) * 3
        + cardinality(array(select unnest(u.wanted_games) intersect select unnest(m.games))) * 3
        + cardinality(array(select unnest(u.games) intersect select unnest(m.games)))
        + case when u.is_online then 2 else 0 end
        + case when u.avatar_url is not null then 1 else 0 end) desc,
       u.updated_at desc
     limit $3`,
    [me, kind, limit, excludeIds],
  );
  return rows.map(toProfileCard);
}

export async function feedRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { kind?: string; limit?: string; exclude?: string } }>("/api/feed", async (request) => {
    const session = await requireSession(request);
    const kind = kindParam(request.query.kind ?? "teammates");
    const limit = Math.min(Math.max(Number(request.query.limit ?? 12) || 12, 1), 30);
    const exclude = (request.query.exclude ?? "")
      .split(",")
      .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
      .slice(0, 60);
    return feedProfiles(session.userId, kind, limit, exclude);
  });

  app.post<{ Body: { targetId?: string; kind?: string; decision?: string } }>("/api/feed/swipe", async (request): Promise<SwipeResult> => {
    const session = await requireSession(request);
    const me = session.userId;
    const { targetId, decision } = request.body ?? {};
    const kind = kindParam(request.body?.kind);
    if (typeof targetId !== "string" || targetId === me) throw badRequest("Invalid profile");
    if (decision !== "like" && decision !== "dislike") throw badRequest("decision must be 'like' or 'dislike'");
    await assertRateLimit("swipes", me);

    const target = await queryOne<{ ok: boolean }>(
      `select (onboarding_complete and account_state = 'active' and not ${blockedPair("$1", "uid")}) as ok
       from users where uid = $2`,
      [me, targetId],
    );
    if (!target?.ok) throw notFound("Profile is unavailable");

    const outcome = await transaction(async (db) => {
      await db.query(
        `insert into swipe_decisions (user_id, target_id, context, decision) values ($1, $2, $3, $4)
         on conflict (user_id, target_id, context) do update set decision = excluded.decision`,
        [me, targetId, kind, decision],
      );
      if (decision === "dislike") return { matched: false, chatId: null, requested: false };

      await assertRateLimit("likes", me, db);
      await db.query(
        `insert into like_requests (from_uid, to_uid, request_type) values ($1, $2, $3)
         on conflict (from_uid, to_uid, request_type) do update set created_at = now()`,
        [me, targetId, kind],
      );
      const reverse = await db.query(
        `select 1 from like_requests where from_uid = $1 and to_uid = $2 and request_type = $3`,
        [targetId, me, kind],
      );
      if (!reverse.rowCount) return { matched: false, chatId: null, requested: true };

      const chatId = await getOrCreateChat(db, me, targetId, kind);
      await db.query(
        `delete from like_requests where request_type = $3
           and ((from_uid = $1 and to_uid = $2) or (from_uid = $2 and to_uid = $1))`,
        [me, targetId, kind],
      );
      return { matched: true, chatId, requested: false };
    });

    if (outcome.matched && outcome.chatId) {
      await announceMatch(outcome.chatId, me, targetId);
    } else if (outcome.requested) {
      const request = await loadRequest(me, targetId, kind);
      const fromCard = request?.from;
      if (request) publish(targetId, { type: "request", request });
      if (fromCard) notifyRequest(targetId, fromCard.username);
    }
    return { matched: outcome.matched, chatId: outcome.chatId };
  });

  app.post<{ Body: { targetId?: string; kind?: string } }>("/api/feed/undo", async (request) => {
    const session = await requireSession(request);
    const kind = kindParam(request.body?.kind);
    const removed = await query(
      `delete from swipe_decisions
       where user_id = $1 and target_id = $2 and context = $3 and decision = 'dislike'
         and updated_at >= now() - interval '10 minutes'
       returning 1`,
      [session.userId, request.body?.targetId, kind],
    );
    return { restored: removed.length === 1 };
  });

  app.get<{ Params: { uid: string } }>("/api/users/:uid", async (request) => {
    const session = await requireSession(request);
    const uid = request.params.uid;
    if (!/^[0-9a-f-]{36}$/i.test(uid)) throw notFound();
    const row = await queryOne<UserRow>(
      `select ${USER_COLUMNS} from users u
       where u.uid = $2 and (u.uid = $1 or (u.onboarding_complete and u.account_state = 'active' and not ${blockedPair("$1", "u.uid")}))`,
      [session.userId, uid],
    );
    if (!row) throw notFound("Profile is unavailable");
    const liked = await query<{ context: string }>(
      `select context from swipe_decisions where user_id = $1 and target_id = $2 and decision = 'like'`,
      [session.userId, uid],
    );
    return { profile: toProfileCard(row), likedKinds: liked.map((item) => item.context) };
  });

  app.get<{ Params: { uid: string } }>("/api/users/:uid/reviews", async (request): Promise<Review[]> => {
    await requireSession(request);
    const rows = await query<{ id: string; from_uid: string; username: string | null; rating: number; review_text: string | null; created_at: string }>(
      `select r.id, r.from_uid, u.username::text, r.rating, r.review_text, r.created_at
       from reviews r join users u on u.uid = r.from_uid
       where r.to_uid = $1 order by r.created_at desc limit 50`,
      [request.params.uid],
    );
    return rows.map((row) => ({
      id: row.id,
      fromUid: row.from_uid,
      fromUsername: row.username,
      rating: row.rating,
      text: row.review_text,
      createdAt: row.created_at,
    }));
  });

  // ── Incoming like requests ────────────────────────────────────────────────

  app.get("/api/requests", async (request): Promise<LikeRequestItem[]> => {
    const session = await requireSession(request);
    const rows = await query<UserRow & { request_id: string; request_type: DiscoveryKind; request_created_at: string }>(
      `select ${USER_COLUMNS}, l.id as request_id, l.request_type, l.created_at as request_created_at
       from like_requests l join users u on u.uid = l.from_uid
       where l.to_uid = $1 and u.account_state = 'active' and not ${blockedPair("$1", "u.uid")}
       order by l.created_at desc limit 100`,
      [session.userId],
    );
    return rows.map((row) => ({ id: row.request_id, kind: row.request_type, createdAt: row.request_created_at, from: toProfileCard(row) }));
  });

  app.post<{ Params: { id: string } }>("/api/requests/:id/accept", async (request) => {
    const session = await requireSession(request);
    const me = session.userId;
    const result = await transaction(async (db) => {
      const like = (await db.query<{ from_uid: string; request_type: DiscoveryKind }>(
        `select from_uid, request_type from like_requests where id = $1 and to_uid = $2 for update`,
        [request.params.id, me],
      )).rows[0];
      if (!like) throw notFound("Like request is unavailable");
      const blocked = (await db.query(`select 1 where ${blockedPair("$1", "$2")}`, [me, like.from_uid])).rowCount;
      if (blocked) throw notFound("Profile is unavailable");
      await db.query(
        `insert into swipe_decisions (user_id, target_id, context, decision) values ($1, $2, $3, 'like')
         on conflict (user_id, target_id, context) do update set decision = 'like'`,
        [me, like.from_uid, like.request_type],
      );
      const chatId = await getOrCreateChat(db, me, like.from_uid, like.request_type);
      await db.query(
        `delete from like_requests where request_type = $3
           and ((from_uid = $1 and to_uid = $2) or (from_uid = $2 and to_uid = $1))`,
        [me, like.from_uid, like.request_type],
      );
      return { chatId, partnerId: like.from_uid };
    });
    await announceMatch(result.chatId, me, result.partnerId);
    return { chatId: result.chatId };
  });

  app.delete<{ Params: { id: string } }>("/api/requests/:id", async (request) => {
    const session = await requireSession(request);
    const like = await queryOne<{ from_uid: string; request_type: string }>(
      `delete from like_requests where id = $1 and to_uid = $2 returning from_uid, request_type`,
      [request.params.id, session.userId],
    );
    if (like) {
      await query(
        `insert into swipe_decisions (user_id, target_id, context, decision) values ($1, $2, $3, 'dislike')
         on conflict (user_id, target_id, context) do update set decision = 'dislike'`,
        [session.userId, like.from_uid, like.request_type],
      );
    }
    return { ok: true };
  });
}

async function loadRequest(fromUid: string, toUid: string, kind: DiscoveryKind): Promise<LikeRequestItem | null> {
  const row = await queryOne<UserRow & { request_id: string; request_created_at: string }>(
    `select ${USER_COLUMNS}, l.id as request_id, l.created_at as request_created_at
     from like_requests l join users u on u.uid = l.from_uid
     where l.from_uid = $1 and l.to_uid = $2 and l.request_type = $3`,
    [fromUid, toUid, kind],
  );
  return row ? { id: row.request_id, kind, createdAt: row.request_created_at, from: toProfileCard(row) } : null;
}

async function announceMatch(chatId: string, me: string, partnerId: string): Promise<void> {
  const [myCard, partnerCard] = await Promise.all([loadCard(me), loadCard(partnerId)]);
  if (!myCard || !partnerCard) return;
  // The initiator already sees the result in the HTTP response; only the
  // partner needs the "It's a match!" event.
  publish(partnerId, { type: "match", chatId, partner: myCard });
  const [mine, theirs] = await Promise.all([chatSummary(chatId, me), chatSummary(chatId, partnerId)]);
  if (mine) publish(me, { type: "chat", chat: mine });
  if (theirs) publish(partnerId, { type: "chat", chat: theirs });
  // The initiator is looking at the app right now; the partner gets a bot message.
  notifyMatch(partnerId, myCard.username, chatId);
}
