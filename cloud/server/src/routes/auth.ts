import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import type { AuthResponse, ClientPlatform } from "@unishare/shared";
import { config } from "../config";
import { query, queryOne, transaction } from "../db";
import { TelegramAuthError, verifyInitData, verifyLoginWidget, type LoginWidgetPayload } from "../auth/telegram";
import { VkAuthError, verifyVkLaunchParams } from "../auth/vk";
import { createSession, hashToken, requireSession } from "../auth/session";
import { HttpError, badRequest, conflict, unauthorized } from "../lib/errors";
import { loadMyProfile } from "./me";

interface IdentityInput {
  provider: "telegram" | "vk" | "dev";
  providerUserId: string;
  username?: string | null;
  displayName?: string | null;
  photoUrl?: string | null;
  languageCode?: string | null;
  /** Only updated when known (true from Telegram allows_write_to_pm, etc.). */
  canMessage?: boolean;
}

function languageFrom(code: string | null | undefined): string {
  const value = (code ?? "").slice(0, 2).toLowerCase();
  if (value === "en" || value === "uk" || value === "be") return value;
  return "ru";
}

function cleanUrl(value: string | null | undefined): string | null {
  if (!value || value.length > 2048) return null;
  return /^https:\/\//.test(value) ? value : null;
}

async function upsertIdentity(db: PoolClient, userId: string, input: IdentityInput): Promise<void> {
  await db.query(
    `insert into user_identities (provider, provider_user_id, user_id, username, display_name, photo_url, language_code, can_message)
     values ($1, $2, $3, $4, $5, $6, $7, coalesce($8, false))
     on conflict (provider, provider_user_id) do update set
       user_id = excluded.user_id,
       username = excluded.username,
       display_name = coalesce(excluded.display_name, user_identities.display_name),
       photo_url = coalesce(excluded.photo_url, user_identities.photo_url),
       language_code = coalesce(excluded.language_code, user_identities.language_code),
       can_message = case when $8::boolean is null then user_identities.can_message else $8::boolean end`,
    [
      input.provider,
      input.providerUserId,
      userId,
      input.username ?? null,
      input.displayName?.slice(0, 120) ?? null,
      cleanUrl(input.photoUrl),
      input.languageCode ?? null,
      input.canMessage ?? null,
    ],
  );
}

/**
 * Signs in (or registers) a platform identity. With a link token the identity
 * is attached to the token owner's existing UniShare account instead.
 */
export async function signInWithIdentity(
  input: IdentityInput,
  client: ClientPlatform,
  linkToken?: string | null,
): Promise<AuthResponse> {
  const result = await transaction(async (db) => {
    const existing = (await db.query<{ user_id: string; onboarding_complete: boolean; account_state: string }>(
      `select i.user_id, u.onboarding_complete, u.account_state
       from user_identities i join users u on u.uid = i.user_id
       where i.provider = $1 and i.provider_user_id = $2
       for update of i`,
      [input.provider, input.providerUserId],
    )).rows[0];

    let userId: string;
    let isNewUser = false;
    let linked: "telegram" | "vk" | undefined;

    if (linkToken) {
      const token = (await db.query<{ user_id: string }>(
        `delete from link_tokens where token_hash = $1 and expires_at > now() returning user_id`,
        [hashToken(linkToken)],
      )).rows[0];
      if (!token) throw badRequest("The link has expired. Create a new one in Settings.", "link_expired");
      userId = token.user_id;

      if (existing && existing.user_id !== userId) {
        if (existing.onboarding_complete) {
          throw conflict("This account is already linked to another UniShare profile", "identity_taken");
        }
        // The identity only owns an empty, unfinished profile: merge it away.
        await db.query(`delete from users where uid = $1`, [existing.user_id]);
      }
      const other = (await db.query<{ provider_user_id: string }>(
        `select provider_user_id from user_identities where user_id = $1 and provider = $2`,
        [userId, input.provider],
      )).rows[0];
      if (other && other.provider_user_id !== input.providerUserId) {
        throw conflict("Another account of this platform is already linked", "provider_already_linked");
      }
      if (input.provider !== "dev") linked = input.provider;
    } else if (existing) {
      userId = existing.user_id;
    } else {
      const created = (await db.query<{ uid: string }>(
        `insert into users (language) values ($1) returning uid`,
        [languageFrom(input.languageCode)],
      )).rows[0];
      userId = created.uid;
      isNewUser = true;
    }

    const state = (await db.query<{ account_state: string }>(`select account_state from users where uid = $1`, [userId])).rows[0];
    if (!state) throw unauthorized();
    if (state.account_state !== "active") throw new HttpError(403, "This account is suspended", "account_suspended");

    await upsertIdentity(db, userId, input);
    const token = await createSession(userId, client, db);
    return { userId, token, isNewUser, linked };
  });

  const profile = await loadMyProfile(result.userId);
  return { token: result.token, profile, isNewUser: result.isNewUser, linked: result.linked };
}

