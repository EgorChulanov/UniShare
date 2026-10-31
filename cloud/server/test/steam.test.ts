// Steam library import against a real PostgreSQL database: Steam sign-in (OpenID 2.0),
// the owned library, profile links without signing in, and unlinking. Every call to
// Steam goes through a mocked fetch.
import assert from "node:assert/strict";
import { after, afterEach, before, mock, test } from "node:test";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";

const BOT_TOKEN = "123456:TEST-token";
process.env.STEAM_API_KEY = "steam-test-key";
process.env.PUBLIC_URL = "https://unishare.test";
process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
process.env.TELEGRAM_BOT_USERNAME = "UniShareTestBot";
process.env.TELEGRAM_APP_SHORT_NAME = "app";
process.env.TELEGRAM_BOT_MODE = "off";
process.env.DEV_AUTH = "1";
process.env.STORAGE_LOCAL_DIR = `/tmp/unishare-steam-test-${process.pid}`;
process.env.COVER_ENRICHMENT = "0";
process.env.RAWG_API_KEY = "";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const OPENID_NS = "http://specs.openid.net/auth/2.0";
const STEAM_ID = "76561198000000001";
const OTHER_STEAM_ID = "76561198000000002";

type App = Awaited<ReturnType<typeof import("../src/app").buildApp>>;
let app: App;
let pool: typeof import("../src/db").pool;
let config: typeof import("../src/config").config;
let hashToken: typeof import("../src/auth/session").hashToken;
let steam: typeof import("../src/routes/steam");
let shared: typeof import("@unishare/shared");
let signInitData: typeof import("../src/auth/telegram").signInitData;

const realFetch = globalThis.fetch;

before(async () => {
  shared = await import("@unishare/shared");
  steam = await import("../src/routes/steam");
  if (!hasDatabase) return;
  const { migrate } = await import("../src/migrate");
  ({ pool } = await import("../src/db"));
  await pool.query(`drop schema public cascade; create schema public;`);
  await migrate(() => undefined);
  ({ config } = await import("../src/config"));
  ({ hashToken } = await import("../src/auth/session"));
  ({ signInitData } = await import("../src/auth/telegram"));
  const { buildApp } = await import("../src/app");
  app = await buildApp();
});

after(async () => {
  if (!hasDatabase) return;
  await app.close();
  await pool.end();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  steam.clearSteamCache();
});

// ── Helpers ────────────────────────────────────────────────────────────────

interface Call {
  url: URL;
  method: string;
  body: string | null;
}

/** The handler returns a JSON body, a Response, or undefined for 404; throwing is a network error. */
function mockFetch(handler: (call: Call) => unknown): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const call = { url, method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : null };
    calls.push(call);
    const reply = handler(call);
    if (reply instanceof Response) return reply;
    if (reply === undefined) return new Response("not found", { status: 404 });
    return Response.json(reply);
  }) as typeof fetch;
  return calls;
}

const isCheckAuth = (call: Call) => call.url.href === "https://steamcommunity.com/openid/login" && call.method === "POST";
const isSummaries = (call: Call) => call.url.pathname === "/ISteamUser/GetPlayerSummaries/v2/";
const isOwned = (call: Call) => call.url.pathname === "/IPlayerService/GetOwnedGames/v1/";
const isVanity = (call: Call) => call.url.pathname === "/ISteamUser/ResolveVanityURL/v1/";
const kv = (fields: Record<string, string>) => new Response(Object.entries(fields).map(([k, v]) => `${k}:${v}\n`).join(""));

function player(steamId: string, personaname = "Gabe", vanity: string | null = "gaben") {
  return {
    steamid: steamId,
    personaname,
    profileurl: vanity ? `https://steamcommunity.com/id/${vanity}/` : `https://steamcommunity.com/profiles/${steamId}/`,
    avatarfull: `https://avatars.steamstatic.com/${steamId}_full.jpg`,
  };
}

/** Steam that signs everything and knows the given players and libraries. */
function steamWorld(options: { valid?: boolean; players?: Record<string, ReturnType<typeof player>>; owned?: Record<string, unknown> } = {}): Call[] {
  return mockFetch((call) => {
    if (isCheckAuth(call)) return kv({ ns: OPENID_NS, is_valid: options.valid === false ? "false" : "true" });
    if (isSummaries(call)) {
      const found = options.players?.[call.url.searchParams.get("steamids") ?? ""];
      return { response: { players: found ? [found] : [] } };
    }
    if (isOwned(call)) return { response: options.owned?.[call.url.searchParams.get("steamid") ?? ""] ?? {} };
    return undefined;
  });
}

