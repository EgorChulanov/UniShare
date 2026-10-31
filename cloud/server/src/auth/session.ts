import { createHmac, randomBytes } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { ClientPlatform } from "@unishare/shared";
import { config } from "../config";
import { query, queryOne, type Queryable } from "../db";
import { unauthorized } from "../lib/errors";

/** Tokens are random; only their keyed hash is stored. */
export function hashToken(token: string): string {
  return createHmac("sha256", config.sessionSecret).update(token).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export async function createSession(userId: string, client: ClientPlatform, db?: Queryable): Promise<string> {
  const token = randomToken();
  await query(
    `insert into sessions (user_id, token_hash, client, expires_at)
     values ($1, $2, $3, now() + make_interval(days => $4))`,
    [userId, hashToken(token), client, config.sessionDays],
    db,
  );
  return token;
}

export interface SessionInfo {
  userId: string;
  sessionId: string;
  client: ClientPlatform;
}

const touchCache = new Map<string, number>();

export async function resolveSession(token: string | null | undefined): Promise<SessionInfo | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const row = await queryOne<{ id: string; user_id: string; client: ClientPlatform; account_state: string }>(
    `select s.id, s.user_id, s.client, u.account_state
     from sessions s join users u on u.uid = s.user_id
     where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token)],
  );
  if (!row || row.account_state !== "active") return null;

  // Slide the expiry at most once per hour per session.
  const last = touchCache.get(row.id) ?? 0;
  if (Date.now() - last > 3_600_000) {
    touchCache.set(row.id, Date.now());
    void query(
      `update sessions set last_used_at = now(), expires_at = now() + make_interval(days => $2) where id = $1`,
      [row.id, config.sessionDays],
    ).catch(() => undefined);
  }
  return { userId: row.user_id, sessionId: row.id, client: row.client };
}

export function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();
  return null;
}

export async function requireSession(request: FastifyRequest): Promise<SessionInfo> {
  const session = await resolveSession(bearerToken(request));
  if (!session) throw unauthorized();
  return session;
}
