import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import { LIMITS, type ChatDetails, type ChatMessage, type ChatSummary, type DirectContact, type DiscoveryKind } from "@unishare/shared";
import { query, queryOne, transaction } from "../db";
import { requireSession } from "../auth/session";
import { badRequest, notFound } from "../lib/errors";
import { signMediaUrl } from "../lib/media";
import { assertContentAllowed, assertRateLimit } from "../lib/moderation";
import { USER_COLUMNS, identityUrl, toProfileCard, type UserRow } from "../lib/profiles";
import { CHAT_PERSPECTIVE, blockedPair } from "../lib/sql";
import { detectImage, storage } from "../lib/storage";
import { onTyping, publish } from "../realtime";
import { notifyMessage } from "../notify";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getOrCreateChat(db: PoolClient, a: string, b: string, kind: DiscoveryKind): Promise<string> {
  const [low, high] = a < b ? [a, b] : [b, a];
  const row = (await db.query<{ id: string }>(
    `insert into chats (user_low, user_high, chat_type) values ($1, $2, $3)
     on conflict (user_low, user_high, chat_type) do update set hidden_for = '{}'
     returning id`,
    [low, high, kind],
  )).rows[0];
  return row.id;
}

type ChatRow = UserRow & {
  id: string;
  chat_type: DiscoveryKind;
  last_message: string;
  last_message_at: string;
  last_sender_id: string | null;
  partner_id: string;
  unread: number;
};

function toSummary(row: ChatRow): ChatSummary {
  return {
    id: row.id,
    kind: row.chat_type,
    partner: toProfileCard({ ...row, uid: row.partner_id }),
    lastMessage: row.last_message,
    lastMessageAt: row.last_message_at,
    lastSenderId: row.last_sender_id,
    unread: row.unread,
  };
}

const CHAT_SELECT = `
  select ${USER_COLUMNS}, ${CHAT_PERSPECTIVE}
  from chats c
  join users u on u.uid = case when c.user_low = $1 then c.user_high else c.user_low end
  where (c.user_low = $1 or c.user_high = $1)
    and u.account_state = 'active'
    and not ${blockedPair("$1", "u.uid")}`;

export async function chatSummary(chatId: string, userId: string): Promise<ChatSummary | null> {
  const row = await queryOne<ChatRow>(`${CHAT_SELECT} and c.id = $2`, [userId, chatId]);
  return row ? toSummary(row) : null;
}

/** Returns the partner id when the caller may use the chat. */
async function requireMembership(chatId: string, userId: string): Promise<{ partnerId: string }> {
  if (!UUID_PATTERN.test(chatId)) throw notFound("Chat is unavailable");
  const row = await queryOne<{ partner_id: string }>(
    `select case when c.user_low = $1 then c.user_high else c.user_low end as partner_id
     from chats c
     where c.id = $2 and (c.user_low = $1 or c.user_high = $1)
       and not ${blockedPair("$1", "case when c.user_low = $1 then c.user_high else c.user_low end")}`,
    [userId, chatId],
  );
  if (!row) throw notFound("Chat is unavailable");
  return { partnerId: row.partner_id };
}