function authError(error: unknown): never {
  if (error instanceof TelegramAuthError || error instanceof VkAuthError) throw new HttpError(401, error.message, "invalid_signature");
  throw error;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { initData?: string; linkToken?: string } }>("/api/auth/telegram", async (request) => {
    if (!config.telegram.botToken) throw new HttpError(503, "Telegram sign-in is not configured");
    const initData = request.body?.initData;
    if (typeof initData !== "string" || initData.length > 8192) throw badRequest("initData is required");
    let verified;
    try {
      verified = verifyInitData(initData, config.telegram.botToken, config.telegram.initDataMaxAgeSeconds);
    } catch (error) {
      authError(error);
    }
    const user = verified.user;
    return signInWithIdentity(
      {
        provider: "telegram",
        providerUserId: String(user.id),
        username: user.username ?? null,
        displayName: [user.first_name, user.last_name].filter(Boolean).join(" ") || null,
        photoUrl: user.photo_url ?? null,
        languageCode: user.language_code ?? null,
        canMessage: user.allows_write_to_pm ? true : undefined,
      },
      "telegram",
      request.body.linkToken,
    );
  });

  app.post<{ Body: { payload?: LoginWidgetPayload; linkToken?: string } }>("/api/auth/telegram-widget", async (request) => {
    if (!config.telegram.botToken) throw new HttpError(503, "Telegram sign-in is not configured");
    const payload = request.body?.payload;
    if (!payload || typeof payload !== "object") throw badRequest("payload is required");
    let user;
    try {
      user = verifyLoginWidget(payload, config.telegram.botToken);
    } catch (error) {
      authError(error);
    }
    return signInWithIdentity(
      {
        provider: "telegram",
        providerUserId: String(user.id),
        username: user.username ?? null,
        displayName: [user.first_name, user.last_name].filter(Boolean).join(" ") || null,
        photoUrl: user.photo_url ?? null,
      },
      "web",
      request.body.linkToken,
    );
  });

  app.post<{
    Body: { launchParams?: string; user?: { firstName?: string; lastName?: string; photoUrl?: string; screenName?: string }; linkToken?: string };
  }>("/api/auth/vk", async (request) => {
    if (!config.vk.appSecret) throw new HttpError(503, "VK sign-in is not configured");
    const launchParams = request.body?.launchParams;
    if (typeof launchParams !== "string" || launchParams.length > 4096) throw badRequest("launchParams are required");
    let verified;
    try {
      verified = verifyVkLaunchParams(launchParams, config.vk.appSecret, config.vk.appId);
    } catch (error) {
      authError(error);
    }
    // Name and photo come from VKWebAppGetUserInfo; they are cosmetic only.
    const info = request.body.user ?? {};
    return signInWithIdentity(
      {
        provider: "vk",
        providerUserId: String(verified.userId),
        username: typeof info.screenName === "string" ? info.screenName.slice(0, 64) : null,
        displayName: [info.firstName, info.lastName].filter((v) => typeof v === "string" && v).join(" ") || null,
        photoUrl: typeof info.photoUrl === "string" ? info.photoUrl : null,
        languageCode: verified.language,
      },
      "vk",
      request.body.linkToken,
    );
  });

  // Local development and automated tests only.
  app.post<{ Body: { name?: string; linkToken?: string } }>("/api/auth/dev", async (request) => {
    if (!config.devAuth) throw new HttpError(404, "Not found");
    const name = String(request.body?.name ?? "").trim().slice(0, 30);
    if (name.length < 3) throw badRequest("name must contain at least 3 characters");
    return signInWithIdentity(
      { provider: "dev", providerUserId: name.toLowerCase(), username: name, displayName: name },
      "web",
      request.body.linkToken,
    );
  });

  app.post("/api/auth/logout", async (request) => {
    const session = await requireSession(request);
    await query(`delete from sessions where id = $1`, [session.sessionId]);
    return { ok: true };
  });

  app.get("/api/auth/session", async (request) => {
    const session = await requireSession(request);
    const row = await queryOne<{ client: string }>(`select client from sessions where id = $1`, [session.sessionId]);
    return { userId: session.userId, client: row?.client };
  });
}
