// Unit tests for game providers, AirShare matching and remote env parsing.
// The database is deliberately unreachable here: cache reads/writes must fail
// silently, and every provider call goes through a mocked fetch.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

process.env.DATABASE_URL = "postgres://nobody:nobody@127.0.0.1:1/none";
process.env.RAWG_API_KEY = "";

const games = await import("../src/games");
const airshare = await import("../src/airshare");
const { parseEnvLines } = await import("../src/bootstrap-env");

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  airshare.resetAirshare();
});

type Route = (url: URL) => unknown;
function mockFetch(routes: Record<string, Route>): string[] {
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    calls.push(url.href);
    for (const [prefix, handler] of Object.entries(routes)) {
      if (url.href.startsWith(prefix)) {
        const body = handler(url);
        if (body === undefined) return new Response("not found", { status: 404 });
        return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      }
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return calls;
}

const STORESEARCH = "https://store.steampowered.com/api/storesearch/";

test("maps Steam search results and drops soundtracks, DLC and demos", () => {
  const results = games.mapSteamSearch([
    { type: "app", id: 1245620, name: "ELDEN RING", tiny_image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1245620/capsule_231x87.jpg?t=1" },
    { type: "app", id: 2622380, name: "ELDEN RING NIGHTREIGN", tiny_image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2622380/abc123/capsule_231x87.jpg?t=2" },
    { type: "app", id: 1, name: "ELDEN RING Soundtrack" },
    { type: "app", id: 2, name: "Some Game - Season Pass" },
    { type: "app", id: 3, name: "Some Game Demo" },
    { type: "app", id: 4, name: "Some Game DLC" },
    { type: "sub", id: 5, name: "ELDEN RING Bundle" },
  ]);
  assert.deepEqual(results.map((game) => game.name), ["ELDEN RING", "ELDEN RING NIGHTREIGN"]);
  assert.equal(results[0].backgroundImage, "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1245620/header.jpg");
  // Hashed asset paths cannot be turned into header.jpg; the capsule is kept.
  assert.equal(results[1].backgroundImage, "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2622380/abc123/capsule_231x87.jpg");
  assert.equal(results[0].source, "steam");
  assert.equal(results[0].steamAppId, 1245620);
});

test("game search uses Steam without a RAWG key and keeps the offline catalog", async () => {
  mockFetch({
    [STORESEARCH]: () => ({ items: [{ type: "app", id: 1245620, name: "ELDEN RING", tiny_image: null }] }),
  });
  const results = await games.searchGames("elden");
  assert.equal(results[0].name, "ELDEN RING");
  assert.equal(results[0].source, "steam");
  // "Elden Ring" from the offline catalog is the same title and is not duplicated.
  assert.equal(results.filter((game) => game.name.toLowerCase() === "elden ring").length, 1);
});

test("game search falls back to the offline catalog when providers are down", async () => {
  mockFetch({});
  const results = await games.searchGames("stardew");
  assert.deepEqual(results.map((game) => game.name), ["Stardew Valley"]);
  assert.equal(results[0].source, "catalog");
});

test("maps Steam app details", () => {
  const details = games.mapSteamDetails(
    {
      name: "ELDEN RING",
      short_description: "<b>НОВЫЙ</b> ролевой боевик &amp; приключение",
      header_image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1245620/header.jpg?t=1",
      genres: [{ description: "Экшены" }, { description: "Ролевые игры" }],
      release_date: { date: "24 фев. 2022 г." },
      metacritic: { score: 94 },
      platforms: { windows: true, mac: false, linux: true },
    },
    "Elden Ring",
  );
  assert.deepEqual(details, {
    name: "ELDEN RING",
    image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1245620/header.jpg",
    rating: 4.7,
    playtimeHours: null,
    platforms: ["PC", "Linux"],
    genres: ["Экшены", "Ролевые игры"],
    released: "24 фев. 2022 г.",
    about: "НОВЫЙ ролевой боевик & приключение",
    source: "steam",
  });
});

test("game details find the Steam app by name, then fall back to Wikipedia", async () => {
  mockFetch({
    [STORESEARCH]: (url) =>
      url.searchParams.get("term") === "Hades" ? { items: [{ type: "app", id: 1145360, name: "Hades", tiny_image: null }] } : { items: [] },
    "https://store.steampowered.com/api/appdetails": () => ({
      "1145360": { success: true, data: { name: "Hades", short_description: "Defy the god of the dead", genres: [{ description: "Action" }] } },
    }),
    "https://en.wikipedia.org/api/rest_v1/page/summary/Super_Mario_Odyssey": () => ({
      type: "standard",
      title: "Super Mario Odyssey",
      description: "2017 video game",
      extract: "A 2017 platform game.",
      thumbnail: { source: "https://upload.wikimedia.org/wikipedia/en/8/8d/Super_Mario_Odyssey.jpg?utm_source=x" },
    }),
  });
  const hades = await games.gameDetails({ name: "Hades" });
  assert.equal(hades.source, "steam");
  assert.equal(hades.about, "Defy the god of the dead");

  const mario = await games.gameDetails({ name: "Super Mario Odyssey" });
  assert.equal(mario.source, "wikipedia");
  assert.equal(mario.image, "https://upload.wikimedia.org/wikipedia/en/8/8d/Super_Mario_Odyssey.jpg");

  const unknown = await games.gameDetails({ name: "Totally Unknown Game" });
  assert.deepEqual(unknown, { name: "Totally Unknown Game", image: null, rating: null, playtimeHours: null, platforms: [], genres: [], released: null, about: null, source: "catalog" });
});

test("resolveCover prefers Steam and uses Wikipedia for console exclusives", async () => {
  mockFetch({
    [STORESEARCH]: (url) =>
      url.searchParams.get("term") === "Dota 2" ? { items: [{ type: "app", id: 570, name: "Dota 2", tiny_image: null }] } : { items: [{ type: "app", id: 9, name: "Unrelated Thing", tiny_image: null }] },
    "https://en.wikipedia.org/api/rest_v1/page/summary/Mario_Kart_8_Deluxe": () => ({
      type: "standard",
      description: "2017 video game",
      thumbnail: { source: "https://upload.wikimedia.org/wikipedia/en/b/b5/MarioKart8Boxart.jpg" },
    }),
  });
  assert.deepEqual(await games.resolveCover("Dota 2"), {
    coverUrl: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/570/header.jpg",
    steamAppId: 570,
    title: "Dota 2",
  });
  assert.deepEqual(await games.resolveCover("Mario Kart 8 Deluxe"), {
    coverUrl: "https://upload.wikimedia.org/wikipedia/en/b/b5/MarioKart8Boxart.jpg",
    steamAppId: null,
    title: null,
  });
  assert.equal(await games.resolveCover("Nothing Matches At All"), null);
});

// ── AirShare ───────────────────────────────────────────────────────────────

test("AirShare matches people on the same network", () => {
  const t = 1_000_000;
  assert.deepEqual(airshare.airsharePing("a", {}, "203.0.113.5", t), []);
  assert.deepEqual(airshare.airsharePing("b", {}, "203.0.113.5", t + 10), ["a"]);
  assert.deepEqual(airshare.airsharePing("a", {}, "203.0.113.5", t + 2_000), ["b"]);
});

test("AirShare matches by distance and ignores far-away users", () => {
  const t = 2_000_000;
  // Red Square, ~100 m apart, different networks.
  airshare.airsharePing("a", { lat: 55.7539, lng: 37.6208, accuracy: 30 }, "198.51.100.1", t);
  const near = airshare.airsharePing("b", { lat: 55.7548, lng: 37.6208, accuracy: 30 }, "198.51.100.2", t + 5);
  assert.deepEqual(near, ["a"]);
  // ~5 km away on yet another network.
  const far = airshare.airsharePing("c", { lat: 55.7989, lng: 37.6208, accuracy: 30 }, "198.51.100.3", t + 10);
  assert.deepEqual(far, []);
  assert.ok(airshare.distanceMeters(55.7539, 37.6208, 55.7548, 37.6208) < 120);
});

test("AirShare presence expires and can be left explicitly", () => {
  const t = 3_000_000;
  airshare.airsharePing("a", {}, "192.0.2.10", t);
  assert.deepEqual(airshare.airsharePing("b", {}, "192.0.2.10", t + airshare.PRESENCE_TTL_MS + 1), []);
  airshare.airsharePing("c", {}, "192.0.2.10", t + airshare.PRESENCE_TTL_MS + 2);
  airshare.airshareLeave("c", t + airshare.PRESENCE_TTL_MS + 2);
  assert.deepEqual(airshare.airsharePing("b", {}, "192.0.2.10", t + airshare.PRESENCE_TTL_MS + 3_000), []);
});

test("AirShare ignores invalid coordinates and throttles pings", () => {
  const t = 4_000_000;
  airshare.airsharePing("a", { lat: 999, lng: 37 }, "192.0.2.20", t);
  airshare.airsharePing("a", { lat: 55, lng: 37 }, "192.0.2.21", t + 100); // within 1 s: not recorded
  assert.deepEqual(airshare.airsharePing("b", {}, "192.0.2.20", t + 200), ["a"]);
  assert.deepEqual(airshare.airsharePing("c", {}, "192.0.2.21", t + 300), []);
});

test("parses remote env lines", () => {
  assert.deepEqual(
    parseEnvLines(`# comment\nRAWG_API_KEY=abc123\n\n TELEGRAM_API_IP = 149.154.167.220 \nQUOTED="a b"\nlower=ignored\n=nokey\n`),
    { RAWG_API_KEY: "abc123", TELEGRAM_API_IP: "149.154.167.220", QUOTED: "a b" },
  );
});
