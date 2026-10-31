// Admin panel, bans, bug reports and the /admin bot claim against a real PostgreSQL database.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";

const BOT_TOKEN = "123456:TEST-token";
const CLAIM_CODE = "owner-claim-code-2026";
const BACKUPS = `/tmp/unishare-admin-backups-${process.pid}`;
process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
process.env.TELEGRAM_BOT_MODE = "off";
process.env.DEV_AUTH = "1";
process.env.STORAGE_LOCAL_DIR = `/tmp/unishare-admin-test-${process.pid}`;
process.env.COVER_ENRICHMENT = "0";
process.env.RAWG_API_KEY = "";
process.env.ADMIN_CLAIM_CODE = CLAIM_CODE;
process.env.BACKUPS_DIR = BACKUPS;
globalThis.fetch = (async () => {
  throw new Error("network disabled in tests");
}) as typeof fetch;

const hasDatabase = Boolean(process.env.DATABASE_URL);

type App = Awaited<ReturnType<typeof import("../src/app").buildApp>>;
let app: App;
let pool: typeof import("../src/db").pool;
let signInitData: typeof import("../src/auth/telegram").signInitData;
let adminModule: typeof import("../src/admin");
let bot: typeof import("../src/bot/telegram");

before(async () => {
  if (!hasDatabase) return;
  mkdirSync(BACKUPS, { recursive: true });
  writeFileSync(`${BACKUPS}/unishare-2026-10-29.sql.gz`, Buffer.alloc(2048));
  writeFileSync(`${BACKUPS}/unishare-2026-10-30.sql.gz`, Buffer.alloc(4096));
  writeFileSync(`${BACKUPS}/notes.txt`, "not a backup");
  utimesSync(`${BACKUPS}/unishare-2026-10-29.sql.gz`, new Date("2026-10-29T03:00:00Z"), new Date("2026-10-29T03:00:00Z"));
  utimesSync(`${BACKUPS}/unishare-2026-10-30.sql.gz`, new Date("2026-10-30T03:00:00Z"), new Date("2026-10-30T03:00:00Z"));

  const { migrate } = await import("../src/migrate");
  ({ pool } = await import("../src/db"));
  await pool.query(`drop schema public cascade; create schema public;`);
  await migrate(() => undefined);
  ({ signInitData } = await import("../src/auth/telegram"));
  adminModule = await import("../src/admin");
  bot = await import("../src/bot/telegram");
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
  const text = response.body;
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = text;
  }
  return { status: response.statusCode, body: parsed as T };
}

async function telegramUser(id: number, name: string): Promise<{ token: string; uid: string }> {
  const initData = signInitData(
    { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: name, username: name, language_code: "ru" }) },
    BOT_TOKEN,
  );
  const response = await call("POST", "/api/auth/telegram", undefined, { initData });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return { token: response.body.token, uid: response.body.profile.uid };
}

/** Dev sign-in plus a finished profile, so the user shows up in the feed and search. */
async function player(name: string): Promise<{ token: string; uid: string }> {
  const signIn = await call("POST", "/api/auth/dev", undefined, { name });
  assert.equal(signIn.status, 200, JSON.stringify(signIn.body));
  const token = signIn.body.token as string;
  const update = await call("PATCH", "/api/me", token, { username: name, platforms: ["PC"], platformGames: { PC: ["Dota 2"] }, onboardingComplete: true });
  assert.equal(update.status, 200, JSON.stringify(update.body));
  return { token, uid: update.body.uid };
}

async function makeAdmin(uid: string): Promise<void> {
  await pool.query(`update users set is_admin = true where uid = $1`, [uid]);
}

/** Each scenario starts without admins and with an empty audit log. */
async function resetAdmins(): Promise<void> {
  await pool.query(`update users set is_admin = false where is_admin`);
  await pool.query(`delete from admin_actions`);
}

async function auditActions(): Promise<{ action: string; admin_id: string | null; target_user_id: string | null; report_id: string | null; bug_id: string | null }[]> {
  return (await pool.query(`select action, admin_id, target_user_id, report_id, bug_id from admin_actions order by created_at`)).rows;
}

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);

