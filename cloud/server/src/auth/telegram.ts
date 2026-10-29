// Verifies Telegram Mini App initData and Telegram Login Widget payloads.
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
// https://core.telegram.org/widgets/login#checking-authorization
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  is_premium?: boolean;
  allows_write_to_pm?: boolean;
}

export interface VerifiedInitData {
  user: TelegramUser;
  authDate: number;
  startParam: string | null;
  chatType: string | null;
}

export class TelegramAuthError extends Error {}

function safeEqualHex(expected: string, actual: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(actual)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual.toLowerCase(), "hex"));
}

function checkFreshness(authDate: number, maxAgeSeconds: number, now: number): void {
  if (!Number.isFinite(authDate) || authDate <= 0) throw new TelegramAuthError("Missing auth_date");
  if (maxAgeSeconds > 0 && now / 1000 - authDate > maxAgeSeconds) {
    throw new TelegramAuthError("Telegram session expired, reopen the app");
  }
}

export function verifyInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86_400,
  now = Date.now(),
): VerifiedInitData {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new TelegramAuthError("initData has no hash");

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (!safeEqualHex(expected, hash)) throw new TelegramAuthError("Invalid initData signature");

  const authDate = Number(params.get("auth_date"));
  checkFreshness(authDate, maxAgeSeconds, now);

  const rawUser = params.get("user");
  if (!rawUser) throw new TelegramAuthError("initData has no user");
  let user: TelegramUser;
  try {
    user = JSON.parse(rawUser) as TelegramUser;
  } catch {
    throw new TelegramAuthError("Malformed initData user");
  }
  if (!Number.isSafeInteger(user.id) || user.id <= 0) throw new TelegramAuthError("Invalid Telegram user id");

  return {
    user,
    authDate,
    startParam: params.get("start_param"),
    chatType: params.get("chat_type"),
  };
}

/** Payload produced by the Telegram Login Widget on regular websites. */
export type LoginWidgetPayload = Record<string, string | number | undefined> & { id: number | string; hash: string; auth_date: number | string };

export function verifyLoginWidget(
  payload: LoginWidgetPayload,
  botToken: string,
  maxAgeSeconds = 86_400,
  now = Date.now(),
): TelegramUser {
  const { hash, ...fields } = payload;
  if (typeof hash !== "string") throw new TelegramAuthError("Missing hash");
  const dataCheckString = Object.keys(fields)
    .filter((key) => fields[key] !== undefined && fields[key] !== null)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const secretKey = createHash("sha256").update(botToken).digest();
  const expected = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (!safeEqualHex(expected, hash)) throw new TelegramAuthError("Invalid Telegram login signature");
  checkFreshness(Number(fields.auth_date), maxAgeSeconds, now);
  const id = Number(fields.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new TelegramAuthError("Invalid Telegram user id");
  return {
    id,
    first_name: fields.first_name ? String(fields.first_name) : undefined,
    last_name: fields.last_name ? String(fields.last_name) : undefined,
    username: fields.username ? String(fields.username) : undefined,
    photo_url: fields.photo_url ? String(fields.photo_url) : undefined,
  };
}

/** Test helper: signs initData the same way Telegram does. */
export function signInitData(fields: Record<string, string>, botToken: string): string {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}
