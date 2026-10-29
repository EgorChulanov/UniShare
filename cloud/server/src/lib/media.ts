// Signed, expiring URLs for private chat photos (an <img> tag cannot send an
// Authorization header, so access is granted by an HMAC signature instead).
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config";

const TTL_SECONDS = 24 * 60 * 60;

function signature(path: string, expires: number): string {
  return createHmac("sha256", config.sessionSecret).update(`${path}:${expires}`).digest("base64url").slice(0, 32);
}

export function signMediaUrl(path: string | null): string | null {
  if (!path || !path.startsWith("/api/media/")) return path;
  // Round the expiry so repeated loads reuse the browser cache.
  const expires = Math.ceil(Date.now() / 1000 / 3600) * 3600 + TTL_SECONDS;
  return `${path}?exp=${expires}&sig=${signature(path, expires)}`;
}

export function verifyMediaSignature(path: string, exp: string | undefined, sig: string | undefined): boolean {
  const expires = Number(exp);
  if (!sig || !Number.isFinite(expires) || expires < Date.now() / 1000) return false;
  const expected = Buffer.from(signature(path, expires));
  const actual = Buffer.from(sig);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