test("non-admins get 403 and anonymous callers 401 on every admin endpoint", { skip: !hasDatabase }, async () => {
  await resetAdmins();
  const user = await player("plain_user");
  const someone = "00000000-0000-4000-8000-000000000000";
  const endpoints: [string, string, unknown?][] = [
    ["GET", "/api/admin/overview"],
    ["GET", "/api/admin/reports?state=all"],
    ["GET", `/api/admin/reports/${someone}`],
    ["POST", `/api/admin/reports/${someone}`, { action: "reject" }],
    ["GET", "/api/admin/bugs"],
    ["GET", `/api/admin/bugs/${someone}`],
    ["POST", `/api/admin/bugs/${someone}`, { state: "resolved" }],
    ["GET", "/api/admin/users?q=a"],
    ["GET", `/api/admin/users/${someone}`],
    ["POST", `/api/admin/users/${someone}/ban`, { state: "banned", reason: "x" }],
    ["POST", `/api/admin/users/${someone}/unban`],
    ["POST", `/api/admin/users/${someone}/admin`, { isAdmin: true }],
    ["GET", "/api/admin/actions"],
  ];
  for (const [method, url, body] of endpoints) {
    const denied = await call(method, url, user.token, body);
    assert.equal(denied.status, 403, `${method} ${url}`);
    assert.equal(denied.body.code, "forbidden");
    assert.equal((await call(method, url, undefined, body)).status, 401, `${method} ${url} anonymous`);
  }
  assert.equal((await call("GET", "/api/me", user.token)).body.isAdmin, false);
});

test("the bot code claims admin rights once, with attempt limits", { skip: !hasDatabase }, async () => {
  await resetAdmins();
  adminModule.resetClaimLimits();
  assert.deepEqual(await adminModule.claimAdmin("900001", CLAIM_CODE), { status: "no_account" });

  const owner = await telegramUser(900002, "owner_tg");
  assert.deepEqual(await adminModule.claimAdmin("900002", "wrong-code"), { status: "invalid" });
  assert.deepEqual(await adminModule.claimAdmin("900002", ""), { status: "invalid" });
  assert.deepEqual(await adminModule.claimAdmin("900002", ` ${CLAIM_CODE} `), { status: "claimed", userId: owner.uid });
  assert.equal((await call("GET", "/api/me", owner.token)).body.isAdmin, true);
  assert.deepEqual(await adminModule.claimAdmin("900002", CLAIM_CODE), { status: "already_admin", userId: owner.uid });

  // The same code does not work for anybody else afterwards.
  const other = await telegramUser(900003, "other_tg");
  assert.deepEqual(await adminModule.claimAdmin("900003", CLAIM_CODE), { status: "invalid" });
  assert.equal((await call("GET", "/api/me", other.token)).body.isAdmin, false);

  // Five attempts per Telegram account per hour.
  adminModule.resetClaimLimits();
  for (let attempt = 0; attempt < 5; attempt++) assert.equal((await adminModule.claimAdmin("900003", `guess-${attempt}`)).status, "invalid");
  assert.deepEqual(await adminModule.claimAdmin("900003", CLAIM_CODE), { status: "rate_limited" });

  const claims = (await auditActions()).filter((entry) => entry.action === "claim_admin");
  assert.equal(claims.length, 1);
  assert.equal(claims[0].admin_id, owner.uid);
  const details = (await pool.query(`select details from admin_actions where action = 'claim_admin'`)).rows[0].details;
  assert.equal(details.telegramId, "900002");
  assert.ok(!JSON.stringify(details).includes(CLAIM_CODE), "the code itself is never stored");
});

