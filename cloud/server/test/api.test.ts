// End-to-end API scenario against a real PostgreSQL database.
// Requires DATABASE_URL (see scripts/test.sh, which starts a throwaway server).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";

const BOT_TOKEN = "123456:TEST-token";
const VK_SECRET = "vk-test-secret";
process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
process.env.TELEGRAM_BOT_MODE = "off";
process.env.VK_APP_ID = "777";
process.env.VK_APP_SECRET = VK_SECRET;
process.env.DEV_AUTH = "1";
process.env.STORAGE_LOCAL_DIR = `/tmp/unishare-test-${process.pid}`;

const hasDatabase = Boolean(process.env.DATABASE_URL);

type App = Awaited<ReturnType<typeof import("../src/app").buildApp>>;
let app: App;
let signInitData: typeof import("../src/auth/telegram").signInitData;
let signVk: typeof import("../src/auth/vk").signVkLaunchParams;
let pool: typeof import("../src/db").pool;

before(async () => {
  if (!hasDatabase) return;
  const { migrate } = await import("../src/migrate");
  ({ pool } = await import("../src/db"));
  await pool.query(`drop schema public cascade; create schema public;`);
  await migrate(() => undefined);
  ({ signInitData } = await import("../src/auth/telegram"));
  ({ signVkLaunchParams: signVk } = await import("../src/auth/vk"));
  const { buildApp } = await import("../src/app");
  app = await buildApp();
});

after(async () => {
  if (!hasDatabase) return;
  await app.close();
  await pool.end();
});

async function call<T = any>(method: string, url: string, token?: string, body?: unknown): Promise<{ status: number; body: T }> {
  const response = await app.inject({
    method: method as "GET",
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    payload: body as Record<string, unknown> | undefined,
  });
  return { status: response.statusCode, body: response.body ? (JSON.parse(response.body) as T) : (undefined as T) };
}

async function telegramLogin(id: number, username: string, linkToken?: string) {
  const initData = signInitData(
    {
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify({ id, first_name: username, username, language_code: "ru", allows_write_to_pm: true }),
    },
    BOT_TOKEN,
  );
  return call("POST", "/api/auth/telegram", undefined, { initData, linkToken });
}

async function onboard(token: string, username: string, games: string[]) {
  return call("PATCH", "/api/me", token, {
    username,
    status: "#coop #fps",
    platforms: ["PlayStation", "Steam"],
    platformGames: { PlayStation: games, Steam: ["Dota 2"] },
    wantedGames: ["Elden Ring"],
    gameMetadata: { "dota 2": { name: "Dota 2", coverUrl: "https://example.com/dota.jpg", rawgId: 10213 } },
    onboardingComplete: true,
  });
}

test("full teammate flow: sign in, onboard, match, chat, review, block", { skip: !hasDatabase }, async () => {
  const alice = await telegramLogin(1001, "alice_tg");
  assert.equal(alice.status, 200, JSON.stringify(alice.body));
  assert.equal(alice.body.isNewUser, true);
  assert.equal(alice.body.profile.onboardingComplete, false);
  assert.equal(alice.body.profile.suggestions.username, "alice_tg");
  const aliceToken = alice.body.token as string;

  const again = await telegramLogin(1001, "alice_tg");
  assert.equal(again.body.isNewUser, false);
  assert.equal(again.body.profile.uid, alice.body.profile.uid);

  const bob = await telegramLogin(1002, "bob_tg");
  const bobToken = bob.body.token as string;

  assert.equal((await call("PATCH", "/api/me", aliceToken, { onboardingComplete: true })).status, 400);
  assert.equal((await onboard(aliceToken, "Alice", ["Elden Ring", "Gran Turismo 7"])).status, 200);
  const bobProfile = await onboard(bobToken, "Bob", ["Elden Ring"]);
  assert.equal(bobProfile.status, 200);
  assert.deepEqual(bobProfile.body.games.sort(), ["Dota 2", "Elden Ring"]);
  assert.equal((await onboard(bobToken, "alice", [])).body.code, "username_taken");

  // Moderation blocks credential sharing.
  const blocked = await call("PATCH", "/api/me", bobToken, { status: "мой пароль 123" });
  assert.equal(blocked.status, 400);
  assert.equal(blocked.body.code, "content_blocked");

  const feed = await call("GET", "/api/feed?kind=teammates", aliceToken);
  assert.equal(feed.status, 200);
  assert.equal(feed.body.length, 1);
  assert.equal(feed.body[0].username, "Bob");
  assert.deepEqual(feed.body[0].providers, ["telegram"]);
  assert.equal(feed.body[0].platformGames.Steam[0].coverUrl, "https://example.com/dota.jpg");
  assert.equal((await call("GET", "/api/feed?kind=skills", aliceToken)).body.length, 0);

  const like = await call("POST", "/api/feed/swipe", aliceToken, { targetId: bobProfile.body.uid, kind: "teammates", decision: "like" });
  assert.deepEqual(like.body, { matched: false, chatId: null });
  assert.equal((await call("GET", "/api/feed?kind=teammates", aliceToken)).body.length, 0);

  const requests = await call("GET", "/api/requests", bobToken);
  assert.equal(requests.body.length, 1);
  assert.equal(requests.body[0].from.username, "Alice");

  const accepted = await call("POST", `/api/requests/${requests.body[0].id}/accept`, bobToken);
  assert.equal(accepted.status, 200);
  const chatId = accepted.body.chatId as string;

  const chats = await call("GET", "/api/chats", aliceToken);
  assert.equal(chats.body.length, 1);
  assert.equal(chats.body[0].partner.username, "Bob");

  const messageId = randomUUID();
  const sent = await call("POST", `/api/chats/${chatId}/messages`, aliceToken, { id: messageId, text: "Привет! Го в Elden Ring?" });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  const duplicate = await call("POST", `/api/chats/${chatId}/messages`, aliceToken, { id: messageId, text: "Привет! Го в Elden Ring?" });
  assert.equal(duplicate.body.id, messageId);
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, aliceToken, { text: "my password is hunter2" })).body.code, "content_blocked");

  const bobChats = await call("GET", "/api/chats", bobToken);
  assert.equal(bobChats.body[0].unread, 1);
  assert.equal((await call("POST", `/api/chats/${chatId}/read`, bobToken)).status, 200);
  assert.equal((await call("GET", "/api/chats", bobToken)).body[0].unread, 0);
  const messages = await call("GET", `/api/chats/${chatId}/messages`, aliceToken);
  assert.equal(messages.body.length, 1);
  assert.ok(messages.body[0].readAt);

  // Direct contact appears only after opting in.
  let details = await call("GET", `/api/chats/${chatId}`, aliceToken);
  assert.deepEqual(details.body.contacts, []);
  assert.equal(details.body.canReview, false);
  await call("PATCH", "/api/me", bobToken, { allowDirectContact: true });
  await call("POST", `/api/chats/${chatId}/messages`, bobToken, { text: "Давай!" });
  details = await call("GET", `/api/chats/${chatId}`, aliceToken);
  assert.deepEqual(details.body.contacts, [{ provider: "telegram", url: "https://t.me/bob_tg", label: "@bob_tg" }]);
  assert.equal(details.body.canReview, true);

  assert.equal((await call("POST", "/api/reviews", aliceToken, { toUid: bobProfile.body.uid, chatId, rating: 5, text: "Отличный тиммейт" })).status, 200);
  const bobCard = await call("GET", `/api/users/${bobProfile.body.uid}`, aliceToken);
  assert.equal(bobCard.body.profile.rating, 5);
  assert.equal(bobCard.body.profile.reviewCount, 1);

  assert.equal((await call("POST", "/api/reports", aliceToken, { subjectId: bobProfile.body.uid, reason: "report.reason.spam" })).status, 200);
  assert.equal((await call("POST", "/api/blocks", aliceToken, { userId: bobProfile.body.uid })).status, 200);
  assert.equal((await call("GET", "/api/chats", bobToken)).body.length, 0);
  assert.equal((await call("GET", `/api/chats/${chatId}/messages`, bobToken)).status, 404);
  assert.equal((await call("GET", `/api/users/${bobProfile.body.uid}`, aliceToken)).status, 404);
});