async function call<T = any>(method: string, url: string, token?: string, body?: unknown): Promise<{ status: number; body: T; text: string; headers: Record<string, unknown> }> {
  const response = await app.inject({
    method: method as "GET",
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    payload: body as Record<string, unknown> | undefined,
  });
  const json = response.headers["content-type"]?.toString().includes("application/json");
  return { status: response.statusCode, body: json && response.body ? (JSON.parse(response.body) as T) : (undefined as T), text: response.body, headers: response.headers };
}

let userCounter = 0;
async function signIn(prefix = "steamer"): Promise<{ token: string; uid: string }> {
  const name = `${prefix}${++userCounter}`;
  const response = await call("POST", "/api/auth/dev", undefined, { name });
  assert.equal(response.status, 200);
  return { token: response.body.token, uid: response.body.profile.uid };
}

/** POST /api/steam/connect and the state token from its return_to. */
async function connect(token: string): Promise<{ url: URL; state: string }> {
  const response = await call<{ url: string; expiresAt: string }>("POST", "/api/steam/connect", token);
  assert.equal(response.status, 200);
  const url = new URL(response.body.url);
  const returnTo = new URL(url.searchParams.get("openid.return_to")!);
  return { url, state: returnTo.searchParams.get("state")! };
}

/** The callback URL Steam redirects to after a successful sign-in; `overrides` replace (or with undefined, drop) fields. */
function callbackUrl(state: string, steamId = STEAM_ID, overrides: Record<string, string | undefined> = {}): string {
  const claimed = `https://steamcommunity.com/openid/id/${steamId}`;
  const fields: Record<string, string | undefined> = {
    "openid.ns": OPENID_NS,
    "openid.mode": "id_res",
    "openid.op_endpoint": "https://steamcommunity.com/openid/login",
    "openid.claimed_id": claimed,
    "openid.identity": claimed,
    "openid.return_to": `https://unishare.test/api/steam/callback?state=${state}`,
    "openid.response_nonce": "2026-10-31T10:00:00Zx1y2z3",
    "openid.assoc_handle": "1234567890",
    "openid.signed": "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
    // "+", "/" and "=" must survive the round trip to check_authentication.
    "openid.sig": "c2ln+bmF0/dXJl=",
    ...overrides,
  };
  const params = new URLSearchParams({ state });
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) params.set(key, value);
  return `/api/steam/callback?${params}`;
}

async function stateCount(uid: string): Promise<number> {
  return (await pool.query<{ count: number }>(`select count(*)::int as count from steam_login_states where user_id = $1`, [uid])).rows[0].count;
}

// ── Profile links ──────────────────────────────────────────────────────────

test("profile links: every accepted form and the rejected ones", async () => {
  const parse = shared.parseSteamProfileInput;
  assert.deepEqual(parse("https://steamcommunity.com/profiles/76561198000000001/"), { kind: "steamid", steamId: STEAM_ID });
  assert.deepEqual(parse("steamcommunity.com/profiles/76561198000000001"), { kind: "steamid", steamId: STEAM_ID });
  assert.deepEqual(parse("http://www.steamcommunity.com/profiles/76561198000000001/games/?tab=all"), { kind: "steamid", steamId: STEAM_ID });
  assert.deepEqual(parse("  https://steamcommunity.com/id/gaben/  "), { kind: "vanity", vanity: "gaben" });
  assert.deepEqual(parse("https://m.steamcommunity.com/id/Some_Name-1?l=russian"), { kind: "vanity", vanity: "Some_Name-1" });
  assert.deepEqual(parse("76561198000000001"), { kind: "steamid", steamId: STEAM_ID });
  assert.deepEqual(parse("gaben"), { kind: "vanity", vanity: "gaben" });
  // Every individual account: the first, today's new ones (765611999…), the ones after 76561200000000000, the last.
  for (const id of ["76561197960265729", "76561199912345678", "76561200000000000", "76561202255233023"]) {
    assert.deepEqual(parse(`https://steamcommunity.com/profiles/${id}`), { kind: "steamid", steamId: id }, id);
    assert.deepEqual(parse(id), { kind: "steamid", steamId: id }, id);
  }
  for (const bad of [
    "",
    "   ",
    "x",
    "12345",
    "76561198",
    "86561198000000001",
    "76561197960265728",
    "76561202255233024",
    "765611980000000010",
    "https://steamcommunity.com/profiles/76561197960265728",
    "https://steamcommunity.com/profiles/gaben",
    "https://evil.com/id/gaben",
    "https://steamcommunity.com/groups/x",
    "two words",
    "имя",
  ]) {
    assert.equal(parse(bad), null, bad);
  }
});