test("overview reports users, activity, database and backups", { skip: !hasDatabase }, async () => {
  await resetAdmins();
  const admin = await player("overview_admin");
  await makeAdmin(admin.uid);
  const response = await call("GET", "/api/admin/overview", admin.token);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const overview = response.body;
  assert.ok(overview.users.total >= 1);
  assert.ok(overview.users.onboarded >= 1);
  assert.ok(overview.users.new24h >= 1 && overview.users.new7d >= overview.users.new24h);
  assert.equal(overview.users.admins, 1);
  for (const key of ["chats", "messages24h", "likes24h", "requests24h", "openReports", "openBugs"]) {
    assert.equal(typeof overview.activity[key], "number", key);
  }
  assert.ok(overview.database.sizeBytes > 0);
  assert.match(overview.database.sizePretty, /B$/);
  assert.match(overview.database.version, /^\d+/);
  assert.ok(overview.database.connections >= 1);
  assert.ok(overview.database.tables.length > 0 && overview.database.tables.length <= 8);
  assert.ok(overview.database.tables.some((table: { name: string }) => table.name === "users"));
  assert.equal(overview.backups.count, 2);
  assert.equal(overview.backups.latest.name, "unishare-2026-10-30.sql.gz");
  assert.equal(overview.backups.latest.sizeBytes, 4096);
  assert.deepEqual(overview.backups.files.map((file: { name: string }) => file.name), ["unishare-2026-10-30.sql.gz", "unishare-2026-10-29.sql.gz"]);
  assert.equal(overview.app.nodeVersion, process.version);
  assert.equal(overview.app.telegram.mode, "off");
});

