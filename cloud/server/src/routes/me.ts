import type { FastifyInstance } from "fastify";
import { LIMITS, telegramAppLink, vkAppLink, type LinkTokenResponse, type MyProfile, type ProfileUpdate } from "@unishare/shared";
import { config } from "../config";
import { query, queryOne, transaction } from "../db";
import { hashToken, randomToken, requireSession } from "../auth/session";
import { badRequest, conflict, notFound } from "../lib/errors";
import { assertContentAllowed } from "../lib/moderation";
import { USER_COLUMNS, profileUpdateToColumns, toMyProfile, toProfileCard, type IdentityRow, type UserRow } from "../lib/profiles";
import { detectImage, storage } from "../lib/storage";
import { prepareProfileShare } from "../bot/telegram";

export async function loadMyProfile(userId: string): Promise<MyProfile> {
  const row = await queryOne<UserRow>(`select ${USER_COLUMNS} from users u where u.uid = $1`, [userId]);
  if (!row) throw notFound("Profile not found");
  const identities = await query<IdentityRow>(
    `select provider, provider_user_id, username, display_name, photo_url, can_message
     from user_identities where user_id = $1 order by created_at`,
    [userId],
  );
  return toMyProfile(row, identities);
}

export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/me", async (request) => {
    const session = await requireSession(request);
    return loadMyProfile(session.userId);
  });

  app.patch<{ Body: ProfileUpdate }>("/api/me", async (request) => {
    const session = await requireSession(request);
    const columns = profileUpdateToColumns(request.body ?? {});
    const current = await loadMyProfile(session.userId);

    const finishing = columns.onboarding_complete === true && !current.onboardingComplete;
    const username = (columns.username as string | undefined) ?? current.username;
    if (finishing || columns.onboarding_complete === true) {
      if (!username) throw badRequest("Choose a username first", "invalid_username");
      const platforms = (columns.platforms as string[] | undefined) ?? current.platforms;
      if (!platforms.length) throw badRequest("Select at least one platform", "platform_required");
    }
    await assertContentAllowed([
      columns.username as string | undefined,
      columns.status as string | undefined,
      columns.skills_description as string | undefined,
    ]);

    const entries = Object.entries(columns);
    if (entries.length) {
      const assignments = entries.map(([column], index) => {
        const cast = ["platform_games", "game_metadata", "subscriptions"].includes(column) ? "::jsonb" : "";
        return `${column} = $${index + 2}${cast}`;
      });
      try {
        await query(`update users set ${assignments.join(", ")} where uid = $1`, [session.userId, ...entries.map(([, value]) => value)]);
      } catch (error) {
        if ((error as { code?: string }).code === "23505") throw conflict("This username is already taken", "username_taken");
        throw error;
      }
    }
    return loadMyProfile(session.userId);
  });

  app.get<{ Querystring: { username?: string } }>("/api/me/username-available", async (request) => {
    const session = await requireSession(request);
    const username = String(request.query.username ?? "").trim();
    const row = await queryOne<{ taken: boolean }>(
      `select exists (select 1 from users where username = $1 and uid <> $2) as taken`,
      [username, session.userId],
    );
    return { available: !row?.taken };
  });

  app.post("/api/me/avatar", { bodyLimit: LIMITS.avatarBytes }, async (request) => {
    const session = await requireSession(request);
    const body = request.body;
    if (!Buffer.isBuffer(body) || body.length === 0) throw badRequest("Send the image as the request body");
    const image = detectImage(body);
    if (!image) throw badRequest("Only JPEG, PNG and WebP images are supported", "unsupported_image");
    const key = `avatars/${session.userId}-${Date.now().toString(36)}.${image.extension}`;
    await storage.put(key, body, image.contentType);

    const previous = await queryOne<{ avatar_url: string | null }>(`select avatar_url from users where uid = $1`, [session.userId]);
    const avatarUrl = storage.publicUrl(key) ?? `/media/${key}`;
    await query(`update users set avatar_url = $2 where uid = $1`, [session.userId, avatarUrl]);
    const previousKey = previous?.avatar_url?.match(/avatars\/[A-Za-z0-9_.-]+$/)?.[0];
    if (previousKey && previousKey !== key) void storage.remove([previousKey]).catch(() => undefined);
    return { avatarUrl };
  });

  app.delete("/api/me", async (request) => {
    const session = await requireSession(request);
    const chatIds = await query<{ id: string }>(
      `select id from chats where user_low = $1 or user_high = $1`,
      [session.userId],
    );
    const avatar = await queryOne<{ avatar_url: string | null }>(`select avatar_url from users where uid = $1`, [session.userId]);
    await query(`delete from users where uid = $1`, [session.userId]);
    const keys = chatIds.map((chat) => `chats/${chat.id}`);
    const avatarKey = avatar?.avatar_url?.match(/avatars\/[A-Za-z0-9_.-]+$/)?.[0];
    if (avatarKey) keys.push(avatarKey);
    void storage.remove(keys).catch(() => undefined);
    return { ok: true };
  });

  // ── Cross-platform account linking ────────────────────────────────────────

  app.post("/api/me/link-token", async (request): Promise<LinkTokenResponse> => {
    const session = await requireSession(request);
    const token = randomToken(24);
    const expires = await transaction(async (db) => {
      await db.query(`delete from link_tokens where user_id = $1 or expires_at < now()`, [session.userId]);
      const row = (await db.query<{ expires_at: string }>(
        `insert into link_tokens (token_hash, user_id, expires_at) values ($1, $2, now() + interval '15 minutes') returning expires_at`,
        [hashToken(token), session.userId],
      )).rows[0];
      return row.expires_at;
    });
    const link = { kind: "link" as const, token };
    return {
      token,
      expiresAt: expires,
      telegramUrl: config.telegram.botUsername ? telegramAppLink(config.telegram.botUsername, config.telegram.appShortName, link) : null,
      vkUrl: config.vk.appId ? vkAppLink(config.vk.appId, link) : null,
    };
  });

  app.delete<{ Params: { provider: string } }>("/api/me/identities/:provider", async (request) => {
    const session = await requireSession(request);
    const provider = request.params.provider;
    if (provider !== "telegram" && provider !== "vk") throw badRequest("Unknown provider");
    await transaction(async (db) => {
      const count = (await db.query<{ count: number }>(
        `select count(*)::int as count from user_identities where user_id = $1`,
        [session.userId],
      )).rows[0].count;
      if (count <= 1) throw badRequest("You cannot unlink the only sign-in method", "last_identity");
      await db.query(`delete from user_identities where user_id = $1 and provider = $2`, [session.userId, provider]);
    });
    return loadMyProfile(session.userId);
  });

  /** Called after Telegram.WebApp.requestWriteAccess or VKWebAppAllowMessagesFromGroup. */
  app.post<{ Body: { provider?: string; allowed?: boolean } }>("/api/me/notifications", async (request) => {
    const session = await requireSession(request);
    const provider = request.body?.provider;
    if (provider !== "telegram" && provider !== "vk") throw badRequest("Unknown provider");
    await query(
      `update user_identities set can_message = $3 where user_id = $1 and provider = $2`,
      [session.userId, provider, Boolean(request.body.allowed)],
    );
    return loadMyProfile(session.userId);
  });

  /** Prepares a Telegram inline message for WebApp.shareMessage. */
  app.post("/api/me/share/telegram", async (request) => {
    const session = await requireSession(request);
    const row = await queryOne<UserRow & { telegram_id: string | null }>(
      `select ${USER_COLUMNS}, (select provider_user_id from user_identities where user_id = u.uid and provider = 'telegram') as telegram_id
       from users u where u.uid = $1`,
      [session.userId],
    );
    if (!row?.telegram_id) return { preparedMessageId: null };
    const preparedMessageId = await prepareProfileShare(Number(row.telegram_id), toProfileCard(row), row.language);
    return { preparedMessageId };
  });
}