test("Steam names lose ™ and ®; the library is sorted by playtime, then by the last session", () => {
  assert.equal(steam.cleanSteamName("Apex Legends™"), "Apex Legends");
  assert.equal(steam.cleanSteamName("Tom Clancy's Rainbow Six® Siege"), "Tom Clancy's Rainbow Six Siege");
  assert.equal(steam.cleanSteamName(""), null);
  assert.equal(steam.cleanSteamName("x".repeat(200))?.length, 80);
  const games = steam.mapOwnedGames([
    { appid: 1172470, name: "Apex Legends™", playtime_forever: 300, rtime_last_played: 0 },
    { appid: 570, name: "Dota 2", playtime_forever: 12_000, rtime_last_played: 1_700_000_000 },
    { appid: 730, name: "Counter-Strike 2", playtime_forever: 300, rtime_last_played: 1_710_000_000 },
    { appid: 10, name: "" },
    { appid: -1, name: "Broken" },
  ]);
  assert.deepEqual(games.map((game) => game.name), ["Dota 2", "Counter-Strike 2", "Apex Legends"]);
  // Cached without image URLs; they are added from the app id when the library is sent.
  assert.deepEqual(games[0], { appId: 570, name: "Dota 2", playtimeMinutes: 12_000, lastPlayedAt: new Date(1_700_000_000_000).toISOString() });
  assert.equal(games[2].lastPlayedAt, null);
  const sent = steam.withImages({ steamId: STEAM_ID, personaName: null, avatarUrl: null, profileUrl: "", private: false, games, gameCount: 3 });
  assert.deepEqual(sent.games[0], {
    ...games[0],
    coverUrl: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/570/header.jpg",
    portraitUrl: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/570/library_600x900.jpg",
  });
  assert.equal("coverUrl" in games[0], false, "withImages does not change the cached games");
});

test("the result page escapes what it shows and names the UniShare profile that got the link", () => {
  const html = steam.renderSteamPage(
    { ok: true, personaName: `<img src=x onerror="alert(1)">`, avatarUrl: `https://a.test/"><script>`, account: `<i>egor</i>` },
    "en",
    `https://t.me/x?a="b"`,
  );
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes(`<img src=x`));
  assert.ok(!html.includes("<i>"));
  assert.ok(html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
  assert.ok(html.includes(`href="https://t.me/x?a=&quot;b&quot;"`));
  assert.ok(html.includes("Linked to the UniShare profile <b>@&lt;i&gt;egor&lt;/i&gt;</b>"));
  // No username yet (before onboarding): no line.
  assert.ok(!steam.renderSteamPage({ ok: true, personaName: "Gabe", avatarUrl: null, account: null }, "ru", "https://x.test/").includes(`class="account"`));
});

// ── Not configured ─────────────────────────────────────────────────────────

test("without STEAM_API_KEY every endpoint answers 503 steam_not_configured", { skip: !hasDatabase }, async () => {
  const { token } = await signIn();
  const steamConfig = config.steam as { apiKey: string | null };
  steamConfig.apiKey = null;
  const calls = mockFetch(() => ({}));
  try {
    assert.equal((await call("GET", "/api/config")).body.steamImport, false);
    for (const [method, url, body] of [
      ["POST", "/api/steam/connect"],
      ["GET", "/api/steam/library"],
      ["POST", "/api/steam/resolve", { profile: "gaben" }],
      ["DELETE", "/api/steam"],
    ] as const) {
      const response = await call(method, url, token, body);
      assert.equal(response.status, 503, url);
      assert.equal(response.body.code, "steam_not_configured", url);
    }
    const page = await call("GET", callbackUrl("a".repeat(32)));
    assert.equal(page.status, 503);
    assert.match(String(page.headers["content-type"]), /text\/html/);
    assert.equal(calls.length, 0);
  } finally {
    steamConfig.apiKey = "steam-test-key";
  }
  assert.equal((await call("GET", "/api/config")).body.steamImport, true);
});

// ── Sign in through Steam ──────────────────────────────────────────────────