test("a report resolved with a ban signs the user out and hides them; unban restores", { skip: !hasDatabase }, async () => {
  await resetAdmins();
  const admin = await player("mod_anna");
  await makeAdmin(admin.uid);
  const reporter = await player("rep_carl");
  const bad = await player("bad_bob");
  const witness = await player("wit_wendy");

  assert.equal((await call("POST", "/api/reports", reporter.token, { subjectId: bad.uid, reason: "report.reason.spam", details: "реклама" })).status, 200);
  assert.equal((await call("POST", "/api/reports", witness.token, { subjectId: bad.uid, reason: "report.reason.fake" })).status, 200);

  const open = await call("GET", "/api/admin/reports?state=open", admin.token);
  assert.equal(open.status, 200);
  assert.equal(open.body.items.length, 2);
  assert.equal(open.body.nextOffset, null);
  const [latest, first] = open.body.items;
  assert.equal(latest.reason, "report.reason.fake");
  assert.equal(first.details, "реклама");
  assert.equal(first.reporter.username, "rep_carl");
  assert.equal(first.subject.uid, bad.uid);
  assert.equal(first.subject.accountState, "active");
  assert.equal(first.subjectReportCount, 2);

  // Bob is visible before the ban.
  const feedNames = async (token: string) => ((await call("GET", "/api/feed?kind=teammates&limit=50", token)).body as { username: string }[]).map((card) => card.username);
  const searchNames = async (token: string, q: string) => ((await call("GET", `/api/search?q=${q}`, token)).body.users as { username: string }[]).map((card) => card.username);
  assert.ok((await feedNames(witness.token)).includes("bad_bob"));
  assert.ok((await searchNames(witness.token, "bad_b")).includes("bad_bob"));

  assert.equal((await call("POST", `/api/admin/reports/${first.id}`, admin.token, { action: "resolve", ban: { state: "banned" } })).body.code, "reason_required");
  assert.equal((await call("POST", `/api/admin/reports/${first.id}`, admin.token, { action: "reject", ban: { state: "banned", reason: "spam" } })).status, 400);
  assert.equal((await call("POST", `/api/admin/reports/${first.id}`, admin.token, { action: "close" })).status, 400);

  const resolved = await call("POST", `/api/admin/reports/${first.id}`, admin.token, {
    action: "resolve",
    note: "Реклама казино",
    ban: { state: "banned", reason: "Спам" },
  });
  assert.equal(resolved.status, 200, JSON.stringify(resolved.body));
  assert.equal(resolved.body.state, "resolved");
  assert.equal(resolved.body.adminNote, "Реклама казино");
  assert.equal(resolved.body.subject.accountState, "banned");

  // Every session of the banned user is gone, and others no longer see them.
  assert.equal((await call("GET", "/api/me", bad.token)).status, 401);
  assert.equal((await call("POST", "/api/auth/dev", undefined, { name: "bad_bob" })).status, 403);
  assert.ok(!(await feedNames(witness.token)).includes("bad_bob"));
  assert.ok(!(await searchNames(witness.token, "bad_b")).includes("bad_bob"));
  // The second report about Bob was closed by the ban.
  assert.equal((await call("GET", "/api/admin/reports?state=open", admin.token)).body.items.length, 0);

  const detail = await call("GET", `/api/admin/users/${bad.uid}`, admin.token);
  assert.equal(detail.body.accountState, "banned");
  assert.equal(detail.body.banReason, "Спам");
  assert.ok(detail.body.bannedAt);
  // Admins still see the banned user's card (the public profile endpoint hides it).
  assert.equal(detail.body.card.username, "bad_bob");
  assert.deepEqual(detail.body.card.platformGames.PC.map((game: { name: string }) => game.name), ["Dota 2"]);
  assert.equal((await call("GET", `/api/users/${bad.uid}`, witness.token)).status, 404);

  // A second ban (or a stale action on a closed report) changes nothing.
  const again = await call("POST", `/api/admin/users/${bad.uid}/ban`, admin.token, { state: "suspended", reason: "Повторно" });
  assert.equal(again.status, 409);
  assert.equal(again.body.code, "already_restricted");
  const closedAgain = await call("POST", `/api/admin/reports/${first.id}`, admin.token, { action: "reject" });
  assert.equal(closedAgain.status, 409);
  assert.equal(closedAgain.body.code, "report_handled");
  const unchanged = await call("GET", `/api/admin/users/${bad.uid}`, admin.token);
  assert.deepEqual([unchanged.body.accountState, unchanged.body.banReason, unchanged.body.bannedAt], ["banned", "Спам", detail.body.bannedAt]);
  const single = await call("GET", `/api/admin/reports/${first.id}`, admin.token);
  assert.equal(single.status, 200);
  assert.equal(single.body.state, "resolved");
  assert.equal((await call("GET", `/api/admin/reports/00000000-0000-4000-8000-000000000000`, admin.token)).status, 404);
  assert.equal(detail.body.counts.reportsAgainst, 2);
  assert.equal(detail.body.recentReports.length, 2);
  assert.deepEqual(detail.body.identities.map((identity: { provider: string }) => identity.provider), ["dev"]);
  assert.deepEqual(detail.body.recentActions.map((entry: { action: string }) => entry.action), ["ban", "report_resolve"]);

  const restricted = await call("GET", "/api/admin/users?filter=restricted", admin.token);
  assert.deepEqual(restricted.body.items.map((user: { uid: string }) => user.uid), [bad.uid]);

  const unbanned = await call("POST", `/api/admin/users/${bad.uid}/unban`, admin.token);
  assert.equal(unbanned.status, 200);
  assert.equal(unbanned.body.accountState, "active");
  assert.equal(unbanned.body.banReason, null);
  const back = await call("POST", "/api/auth/dev", undefined, { name: "bad_bob" });
  assert.equal(back.status, 200);
  assert.equal((await call("GET", "/api/me", back.body.token)).status, 200);
  assert.ok((await feedNames(witness.token)).includes("bad_bob"));

  // Reopen and reject also work and are logged.
  assert.equal((await call("POST", `/api/admin/reports/${first.id}`, admin.token, { action: "reopen" })).body.state, "open");
  assert.equal((await call("POST", `/api/admin/reports/${first.id}`, admin.token, { action: "reopen" })).body.code, "report_handled");
  assert.equal((await call("POST", `/api/admin/reports/${first.id}`, admin.token, { action: "reject" })).body.state, "rejected");
  assert.equal((await call("GET", "/api/admin/reports?state=rejected", admin.token)).body.items[0].id, first.id);

  const log = await call("GET", "/api/admin/actions", admin.token);
  assert.equal(log.status, 200);
  assert.deepEqual(
    log.body.items.map((entry: { action: string }) => entry.action),
    ["report_reject", "report_reopen", "unban", "ban", "report_resolve"],
  );
  const ban = log.body.items.find((entry: { action: string }) => entry.action === "ban");
  assert.equal(ban.adminName, "mod_anna");
  assert.equal(ban.targetName, "bad_bob");
  assert.equal(ban.reportId, first.id);
  assert.equal(ban.reason, "Спам");
});

