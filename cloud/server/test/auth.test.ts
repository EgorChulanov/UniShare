import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, createHmac } from "node:crypto";
import { TelegramAuthError, signInitData, verifyInitData, verifyLoginWidget } from "../src/auth/telegram";
import { VkAuthError, signVkLaunchParams, verifyVkLaunchParams } from "../src/auth/vk";
import { decodeDeepLink, encodeDeepLink, parseAnyLink } from "@unishare/shared";

const BOT_TOKEN = "123456:TEST-token";

test("accepts correctly signed Telegram initData", () => {
  const now = Math.floor(Date.now() / 1000);
  const initData = signInitData(
    {
      auth_date: String(now),
      query_id: "AAE",
      user: JSON.stringify({ id: 42, first_name: "Egor", username: "egor", language_code: "ru", allows_write_to_pm: true }),
      start_param: "s_chats",
      signature: "ignored-but-signed",
    },
    BOT_TOKEN,
  );
  const verified = verifyInitData(initData, BOT_TOKEN);
  assert.equal(verified.user.id, 42);
  assert.equal(verified.user.username, "egor");
  assert.equal(verified.startParam, "s_chats");
});

test("rejects tampered or stale Telegram initData", () => {
  const now = Math.floor(Date.now() / 1000);
  const initData = signInitData({ auth_date: String(now), user: JSON.stringify({ id: 42 }) }, BOT_TOKEN);
  const tampered = initData.replace("42", "43");
  assert.throws(() => verifyInitData(tampered, BOT_TOKEN), TelegramAuthError);
  assert.throws(() => verifyInitData(initData, "999:other"), TelegramAuthError);
  const stale = signInitData({ auth_date: String(now - 3 * 86_400), user: JSON.stringify({ id: 42 }) }, BOT_TOKEN);
  assert.throws(() => verifyInitData(stale, BOT_TOKEN, 86_400), /expired/);
});

test("verifies Telegram Login Widget payloads", () => {
  const fields = { id: 7, first_name: "Ann", username: "ann", auth_date: Math.floor(Date.now() / 1000) };
  const check = Object.keys(fields).sort().map((key) => `${key}=${fields[key as keyof typeof fields]}`).join("\n");
  const hash = createHmac("sha256", createHash("sha256").update(BOT_TOKEN).digest()).update(check).digest("hex");
  assert.equal(verifyLoginWidget({ ...fields, hash }, BOT_TOKEN).id, 7);
  assert.throws(() => verifyLoginWidget({ ...fields, id: 8, hash }, BOT_TOKEN), TelegramAuthError);
});

test("verifies VK launch params signature", () => {
  const secret = "wvl68m4dR1UpLrVRli";
  const query = signVkLaunchParams(
    {
      vk_access_token_settings: "notify,friends",
      vk_app_id: "6736218",
      vk_are_notifications_enabled: "0",
      vk_is_app_user: "1",
      vk_language: "ru",
      vk_platform: "android",
      vk_ts: String(Math.floor(Date.now() / 1000)),
      vk_user_id: "494075",
    },
    secret,
  );
  const verified = verifyVkLaunchParams(`${query}&utm_source=catalog`, secret, 6736218);
  assert.equal(verified.userId, 494075);
  assert.equal(verified.language, "ru");
  assert.throws(() => verifyVkLaunchParams(query.replace("494075", "494076"), secret, 6736218), VkAuthError);
  assert.throws(() => verifyVkLaunchParams(query, secret, 1), /another app/);
});

test("signs only vk_* params in the documented querystring format", () => {
  // Algorithm from dev.vk.com: HMAC-SHA256 over sorted vk_* params, base64url without padding.
  const params =
    "vk_access_token_settings=notify&vk_app_id=6736218&vk_are_notifications_enabled=0&vk_is_app_user=0&vk_language=ru&vk_platform=android&vk_user_id=494075";
  const sign = createHmac("sha256", "wvl68m4dR1UpLrVRli").update(params).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const verified = verifyVkLaunchParams(`${params}&sign=${sign}`, "wvl68m4dR1UpLrVRli", 6736218, 0);
  assert.equal(verified.userId, 494075);
});

test("deep links round-trip through every format", () => {
  const uid = "0f8fad5b-d9cb-469f-a165-70867728950e";
  const payload = encodeDeepLink({ kind: "profile", uid });
  assert.equal(payload, "u_0f8fad5bd9cb469fa16570867728950e");
  assert.ok(payload.length <= 64);
  assert.deepEqual(decodeDeepLink(payload), { kind: "profile", uid });
  assert.deepEqual(parseAnyLink(`https://t.me/UniversalShareBot?startapp=${payload}`), { kind: "profile", uid });
  assert.deepEqual(parseAnyLink(`https://vk.com/app123#${payload}`), { kind: "profile", uid });
  assert.deepEqual(parseAnyLink(`https://unishare.example/u/${uid}`), { kind: "profile", uid });
  assert.deepEqual(parseAnyLink("s_nearby"), { kind: "screen", screen: "nearby" });
  assert.equal(parseAnyLink("https://example.com"), null);
});