test("connect returns the Steam OpenID page and stores a 15-minute state", { skip: !hasDatabase }, async () => {
  assert.equal((await call("POST", "/api/steam/connect")).status, 401);
  const { token, uid } = await signIn();
  const { url, state } = await connect(token);
  assert.equal(`${url.origin}${url.pathname}`, "https://steamcommunity.com/openid/login");
  assert.equal(url.searchParams.get("openid.ns"), OPENID_NS);
  assert.equal(url.searchParams.get("openid.mode"), "checkid_setup");
  assert.equal(url.searchParams.get("openid.realm"), "https://unishare.test");
  assert.equal(url.searchParams.get("openid.return_to"), `https://unishare.test/api/steam/callback?state=${state}`);
  assert.equal(url.searchParams.get("openid.identity"), "http://specs.openid.net/auth/2.0/identifier_select");
  assert.equal(url.searchParams.get("openid.claimed_id"), "http://specs.openid.net/auth/2.0/identifier_select");
  assert.match(state, /^[A-Za-z0-9_-]{32}$/);

  const row = (await pool.query<{ user_id: string; client: string; minutes: number }>(
    `select user_id, client, (extract(epoch from expires_at - now()) / 60)::float8 as minutes from steam_login_states where token_hash = $1`,
    [hashToken(state)],
  )).rows[0];
  assert.equal(row.user_id, uid);
  assert.equal(row.client, "web");
  assert.ok(row.minutes > 14 && row.minutes <= 15);
  // Only the hash is stored.
  assert.equal((await pool.query(`select 1 from steam_login_states where token_hash = $1`, [state])).rowCount, 0);

  // Earlier states stay usable (a Steam page may still be open), up to five per user.
  for (let i = 0; i < 6; i++) await connect(token);
  assert.equal(await stateCount(uid), 5);
});

test("a verified Steam answer links the account once and notifies the open app", { skip: !hasDatabase }, async () => {
  const { token, uid } = await signIn();
  const { attachRealtime } = await import("../src/realtime");
  await app.listen({ port: 0, host: "127.0.0.1" });
  const detach = attachRealtime(app.server);
  const socket = await new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${(app.server.address() as AddressInfo).port}/api/ws?token=${encodeURIComponent(token)}`);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
  const updated = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no profile_updated")), 3_000);
    socket.on("message", (data) => {
      if (JSON.parse(String(data)).type === "profile_updated") {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  try {
    await pool.query(`update users set username = 'gabe_fan' where uid = $1`, [uid]);
    const { state } = await connect(token);
    const calls = steamWorld({ players: { [STEAM_ID]: player(STEAM_ID, "<b>Gabe</b>") } });
    const page = await call("GET", callbackUrl(state));
    assert.equal(page.status, 200);
    assert.match(String(page.headers["content-type"]), /text\/html/);
    assert.equal(page.headers["cache-control"], "no-store");
    assert.match(String(page.headers["content-security-policy"]), /default-src 'none'/);
    assert.ok(page.text.includes("Steam подключён"), "the page follows the user's language (ru)");
    assert.ok(page.text.includes("&lt;b&gt;Gabe&lt;/b&gt;"));
    // Whoever signed in to Steam sees which UniShare profile got the account.
    assert.ok(page.text.includes("Привязан к профилю UniShare <b>@gabe_fan</b>"));
    assert.ok(page.text.includes(`href="https://unishare.test/?startapp=s_profile"`), "a web sign-in goes back to the website");

    // check_authentication got every openid.* field back, with only the mode changed.
    const check = calls.find(isCheckAuth)!;
    const sent = new URLSearchParams(check.body!);
    assert.equal(sent.get("openid.mode"), "check_authentication");
    assert.equal(sent.get("openid.sig"), "c2ln+bmF0/dXJl=");
    assert.equal(sent.get("openid.claimed_id"), `https://steamcommunity.com/openid/id/${STEAM_ID}`);
    assert.equal(sent.get("state"), null);
    assert.equal(calls.find(isSummaries)!.url.searchParams.get("key"), "steam-test-key");

    await updated;
    const me = await call("GET", "/api/me", token);
    assert.deepEqual(me.body.steam, {
      steamId: STEAM_ID,
      personaName: "<b>Gabe</b>",
      avatarUrl: `https://avatars.steamstatic.com/${STEAM_ID}_full.jpg`,
      profileUrl: `https://steamcommunity.com/profiles/${STEAM_ID}`,
    });
    assert.deepEqual(me.body.identities, [], "Steam is not a sign-in identity");
    const identity = (await pool.query(`select username, display_name from user_identities where user_id = $1 and provider = 'steam'`, [uid])).rows[0];
    assert.deepEqual(identity, { username: "gaben", display_name: "<b>Gabe</b>" });

    // Single use.
    assert.equal(await stateCount(uid), 0);
    const again = await call("GET", callbackUrl(state));
    assert.equal(again.status, 400);
    assert.ok(again.text.includes("устарела или уже использована"));
  } finally {
    socket.close();
    detach();
  }
});

