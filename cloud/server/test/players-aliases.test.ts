// /api/players and the people list of /api/search against a real PostgreSQL
// database: a game saved under an alias ("гта 6"), another spelling ("GTA VI")
// or a store edition ("Grand Theft Auto V Enhanced") belongs to the same game
// card search shows. Requires DATABASE_URL; providers are offline.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

process.env.DEV_AUTH = "1";
process.env.TELEGRAM_BOT_MODE = "off";
process.env.COVER_ENRICHMENT = "0";
process.env.RAWG_API_KEY = "";
process.env.STORAGE_LOCAL_DIR = `/tmp/unishare-test-${process.pid}`;
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

async function player(name: string, games: string[]): Promise<string> {
  const auth = await call("POST", "/api/auth/dev", undefined, { name });
  assert.equal(auth.status, 200, JSON.stringify(auth.body));
  const saved = await call("PATCH", "/api/me", auth.body.token, {
    username: name,
    platforms: ["PC"],
    platformGames: { PC: games },
    onboardingComplete: true,
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  return auth.body.token as string;
}

test("players of a game: aliases, spellings and store editions list the same people", { skip: !hasDatabase }, async () => {
  const me = await player("Searcher", ["Dota 2"]);
  await player("slang_fan", ["гта 6"]);
  await player("caps_fan", ["GTA VI"]);
  await player("title_fan", ["Grand Theft Auto VI"]);
  await player("enhanced_fan", ["Grand Theft Auto V Enhanced"]);
  await player("legacy_fan", ["Grand Theft Auto V"]);
  await player("skyrim_fan", ["The Elder Scrolls V: Skyrim Special Edition"]);
  await player("series_fan", ["гта"]);
  await player("cs_original", ["Counter-Strike"]);
  await player("cs2_fan", ["Counter-Strike 2"]);

  const players = async (game: string) => {
    const response = await call<{ username: string }[]>("GET", `/api/players?game=${encodeURIComponent(game)}`, me);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return response.body.map((card) => card.username).sort();
  };
  const gta6 = ["caps_fan", "slang_fan", "title_fan"];
  assert.deepEqual(await players("Grand Theft Auto VI"), gta6);
  assert.deepEqual(await players("гта 6"), gta6);
  assert.deepEqual(await players("GTA 6"), gta6);
  // The card search shows ("Grand Theft Auto V") and the store name an older profile saved list the same people.
  assert.deepEqual(await players("Grand Theft Auto V"), ["enhanced_fan", "legacy_fan"]);
  assert.deepEqual(await players("Grand Theft Auto V Enhanced"), ["enhanced_fan", "legacy_fan"]);
  assert.deepEqual(await players("The Elder Scrolls V: Skyrim"), ["skyrim_fan"]);
  assert.deepEqual(await players("Counter-Strike"), ["cs_original"]);
  assert.deepEqual(await players("Counter-Strike 2"), ["cs2_fan"]);

  // People search: "гта 6" finds whoever saved any name of Grand Theft Auto VI, not the series slang.
  const people = async (q: string) => {
    const response = await call<{ users: { username: string }[] }>("GET", `/api/search?q=${encodeURIComponent(q)}`, me);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return response.body.users.map((card) => card.username).sort();
  };
  for (const q of ["гта 6", "gta 6", "GTA VI"]) {
    const found = await people(q);
    for (const name of gta6) assert.ok(found.includes(name), `${q}: ${found.join(", ")}`);
    assert.ok(!found.includes("series_fan") && !found.includes("legacy_fan"), `${q}: ${found.join(", ")}`);
  }
  assert.ok((await people("гта")).includes("series_fan"));
  // Store editions older profiles saved; "кс 1.6" (Steam's "Counter-Strike") is not CS2.
  assert.deepEqual((await people("гта 5")).filter((name) => name.endsWith("_fan")), ["enhanced_fan", "legacy_fan"]);
  assert.ok((await people("скайрим")).includes("skyrim_fan"));
  assert.deepEqual(await people("кс 1.6"), ["cs_original"]);
});
