// Avatar picker (POST /api/me/avatar/pick) against a real PostgreSQL database.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { AVATAR_PRESETS, avatarPreset, isAvatarArtUrl, sanitizePickedAvatar, steamPortraitUrl } from "@unishare/shared";

const STORAGE_DIR = `/tmp/unishare-avatar-test-${process.pid}`;
process.env.TELEGRAM_BOT_MODE = "off";
process.env.DEV_AUTH = "1";
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_DIR = STORAGE_DIR;
process.env.COVER_ENRICHMENT = "0";
process.env.RAWG_API_KEY = "";
globalThis.fetch = (async () => {
  throw new Error("network disabled in tests");
}) as typeof fetch;

const hasDatabase = Boolean(process.env.DATABASE_URL);

type App = Awaited<ReturnType<typeof import("../src/app").buildApp>>;
let app: App;
let pool: typeof import("../src/db").pool;

before(async () => {
  if (!hasDatabase) return;
  const { migrate } = await import("../src/migrate");
  ({ pool } = await import("../src/db"));
  await pool.query(`drop schema public cascade; create schema public;`);
  await migrate(() => undefined);
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

async function signIn(name: string): Promise<string> {
  const response = await call<{ token: string }>("POST", "/api/auth/dev", undefined, { name });
  assert.equal(response.status, 200);
  return response.body.token;
}

const pick = (token: string | undefined, avatarUrl: unknown) => call("POST", "/api/me/avatar/pick", token, { avatarUrl });

test("shared avatar rules", () => {
  assert.ok(AVATAR_PRESETS.length >= 20);
  assert.equal(new Set(AVATAR_PRESETS.map((preset) => preset.id)).size, AVATAR_PRESETS.length);
  assert.equal(avatarPreset("preset:crown")?.id, "crown");
  assert.equal(avatarPreset("preset:nope"), null);
  assert.equal(avatarPreset("crown"), null);
  assert.ok(isAvatarArtUrl(steamPortraitUrl(1091500)));
  assert.ok(isAvatarArtUrl("https://media.rawg.io/media/games/26d/26d4437715bee60138dab4a7c8c59c92.jpg"));
  assert.ok(isAvatarArtUrl("https://cdn.akamai.steamstatic.com/steam/apps/570/header.JPG?t=1731544174"));
  assert.equal(isAvatarArtUrl("https://media.rawg.io.evil.example/x.jpg"), false);
  assert.equal(isAvatarArtUrl("https://user:pw@media.rawg.io/x.jpg"), false);
  assert.equal(isAvatarArtUrl("https://media.rawg.io:8443/x.jpg"), false);
  assert.equal(isAvatarArtUrl("https://media.rawg.io/x.svg"), false);
  assert.equal(sanitizePickedAvatar(42), null);
  assert.equal(sanitizePickedAvatar(`https://media.rawg.io/${"a".repeat(2100)}.jpg`), null);
});

test("picks a preset, game art, and rejects anything else", { skip: !hasDatabase }, async () => {
  const token = await signIn("avatar_picker");

  assert.equal((await pick(undefined, "preset:crown")).status, 401);

  const preset = await pick(token, "preset:crown");
  assert.equal(preset.status, 200);
  assert.deepEqual(preset.body, { avatarUrl: "preset:crown" });
  assert.equal((await call("GET", "/api/me", token)).body.avatarUrl, "preset:crown");

  const art = steamPortraitUrl(1091500);
  const picked = await pick(token, art);
  assert.equal(picked.status, 200);
  assert.equal(picked.body.avatarUrl, art);
  assert.equal((await call("GET", "/api/me", token)).body.avatarUrl, art);
  // Others see it on the public card too.
  const onboarded = await call("PATCH", "/api/me", token, { username: "avatar_picker", platforms: ["Steam"], onboardingComplete: true });
  assert.equal(onboarded.status, 200);
  assert.equal(onboarded.body.avatarUrl, art);
  const other = await signIn("avatar_viewer");
  const uid = (await call("GET", "/api/me", token)).body.uid;
  assert.equal((await call("GET", `/api/users/${uid}`, other)).body.profile.avatarUrl, art);

  const rejected: unknown[] = [
    "preset:does-not-exist",
    "preset:",
    "crown",
    "https://example.com/avatar.jpg",
    "https://media.rawg.io.evil.example/a.jpg",
    "http://media.rawg.io/media/games/a.jpg",
    "javascript:alert(1)//media.rawg.io/a.jpg",
    "data:image/png;base64,iVBORw0KGgo=",
    "https://media.rawg.io/media/games/a.html",
    "https://upload.wikimedia.org/wikipedia/en/",
    "/media/avatars/someone-else.jpg",
    `https://media.rawg.io/${"x".repeat(2100)}.jpg`,
    "",
    null,
    123,
    { url: art },
  ];
  for (const value of rejected) {
    const response = await pick(token, value);
    assert.equal(response.status, 400, `accepted ${JSON.stringify(value)?.slice(0, 80)}`);
    assert.equal(response.body.code, "invalid_avatar");
  }
  // Nothing rejected was stored.
  assert.equal((await call("GET", "/api/me", token)).body.avatarUrl, art);
});

test("picking replaces an uploaded photo and deletes its file", { skip: !hasDatabase }, async () => {
  const token = await signIn("avatar_uploader");
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
  const upload = await app.inject({
    method: "POST",
    url: "/api/me/avatar",
    headers: { authorization: `Bearer ${token}`, "content-type": "image/jpeg" },
    payload: jpeg,
  });
  assert.equal(upload.statusCode, 200);
  const uploadedUrl = (JSON.parse(upload.body) as { avatarUrl: string }).avatarUrl;
  const key = uploadedUrl.match(/avatars\/[A-Za-z0-9_.-]+$/)![0];
  const file = join(STORAGE_DIR, key);
  assert.ok(existsSync(file));

  const response = await pick(token, "preset:dragon");
  assert.equal(response.status, 200);
  // The file is removed in the background.
  for (let attempt = 0; attempt < 50 && existsSync(file); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(existsSync(file), false);
  assert.equal((await call("GET", "/api/me", token)).body.avatarUrl, "preset:dragon");

  // A previous preset or game art has no file: picking again is fine.
  assert.equal((await pick(token, "preset:ghost")).status, 200);
  assert.equal((await pick(token, "https://media.rawg.io/media/games/26d/26d4437715bee60138dab4a7c8c59c92.jpg")).status, 200);
  assert.equal((await pick(token, "preset:ghost")).status, 200);
});

test("picks are rate limited per user", { skip: !hasDatabase }, async () => {
  const token = await signIn("avatar_spammer");
  let limited = 0;
  for (let index = 0; index < 32; index += 1) {
    const response = await pick(token, `preset:${AVATAR_PRESETS[index % AVATAR_PRESETS.length].id}`);
    if (response.status === 429) limited += 1;
    else assert.equal(response.status, 200);
  }
  assert.equal(limited, 2);
  // Another user is not affected.
  assert.equal((await pick(await signIn("avatar_calm"), "preset:moon")).status, 200);
});

const jpegBytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);

async function uploadPhoto(token: string): Promise<{ url: string; file: string }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/me/avatar",
    headers: { authorization: `Bearer ${token}`, "content-type": "image/jpeg" },
    payload: jpegBytes,
  });
  assert.equal(response.statusCode, 200);
  const url = (JSON.parse(response.body) as { avatarUrl: string }).avatarUrl;
  return { url, file: join(STORAGE_DIR, url.match(/avatars\/[^/]+$/)![0]) };
}