test("the callback rejects bad, expired and forged answers without linking", { skip: !hasDatabase }, async () => {
  const { token, uid } = await signIn();
  const { state } = await connect(token);
  const calls = steamWorld({ players: { [STEAM_ID]: player(STEAM_ID) } });
  const expectPage = async (url: string, status: number, text: string) => {
    const page = await call("GET", url);
    assert.equal(page.status, status, url);
    assert.ok(page.text.includes(text), `${url}: ${text}`);
  };

  await expectPage(callbackUrl("x".repeat(32)), 400, "устарела");
  await expectPage(callbackUrl("bad state!"), 400, "устарела");
  await expectPage(callbackUrl(state).replace(/state=[^&]+&/, ""), 400, "устарела");

  const forged: Record<string, string | undefined>[] = [
    { "openid.return_to": `https://evil.test/api/steam/callback?state=${state}` },
    { "openid.return_to": `https://unishare.test/api/steam/callback?state=${state}&x=1` },
    { "openid.op_endpoint": "https://evil.test/openid/login" },
    { "openid.claimed_id": "https://steamcommunity.com/openid/id/123", "openid.identity": "https://steamcommunity.com/openid/id/123" },
    { "openid.claimed_id": `https://evil.test/openid/id/${STEAM_ID}`, "openid.identity": `https://evil.test/openid/id/${STEAM_ID}` },
    { "openid.identity": `https://steamcommunity.com/openid/id/${OTHER_STEAM_ID}` },
    { "openid.signed": "signed,op_endpoint,return_to,response_nonce,assoc_handle" },
    { "openid.sig": undefined },
    { "openid.mode": "checkid_setup" },
    { "openid.ns": "http://openid.net/signon/1.1" },
  ];
  for (const override of forged) await expectPage(callbackUrl(state, STEAM_ID, override), 400, "некорректный ответ");
  // Another state's return_to.
  const other = await connect(token);
  await expectPage(callbackUrl(state, STEAM_ID, { "openid.return_to": `https://unishare.test/api/steam/callback?state=${other.state}` }), 400, "некорректный ответ");
  assert.equal(calls.filter(isCheckAuth).length, 0, "malformed answers never reach Steam");

  // Steam says the signature is not its own.
  steamWorld({ valid: false });
  await expectPage(callbackUrl(state), 403, "не подтвердил");
  // steamcommunity.com unreachable from the server.
  mockFetch(() => {
    throw new TypeError("fetch failed");
  });
  await expectPage(callbackUrl(state), 502, "ссылку на профиль Steam");
  mockFetch((call) => (isCheckAuth(call) ? new Response("", { status: 503 }) : undefined));
  await expectPage(callbackUrl(state), 502, "ссылку на профиль Steam");

  // The user cancelled on Steam.
  await expectPage(`/api/steam/callback?state=${state}&openid.ns=${encodeURIComponent(OPENID_NS)}&openid.mode=cancel`, 200, "отменён");

  // None of the failures used up the state or linked anything.
  assert.equal((await call("GET", "/api/me", token)).body.steam, null);
  assert.equal(await stateCount(uid), 2);

  // An expired state.
  await pool.query(`update steam_login_states set expires_at = now() - interval '1 second' where token_hash = $1`, [hashToken(state)]);
  steamWorld({ players: { [STEAM_ID]: player(STEAM_ID) } });
  await expectPage(callbackUrl(state), 400, "устарела");
  assert.equal((await call("GET", "/api/me", token)).body.steam, null);
});

test("a Steam account linked to another profile is refused; a new one replaces the old", { skip: !hasDatabase }, async () => {
  const owner = await signIn();
  const intruder = await signIn();
  const first = "76561198000000010";
  const second = "76561198000000011";
  steamWorld({ players: { [first]: player(first), [second]: player(second, "Second", null) } });

  assert.equal((await call("GET", callbackUrl((await connect(owner.token)).state, first))).status, 200);
  const refused = await call("GET", callbackUrl((await connect(intruder.token)).state, first));
  assert.equal(refused.status, 409);
  assert.ok(refused.text.includes("уже привязан к другому профилю"));
  assert.equal((await call("GET", "/api/me", intruder.token)).body.steam, null);
  assert.equal((await call("GET", "/api/me", owner.token)).body.steam.steamId, first);

  // The owner signs in with another Steam account: it replaces the first one.
  assert.equal((await call("GET", callbackUrl((await connect(owner.token)).state, second))).status, 200);
  const me = (await call("GET", "/api/me", owner.token)).body;
  assert.equal(me.steam.steamId, second);
  assert.equal(me.steam.personaName, "Second");
  const rows = await pool.query(`select provider_user_id from user_identities where user_id = $1 and provider = 'steam'`, [owner.uid]);
  assert.deepEqual(rows.rows, [{ provider_user_id: second }]);
  // The first account is free again.
  assert.equal((await call("GET", callbackUrl((await connect(intruder.token)).state, first))).status, 200);
  assert.equal((await call("GET", "/api/me", intruder.token)).body.steam.steamId, first);
});

