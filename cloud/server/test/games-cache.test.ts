// Unit tests for provider failures vs. real misses in the game catalog cache,
// the details cache key, "Popular now" filtering, cover enrichment and
// GameTag.steamAppId on profile saves. PostgreSQL is replaced by an in-memory
// fake on the pool (cache rows with their TTL, one users row with a model of
// users_touch_updated_at); every provider call goes through a mocked fetch.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { UserRow } from "../src/lib/profiles";

process.env.DATABASE_URL = "postgres://nobody:nobody@127.0.0.1:1/none";
process.env.RAWG_API_KEY = "";

const { pool } = await import("../src/db");
const games = await import("../src/games");
const enrich = await import("../src/enrich");
const profiles = await import("../src/lib/profiles");

// ── Fake database ──────────────────────────────────────────────────────────

interface FakeUser {
  games: string[];
  wanted_games: string[];
  game_metadata: Record<string, unknown>;
  is_online: boolean;
  updated_at: string;
}

const cache = new Map<string, { payload: unknown; seconds: number }>();
const users = new Map<string, FakeUser>();
const statements: string[] = [];
let popularRows: { name: string; count: number }[] = [];

async function fakeQuery(text: string, values: unknown[] = []): Promise<{ rows: unknown[] }> {
  statements.push(text);
  if (text.includes("insert into game_catalog_cache")) {
    cache.set(String(values[0]), { payload: JSON.parse(String(values[1])), seconds: Number(values[2]) });
    return { rows: [] };
  }
  if (text.includes("select payload from game_catalog_cache")) {
    const row = cache.get(String(values[0]));
    return { rows: row ? [{ payload: row.payload }] : [] };
  }
  if (text.includes("unnest(u.games || u.wanted_games)")) return { rows: popularRows };
  if (text.startsWith("select games, wanted_games, game_metadata from users")) {
    const user = users.get(String(values[0]));
    return { rows: user ? [structuredClone(user)] : [] };
  }
  if (text.startsWith("update users")) {
    const user = users.get(String(values[0]))!;
    const old = structuredClone(user);
    if (text.includes("game_metadata = game_metadata || $2::jsonb")) user.game_metadata = { ...user.game_metadata, ...JSON.parse(String(values[1])) };
    if (text.includes("is_online = not is_online")) user.is_online = !user.is_online;
    // users_touch_updated_at (001_init.sql): a change that leaves is_online/last_seen alone bumps updated_at.
    if (JSON.stringify(old) !== JSON.stringify(user) && old.is_online === user.is_online) user.updated_at = "now";
    return { rows: [] };
  }
  return { rows: [] };
}

const fakePool = pool as unknown as {
  query: typeof fakeQuery;
  connect: () => Promise<{ query: typeof fakeQuery; release: () => void }>;
};
fakePool.query = fakeQuery;
fakePool.connect = async () => ({ query: fakeQuery, release: () => undefined });

// ── Fake providers ─────────────────────────────────────────────────────────

const realFetch = globalThis.fetch;
beforeEach(() => {
  cache.clear();
  users.clear();
  statements.length = 0;
  popularRows = [];
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** The handler returns a JSON body, a Response, or undefined for 404; throwing is a network error. */
function mockFetch(handler: (url: URL) => unknown): string[] {
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    calls.push(url.href);
    const reply = handler(url);
    if (reply instanceof Response) return reply;
    if (reply === undefined) return new Response("not found", { status: 404 });
    return Response.json(reply);
  }) as typeof fetch;
  return calls;
}

const status = (code: number) => new Response("", { status: code });
const isSearch = (url: URL) => url.pathname === "/api/storesearch/";
const isAppDetails = (url: URL) => url.pathname === "/api/appdetails";
const wikiTitle = (url: URL) => (url.hostname === "en.wikipedia.org" ? decodeURIComponent(url.pathname.split("/").pop() ?? "") : null);
const wikiCalls = (calls: string[]) => calls.map((call) => wikiTitle(new URL(call))).filter(Boolean);

const FAILURE_SECONDS = 10 * 60;
const MISS_SECONDS = 72 * 3600;

// ── One card per game ──────────────────────────────────────────────────────

test("search shows one card per game across Steam and the offline catalog", async () => {
  mockFetch((url) => (isSearch(url) ? { items: [{ type: "app", id: 1172470, name: "Apex Legends™", tiny_image: "https://cdn.akamai.steamstatic.com/steam/apps/1172470/capsule_231x87.jpg" }] } : undefined));
  const results = await games.searchGames("apex");
  const apex = results.filter((game) => games.gameKey(game.name) === "apex legends");
  assert.equal(apex.length, 1);
  assert.equal(apex[0].steamAppId, 1172470);
  assert.equal(games.gameKey("Counter-Strike 2"), games.gameKey("Counter Strike 2"));
  assert.equal(games.gameKey("Assassin’s Creed"), games.gameKey("Assassins Creed"));
  assert.notEqual(games.gameKey("Hollow Knight: Silksong"), games.gameKey("Hollow Knight"));
});