function toMessage(row: { id: string; chat_id: string; sender_id: string; text: string | null; image_url: string | null; created_at: string; read_at: string | null }): ChatMessage {
  return {
    id: row.id,
    chatId: row.chat_id,
    senderId: row.sender_id,
    text: row.text,
    imageUrl: signMediaUrl(row.image_url),
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

// Relay typing indicators to the chat partner.
onTyping((userId, chatId) => {
  requireMembership(chatId, userId)
    .then(({ partnerId }) => publish(partnerId, { type: "typing", chatId, uid: userId }))
    .catch(() => undefined);
});

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/chats", async (request): Promise<ChatSummary[]> => {
    const session = await requireSession(request);
    const rows = await query<ChatRow>(
      `${CHAT_SELECT} and not ($1 = any(c.hidden_for)) order by c.last_message_at desc limit 200`,
      [session.userId],
    );
    return rows.map(toSummary);
  });

  app.get<{ Params: { id: string } }>("/api/chats/:id", async (request): Promise<ChatDetails> => {
    const session = await requireSession(request);
    await requireMembership(request.params.id, session.userId);
    const summary = await chatSummary(request.params.id, session.userId);
    if (!summary) throw notFound("Chat is unavailable");

    const reviewed = await queryOne<{ exists: boolean }>(
      `select exists (select 1 from reviews where from_uid = $1 and to_uid = $2 and chat_id = $3) as exists`,
      [session.userId, summary.partner.uid, summary.id],
    );
    const messageCount = await queryOne<{ mine: number; theirs: number }>(
      `select count(*) filter (where sender_id = $2)::int as mine, count(*) filter (where sender_id <> $2)::int as theirs
       from messages where chat_id = $1`,
      [summary.id, session.userId],
    );

    // Direct contacts are shared only by partners who opted in.
    const contacts: DirectContact[] = [];
    const partner = await queryOne<{ allow_direct_contact: boolean }>(`select allow_direct_contact from users where uid = $1`, [summary.partner.uid]);
    if (partner?.allow_direct_contact) {
      const identities = await query<{ provider: string; provider_user_id: string; username: string | null }>(
        `select provider, provider_user_id, username from user_identities where user_id = $1 and provider in ('telegram', 'vk')`,
        [summary.partner.uid],
      );
      for (const identity of identities) {
        const url = identityUrl(identity);
        if (!url) continue;
        contacts.push({
          provider: identity.provider as "telegram" | "vk",
          url,
          label: identity.provider === "telegram" ? `@${identity.username}` : "VK",
        });
      }
    }

    return {
      ...summary,
      canReview: !reviewed?.exists && (messageCount?.mine ?? 0) > 0 && (messageCount?.theirs ?? 0) > 0,
      contacts,
    };
  });

  app.get<{ Params: { id: string }; Querystring: { before?: string; limit?: string } }>("/api/chats/:id/messages", async (request) => {
    const session = await requireSession(request);
    await requireMembership(request.params.id, session.userId);
    const limit = Math.min(Math.max(Number(request.query.limit ?? 50) || 50, 1), 100);
    const before = request.query.before && !Number.isNaN(Date.parse(request.query.before)) ? request.query.before : null;
    const rows = await query<Parameters<typeof toMessage>[0]>(
      `select * from messages
       where chat_id = $1 and ($2::timestamptz is null or created_at < $2::timestamptz)
       order by created_at desc limit $3`,
      [request.params.id, before, limit],
    );
    return rows.reverse().map(toMessage);
  });

  app.post<{ Params: { id: string }; Body: { id?: string; text?: string | null; imageUrl?: string | null } }>(
    "/api/chats/:id/messages",
    async (request): Promise<ChatMessage> => {
      const session = await requireSession(request);
      const me = session.userId;
      const chatId = request.params.id;
      const { partnerId } = await requireMembership(chatId, me);

      const text = typeof request.body?.text === "string" ? request.body.text.trim() : "";
      const rawImage = typeof request.body?.imageUrl === "string" ? request.body.imageUrl.split("?")[0] : null;
      const imageUrl = rawImage && rawImage.startsWith(`/api/media/chats/${chatId}/`) ? rawImage : null;
      if (!text && !imageUrl) throw badRequest("Message content is required");
      if (text.length > LIMITS.messageMax) throw badRequest("Message is too long");
      const id = typeof request.body?.id === "string" && UUID_PATTERN.test(request.body.id) ? request.body.id : randomUUID();

      await assertContentAllowed([text]);
      await assertRateLimit("messages", me);

      const message = await transaction(async (db) => {
        const inserted = (await db.query<Parameters<typeof toMessage>[0]>(
          `insert into messages (id, chat_id, sender_id, text, image_url) values ($1, $2, $3, $4, $5)
           on conflict (id) do nothing returning *`,
          [id, chatId, me, text || null, imageUrl],
        )).rows[0];
        if (!inserted) {
          const existing = (await db.query<Parameters<typeof toMessage>[0]>(`select * from messages where id = $1 and sender_id = $2`, [id, me])).rows[0];
          if (!existing) throw badRequest("Duplicate message id");
          return { message: existing, fresh: false };
        }
        await db.query(
          `update chats set
             last_message = $2,
             last_message_at = now(),
             last_sender_id = $3,
             hidden_for = '{}',
             unread_low = case when user_low = $3 then unread_low else unread_low + 1 end,
             unread_high = case when user_high = $3 then unread_high else unread_high + 1 end
           where id = $1`,
          [chatId, text ? text.slice(0, 1000) : "📷", me],
        );
        return { message: inserted, fresh: true };
      });

      const payload = toMessage(message.message);
      if (message.fresh) {
        publish(partnerId, { type: "message", message: payload });
        publish(me, { type: "message", message: payload });
        const [mine, theirs] = await Promise.all([chatSummary(chatId, me), chatSummary(chatId, partnerId)]);
        if (mine) publish(me, { type: "chat", chat: mine });
        if (theirs) publish(partnerId, { type: "chat", chat: theirs });
        notifyMessage(partnerId, theirs?.partner.username ?? "UniShare", chatId, text || null);
      }
      return payload;
    },
  );

  app.post<{ Params: { id: string } }>("/api/chats/:id/images", { bodyLimit: LIMITS.chatImageBytes }, async (request) => {
    const session = await requireSession(request);
    const chatId = request.params.id;
    await requireMembership(chatId, session.userId);
    const body = request.body;
    if (!Buffer.isBuffer(body) || body.length === 0) throw badRequest("Send the image as the request body");
    const image = detectImage(body);
    if (!image) throw badRequest("Only JPEG, PNG and WebP images are supported", "unsupported_image");
    const key = `chats/${chatId}/${session.userId.slice(0, 8)}-${randomUUID()}.${image.extension}`;
    await storage.put(key, body, image.contentType);
    return { imageUrl: signMediaUrl(`/api/media/${key}`) };
  });

  app.post<{ Params: { id: string } }>("/api/chats/:id/read", async (request) => {
    const session = await requireSession(request);
    const me = session.userId;
    const { partnerId } = await requireMembership(request.params.id, me);
    const readAt = new Date().toISOString();
    const updated = await query(
      `update messages set read_at = $3 where chat_id = $1 and sender_id <> $2 and read_at is null returning 1`,
      [request.params.id, me, readAt],
    );
    await query(
      `update chats set
         unread_low = case when user_low = $2 then 0 else unread_low end,
         unread_high = case when user_high = $2 then 0 else unread_high end
       where id = $1`,
      [request.params.id, me],
    );
    if (updated.length) publish(partnerId, { type: "read", chatId: request.params.id, readerId: me, readAt });
    return { ok: true };
  });

  /** Hides the chat for the caller (swipe-to-delete); a new message restores it. */
  app.delete<{ Params: { id: string } }>("/api/chats/:id", async (request) => {
    const session = await requireSession(request);
    await requireMembership(request.params.id, session.userId);
    const remaining = await queryOne<{ hidden_for: string[] }>(
      `update chats set hidden_for = array(select distinct unnest(hidden_for || $2::uuid))
       where id = $1 returning hidden_for`,
      [request.params.id, session.userId],
    );
    if (remaining && remaining.hidden_for.length >= 2) {
      await query(`delete from chats where id = $1`, [request.params.id]);
      void storage.remove([`chats/${request.params.id}`]).catch(() => undefined);
    }
    publish(session.userId, { type: "chat_removed", chatId: request.params.id });
    return { ok: true };
  });
}