test("a refused link keeps the user's current Steam account and the sign-in link", { skip: !hasDatabase }, async () => {
  const alice = await signIn();
  const bob = await signIn();
  const mine = "76561198000000020";
  const bobs = "76561198000000021";
  const spare = "76561198000000022";
  steamWorld({ players: { [mine]: player(mine, "Alice"), [bobs]: player(bobs, "Bob"), [spare]: player(spare, "Spare") } });
  assert.equal((await call("GET", callbackUrl((await connect(alice.token)).state, mine))).status, 200);
  assert.equal((await call("GET", callbackUrl((await connect(bob.token)).state, bobs))).status, 200);

  // Alice signs in to Steam with Bob's account.
  const { state } = await connect(alice.token);
  const refused = await call("GET", callbackUrl(state, bobs));
  assert.equal(refused.status, 409);
  assert.ok(refused.text.includes("уже привязан к другому профилю"));
  const me = (await call("GET", "/api/me", alice.token)).body;
  assert.equal(me.steam.steamId, mine, "her own Steam account is still linked");
  assert.equal(me.steam.personaName, "Alice");
  assert.equal((await call("GET", "/api/me", bob.token)).body.steam.steamId, bobs);
  // The state was not used up: "Open again" with the same link, now with another Steam account, works.
  assert.equal(await stateCount(alice.uid), 1);
  assert.equal((await call("GET", callbackUrl(state, spare))).status, 200);
  assert.equal((await call("GET", "/api/me", alice.token)).body.steam.steamId, spare);
  assert.equal(await stateCount(alice.uid), 0);
});

test("the result page links back to the Telegram Mini App and works when Steam has no summary", { skip: !hasDatabase }, async () => {
  const initData = signInitData(
    { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 4242, first_name: "Tg", username: "tg_steam", language_code: "en" }) },
    BOT_TOKEN,
  );
  const signedIn = await call("POST", "/api/auth/telegram", undefined, { initData });
  const token = signedIn.body.token as string;
  const { state } = await connect(token);
  // GetPlayerSummaries fails: the account is linked without a persona.
  mockFetch((call) => (isCheckAuth(call) ? kv({ ns: OPENID_NS, is_valid: "true" }) : new Response("", { status: 500 })));
  const page = await call("GET", callbackUrl(state, "76561198000000077"));
  assert.equal(page.status, 200);
  assert.ok(page.text.includes("Steam connected"));
  assert.ok(page.text.includes(`href="https://t.me/UniShareTestBot/app?startapp=s_profile"`));
  const me = (await call("GET", "/api/me", token)).body;
  assert.equal(me.steam.steamId, "76561198000000077");
  assert.equal(me.steam.personaName, null);

  // Telegram stays the only sign-in method: it cannot be unlinked because Steam is linked.
  const unlink = await call("DELETE", "/api/me/identities/telegram", token);
  assert.equal(unlink.status, 400);
  assert.equal(unlink.body.code, "last_identity");
});

// ── Library ────────────────────────────────────────────────────────────────

const OWNED = {
  game_count: 3,
  games: [
    { appid: 1172470, name: "Apex Legends™", playtime_forever: 300, rtime_last_played: 0 },
    { appid: 570, name: "Dota 2", playtime_forever: 12_000, rtime_last_played: 1_700_000_000 },
    { appid: 730, name: "Counter-Strike 2", playtime_forever: 900, rtime_last_played: 1_710_000_000 },
  ],
};

