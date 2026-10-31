// Unit tests for game search: the alias table (Russian names, slang,
// abbreviations), query normalization, store queries with canonical names,
// sequels the table does not have, add-on filtering, ranking, the result cap,
// covers within a time budget, hand-set covers and the name matching
// /api/players and the people search use. PostgreSQL is replaced by an
// in-memory cache and override table on the pool; every provider call goes
// through a mocked fetch, as in games-cache.test.ts.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { findGameAliases, gameSearchKey, canonicalGame, GAME_ALIASES } from "@unishare/shared";

process.env.DATABASE_URL = "postgres://nobody:nobody@127.0.0.1:1/none";
process.env.RAWG_API_KEY = "";

const { pool } = await import("../src/db");
const games = await import("../src/games");

// ── Fake database and providers ────────────────────────────────────────────

const cache = new Map<string, unknown>();
interface Override {
  game_id: number;
  name: string;
  background_image: string | null;
  search_terms: string[];
}
let overrides: Override[] = [];

async function fakeQuery(text: string, values: unknown[] = []): Promise<{ rows: unknown[] }> {
  if (text.includes("insert into game_catalog_cache")) cache.set(String(values[0]), JSON.parse(String(values[1])));
  if (text.includes("select payload from game_catalog_cache") && cache.has(String(values[0]))) return { rows: [{ payload: cache.get(String(values[0])) }] };
  if (text.includes("from game_catalog_overrides") && text.includes("coalesce(background_image")) {
    // resolveCover: an enabled row of that name or search term with a cover.
    const name = String(values[0]).toLowerCase();
    const row = overrides.find((item) => item.background_image && (item.name.toLowerCase() === name || item.search_terms.includes(name)));
    return { rows: row ? [{ background_image: row.background_image }] : [] };
  }
  if (text.includes("from game_catalog_overrides")) {
    // Search: the name or a search term contains the query, or the name is a title the query names.
    const [needle, titles] = values as [string, string[]];
    const rows = overrides.filter(
      (item) => item.name.toLowerCase().includes(needle) || titles.includes(item.name.toLowerCase()) || item.search_terms.some((term) => term.includes(needle)),
    );
    return { rows: rows.map((item) => ({ game_id: item.game_id, name: item.name, background_image: item.background_image, released: null })) };
  }
  return { rows: [] };
}
(pool as unknown as { query: typeof fakeQuery }).query = fakeQuery;