test("admins cannot ban themselves or other admins, and the last admin stays", { skip: !hasDatabase }, async () => {
  await resetAdmins();
  const anna = await player("adm_anna");
  const dave = await player("adm_dave");
  const eve = await player("usr_eve");
  await makeAdmin(anna.uid);

  const self = await call("POST", `/api/admin/users/${anna.uid}/ban`, anna.token, { state: "banned", reason: "test" });
  assert.equal(self.status, 400);
  assert.equal(self.body.code, "cannot_ban_self");
  assert.equal((await call("POST", `/api/admin/users/${eve.uid}/ban`, anna.token, { state: "deleted", reason: "x" })).status, 400);
  assert.equal((await call("POST", `/api/admin/users/not-a-uuid/ban`, anna.token, { state: "banned", reason: "x" })).status, 404);

  // The only admin cannot drop their own rights.
  const lonely = await call("POST", `/api/admin/users/${anna.uid}/admin`, anna.token, { isAdmin: false });
  assert.equal(lonely.body.code, "last_admin");

  const granted = await call("POST", `/api/admin/users/${dave.uid}/admin`, anna.token, { isAdmin: true });
  assert.equal(granted.status, 200);
  assert.equal(granted.body.isAdmin, true);
  assert.equal((await call("GET", "/api/me", dave.token)).body.isAdmin, true);
  assert.equal((await call("GET", "/api/admin/users?filter=admins", dave.token)).body.items.length, 2);

  const otherAdmin = await call("POST", `/api/admin/users/${dave.uid}/ban`, anna.token, { state: "suspended", reason: "test" });
  assert.equal(otherAdmin.body.code, "cannot_ban_admin");
  assert.equal((await call("POST", "/api/reports", eve.token, { subjectId: dave.uid, reason: "report.reason.spam" })).status, 200);
  const reportId = (await call("GET", "/api/admin/reports", anna.token)).body.items[0].id;
  assert.equal((await call("POST", `/api/admin/reports/${reportId}`, anna.token, { action: "resolve", ban: { state: "banned", reason: "x" } })).body.code, "cannot_ban_admin");
  // The failed ban rolled the whole action back.
  assert.equal((await call("GET", "/api/admin/reports", anna.token)).body.items[0].state, "open");

  // Suspension works like a ban for the user.
  const suspended = await call("POST", `/api/admin/users/${eve.uid}/ban`, anna.token, { state: "suspended", reason: "Проверка" });
  assert.equal(suspended.body.accountState, "suspended");
  assert.equal((await call("GET", "/api/me", eve.token)).status, 401);
  assert.equal((await call("POST", `/api/admin/users/${eve.uid}/admin`, anna.token, { isAdmin: true })).body.code, "account_restricted");

  // With two admins, one may step down; then the other is the last one.
  assert.equal((await call("POST", `/api/admin/users/${anna.uid}/admin`, anna.token, { isAdmin: false })).body.isAdmin, false);
  assert.equal((await call("GET", "/api/admin/overview", anna.token)).status, 403);
  assert.equal((await call("POST", `/api/admin/users/${dave.uid}/admin`, dave.token, { isAdmin: false })).body.code, "last_admin");

  const actions = (await auditActions()).map((entry) => entry.action);
  assert.deepEqual(actions, ["grant_admin", "suspend", "revoke_admin"]);
});