test("library: the linked account's games, cached; private and unreachable libraries", { skip: !hasDatabase }, async () => {
  const { token } = await signIn();
  steamWorld({ players: { [STEAM_ID]: player(STEAM_ID) } });
  const notLinked = await call("GET", "/api/steam/library", token);
  assert.equal(notLinked.status, 409);
  assert.equal(notLinked.body.code, "steam_not_linked");
  assert.equal((await call("GET", "/api/steam/library")).status, 401);

  // A fresh account for this test (the other tests own STEAM_ID).
  const steamId = "76561198000000100";
  assert.equal((await call("GET", callbackUrl((await connect(token)).state, steamId))).status, 200);

  // Private "Game details": Steam answers an empty response. Not cached, so a retry asks again.
  let calls = steamWorld({ players: { [steamId]: player(steamId, "Lib Owner") }, owned: {} });
  const hidden = await call("GET", "/api/steam/library", token);
  assert.equal(hidden.status, 200);
  assert.deepEqual(
    { private: hidden.body.private, games: hidden.body.games, gameCount: hidden.body.gameCount, personaName: hidden.body.personaName },
    { private: true, games: [], gameCount: 0, personaName: "Lib Owner" },
  );
  await call("GET", "/api/steam/library", token);
  assert.equal(calls.filter(isOwned).length, 2);

  // A public library without games is not private.
  steamWorld({ players: { [steamId]: player(steamId) }, owned: { [steamId]: { game_count: 0 } } });
  const empty = (await call("GET", "/api/steam/library", token)).body;
  assert.equal(empty.private, false);
  assert.deepEqual(empty.games, []);
  steam.clearSteamCache();

  calls = steamWorld({ players: { [steamId]: player(steamId, "Lib Owner", "libowner") }, owned: { [steamId]: OWNED } });
  const library = await call("GET", "/api/steam/library", token);
  assert.equal(library.status, 200);
  assert.equal(library.body.steamId, steamId);
  assert.equal(library.body.private, false);
  assert.equal(library.body.gameCount, 3);
  assert.equal(library.body.profileUrl, "https://steamcommunity.com/id/libowner/");
  assert.equal(library.body.avatarUrl, `https://avatars.steamstatic.com/${steamId}_full.jpg`);
  assert.deepEqual(library.body.games.map((game: { name: string }) => game.name), ["Dota 2", "Counter-Strike 2", "Apex Legends"]);
  assert.equal(library.body.games[0].playtimeMinutes, 12_000);
  const owned = calls.find(isOwned)!.url.searchParams;
  assert.equal(owned.get("steamid"), steamId);
  assert.equal(owned.get("include_appinfo"), "1");
  assert.equal(owned.get("include_played_free_games"), "1");
  assert.equal(owned.get("key"), "steam-test-key");

  // Cached: a second request does not reach Steam.
  const before = calls.length;
  assert.equal((await call("GET", "/api/steam/library", token)).body.games.length, 3);
  assert.equal(calls.length, before);

  // Steam down or slow.
  steam.clearSteamCache();
  for (const failure of [() => new Response("", { status: 500 }), () => new Response("<html>", { status: 200 }), () => { throw new TypeError("fetch failed"); }]) {
    mockFetch(failure);
    const down = await call("GET", "/api/steam/library", token);
    assert.equal(down.status, 502);
    assert.equal(down.body.code, "steam_unavailable");
  }
});

test("resolve: a public profile's games without signing in, for every input form", { skip: !hasDatabase }, async () => {
  const { token } = await signIn();
  const steamId = "76561198000000200";
  const calls = mockFetch((call) => {
    if (isVanity(call)) {
      return call.url.searchParams.get("vanityurl") === "public_guy" ? { response: { success: 1, steamid: steamId } } : { response: { success: 42, message: "No match" } };
    }
    if (isSummaries(call)) return { response: { players: call.url.searchParams.get("steamids") === steamId ? [player(steamId, "Public Guy", "public_guy")] : [] } };
    if (isOwned(call)) return { response: call.url.searchParams.get("steamid") === steamId ? OWNED : {} };
    return undefined;
  });

  for (const profile of [
    `https://steamcommunity.com/profiles/${steamId}/`,
    steamId,
    "https://steamcommunity.com/id/public_guy/",
    "steamcommunity.com/id/public_guy",
    "public_guy",
  ]) {
    steam.clearSteamCache();
    calls.length = 0;
    const response = await call("POST", "/api/steam/resolve", token, { profile });
    assert.equal(response.status, 200, profile);
    assert.equal(response.body.steamId, steamId);
    assert.equal(response.body.personaName, "Public Guy");
    assert.equal(response.body.games.length, 3);
    assert.equal(calls.some(isVanity), !/\d{17}/.test(profile), profile);
  }

  for (const profile of ["", "x", "https://example.com/id/public_guy", 42]) {
    const response = await call("POST", "/api/steam/resolve", token, { profile });
    assert.equal(response.status, 400, String(profile));
    assert.equal(response.body.code, "steam_profile_invalid");
  }
  for (const profile of ["nobody_here", "76561198000000999"]) {
    const response = await call("POST", "/api/steam/resolve", token, { profile });
    assert.equal(response.status, 404, profile);
    assert.equal(response.body.code, "steam_profile_not_found");
  }
  mockFetch(() => {
    throw new TypeError("fetch failed");
  });
  const down = await call("POST", "/api/steam/resolve", token, { profile: "public_guy" });
  assert.equal(down.status, 502);
  assert.equal(down.body.code, "steam_unavailable");

  // Nothing was linked.
  assert.equal((await call("GET", "/api/me", token)).body.steam, null);
});