// ── Failures vs. misses ────────────────────────────────────────────────────

test("steamSearch tells a failed request from an empty answer", async () => {
  mockFetch(() => status(429));
  assert.equal(await games.steamSearch("Anything"), null);
  assert.equal(cache.has("steam:anything"), false);
  mockFetch(() => ({ items: [] }));
  assert.deepEqual(await games.steamSearch("Anything"), []);
  assert.equal(cache.has("steam:anything"), true);
});

test("a Steam failure is neither cached as a miss nor guessed from Wikipedia", async () => {
  const failures: (() => Response)[] = [
    () => status(429),
    () => status(503),
    () => {
      throw new TypeError("fetch failed");
    },
  ];
  for (const failure of failures) {
    cache.clear();
    const calls = mockFetch((url) =>
      isSearch(url)
        ? failure()
        : { type: "standard", title: "Hades", description: "Greek god of the underworld", thumbnail: { source: "https://upload.wikimedia.org/statue.jpg" } },
    );
    assert.equal(await games.resolveCover("Hades"), null);
    assert.deepEqual(wikiCalls(calls), []);
    assert.deepEqual(cache.get("cover3:hades"), { payload: { cover: null }, seconds: FAILURE_SECONDS });
  }
});

test("a Wikipedia failure after a Steam miss is kept for minutes only", async () => {
  mockFetch((url) => (isSearch(url) ? { items: [] } : status(500)));
  assert.equal(await games.resolveCover("Some Console Game"), null);
  assert.equal(cache.get("cover3:some console game")?.seconds, FAILURE_SECONDS);
});

test("a real miss (both providers answered) is cached for 72 hours", async () => {
  mockFetch((url) => (isSearch(url) ? { items: [] } : undefined));
  assert.equal(await games.resolveCover("Nothing Matches"), null);
  assert.equal(cache.get("cover3:nothing matches")?.seconds, MISS_SECONDS);
});

test("a hashed capsule asks appdetails for the header with cc=us; while that fails the capsule is kept for minutes", async () => {
  const capsule = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2622380/abc123/capsule_231x87.jpg";
  let detailsUp = false;
  const calls = mockFetch((url) => {
    if (isSearch(url)) return { items: [{ type: "app", id: 2622380, name: "ELDEN RING NIGHTREIGN", tiny_image: capsule }] };
    if (isAppDetails(url)) return detailsUp ? { "2622380": { success: true, data: { header_image: "https://cdn/header.jpg?t=1" } } } : status(429);
    return undefined;
  });
  assert.deepEqual(await games.resolveCover("Elden Ring Nightreign"), { coverUrl: capsule, steamAppId: 2622380, title: "ELDEN RING NIGHTREIGN" });
  assert.equal(cache.get("cover3:elden ring nightreign")?.seconds, FAILURE_SECONDS);

  cache.delete("cover3:elden ring nightreign");
  detailsUp = true;
  assert.deepEqual(await games.resolveCover("Elden Ring Nightreign"), {
    coverUrl: "https://cdn/header.jpg",
    steamAppId: 2622380,
    title: "ELDEN RING NIGHTREIGN",
  });
  const details = new URL(calls.find((call) => call.includes("/api/appdetails"))!);
  assert.equal(details.searchParams.get("cc"), "us");
});

// ── Wikipedia matching ─────────────────────────────────────────────────────

test("Wikipedia: '<name> (video game)' first, the bare title only when it describes a game", async () => {
  const image = (name: string) => ({ source: `https://upload.wikimedia.org/${name}.jpg` });
  const calls = mockFetch((url) => {
    if (isSearch(url)) return { items: [] };
    switch (wikiTitle(url)) {
      case "Hades_(video_game)":
        return { type: "standard", title: "Hades (video game)", description: "2020 video game", thumbnail: image("hades-game") };
      case "Hades":
        return { type: "standard", title: "Hades", description: "Greek god of the underworld", thumbnail: image("statue") };
      case "Spider-Man":
        return {
          type: "standard",
          title: "Spider-Man",
          description: "Marvel Comics superhero",
          extract: "Spider-Man is a superhero in American comic books. He has appeared in films and video games.",
          thumbnail: image("comic"),
        };
      case "Pathologic":
        return { type: "standard", title: "Pathologic", description: "компьютерная игра 2005 года", thumbnail: image("pathologic") };
      case "Mor":
        return { type: "standard", title: "Mor", extract: "«Мор» — видеоигра в жанре survival horror.", thumbnail: image("mor") };
      case "Roblox":
        return { type: "standard", title: "Roblox", description: "Online game platform and game creation system", thumbnail: image("roblox") };
      default:
        return undefined;
    }
  });
  assert.deepEqual(await games.resolveCover("Hades"), { coverUrl: "https://upload.wikimedia.org/hades-game.jpg", steamAppId: null, title: null });
  assert.deepEqual(wikiCalls(calls), ["Hades_(video_game)"]);

  assert.equal(await games.resolveCover("Spider-Man"), null);
  assert.equal(cache.get("cover3:spider-man")?.seconds, MISS_SECONDS);
  assert.equal((await games.gameDetails({ name: "Spider-Man" })).source, "catalog");

  assert.equal((await games.resolveCover("Pathologic"))?.coverUrl, "https://upload.wikimedia.org/pathologic.jpg");
  assert.equal((await games.resolveCover("Mor"))?.coverUrl, "https://upload.wikimedia.org/mor.jpg");
  assert.equal((await games.resolveCover("Roblox"))?.coverUrl, "https://upload.wikimedia.org/roblox.jpg");
});