test("links VK to an existing Telegram account and merges empty profiles", { skip: !hasDatabase }, async () => {
  const tg = await telegramLogin(2001, "carol_tg");
  const token = tg.body.token as string;
  await onboard(token, "Carol", ["Hades"]);

  const link = await call("POST", "/api/me/link-token", token);
  assert.equal(link.status, 200);
  assert.equal(link.body.vkUrl.startsWith("https://vk.com/app777#l_"), true);

  const launch = signVk(
    { vk_app_id: "777", vk_user_id: "555", vk_language: "ru", vk_platform: "mobile_web", vk_ts: String(Math.floor(Date.now() / 1000)) },
    VK_SECRET,
  );
  // The VK identity first opens the app on its own (empty profile)...
  const lonely = await call("POST", "/api/auth/vk", undefined, { launchParams: launch });
  assert.equal(lonely.body.isNewUser, true);
  // ...and is then merged into Carol's account through the link token.
  const linked = await call("POST", "/api/auth/vk", undefined, { launchParams: launch, linkToken: link.body.token, user: { firstName: "Carol" } });
  assert.equal(linked.status, 200, JSON.stringify(linked.body));
  assert.equal(linked.body.linked, "vk");
  assert.equal(linked.body.profile.uid, tg.body.profile.uid);
  assert.deepEqual(linked.body.profile.identities.map((identity: { provider: string }) => identity.provider).sort(), ["telegram", "vk"]);

  const reused = await call("POST", "/api/auth/vk", undefined, { launchParams: launch, linkToken: link.body.token });
  assert.equal(reused.body.code, "link_expired");

  const viaVk = await call("POST", "/api/auth/vk", undefined, { launchParams: launch });
  assert.equal(viaVk.body.profile.username, "Carol");

  assert.equal((await call("DELETE", "/api/me/identities/vk", token)).status, 200);
  assert.equal((await call("DELETE", "/api/me/identities/telegram", token)).body.code, "last_identity");

  assert.equal((await call("DELETE", "/api/me", token)).status, 200);
  assert.equal((await call("GET", "/api/me", token)).status, 401);
});

test("rejects forged sign-in payloads and unauthenticated calls", { skip: !hasDatabase }, async () => {
  assert.equal((await call("POST", "/api/auth/telegram", undefined, { initData: "user=%7B%22id%22%3A1%7D&auth_date=1&hash=00" })).status, 401);
  assert.equal((await call("POST", "/api/auth/vk", undefined, { launchParams: "vk_user_id=1&vk_app_id=777&sign=abc" })).status, 401);
  assert.equal((await call("GET", "/api/feed")).status, 401);
  assert.equal((await call("GET", "/api/config")).body.vkAppId, 777);
  const games = await call("GET", "/api/games/search?q=elden", (await call("POST", "/api/auth/dev", undefined, { name: "tester" })).body.token);
  assert.equal(games.body[0].name, "Elden Ring");
});