/** Gives background removals time to run, then reports whether the file is still there. */
async function stillThere(file: string): Promise<boolean> {
  await new Promise((resolve) => setTimeout(resolve, 150));
  return existsSync(file);
}

const uidOf = async (token: string) => (await call("GET", "/api/me", token)).body.uid as string;
const setStoredAvatar = (uid: string, url: string) => pool.query(`update users set avatar_url = $2 where uid = $1`, [uid, url]);

test("another user's uploaded photo is never deleted through a forged avatar URL", { skip: !hasDatabase }, async () => {
  const victim = await signIn("avatar_victim");
  const photo = await uploadPhoto(victim);
  const key = photo.url.match(/avatars\/[^/]+$/)![0];
  assert.ok(existsSync(photo.file));
  const attacker = await signIn("avatar_attacker");
  const attackerUid = await uidOf(attacker);

  // Game art on an allowed host whose path carries the victim's key: a valid pick, but not the attacker's file.
  assert.equal((await pick(attacker, `https://media.rawg.io/${key}`)).status, 200);
  assert.equal((await pick(attacker, "preset:crown")).status, 200);
  assert.ok(await stillThere(photo.file), "a pick deleted another user's photo");

  // PATCH cannot store the key either, under any host or as the bare media path.
  for (const forged of [`https://evil.example/${key}`, photo.url, `https://example.com/media/${key}`]) {
    const response = await call("PATCH", "/api/me", attacker, { avatarUrl: forged });
    assert.equal(response.status, 400, forged);
    assert.equal(response.body.code, "invalid_avatar");
  }

  // Values stored before this check (old PATCH) are not trusted by the upload, pick or delete paths.
  await setStoredAvatar(attackerUid, `https://evil.example/${key}`);
  assert.equal((await pick(attacker, "preset:ghost")).status, 200);
  await setStoredAvatar(attackerUid, photo.url);
  await uploadPhoto(attacker);
  await setStoredAvatar(attackerUid, photo.url);
  assert.equal((await call("DELETE", "/api/me", attacker)).status, 200);
  assert.ok(await stillThere(photo.file), "another user's photo was deleted");
  assert.equal((await call("GET", "/api/me", victim)).body.avatarUrl, photo.url);

  // The owner's own replace still cleans up.
  assert.equal((await pick(victim, "preset:moon")).status, 200);
  assert.equal(await stillThere(photo.file), false);
});