// ── Details ────────────────────────────────────────────────────────────────

test("game details: a failed Steam lookup is not replaced by Wikipedia and is kept for minutes only", async () => {
  const article = { type: "standard", title: "Some Article", description: "video game", extract: "Text", thumbnail: { source: "https://upload.wikimedia.org/a.jpg" } };
  let calls = mockFetch((url) => (isAppDetails(url) ? status(429) : wikiTitle(url) ? article : undefined));
  const byId = await games.gameDetails({ name: "Counter-Strike 2", steamAppId: 730 });
  assert.equal(byId.source, "catalog");
  assert.deepEqual(wikiCalls(calls), []);
  assert.equal(cache.get("details:steam:730:counter-strike 2")?.seconds, FAILURE_SECONDS);

  calls = mockFetch((url) => {
    if (isSearch(url)) throw new TypeError("fetch failed");
    return wikiTitle(url) ? article : undefined;
  });
  assert.equal((await games.gameDetails({ name: "Hades" })).source, "catalog");
  assert.deepEqual(wikiCalls(calls), []);
  assert.equal(cache.get("details:name:hades")?.seconds, FAILURE_SECONDS);
});

test("game details: a real miss is cached, a Steam success:false still falls back to Wikipedia", async () => {
  mockFetch((url) => (isSearch(url) ? { items: [] } : undefined));
  assert.equal((await games.gameDetails({ name: "Totally Unknown Game" })).source, "catalog");
  assert.equal(cache.get("details:name:totally unknown game")?.seconds, MISS_SECONDS);

  mockFetch((url) => {
    if (isAppDetails(url)) return { "100": { success: false } };
    if (wikiTitle(url) === "Region_Locked_(video_game)") {
      return { type: "standard", title: "Region Locked", extract: "A game.", thumbnail: { source: "https://upload.wikimedia.org/r.jpg" } };
    }
    return undefined;
  });
  const details = await games.gameDetails({ name: "Region Locked", steamAppId: 100 });
  assert.equal(details.source, "wikipedia");
  assert.equal(cache.get("details:steam:100:region locked")?.seconds, 7 * 24 * 3600);
});

test("game details are cached per name, so another name cannot poison an app id", async () => {
  let steamHasPage = false;
  const calls = mockFetch((url) => {
    if (isAppDetails(url)) return { "730": steamHasPage ? { success: true, data: { name: "Counter-Strike 2" } } : { success: false } };
    if (wikiTitle(url) === "Poison_(video_game)") {
      return { type: "standard", title: "Poison", extract: "Attacker text", thumbnail: { source: "https://upload.wikimedia.org/poison.jpg" } };
    }
    return undefined;
  });
  const poisoned = await games.gameDetails({ name: "Poison", steamAppId: 730 });
  assert.equal(poisoned.source, "wikipedia");

  steamHasPage = true;
  const real = await games.gameDetails({ name: "Counter-Strike 2", steamAppId: 730 });
  assert.equal(real.source, "steam");
  assert.equal(real.name, "Counter-Strike 2");
  assert.ok(cache.has("details:steam:730:poison"));
  assert.ok(cache.has("details:steam:730:counter-strike 2"));

  for (const call of calls.map((href) => new URL(href)).filter(isAppDetails)) {
    assert.equal(call.searchParams.get("cc"), "us");
    assert.equal(call.searchParams.get("l"), "russian");
  }
});

// ── Popular now ────────────────────────────────────────────────────────────