const realFetch = globalThis.fetch;
beforeEach(() => {
  cache.clear();
  overrides = [];
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** The handler returns a JSON body, a Response, a promise of either, or undefined for 404; throwing is a network error. */
function mockFetch(handler: (url: URL) => unknown): URL[] {
  const calls: URL[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    calls.push(url);
    const reply = await handler(url);
    if (reply instanceof Response) return reply;
    if (reply === undefined) return new Response("not found", { status: 404 });
    return Response.json(reply);
  }) as typeof fetch;
  return calls;
}

const isSearch = (url: URL) => url.pathname === "/api/storesearch/";
const steamTerms = (calls: URL[]) => calls.filter(isSearch).map((url) => url.searchParams.get("term"));
const wikiTitle = (url: URL) => (url.hostname === "en.wikipedia.org" ? decodeURIComponent(url.pathname.split("/").pop() ?? "") : null);
const ruWikiTitle = (url: URL) => (url.hostname === "ru.wikipedia.org" ? decodeURIComponent(url.pathname.split("/").pop() ?? "") : null);
const app = (id: number, name: string) => ({ type: "app", id, name, tiny_image: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/capsule_231x87.jpg?t=1` });
const names = (results: { name: string }[]) => results.map((game) => game.name);
const titles = (query: string) => findGameAliases(query).map((match) => match.title);

/** Steam answers from a fixed catalog by term; Wikipedia knows GTA VI. */
const STEAM: Record<string, ReturnType<typeof app>[]> = {
  "Grand Theft Auto": [
    app(3240220, "Grand Theft Auto V Enhanced"),
    app(12210, "Grand Theft Auto IV: The Complete Edition"),
    app(1547000, "Grand Theft Auto: San Andreas – The Definitive Edition"),
    app(1546990, "Grand Theft Auto: Vice City – The Definitive Edition"),
    app(1546970, "Grand Theft Auto III – The Definitive Edition"),
    app(12220, "Grand Theft Auto: Episodes from Liberty City"),
  ],
  "Grand Theft Auto V": [app(3240220, "Grand Theft Auto V Enhanced")],
  "Counter-Strike": [
    app(730, "Counter-Strike 2"),
    app(2678630, "Counter-Strike 2 Soundtrack"),
    app(10, "Counter-Strike"),
    app(240, "Counter-Strike: Source"),
    app(666220, "CS2D"),
    app(647631, "Pure Farming 2018 - Gomselmash Palesse CS-200"),
  ],
  "The Witcher": [app(292030, "The Witcher 3: Wild Hunt — Remastered"), app(20900, "The Witcher: Enhanced Edition Director's Cut"), app(1229320, "The Witcher 3: Wild Hunt — Remastered Soundtrack")],
  "Red Dead Redemption": [app(1174180, "Red Dead Redemption 2"), app(2668510, "Red Dead Redemption"), app(4147110, "Deadrock Redemption 2")],
  Minecraft: [app(1672970, "Minecraft Dungeons"), app(1928870, "Minecraft Legends"), app(5167410, "Minecraft Dungeons II Deluxe Upgrade")],
  "god of war": [
    app(1593500, "God of War"),
    app(2322010, "God of War Ragnarök"),
    app(2974330, "God of War Ragnarök - Digital Deluxe Edition Upgrade"),
    app(2974310, "God of War Ragnarök Soundtrack"),
    app(2974340, "God of War Ragnarök - Digital Artbook"),
    app(914120, "Shadow Unit - GOD OF WAR EDITION"),
    app(506803, "RTK13 - Additional scenario 〝The God of War, Surrounded″ 追加シナリオ「軍神包囲網」"),
    app(392640, 'NOBUNAGA\'S AMBITION: SoI - Scenario 2 "God of War Descends"'),
    app(1197700, "Hermes: War of the Gods"),
  ],
  // Live answers (October 2026) for sequels the alias table does not have.
  Fallout: [app(377160, "Fallout 4"), app(1151340, "Fallout 76"), app(22380, "Fallout: New Vegas"), app(588430, "Fallout Shelter"), app(22370, "Fallout 3: Game of the Year Edition")],
  "Fallout 2": [app(38410, "Fallout 2: A Post Nuclear Role Playing Game"), app(3245750, "Fantasy Grounds - Fallout RPG - NPC Pack 2 - Enclave Remnants")],
  "Hitman 2": [app(6850, "Hitman 2: Silent Assassin"), app(1829590, "HITMAN 3 Access Pass: HITMAN 2 Expansion")],
  "The Sims 3": [app(47890, "The Sims™ 3"), app(223594, "The Sims 3: Seasons"), app(47930, "The Sims™ 3 Pets")],
  "The Sims": [app(1222670, "The Sims™ 4"), app(47890, "The Sims™ 3")],
  "Doom 64": [app(1148590, "DOOM 64"), app(3297340, "Doomed Hell 64: FPS Dungeon Crawler")],
  "Sid Meier's Civilization IV": [app(3900, "Sid Meier's Civilization® IV"), app(16810, "Sid Meier's Civilization IV: Colonization"), app(3958350, "Sid Meier's Civilization® VII: Sayyida al Hurra Pack")],
  "civ 4": [app(1357210, "Galactic Civilizations IV"), app(3900, "Sid Meier's Civilization® IV"), app(8800, "Civilization IV: Beyond the Sword")],
  "Far Cry 2": [app(19900, "Far Cry® 2"), app(2369456, "Far Cry® 6 DLC 2 Pagan: Control")],
  "The Elder Scrolls V: Skyrim": [
    app(489830, "The Elder Scrolls V: Skyrim Special Edition"),
    app(1746860, "The Elder Scrolls V: Skyrim Anniversary Upgrade"),
    app(611670, "The Elder Scrolls V: Skyrim VR"),
    app(365720, "Skyrim Script Extender (SKSE)"),
    app(1946180, "Skyrim Special Edition: Creation Kit"),
    app(1240360, "The Elder Scrolls V: Skyrim Soundtrack"),
    app(598120, "The Elder Scrolls V: Skyrim Special Edition - Creations"),
  ],
};

function storeMock(url: URL): unknown {
  if (isSearch(url)) {
    const term = (url.searchParams.get("term") ?? "").toLowerCase();
    return { items: Object.entries(STEAM).find(([key]) => key.toLowerCase() === term)?.[1] ?? [] };
  }
  if (url.pathname === "/api/appdetails") return {};
  if (wikiTitle(url) === "Grand_Theft_Auto_VI") {
    return { type: "standard", title: "Grand Theft Auto VI", description: "Upcoming video game", thumbnail: { source: "https://upload.wikimedia.org/gta6.png?utm=1" } };
  }
  return undefined;
}

// ── Aliases and normalization ──────────────────────────────────────────────

test("every alias from the brief names its game", () => {
  const expected: [string, string][] = [
    ["гта", "Grand Theft Auto V"],
    ["gta", "Grand Theft Auto VI"],
    ["гта 5", "Grand Theft Auto V"],
    ["gta 5", "Grand Theft Auto V"],
    ["gta v", "Grand Theft Auto V"],
    ["гта 6", "Grand Theft Auto VI"],
    ["gta 6", "Grand Theft Auto VI"],
    ["gta vi", "Grand Theft Auto VI"],
    ["гта са", "Grand Theft Auto: San Andreas"],
    ["кс", "Counter-Strike 2"],
    ["кс2", "Counter-Strike 2"],
    ["кс 2", "Counter-Strike 2"],
    ["cs", "Counter-Strike 2"],
    ["cs2", "Counter-Strike 2"],
    ["контра", "Counter-Strike 2"],
    ["кс го", "Counter-Strike: Global Offensive"],
    ["csgo", "Counter-Strike: Global Offensive"],
    ["дота", "Dota 2"],
    ["дота 2", "Dota 2"],
    ["ведьмак", "The Witcher 3: Wild Hunt"],
    ["ведьмак 3", "The Witcher 3: Wild Hunt"],
    ["киберпанк", "Cyberpunk 2077"],
    ["майнкрафт", "Minecraft"],
    ["майн", "Minecraft"],
    ["рдр 2", "Red Dead Redemption 2"],
    ["рдр2", "Red Dead Redemption 2"],
    ["rdr2", "Red Dead Redemption 2"],
    ["лол", "League of Legends"],
    ["вов", "World of Warcraft"],
    ["пабг", "PUBG: Battlegrounds"],
    ["pubg", "PUBG: Battlegrounds"],
    ["фифа", "EA Sports FC 25"],
    ["fifa", "EA Sports FC 24"],
    ["fc 25", "EA Sports FC 25"],
    ["фк 25", "EA Sports FC 25"],
    ["бг3", "Baldur's Gate 3"],
    ["bg3", "Baldur's Gate 3"],
    ["балдурс гейт", "Baldur's Gate 3"],
    ["элден ринг", "Elden Ring"],
    ["апекс", "Apex Legends"],
    ["валорант", "Valorant"],
    ["фортнайт", "Fortnite"],
    ["варфейс", "Warface"],
    ["танки", "World of Tanks"],
    ["танки", "Мир танков"],
    ["вот", "World of Tanks"],
    ["wot", "World of Tanks"],
    ["мир танков", "Мир танков"],
    ["вар тандер", "War Thunder"],
    ["сталкер 2", "S.T.A.L.K.E.R. 2: Heart of Chornobyl"],
    ["хеллдайверс", "Helldivers 2"],
    ["роблокс", "Roblox"],
    ["геншин", "Genshin Impact"],
    ["зельда", "The Legend of Zelda: Tears of the Kingdom"],
    ["марио карт", "Mario Kart 8 Deluxe"],
    ["смэш", "Super Smash Bros. Ultimate"],
    ["покемон", "Pokémon Scarlet"],
    ["тлоу", "The Last of Us Part II"],
    ["the last of us", "The Last of Us Part I"],
    ["год оф вар", "God of War"],
    ["гов", "God of War Ragnarök"],
    ["хорайзон", "Horizon Forbidden West"],
    ["спайдермен", "Marvel's Spider-Man 2"],
    ["асасин", "Assassin's Creed Shadows"],
    ["ассасин", "Assassin's Creed Valhalla"],
    ["фар край", "Far Cry 6"],
    ["колда", "Call of Duty: Warzone"],
    ["cod", "Call of Duty: Black Ops 6"],
    ["call of duty", "Call of Duty: Black Ops 7"],
    ["батла", "Battlefield 6"],
    ["battlefield", "Battlefield 2042"],
    ["раст", "Rust"],
    ["дейз", "DayZ"],
    ["тарков", "Escape from Tarkov"],
    ["eft", "Escape from Tarkov"],
    ["скайрим", "The Elder Scrolls V: Skyrim"],
    ["фоллаут", "Fallout 4"],
    ["хогвартс", "Hogwarts Legacy"],
    ["стардью", "Stardew Valley"],
    ["террария", "Terraria"],
    ["амонг ас", "Among Us"],
    ["фазмофобия", "Phasmophobia"],
    ["дбд", "Dead by Daylight"],
    ["dead by daylight", "Dead by Daylight"],
    ["ark", "ARK: Survival Ascended"],
    ["palworld", "Palworld"],
  ];
  for (const [query, title] of expected) {
    assert.ok(titles(query).includes(title), `${query} -> ${title}: ${titles(query).join(", ")}`);
  }
  assert.ok(GAME_ALIASES.length >= 120);
});

test("queries are normalized: case, ё, punctuation, spacing, letters next to digits, Roman numerals", () => {
  for (const query of ["GTA VI", "gta 6", "гта 6", "ГТА  6!", "Grand Theft Auto 6", "grand theft auto vi", "gta6", "гта vi"]) {
    assert.equal(findGameAliases(query)[0]?.title, "Grand Theft Auto VI", query);
  }
  assert.equal(gameSearchKey("Ёжик"), gameSearchKey("ежик"));
  assert.equal(gameSearchKey("S.T.A.L.K.E.R. 2"), "stalker 2");
  assert.equal(gameSearchKey("Super Smash Bros. Ultimate"), "super smash bros ultimate");
  assert.equal(gameSearchKey("cs2"), gameSearchKey("CS 2"));
  assert.equal(gameSearchKey("Final Fantasy XIV"), "final fantasy 14");
  assert.equal(gameSearchKey("The Last of Us Part I"), "the last of us part 1");
  // A lone "I" is a word unless it ends the title.
  assert.equal(gameSearchKey("I Am Bread"), "i am bread");
  assert.equal(gameSearchKey("Baldur's Gate 3"), gameSearchKey("Baldurs Gate 3"));
  assert.equal(gameSearchKey("Heroes of Might & Magic III"), "heroes of might and magic 3");
});

test("short queries find the games they start; the Russian layout typo is understood", () => {
  assert.deepEqual(titles("гта").slice(0, 5), [
    "Grand Theft Auto V",
    "Grand Theft Auto VI",
    "Grand Theft Auto: San Andreas",
    "Grand Theft Auto IV",
    "Grand Theft Auto: Vice City",
  ]);
  assert.ok(findGameAliases("ведьм").every((match) => !match.exact && match.title.startsWith("The Witcher")));
  assert.equal(findGameAliases("пеф")[0]?.title, "Grand Theft Auto V"); // "gta" with the Russian layout on
  assert.equal(findGameAliases("сыпщ")[0]?.title, "Counter-Strike: Global Offensive"); // "csgo"
  // Next to an exact alias only longer names of the same word count.
  assert.ok(!titles("вот").some((title) => title.startsWith("Watch Dogs")));
  assert.deepEqual(findGameAliases("abcdefgh"), []);
  assert.deepEqual(findGameAliases("minecraft dungeons"), []); // another game, left to the stores
  assert.deepEqual(titles("гта 5 рп сервер"), ["Grand Theft Auto V"]);
});

test("a series alias with a number the table does not have is never an exact match", () => {
  for (const query of ["fallout 2", "фоллаут 2", "hitman 2", "хитман 2", "симс 3", "doom 64", "civ 4", "far cry 2"]) {
    const matches = findGameAliases(query);
    assert.ok(matches.length > 0, query);
    assert.ok(matches.every((match) => !match.exact), `${query}: ${matches.map((match) => match.title).join(", ")}`);
    assert.ok(matches.some((match) => match.sequel), query);
  }
  assert.deepEqual(findGameAliases("fallout 2").find((match) => match.sequel)?.sequel, { alias: "fallout", number: 2 });
  // A number that is a word of a title still names it; a part of one does not.
  assert.deepEqual(findGameAliases("фоллаут 76").filter((match) => match.exact).map((match) => match.title), ["Fallout 76"]);
  assert.equal(findGameAliases("ведьмак 3")[0].title, "The Witcher 3: Wild Hunt");
  assert.equal(findGameAliases("фоллаут 7")[0].title, "Fallout 76");
  assert.ok(findGameAliases("фоллаут 7").every((match) => !match.exact));
});

test("canonicalGame maps one-game aliases, not series", () => {
  assert.deepEqual(canonicalGame("гта 6"), { title: "Grand Theft Auto VI", store: "other" });
  assert.deepEqual(canonicalGame("Hades"), { title: "Hades", store: "steam" });
  assert.equal(canonicalGame("гта"), null);
  assert.equal(canonicalGame("Spider-Man"), null);
  assert.equal(canonicalGame("Some Indie Game"), null);
  // Steam's "Counter-Strike" is 1.6, not CS2.
  assert.equal(canonicalGame("Counter-Strike")?.title, "Counter-Strike");
  assert.equal(canonicalGame("кс 1.6")?.title, "Counter-Strike");
});

test("one game, one name: aliases, editions and spellings match for /api/players and the people search", () => {
  const gta6 = games.gameMatcher("Grand Theft Auto VI");
  for (const name of ["Grand Theft Auto VI", "гта 6", "ГТА 6", "GTA VI", "gta6", "GTA-6", "Grand Theft Auto 6"]) assert.ok(gta6(name), name);
  for (const name of ["гта", "Grand Theft Auto V", "GTA 5", "Grand Theft Auto V Enhanced"]) assert.ok(!gta6(name), name);

  const gta5 = games.gameMatcher("Grand Theft Auto V Enhanced");
  for (const name of ["Grand Theft Auto V", "Grand Theft Auto V Legacy", "Grand Theft Auto V Enhanced", "гта 5", "GTA V"]) assert.ok(gta5(name), name);
  const skyrim = games.gameMatcher("The Elder Scrolls V: Skyrim");
  for (const name of ["The Elder Scrolls V: Skyrim Special Edition", "скайрим", "The Elder Scrolls V: Skyrim Anniversary Edition"]) assert.ok(skyrim(name), name);
  assert.ok(!skyrim("The Elder Scrolls V: Skyrim VR"));
  assert.ok(games.gameMatcher("Apex Legends")("Apex Legends™"));
  assert.ok(games.gameMatcher("Some Saga")("Some Saga – The Definitive Edition"));
  assert.ok(!games.gameMatcher("Counter-Strike 2")("Counter-Strike"));
  assert.ok(!games.gameMatcher("Hogwarts Legacy")("Hogwarts Legacy 2"));

  assert.equal(games.canonicalTitle("гта 6"), "Grand Theft Auto VI");
  assert.equal(games.canonicalTitle("Grand Theft Auto IV: The Complete Edition"), "Grand Theft Auto IV");
  assert.equal(games.canonicalTitle("ELDEN RING"), "Elden Ring");
  assert.equal(games.canonicalTitle("Some Indie Game"), "Some Indie Game");

  // SQL pre-filter: every saved form contains one of the words.
  const filter = games.gameFilter("Grand Theft Auto VI");
  assert.ok(filter.names.includes("grand theft auto vi") && filter.names.includes("гта 6") && filter.names.includes("gta 6"));
  assert.ok(!filter.names.includes("гта"), "a series alias is not a name of one game");
  for (const saved of ["GTA VI", "gta6", "ГТА 6", "Grand Theft Auto VI"]) {
    assert.ok(filter.names.includes(saved.toLowerCase()) || filter.words.some((word) => saved.toLowerCase().includes(word)), saved);
  }
  assert.ok(games.gameFilter("Pokémon Scarlet").words.includes("pokemon"));

  const people = games.queryGameFilter("гта 6");
  for (const name of ["grand theft auto vi", "grand theft auto 6", "gta 6", "gta vi", "gta6", "гта 6", "гта6"]) assert.ok(people.names.includes(name), name);
  assert.ok(!people.names.includes("гта"));
  assert.deepEqual(games.queryGameFilter("гта 5").editions, ["grand theft auto v %", "grand theft auto v:%"]);
  // "Counter-Strike %" would find CS2 players.
  assert.deepEqual(games.queryGameFilter("кс 1.6").editions, []);
  assert.deepEqual(games.queryGameFilter("ведьм"), { names: [], editions: [] }, "only games the query names exactly");
});

// ── Search ─────────────────────────────────────────────────────────────────

test("'gta 6', 'гта 6', 'GTA VI' and 'Grand Theft Auto 6' put Grand Theft Auto VI first, with its cover", async () => {
  for (const query of ["gta 6", "гта 6", "GTA VI", "Grand Theft Auto 6"]) {
    cache.clear();
    const calls = mockFetch(storeMock);
    const results = await games.searchGames(query);
    assert.equal(results[0].name, "Grand Theft Auto VI", query);
    assert.equal(results[0].backgroundImage, "https://upload.wikimedia.org/gta6.png", query);
    assert.equal(results[0].steamAppId, null);
    // GTA VI is not on Steam: the store is asked for the series, the cover comes from Wikipedia only.
    assert.equal(steamTerms(calls)[0], "Grand Theft Auto", query);
    // The rest of the series under the alias table's titles, as "гта 5" shows them.
    assert.deepEqual(names(results).slice(1, 3), ["Grand Theft Auto V", "Grand Theft Auto IV"], query);
    assert.equal(results[1].steamAppId, 3240220, query);
    assert.ok(results[1].backgroundImage, query);
  }
});

test("a sequel the table does not have comes first, the rest of its series after it", async () => {
  const cases: [string, string, string][] = [
    ["fallout 2", "Fallout 2", "Fallout 2: A Post Nuclear Role Playing Game"],
    ["фоллаут 2", "Fallout 2", "Fallout 2: A Post Nuclear Role Playing Game"],
    ["hitman 2", "Hitman 2", "Hitman 2: Silent Assassin"],
    ["хитман 2", "Hitman 2", "Hitman 2: Silent Assassin"],
    ["симс 3", "The Sims 3", "The Sims™ 3"],
    ["doom 64", "Doom 64", "DOOM 64"],
    ["civ 4", "Sid Meier's Civilization IV", "Sid Meier's Civilization® IV"],
    ["far cry 2", "Far Cry 2", "Far Cry® 2"],
  ];
  for (const [query, term, first] of cases) {
    cache.clear();
    const calls = mockFetch(storeMock);
    const results = names(await games.searchGames(query));
    assert.ok(steamTerms(calls).some((value) => value?.toLowerCase() === term.toLowerCase()), `${query}: ${steamTerms(calls).join(", ")}`);
    assert.ok(steamTerms(calls).every((value) => !/\p{Script=Cyrillic}/u.test(value ?? "")), `${query} sent Cyrillic to Steam`);
    assert.equal(results[0], first, `${query}: ${results.join(", ")}`);
  }

  // The series is asked for too, so its games come with art from one more search, not one lookup each.
  cache.clear();
  const falloutCalls = mockFetch(storeMock);
  const fallout = names(await games.searchGames("fallout 2"));
  assert.deepEqual(steamTerms(falloutCalls), ["Fallout 2", "Fallout"]);
  assert.deepEqual(fallout.slice(0, 4), ["Fallout 2: A Post Nuclear Role Playing Game", "Fallout 4", "Fallout 76", "Fallout: New Vegas"]);
  assert.ok(fallout.indexOf("Fallout Shelter") > 3 && fallout.includes("Fallout 3"), fallout.join(", "));
  cache.clear();
  mockFetch(storeMock);
  const hitman = names(await games.searchGames("hitman 2"));
  assert.deepEqual(hitman, ["Hitman 2: Silent Assassin", "Hitman: World of Assassination"]);
  cache.clear();
  mockFetch(storeMock);
  const sims = names(await games.searchGames("симс 3"));
  assert.ok(sims.indexOf("The Sims™ 3") < sims.indexOf("The Sims 4"), sims.join(", "));
  cache.clear();
  mockFetch(storeMock);
  const civ = names(await games.searchGames("civ 4"));
  assert.ok(civ.indexOf("Sid Meier's Civilization® IV") < civ.indexOf("Sid Meier's Civilization VII"), civ.join(", "));
  assert.ok(!civ.some((name) => name.includes("Sayyida")));

  // A number that is a word of a title still names that game first.
  cache.clear();
  mockFetch(storeMock);
  assert.equal((await games.searchGames("гта 5 рп сервер"))[0].name, "Grand Theft Auto V");
});

test("Cyrillic and slang queries search the stores by the canonical name", async () => {
  const cases: [string, string, string][] = [
    ["ведьмак", "The Witcher", "The Witcher 3: Wild Hunt"],
    ["кс 2", "Counter-Strike", "Counter-Strike 2"],
    ["cs2", "Counter-Strike", "Counter-Strike 2"],
    ["майнкрафт", "Minecraft", "Minecraft"],
    ["рдр 2", "Red Dead Redemption", "Red Dead Redemption 2"],
    ["гта", "Grand Theft Auto", "Grand Theft Auto V"],
  ];
  for (const [query, term, first] of cases) {
    cache.clear();
    const calls = mockFetch(storeMock);
    const results = await games.searchGames(query);
    assert.ok(steamTerms(calls).includes(term), `${query}: ${steamTerms(calls).join(", ")}`);
    assert.ok(steamTerms(calls).every((value) => !/\p{Script=Cyrillic}/u.test(value ?? "")), `${query} sent Cyrillic to Steam`);
    assert.equal(results[0].name, first, `${query}: ${names(results).join(", ")}`);
  }

  // The store's guesses for the canonical name are left out, the rest of the series stays.
  cache.clear();
  mockFetch(storeMock);
  assert.deepEqual(names(await games.searchGames("кс 2")), ["Counter-Strike 2", "Counter-Strike", "Counter-Strike: Source"]);
});

test("store editions fold into the named game: one card, its art and Steam app", async () => {
  mockFetch(storeMock);
  const results = await games.searchGames("гта");
  assert.deepEqual(names(results).slice(0, 6), [
    "Grand Theft Auto V",
    "Grand Theft Auto VI",
    "Grand Theft Auto: San Andreas",
    "Grand Theft Auto IV",
    "Grand Theft Auto: Vice City",
    "Grand Theft Auto III",
  ]);
  const gta5 = results[0];
  assert.equal(gta5.steamAppId, 3240220);
  assert.equal(gta5.source, "steam");
  assert.ok(gta5.backgroundImage);
  assert.ok(!names(results).some((name) => /Enhanced|Definitive|Complete Edition/.test(name)));
  assert.ok(names(results).includes("Grand Theft Auto: Episodes from Liberty City"));

  // "Minecraft Dungeons" is another game: neither its app nor its art goes to Minecraft.
  mockFetch(storeMock);
  const minecraft = await games.searchGames("майнкрафт");
  assert.equal(minecraft[0].name, "Minecraft");
  assert.equal(minecraft[0].steamAppId, null);
  assert.equal(minecraft[0].backgroundImage, null);
  assert.deepEqual(names(minecraft).slice(1, 3), ["Minecraft Dungeons", "Minecraft Legends"]);
  assert.ok(!names(minecraft).includes("Minecraft Dungeons II Deluxe Upgrade"));
});

test("add-ons of other products are dropped, real games kept, exact titles first", async () => {
  mockFetch(storeMock);
  const results = names(await games.searchGames("god of war"));
  assert.deepEqual(results.slice(0, 2), ["God of War", "God of War Ragnarök"]);
  for (const noise of ["Shadow Unit", "RTK13", "NOBUNAGA", "Soundtrack", "Artbook", "Upgrade"]) {
    assert.ok(!results.some((name) => name.includes(noise)), `${noise} in ${results.join(", ")}`);
  }
  // Steam's guess for the name matches no word of it.
  assert.ok(!results.includes("Hermes: War of the Gods"));

  for (const name of [
    "Counter-Strike 2 Soundtrack",
    "War Thunder - Su-30MKK Pack",
    "Fallout 76: Mojave Bundle",
    "ELDEN RING Tarnished Pack",
    "Hogwarts Legacy: Dark Arts Pack",
    "EA SPORTS FC™ 25 - FC Points",
    "The Last of Us™ Part I - Upgrade to Digital Deluxe Edition",
    "Minecraft Dungeons: Fauna Faire Adventure Pass",
    "S.T.A.L.K.E.R. 2: Heart of Chornobyl - Deluxe Upgrade",
    "Baldur's Gate 3 - Digital Deluxe Edition DLC",
    "Baldur's Gate 3 Toolkit Data",
    "Cyberpunk 2077 Bonus Content",
    "World of Tanks — 90 Days of Premium Pack",
    "Some Game Demo",
    "Some Game Playtest",
  ]) {
    assert.ok(games.isAddOn(name), name);
  }
  for (const name of [
    "The Jackbox Naughty Pack Soundtrack",
    "Skyrim Script Extender (SKSE)",
    "Skyrim Special Edition: Creation Kit",
    "Fallout 4 Creation Kit",
    "HITMAN 3 Access Pass: HITMAN 2 Expansion",
  ]) {
    assert.ok(games.isAddOn(name), name);
  }
  for (const name of [
    "Costume Quest",
    "Upgrade Complete 2",
    "Skin Deep",
    "The Jackbox Party Pack",
    "The Jackbox Party Pack 10",
    "The Jackbox Naughty Pack",
    "The Jackbox Survey Scramble",
    "Season: A Letter to the Future",
    "Demon's Souls",
    "Bundle of Joy Simulator",
    "Worst Case Scenario",
  ]) {
    assert.ok(!games.isAddOn(name), name);
  }

  // Skyrim: the Special Edition is the named game; tools, upgrades, soundtracks and creations are not games.
  cache.clear();
  mockFetch(storeMock);
  const skyrim = await games.searchGames("скайрим");
  assert.equal(skyrim[0].name, "The Elder Scrolls V: Skyrim");
  assert.equal(skyrim[0].steamAppId, 489830);
  assert.deepEqual(names(skyrim).slice(0, 2), ["The Elder Scrolls V: Skyrim", "The Elder Scrolls V: Skyrim VR"]);
  for (const noise of ["SKSE", "Creation Kit", "Upgrade", "Soundtrack", "Creations"]) {
    assert.ok(!names(skyrim).some((name) => name.includes(noise)), `${noise} in ${names(skyrim).join(", ")}`);
  }
});

test("DLC named after a game on the list is left out; editions and standalone games stay", async () => {
  mockFetch((url) =>
    isSearch(url)
      ? {
          items: [
            app(381210, "Dead by Daylight"),
            app(2656010, "Dead by Daylight - Chucky Chapter"),
            app(1324970, "Dead By Daylight - Silent Hill Chapter"),
            app(1172710, "Dune: Awakening"),
            app(3604170, "Dune: Awakening - Sardaukar Bator Armor"),
            app(1605220, "Dune: Spice Wars"),
            app(4490930, "Escape from Tarkov: TarCoin Ingame Currency"),
          ],
        }
      : undefined,
  );
  for (const [query, kept] of [["dbd", ["Dead by Daylight"]], ["dune", ["Dune: Awakening", "Dune: Spice Wars"]]] as const) {
    cache.clear();
    const results = names(await games.searchGames(query));
    for (const name of kept) assert.ok(results.includes(name), `${query}: ${name}`);
    assert.ok(!results.some((name) => / - |Currency/.test(name)), `${query}: ${results.join(", ")}`);
  }

  // "– The Definitive Edition" is an edition, not a DLC of the game before the dash.
  cache.clear();
  mockFetch((url) => (isSearch(url) ? { items: [app(1, "Some Saga"), app(2, "Some Saga – The Definitive Edition")] } : undefined));
  assert.deepEqual(names(await games.searchGames("some saga")), ["Some Saga", "Some Saga – The Definitive Edition"]);
});

test("the offline catalog matches words, not letters inside them", async () => {
  mockFetch(() => {
    throw new TypeError("fetch failed");
  });
  const ark = names(await games.searchGames("ark"));
  assert.ok(ark.includes("ARK: Survival Ascended"));
  assert.ok(!ark.includes("Dark Souls III") && !ark.includes("Escape from Tarkov"), ark.join(", "));
  assert.ok(names(await games.searchGames("ring")).includes("Elden Ring"));
});

test("store results: the exact title, then titles starting with the query, then the rest", async () => {
  mockFetch((url) =>
    isSearch(url)
      ? { items: [app(1, "Puyo Puyo Tetris 2"), app(2, "Classic Tetris Clone"), app(3, "Tetris Effect: Connected"), app(4, "Block Puzzle"), app(5, "Tetris")] }
      : undefined,
  );
  assert.deepEqual(names(await games.searchGames("tetris")), ["Tetris", "Tetris Effect: Connected", "Puyo Puyo Tetris 2", "Classic Tetris Clone", "Block Puzzle"]);
});

test("at most 12 results, one card per game", async () => {
  mockFetch((url) => {
    if (!isSearch(url)) return undefined;
    const items = Array.from({ length: 15 }, (_, index) => app(100 + index, `Apex Arena ${index + 1}`));
    return { items: [app(1172470, "Apex Legends™"), ...items, app(1172471, "Apex Legends")] };
  });
  const results = await games.searchGames("apex");
  assert.equal(results.length, 12);
  const keys = results.map((game) => games.gameKey(game.name));
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(results[0].name, "Apex Legends");
  assert.equal(results[0].steamAppId, 1172470);
});

test("slow covers do not hold the search back; the lookup finishes in the background for the next search", async () => {
  let release: () => void = () => undefined;
  const wikipediaAnswered = new Promise<void>((resolve) => {
    release = resolve;
  });
  mockFetch(async (url) => {
    if (wikiTitle(url) === null) return storeMock(url);
    await wikipediaAnswered;
    return storeMock(url);
  });
  const started = Date.now();
  const first = await games.searchGames("гта 6");
  assert.ok(Date.now() - started < 2_500, `took ${Date.now() - started} ms`);
  assert.equal(first[0].name, "Grand Theft Auto VI");
  assert.equal(first[0].backgroundImage, null);

  release();
  await new Promise((resolve) => setTimeout(resolve, 50));
  const second = await games.searchGames("gta 6");
  assert.equal(second[0].backgroundImage, "https://upload.wikimedia.org/gta6.png");
});

test("with every provider down the aliases and the offline catalog still answer", async () => {
  mockFetch(() => {
    throw new TypeError("fetch failed");
  });
  assert.equal((await games.searchGames("гта 6"))[0].name, "Grand Theft Auto VI");
  assert.equal((await games.searchGames("майнкрафт"))[0].name, "Minecraft");
  assert.equal((await games.searchGames("elden"))[0].name, "Elden Ring");
  assert.ok(names(await games.searchGames("Counter Strike")).includes("Counter-Strike 2"));
});

test("a cold search for a series asks Steam once: named games take their art from its answer", async () => {
  const calls = mockFetch(storeMock);
  const results = await games.searchGames("гта");
  assert.deepEqual(steamTerms(calls), ["Grand Theft Auto"]);
  assert.ok(!calls.some((url) => url.pathname === "/api/appdetails"));
  // Only GTA VI, which Steam does not sell, is looked up on Wikipedia.
  assert.deepEqual(calls.map(wikiTitle).filter(Boolean), ["Grand_Theft_Auto_VI_(video_game)", "Grand_Theft_Auto_VI"]);
  assert.ok(results.slice(0, 6).every((game) => game.backgroundImage), names(results).join(", "));
});

test("concurrent searches share one Steam request per term", async () => {
  const calls = mockFetch(storeMock);
  await Promise.all([games.steamSearch("Counter-Strike 2"), games.steamSearch("counter-strike 2")]);
  assert.equal(steamTerms(calls).length, 1);
});

test("hand-set covers: curated rows answer the aliases of their game, and covers use them first", async () => {
  overrides = [{ game_id: -1, name: "Fortnite", background_image: "https://cdn.example/fortnite.jpg", search_terms: ["fortnite", "фортнайт"] }];
  const calls = mockFetch(storeMock);
  for (const query of ["фортик", "fortnite", "форт"]) {
    const results = await games.searchGames(query);
    assert.equal(results[0].name, "Fortnite", query);
    assert.equal(results[0].backgroundImage, "https://cdn.example/fortnite.jpg", query);
    assert.equal(results.filter((game) => game.name === "Fortnite").length, 1, query);
  }
  // Profile cards and Popular now go through resolveCover: the override wins without asking any provider.
  calls.length = 0;
  assert.equal((await games.resolveCover("фортик"))?.coverUrl, "https://cdn.example/fortnite.jpg");
  assert.equal((await games.resolveCover("Fortnite"))?.coverUrl, "https://cdn.example/fortnite.jpg");
  assert.deepEqual(calls, []);
  // A cover cached before the override was set does not hide it.
  overrides = [];
  cache.set("cover3w:roblox", { cover: null });
  overrides = [{ game_id: -2, name: "Roblox", background_image: "https://cdn.example/roblox.jpg", search_terms: [] }];
  assert.equal((await games.resolveCover("роблокс"))?.coverUrl, "https://cdn.example/roblox.jpg");
});

test("games the alias table knows fall back to the Russian Wikipedia for art; Cyrillic titles go there first", async () => {
  const calls = mockFetch((url) => {
    if (wikiTitle(url) === "Minecraft") return { type: "standard", title: "Minecraft", description: "Sandbox video game", extract: "Minecraft is a sandbox game." };
    if (ruWikiTitle(url) === "Minecraft") {
      return { type: "standard", title: "Minecraft", description: "компьютерная инди-игра 2011 года в жанре песочницы", thumbnail: { source: "https://upload.wikimedia.org/wikipedia/ru/f/f4/Minecraft_Cover_Art.png?utm=1" } };
    }
    if (ruWikiTitle(url) === "Мир_танков") {
      return { type: "standard", title: "Мир танков", description: "компьютерная игра 2022 года, созданная на основе World of Tanks", thumbnail: { source: "https://thumb.wikimedia.org/mt.jpg" } };
    }
    if (ruWikiTitle(url) === "Смута_(игра)") return { type: "standard", title: "Смута (игра)", description: "компьютерная игра 2024 года", thumbnail: { source: "https://thumb.wikimedia.org/smuta.jpg" } };
    if (ruWikiTitle(url) === "Смута") return { type: "standard", title: "Смута", description: "период в истории России", thumbnail: { source: "https://thumb.wikimedia.org/history.jpg" } };
    return storeMock(url);
  });
  assert.equal((await games.resolveCover("майнкрафт"))?.coverUrl, "https://upload.wikimedia.org/wikipedia/ru/f/f4/Minecraft_Cover_Art.png");
  assert.equal((await games.resolveCover("Мир танков"))?.coverUrl, "https://thumb.wikimedia.org/mt.jpg");
  assert.ok(!calls.some((url) => url.hostname === "en.wikipedia.org" && decodeURIComponent(url.pathname).includes("Мир")), "Cyrillic titles skip the English Wikipedia");
  assert.equal((await games.resolveCover("Смута"))?.coverUrl, "https://thumb.wikimedia.org/smuta.jpg");
  const details = await games.gameDetails({ name: "Мир танков" });
  assert.equal(details.source, "wikipedia");
  assert.match(details.about ?? details.name, /Мир танков|танк/);

  // Free text the table does not know never costs the extra requests.
  calls.length = 0;
  await games.resolveCover("Some Console Game");
  assert.ok(!calls.some((url) => url.hostname === "ru.wikipedia.org"));
});

test("covers and details of an alias are those of its game; games not on Steam skip the Steam search", async () => {
  let calls = mockFetch(storeMock);
  assert.equal((await games.resolveCover("гта 6"))?.coverUrl, "https://upload.wikimedia.org/gta6.png");
  assert.deepEqual(steamTerms(calls), []);
  assert.ok(cache.has("cover3w:grand theft auto vi"));

  calls = mockFetch((url) => (wikiTitle(url) === "Minecraft" ? { type: "standard", title: "Minecraft", description: "Sandbox video game", extract: "Minecraft is a sandbox game." } : storeMock(url)));
  const details = await games.gameDetails({ name: "майнкрафт" });
  assert.equal(details.source, "wikipedia");
  assert.equal(details.name, "Minecraft");
  assert.deepEqual(steamTerms(calls), []);
});