test("deleting the account removes the user's own uploaded photo", { skip: !hasDatabase }, async () => {
  const token = await signIn("avatar_leaver");
  const photo = await uploadPhoto(token);
  assert.equal((await call("DELETE", "/api/me", token)).status, 200);
  assert.equal(await stillThere(photo.file), false);
});

test("PATCH /api/me only takes presets, game art and the user's own photos", { skip: !hasDatabase }, async () => {
  const token = await signIn("avatar_patcher");
  const uid = await uidOf(token);
  const other = await signIn("avatar_other");
  const otherUid = await uidOf(other);
  const telegramPhoto = "https://t.me/i/userpic/320/avatar_patcher.jpg";
  await pool.query(`update user_identities set photo_url = $2 where user_id = $1`, [uid, telegramPhoto]);
  await pool.query(`update user_identities set photo_url = $2 where user_id = $1`, [otherUid, "https://t.me/i/userpic/320/avatar_other.jpg"]);
  const patch = (avatarUrl: unknown) => call("PATCH", "/api/me", token, { avatarUrl });
  const stored = async () => (await call("GET", "/api/me", token)).body.avatarUrl;

  // The platform photo onboarding offers ("use my Telegram photo").
  assert.equal((await patch(telegramPhoto)).status, 200);
  assert.equal(await stored(), telegramPhoto);
  const preset = await patch("preset:wand");
  assert.equal(preset.status, 200);
  assert.equal(preset.body.avatarUrl, "preset:wand");
  const art = steamPortraitUrl(730);
  assert.equal((await patch(art)).status, 200);
  assert.equal(await stored(), art);
  assert.equal((await patch(null)).status, 200);
  assert.equal(await stored(), null);
  // Onboarding sends the URL the upload returned.
  const photo = await uploadPhoto(token);
  assert.equal((await patch(photo.url)).status, 200);
  assert.equal(await stored(), photo.url);
  // A value saved earlier by an older client can be sent back unchanged.
  const legacy = "https://legacy.example/old-avatar.png";
  await setStoredAvatar(uid, legacy);
  assert.equal((await patch(legacy)).status, 200);
  assert.equal(await stored(), legacy);

  const rejected: unknown[] = [
    "https://example.com/pixel.gif",
    "https://tracker.example/p.png?u=1",
    "http://t.me/i/userpic/320/avatar_patcher.jpg",
    "https://t.me/i/userpic/320/avatar_other.jpg",
    "javascript:alert(1)",
    "preset:nope",
    `/media/avatars/${otherUid}-abc.jpg`,
    `/media/avatars/${uid}-abc.svg`,
    `/media/avatars/${uid}-abc.jpg/../x.jpg`,
    "",
    42,
    { url: art },
  ];
  for (const value of rejected) {
    const response = await patch(value);
    assert.equal(response.status, 400, `accepted ${JSON.stringify(value)}`);
    assert.equal(response.body.code, "invalid_avatar");
  }
  assert.equal(await stored(), legacy);
  // A patch without avatarUrl leaves it alone.
  assert.equal((await call("PATCH", "/api/me", token, { status: "hi" })).body.avatarUrl, legacy);
});
