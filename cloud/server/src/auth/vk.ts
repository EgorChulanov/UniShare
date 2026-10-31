// Verifies VK Mini App launch parameters.
// https://dev.vk.com/ru/mini-apps/development/launch-params-sign
import { createHmac, timingSafeEqual } from "node:crypto";
import { stringify } from "node:querystring";

export interface VerifiedVkLaunch {
  userId: number;
  appId: number;
  language: string | null;
  platform: string | null;
  /** True when the user allowed notifications for the app. */
  areNotificationsEnabled: boolean;
  timestamp: number;
}

export class VkAuthError extends Error {}

function signParams(vkParams: Record<string, string>, secret: string): string {
  const ordered = Object.keys(vkParams)
    .sort()
    .reduce<Record<string, string>>((acc, key) => {
      acc[key] = vkParams[key];
      return acc;
    }, {});
  return createHmac("sha256", secret)
    .update(stringify(ordered))
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function verifyVkLaunchParams(
  query: string,
  secret: string,
  expectedAppId: number | null,
  maxAgeSeconds = 7 * 86_400,
  now = Date.now(),
): VerifiedVkLaunch {
  const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  const sign = params.get("sign");
  if (!sign) throw new VkAuthError("Launch params have no sign");

  const vkParams: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    if (key.startsWith("vk_")) vkParams[key] = value;
  }
  const expected = signParams(vkParams, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(sign);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new VkAuthError("Invalid VK launch signature");

  const userId = Number(vkParams.vk_user_id);
  const appId = Number(vkParams.vk_app_id);
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new VkAuthError("Invalid VK user id");
  if (expectedAppId && appId !== expectedAppId) throw new VkAuthError("Launch params belong to another app");

  const timestamp = Number(vkParams.vk_ts);
  if (maxAgeSeconds > 0 && Number.isFinite(timestamp) && now / 1000 - timestamp > maxAgeSeconds) {
    throw new VkAuthError("VK session expired, reopen the app");
  }

  return {
    userId,
    appId,
    language: vkParams.vk_language ?? null,
    platform: vkParams.vk_platform ?? null,
    areNotificationsEnabled: vkParams.vk_are_notifications_enabled === "1",
    timestamp,
  };
}

/** Test helper: builds a signed launch query string. */
export function signVkLaunchParams(vkParams: Record<string, string>, secret: string): string {
  return new URLSearchParams({ ...vkParams, sign: signParams(vkParams, secret) }).toString();
}