test("Popular now only shows user-entered names that are a Steam app or in the offline catalog", async () => {
  popularRows = [
    { name: "dota 2 is life", count: 5 }, // prefix of Steam's "Dota 2": kept under the players' title, which /api/players matches
    { name: "Some Wiki Article", count: 4 }, // only a Wikipedia image: left out
    { name: "mario kart 8 deluxe", count: 3 }, // console title from the offline catalog
    { name: "Baldurs Gate 3", count: 2 }, // the store title without the apostrophe: the same app
  ];
  mockFetch((url) => {
    if (isSearch(url)) {
      const term = url.searchParams.get("term");
      if (term === "dota 2 is life") return { items: [{ type: "app", id: 570, name: "Dota 2", tiny_image: null }] };
      if (term === "Baldurs Gate 3") return { items: [{ type: "app", id: 1086940, name: "Baldur's Gate 3", tiny_image: null }] };
      return { items: [] };
    }
    // A prefix match does not claim its app, so the "Dota 2" top seller keeps its tile;
    // an exact title does, so Baldur's Gate 3 is not shown twice.
    if (url.pathname === "/api/featuredcategories") {
      return {
        top_sellers: {
          items: [
            { id: 570, name: "Dota 2", header_image: "https://cdn/570.jpg" },
            { id: 1086940, name: "Baldur's Gate 3", header_image: "https://cdn/bg3.jpg" },
          ],
        },
      };
    }
    const title = wikiTitle(url);
    if (title === "Some_Wiki_Article_(video_game)" || title === "mario_kart_8_deluxe_(video_game)") {
      return { type: "standard", title, thumbnail: { source: `https://upload.wikimedia.org/${title}.jpg` } };
    }
    return undefined;
  });
  const list = await games.popularGames();
  assert.deepEqual(
    list.map((game) => [game.name, game.steamAppId]),
    [
      ["dota 2 is life", 570],
      ["Mario Kart 8 Deluxe", null],
      ["Baldurs Gate 3", 1086940],
      ["Dota 2", 570],
    ],
  );
  const usedQuery = statements.find((text) => text.includes("unnest(u.games || u.wanted_games)")) ?? "";
  assert.match(usedQuery, /not exists \(select 1 from content_rules r where r\.is_active and g ~\* r\.pattern\)/);
  // A title only one player has never becomes "popular".
  assert.match(usedQuery, /group by lower\(g\) having count\(distinct u\.uid\) >= 2/);
  assert.equal(cache.get("popular:v6")?.seconds, 12 * 3600);
});

test("Popular now: a list built without Steam's top sellers is kept for minutes only", async () => {
  mockFetch((url) => (url.pathname === "/api/featuredcategories" ? status(503) : isSearch(url) ? { items: [{ type: "app", id: 570, name: url.searchParams.get("term"), tiny_image: null }] } : undefined));
  const list = await games.popularGames();
  assert.ok(list.length > 0);
  assert.equal(cache.get("popular:v6")?.seconds, FAILURE_SECONDS);
});

// ── Cover enrichment ───────────────────────────────────────────────────────

test("cover enrichment re-reads the games after a save during a pass and keeps updated_at", async () => {
  users.set("u1", { games: ["Dota 2"], wanted_games: [], game_metadata: {}, is_online: true, updated_at: "before" });
  mockFetch((url) => {
    if (!isSearch(url)) return undefined;
    const term = url.searchParams.get("term");
    return { items: [{ type: "app", id: term === "Dota 2" ? 570 : 1145360, name: term, tiny_image: null }] };
  });
  const first = enrich.enrichUserCovers("u1");
  users.get("u1")!.games.push("Hades"); // saved while the first pass is looking up covers
  assert.equal(await enrich.enrichUserCovers("u1"), 0);
  assert.equal(await first, 2);

  const user = users.get("u1")!;
  assert.deepEqual(Object.keys(user.game_metadata).sort(), ["dota 2", "hades"]);
  assert.equal((user.game_metadata.hades as { steamAppId: number }).steamAppId, 1145360);
  assert.equal(user.updated_at, "before");
  assert.equal(user.is_online, true);
});

// ── Profiles ───────────────────────────────────────────────────────────────

test("profile saves keep a valid GameTag.steamAppId and cards return it", () => {
  const columns = profiles.profileUpdateToColumns({
    gameMetadata: {
      prey: { name: "Prey", coverUrl: "https://example.com/prey.jpg", rawgId: null, steamAppId: 3970 },
      negative: { name: "Negative", steamAppId: -1 },
      fraction: { name: "Fraction", steamAppId: 1.5 },
    },
  });
  const metadata = JSON.parse(String(columns.game_metadata));
  assert.equal(metadata.prey.steamAppId, 3970);
  assert.equal(metadata.negative.steamAppId, null);
  assert.equal(metadata.fraction.steamAppId, null);

  const card = profiles.toProfileCard({ uid: "u1", games: ["Prey"], game_metadata: metadata } as unknown as UserRow);
  assert.equal(card.games[0].steamAppId, 3970);
});