test("the library cache holds at most 50 000 games; pasted links are kept 3 minutes, linked libraries 10", { skip: !hasDatabase }, async () => {
  const bigLibrary = (steamId: string) => ({
    game_count: 2000,
    games: Array.from({ length: 2000 }, (_, index) => ({ appid: index + 1, name: `Game ${steamId.slice(-3)}-${index}`, playtime_forever: index })),
  });
  const calls = mockFetch((call) => {
    const steamId = call.url.searchParams.get("steamids") ?? call.url.searchParams.get("steamid") ?? "";
    if (isCheckAuth(call)) return kv({ ns: OPENID_NS, is_valid: "true" });
    if (isSummaries(call)) return { response: { players: [player(steamId, "Collector", null)] } };
    if (isOwned(call)) return { response: bigLibrary(steamId) };
    return undefined;
  });
  const ids = Array.from({ length: 30 }, (_, index) => `7656119800000${1000 + index}`);
  const users = [await signIn(), await signIn()];
  for (const [index, id] of ids.entries()) {
    const response = await call("POST", "/api/steam/resolve", users[index < 20 ? 0 : 1].token, { profile: id });
    assert.equal(response.status, 200);
    assert.equal(response.body.games.length, 2000);
    assert.equal(response.body.games[0].coverUrl, "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2000/header.jpg");
  }
  assert.deepEqual(steam.steamCacheStats(), { libraries: 25, games: 50_000 });
  // The oldest libraries were dropped first: the first link asks Steam again, the last one does not.
  const owned = () => calls.filter(isOwned).length;
  let before = owned();
  await call("POST", "/api/steam/resolve", users[1].token, { profile: ids[29] });
  assert.equal(owned(), before);
  await call("POST", "/api/steam/resolve", users[1].token, { profile: ids[0] });
  assert.equal(owned(), before + 1);

  // Time: a pasted link's library expires after 3 minutes, a linked one after 10.
  steam.clearSteamCache();
  const linked = await signIn();
  const linkedId = "76561198000002000";
  assert.equal((await call("GET", callbackUrl((await connect(linked.token)).state, linkedId))).status, 200);
  mock.timers.enable({ apis: ["Date"], now: Date.now() });
  try {
    await call("GET", "/api/steam/library", linked.token);
    await call("POST", "/api/steam/resolve", users[1].token, { profile: ids[1] });
    before = owned();
    mock.timers.tick(4 * 60_000);
    await call("GET", "/api/steam/library", linked.token);
    assert.equal(owned(), before, "the linked library is still cached");
    await call("POST", "/api/steam/resolve", users[1].token, { profile: ids[1] });
    assert.equal(owned(), before + 1, "the pasted link's library expired");
    mock.timers.tick(7 * 60_000);
    await call("GET", "/api/steam/library", linked.token);
    assert.equal(owned(), before + 2, "the linked library expired too");
  } finally {
    mock.timers.reset();
  }
});

test("unlink removes the Steam account and its pending sign-ins", { skip: !hasDatabase }, async () => {
  const { token, uid } = await signIn();
  const steamId = "76561198000000300";
  steamWorld({ players: { [steamId]: player(steamId) } });
  assert.equal((await call("GET", callbackUrl((await connect(token)).state, steamId))).status, 200);
  await connect(token);
  assert.equal((await call("GET", "/api/me", token)).body.steam.steamId, steamId);

  const unlinked = await call("DELETE", "/api/steam", token);
  assert.equal(unlinked.status, 200);
  assert.equal(unlinked.body.steam, null);
  assert.equal((await pool.query(`select 1 from user_identities where user_id = $1 and provider = 'steam'`, [uid])).rowCount, 0);
  assert.equal(await stateCount(uid), 0);
  assert.equal((await call("GET", "/api/steam/library", token)).body.code, "steam_not_linked");
  // Unlinking twice is fine.
  assert.equal((await call("DELETE", "/api/steam", token)).status, 200);
});