test("bug reports: create, validate, rate limit, admin list, screenshot and state", { skip: !hasDatabase }, async () => {
  await resetAdmins();
  const admin = await player("bug_admin");
  await makeAdmin(admin.uid);
  const user = await player("bug_user");

  assert.equal((await call("POST", "/api/bugs", undefined, { text: "Не грузится лента" })).status, 401);
  const tooShort = await call("POST", "/api/bugs", user.token, { text: "  🐞🐞  " });
  assert.equal(tooShort.status, 400);
  assert.equal(tooShort.body.code, "invalid_text");
  assert.equal((await call("POST", "/api/bugs", user.token, { text: "x".repeat(2001) })).body.code, "invalid_text");
  assert.equal((await call("POST", "/api/bugs", user.token, { text: "Не грузится лента", context: "web" })).status, 400);
  const fakeImage = `data:image/png;base64,${Buffer.from("<svg onload=alert(1)>").toString("base64")}`;
  assert.equal((await call("POST", "/api/bugs", user.token, { text: "Не грузится лента", screenshot: fakeImage })).body.code, "unsupported_image");
  assert.equal((await call("POST", "/api/bugs", user.token, { text: "Не грузится лента", screenshot: "https://example.com/a.png" })).body.code, "unsupported_image");

  const created = await call("POST", "/api/bugs", user.token, {
    text: "Не грузится лента после свайпа",
    context: {
      client: "telegram",
      platform: "ios",
      appVersion: "1.4.0",
      url: "https://unishare.example/?startapp=l_secret#tgWebAppData=user%3D1%26hash%3Dabc",
      userAgent: "Mozilla/5.0",
      screen: "390x844@3",
      language: "ru",
      secret: "dropped",
    },
    screenshot: `data:image/png;base64,${PNG.toString("base64")}`,
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const bugId = created.body.id as string;

  for (let index = 0; index < 4; index++) {
    assert.equal((await call("POST", "/api/bugs", user.token, { text: `Ещё одна проблема ${index}` })).status, 200);
  }
  const limited = await call("POST", "/api/bugs", user.token, { text: "Шестая за час" });
  assert.equal(limited.status, 429);
  assert.equal(limited.body.code, "rate_limited");

  const list = await call("GET", "/api/admin/bugs?state=open", admin.token);
  assert.equal(list.status, 200);
  assert.equal(list.body.items.length, 5);
  const bug = list.body.items.find((item: { id: string }) => item.id === bugId);
  assert.equal(bug.user.username, "bug_user");
  assert.deepEqual(bug.context, {
    client: "telegram",
    platform: "ios",
    appVersion: "1.4.0",
    url: "https://unishare.example/",
    userAgent: "Mozilla/5.0",
    screen: "390x844@3",
    language: "ru",
  });
  assert.match(bug.screenshotUrl, new RegExp(`^/api/media/bugs/${bugId}\\.png\\?exp=\\d+&sig=`));

  const image = await app.inject({ method: "GET", url: bug.screenshotUrl });
  assert.equal(image.statusCode, 200);
  assert.equal(image.headers["content-type"], "image/png");
  assert.equal(image.rawPayload.length, PNG.length);
  assert.equal((await app.inject({ method: "GET", url: `/api/media/bugs/${bugId}.png` })).statusCode, 403);
  assert.equal((await app.inject({ method: "GET", url: bug.screenshotUrl.replace(/sig=[^&]+/, "sig=forged") })).statusCode, 403);
  // The public avatar route cannot be walked over to the screenshots ("avatars/../bugs/...").
  for (const file of [`..%2Fbugs%2F${bugId}.png`, `..%5Cbugs%5C${bugId}.png`, `.%2F..%2Fbugs%2F${bugId}.png`]) {
    assert.equal((await app.inject({ method: "GET", url: `/media/avatars/${file}` })).statusCode, 404, file);
  }
  const single = await call("GET", `/api/admin/bugs/${bugId}`, admin.token);
  assert.equal(single.status, 200);
  assert.equal(single.body.text, "Не грузится лента после свайпа");
  assert.match(single.body.screenshotUrl, /sig=/);

  assert.equal((await call("POST", `/api/admin/bugs/${bugId}`, admin.token, { state: "fixed" })).status, 400);
  const resolved = await call("POST", `/api/admin/bugs/${bugId}`, admin.token, { state: "resolved", note: "Исправлено в 1.4.1" });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.state, "resolved");
  assert.equal(resolved.body.adminNote, "Исправлено в 1.4.1");
  assert.ok(resolved.body.resolvedAt);
  // A second admin with a stale view cannot flip it to "rejected".
  const stale = await call("POST", `/api/admin/bugs/${bugId}`, admin.token, { state: "rejected" });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, "bug_handled");
  assert.equal((await call("GET", "/api/admin/bugs?state=open", admin.token)).body.items.length, 4);
  assert.equal((await call("GET", "/api/admin/bugs?state=resolved", admin.token)).body.items[0].id, bugId);
  assert.equal((await call("GET", "/api/admin/bugs?state=all", admin.token)).body.items.length, 5);
  const overview = await call("GET", "/api/admin/overview", admin.token);
  assert.equal(overview.body.activity.openBugs, 4);

  const log = await auditActions();
  assert.equal(log.length, 1);
  assert.deepEqual(log[0], { action: "bug_resolve", admin_id: admin.uid, target_user_id: user.uid, report_id: null, bug_id: bugId });

  // Deleting the account keeps the report but drops the author.
  assert.equal((await call("DELETE", "/api/me", user.token)).status, 200);
  const orphan = (await call("GET", "/api/admin/bugs?state=resolved", admin.token)).body.items[0];
  assert.equal(orphan.id, bugId);
  assert.equal(orphan.user, null);
});

