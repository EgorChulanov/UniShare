// Avatars picked in the app: original UniShare presets and game art.
import type { FastifyInstance } from "fastify";
import { sanitizePickedAvatar } from "@unishare/shared";
import { query, queryOne } from "../db";
import { requireSession } from "../auth/session";
import { badRequest, notFound } from "../lib/errors";
import { SlidingWindowLimit } from "../lib/ratelimit";
import { storage } from "../lib/storage";

/** URL of an avatar file stored by POST /api/me/avatar. */
export function uploadedAvatarUrl(key: string): string {
  return storage.publicUrl(key) ?? `/media/${key}`;
}

/**
 * Storage key of a photo this server stored for this user (POST /api/me/avatar), or null.
 * Upload URLs are public, so a value that merely ends in "avatars/<file>" proves nothing:
 * the key must be in the user's own namespace and the URL exactly the one the upload issued.
 */
export function ownUploadedAvatarKey(userId: string, url: string | null | undefined): string | null {
  const key = url?.match(/avatars\/[^/]+$/)?.[0];
  if (!key?.startsWith(`avatars/${userId}-`)) return null;
  if (!/^[a-z0-9]+\.(jpg|png|webp)$/.test(key.slice(`avatars/${userId}-`.length))) return null;
  return uploadedAvatarUrl(key) === url ? key : null;
}

/**
 * Photos PATCH /api/me may set besides presets and game art: the value stored now,
 * the user's own uploads, and the photos of their linked Telegram, VK or Steam accounts.
 */
export async function ownAvatarMatcher(userId: string): Promise<(url: string) => boolean> {
  const rows = await query<{ url: string }>(
    `select avatar_url as url from users where uid = $1 and avatar_url is not null
     union
     select photo_url from user_identities where user_id = $1 and photo_url is not null`,
    [userId],
  );
  const owned = new Set(rows.map((row) => row.url));
  return (url) => owned.has(url) || ownUploadedAvatarKey(userId, url) !== null;
}

export async function avatarRoutes(app: FastifyInstance): Promise<void> {
  // Each pick is a write; generous for someone trying avatars on, tight for a script.
  const pickLimit = new SlidingWindowLimit(30, 10 * 60_000);

  // Body: { avatarUrl: "preset:<id>" | https URL of game art on an allowed host }.
  app.post<{ Body: { avatarUrl?: unknown } }>("/api/me/avatar/pick", async (request) => {
    const session = await requireSession(request);
    pickLimit.assert(session.userId);
    const avatarUrl = sanitizePickedAvatar(request.body?.avatarUrl);
    if (!avatarUrl) throw badRequest("Pick a UniShare avatar or game art", "invalid_avatar");

    // The row lock makes the old value and the new one one step, so a parallel upload
    // cannot slip in between and leave its file behind.
    const row = await queryOne<{ previous: string | null }>(
      `update users u set avatar_url = $2
       from (select uid, avatar_url from users where uid = $1 for update) previous
       where u.uid = previous.uid
       returning previous.avatar_url as previous`,
      [session.userId, avatarUrl],
    );
    if (!row) throw notFound("Profile not found");
    // The user's uploaded photo it replaces is no longer referenced (same as a new upload in routes/me.ts).
    const previousKey = ownUploadedAvatarKey(session.userId, row.previous);
    if (previousKey) void storage.remove([previousKey]).catch(() => undefined);
    return { avatarUrl };
  });
}
