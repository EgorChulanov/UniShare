import type { FastifyInstance } from "fastify";
import { LIMITS, REPORT_REASONS, type Story } from "@unishare/shared";
import { query, queryOne } from "../db";
import { requireSession } from "../auth/session";
import { badRequest, notFound } from "../lib/errors";
import { assertContentAllowed, assertRateLimit } from "../lib/moderation";
import { publish } from "../realtime";
import { searchGames } from "../games";

const REASON_KEYS = new Set<string>(REPORT_REASONS.map((reason) => reason.key));

export async function socialRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { subjectId?: string; reason?: string; details?: string } }>("/api/reports", async (request) => {
    const session = await requireSession(request);
    const { subjectId, reason } = request.body ?? {};
    const details = String(request.body?.details ?? "").trim().slice(0, LIMITS.reportDetailsMax);
    if (typeof subjectId !== "string" || subjectId === session.userId) throw badRequest("Invalid profile");
    if (typeof reason !== "string" || !REASON_KEYS.has(reason)) throw badRequest("Invalid reason");
    await assertRateLimit("reports", session.userId);
    const subject = await queryOne(`select 1 from users where uid = $1`, [subjectId]);
    if (!subject) throw notFound("Profile is unavailable");
    await query(
      `insert into reports (reporter_id, subject_id, reason, details) values ($1, $2, $3, $4)`,
      [session.userId, subjectId, reason, details],
    );
    return { ok: true };
  });

  app.post<{ Body: { userId?: string } }>("/api/blocks", async (request) => {
    const session = await requireSession(request);
    const userId = request.body?.userId;
    if (typeof userId !== "string" || userId === session.userId) throw badRequest("Invalid profile");
    await query(
      `insert into blocks (blocker_id, blocked_id) values ($1, $2) on conflict do nothing`,
      [session.userId, userId],
    );
    // Both sides lose the conversation and pending requests immediately.
    const chats = await query<{ id: string }>(
      `select id from chats where user_low = least($1::uuid, $2::uuid) and user_high = greatest($1::uuid, $2::uuid)`,
      [session.userId, userId],
    );
    await query(
      `delete from like_requests where (from_uid = $1 and to_uid = $2) or (from_uid = $2 and to_uid = $1)`,
      [session.userId, userId],
    );
    for (const chat of chats) {
      publish(session.userId, { type: "chat_removed", chatId: chat.id });
      publish(userId, { type: "chat_removed", chatId: chat.id });
    }
    return { ok: true };
  });

  app.post<{ Body: { toUid?: string; chatId?: string; rating?: number; text?: string } }>("/api/reviews", async (request) => {
    const session = await requireSession(request);
    const { toUid, chatId } = request.body ?? {};
    const rating = Number(request.body?.rating);
    const text = String(request.body?.text ?? "").trim().slice(0, LIMITS.reviewMax) || null;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw badRequest("Rating must be 1–5");
    if (typeof toUid !== "string" || typeof chatId !== "string" || toUid === session.userId) throw badRequest("Invalid review");
    const chat = await queryOne(
      `select 1 from chats where id = $1
         and user_low = least($2::uuid, $3::uuid) and user_high = greatest($2::uuid, $3::uuid)`,
      [chatId, session.userId, toUid],
    );
    if (!chat) throw notFound("Chat is unavailable");
    await assertContentAllowed([text]);
    await assertRateLimit("reviews", session.userId);
    await query(
      `insert into reviews (from_uid, to_uid, chat_id, rating, review_text) values ($1, $2, $3, $4, $5)
       on conflict (from_uid, to_uid, chat_id) do update set rating = excluded.rating, review_text = excluded.review_text`,
      [session.userId, toUid, chatId, rating, text],
    );
    return { ok: true };
  });

  app.get("/api/stories", async (request): Promise<Story[]> => {
    const session = await requireSession(request);
    const rows = await query<{
      id: string; title: string; subtitle: string; body: string; image_url: string | null; symbol: string;
      accent_hex: string; cta_title: string | null; cta_url: string | null; published_at: string; is_seen: boolean;
    }>(
      `select s.*, exists (select 1 from story_views v where v.story_id = s.id and v.user_id = $1) as is_seen
       from stories s, users u
       where u.uid = $1 and s.is_active and s.published_at <= now()
         and (s.expires_at is null or s.expires_at > now())
         and (s.language is null or s.language = (case when u.language in ('ru', 'uk', 'be') then 'ru' else 'en' end))
       order by s.priority desc, s.published_at desc limit 20`,
      [session.userId],
    );
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      subtitle: row.subtitle,
      body: row.body,
      imageUrl: row.image_url,
      symbol: row.symbol,
      accentHex: row.accent_hex,
      ctaTitle: row.cta_title,
      ctaUrl: row.cta_url,
      publishedAt: row.published_at,
      isSeen: row.is_seen,
    }));
  });

  app.post<{ Params: { id: string } }>("/api/stories/:id/view", async (request) => {
    const session = await requireSession(request);
    await query(
      `insert into story_views (story_id, user_id) select id, $2 from stories where id = $1
       on conflict (story_id, user_id) do update set viewed_at = now()`,
      [request.params.id, session.userId],
    ).catch(() => undefined);
    return { ok: true };
  });

  app.get<{ Querystring: { q?: string } }>("/api/games/search", async (request) => {
    await requireSession(request);
    return searchGames(String(request.query.q ?? ""));
  });
}