test("admin user search finds by name, uid and Telegram id; pages newest first", { skip: !hasDatabase }, async () => {
  await resetAdmins();
  const admin = await player("srch_admin");
  await makeAdmin(admin.uid);
  const tg = await telegramUser(777111, "tg_findme");
  await call("PATCH", "/api/me", tg.token, { username: "FindMe_Player", platforms: ["PC"], onboardingComplete: true });

  const ids = async (q: string) => ((await call("GET", `/api/admin/users?q=${encodeURIComponent(q)}`, admin.token)).body.items as { uid: string }[]).map((user) => user.uid);
  assert.deepEqual(await ids("findme_p"), [tg.uid]);
  assert.deepEqual(await ids(tg.uid.toUpperCase()), [tg.uid]);
  assert.deepEqual(await ids("777111"), [tg.uid]);
  assert.deepEqual(await ids("@tg_findme"), [tg.uid]);
  assert.deepEqual(await ids("%"), []);

  const newest = await call("GET", "/api/admin/users", admin.token);
  assert.equal(newest.body.items[0].uid, tg.uid);
  assert.deepEqual(newest.body.items[0].providers, ["telegram"]);
  const total = (await pool.query(`select count(*)::int as count from users`)).rows[0].count as number;
  if (total > 30) assert.equal(newest.body.nextOffset, 30);
});

test("Telegram report buttons use the same checks and audit log", { skip: !hasDatabase }, async () => {
  await resetAdmins();
  const admin = await telegramUser(555001, "tg_admin");
  await makeAdmin(admin.uid);
  const outsider = await telegramUser(555002, "tg_outsider");
  const reporter = await player("btn_reporter");
  const target = await player("btn_target");
  await call("POST", "/api/reports", reporter.token, { subjectId: target.uid, reason: "report.reason.harassment", details: "<b>оскорбления</b>" });
  const reportId = (await pool.query(`select id from reports where subject_id = $1`, [target.uid])).rows[0].id as string;
  // A second report about the same user; every admin gets a message with buttons for it too.
  await call("POST", "/api/reports", outsider.token, { subjectId: target.uid, reason: "report.reason.spam" });

  const denied = await bot.adminReportButton("555002", "ban", reportId);
  assert.equal(denied.ok, false);
  assert.equal(denied.html, null);
  assert.equal((await call("GET", "/api/me", target.token)).status, 200);
  void outsider;

  const banned = await bot.adminReportButton("555001", "ban", reportId);
  assert.equal(banned.ok, true, banned.toast);
  assert.match(banned.html!, /Новая жалоба/);
  assert.match(banned.html!, /&lt;b&gt;оскорбления&lt;\/b&gt;/, "user text is escaped for HTML");
  assert.match(banned.html!, /Забанен/);
  assert.equal((await call("GET", "/api/me", target.token)).status, 401);
  const state = (await pool.query(`select account_state, ban_reason from users where uid = $1`, [target.uid])).rows[0];
  assert.deepEqual(state, { account_state: "banned", ban_reason: "Оскорбления или травля" });

  assert.equal(banned.open, false);

  const missing = await bot.adminReportButton("555001", "rej", "00000000-0000-4000-8000-000000000000");
  assert.equal(missing.ok, false);

  // Dismiss after the ban: refused, the user stays banned and the message shows the ban.
  const dismissLate = await bot.adminReportButton("555001", "rej", reportId);
  assert.equal(dismissLate.ok, false);
  assert.equal(dismissLate.toast, "Эту жалобу уже обработали.");
  assert.match(dismissLate.html!, /\n\n🚫 <b>Забанен<\/b> · id [0-9a-f]{8}$/);
  assert.equal(dismissLate.open, false);
  assert.equal((await pool.query(`select state from reports where id = $1`, [reportId])).rows[0].state, "resolved");

  // Ban from a second report that the first ban already closed: no second ban.
  const before = (await pool.query(`select ban_reason, banned_at from users where uid = $1`, [target.uid])).rows[0];
  const secondReport = (await pool.query(`select id from reports where subject_id = $1 and id <> $2`, [target.uid, reportId])).rows[0].id as string;
  const banAgain = await bot.adminReportButton("555001", "ban", secondReport);
  assert.equal(banAgain.ok, false);
  assert.equal(banAgain.toast, "Эту жалобу уже обработали.");
  assert.deepEqual((await pool.query(`select ban_reason, banned_at from users where uid = $1`, [target.uid])).rows[0], before);

  // Ban after the report was dismissed in the panel: refused, the user stays active.
  const other = await player("btn_other");
  await call("POST", "/api/reports", reporter.token, { subjectId: other.uid, reason: "report.reason.spam" });
  const otherReport = (await pool.query(`select id from reports where subject_id = $1`, [other.uid])).rows[0].id as string;
  assert.equal((await call("POST", `/api/admin/reports/${otherReport}`, admin.token, { action: "reject" })).status, 200);
  const banDismissed = await bot.adminReportButton("555001", "ban", otherReport, "en");
  assert.equal(banDismissed.ok, false);
  assert.equal(banDismissed.toast, "This report has already been handled.");
  assert.match(banDismissed.html!, /Report dismissed<\/b> · id [0-9a-f]{8}$/);
  assert.equal((await call("GET", "/api/me", other.token)).status, 200);

  // A webhook without a secret could carry a forged admin id: the buttons do nothing then.
  const { config } = await import("../src/config");
  const telegramConfig = config.telegram as { mode: string; webhookSecret: string | null };
  const saved = { mode: telegramConfig.mode, webhookSecret: telegramConfig.webhookSecret };
  await call("POST", "/api/reports", reporter.token, { subjectId: other.uid, reason: "report.reason.fake" });
  const freshReport = (await pool.query(`select id from reports where subject_id = $1 and state = 'open'`, [other.uid])).rows[0].id as string;
  try {
    telegramConfig.mode = "webhook";
    telegramConfig.webhookSecret = null;
    const forged = await bot.adminReportButton("555001", "ban", freshReport, "uk");
    assert.equal(forged.ok, false);
    assert.match(forged.toast, /TELEGRAM_WEBHOOK_SECRET/);
    assert.equal(forged.html, null);
    assert.equal((await call("GET", "/api/me", other.token)).status, 200);
    telegramConfig.webhookSecret = "secret-from-env";
    assert.equal((await bot.adminReportButton("555001", "rej", freshReport, "be")).toast, "Гатова");
  } finally {
    Object.assign(telegramConfig, saved);
  }
  assert.equal((await bot.adminReportButton("555002", "rej", freshReport, "uk")).toast, "Немає доступу: ви не адміністратор.");

  const log = (await auditActions()).filter((entry) => entry.report_id === reportId).map((entry) => [entry.action, entry.admin_id]);
  assert.deepEqual(log, [["report_resolve", admin.uid], ["ban", admin.uid]]);
  assert.equal((await auditActions()).filter((entry) => entry.action === "ban").length, 1);

  // Notifications are a no-op without a running bot and never throw.
  await bot.notifyAdminsAboutReport(reportId);
  await bot.notifyAdminsAboutBug("00000000-0000-4000-8000-000000000000");
});

test("a ban closes the user's open realtime sockets", { skip: !hasDatabase }, async () => {
  await resetAdmins();
  const { attachRealtime } = await import("../src/realtime");
  await app.listen({ port: 0, host: "127.0.0.1" });
  const detach = attachRealtime(app.server);
  try {
    const admin = await player("ws_admin");
    await makeAdmin(admin.uid);
    const target = await player("ws_target");
    const base = `ws://127.0.0.1:${(app.server.address() as AddressInfo).port}/api/ws`;
    const socket = await new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(`${base}?token=${encodeURIComponent(target.token)}`);
      ws.once("open", () => resolve(ws));
      ws.once("error", reject);
    });
    const closed = new Promise<number>((resolve) => socket.once("close", (code) => resolve(code)));
    assert.equal((await call("POST", `/api/admin/users/${target.uid}/ban`, admin.token, { state: "banned", reason: "Спам" })).status, 200);
    assert.equal(await closed, 4003);
    // Reconnecting with the old token is refused.
    const refused = await new Promise<boolean>((resolve) => {
      const ws = new WebSocket(`${base}?token=${encodeURIComponent(target.token)}`);
      ws.once("open", () => resolve(false));
      ws.once("error", () => resolve(true));
    });
    assert.equal(refused, true);
  } finally {
    detach();
  }
});
