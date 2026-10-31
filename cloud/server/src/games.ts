// Game catalog: curated overrides, RAWG (when RAWG_API_KEY is set), the
// public Steam store API and Wikipedia (no keys needed), plus an offline list
// of popular titles. Search understands Russian names, slang and
// abbreviations through the alias table in @unishare/shared. Every provider
// response is cached in PostgreSQL and no provider failure ever reaches the
// caller.
import {
  GAME_ALIASES,
  POPULAR_GAMES,
  canonicalGame,
  findGameAliases,
  gameSearchKey,
  normalizeGameName,
  sanitizeGameName,
  type GameAliasMatch,
  type GameDetails,
  type GameSearchResult,
} from "@unishare/shared";
import { config } from "./config";
import { query, queryOne } from "./db";

const SEARCH_TTL_DAYS = 14;
const COVER_TTL_DAYS = 14;
const DETAILS_TTL_DAYS = 7;
const POPULAR_TTL_HOURS = 12;
/** "Every provider answered and nothing was found": cached shorter so new store entries show up. */
const MISS_TTL_HOURS = 72;
/** A provider did not answer: the fallback is kept for 10 minutes, just enough not to hammer it. */
const FAILURE_TTL_HOURS = 10 / 60;
const TIMEOUT_MS = 6_000;
const USER_AGENT = "UniShare/1.0 (https://github.com/EgorChulanov/UniShare; official@egorchulanov.ru)";

// ── HTTP + cache helpers ───────────────────────────────────────────────────

/** A provider answer, or `ok: false` when the provider did not answer. */
type Lookup<T> = { ok: true; data: T } | { ok: false };

/**
 * 404/410 is an answer ("no such page": `data` is null). A timeout, network
 * error, rate limit (429), any other status or a body that is not JSON is a
 * failure, which callers must not cache as "not found".
 */
async function fetchJson<T>(url: string): Promise<Lookup<T | null>> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 404 || response.status === 410) return { ok: true, data: null };
    if (!response.ok) return { ok: false };
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false };
  }
}

async function cacheGet<T>(key: string, allowStale = false): Promise<T | undefined> {
  const row = await queryOne<{ payload: T }>(
    `select payload from game_catalog_cache where cache_key = $1 ${allowStale ? "" : "and expires_at > now()"}`,
    [key.slice(0, 160)],
  ).catch(() => null);
  return row ? row.payload : undefined;
}

async function cachePut(key: string, payload: unknown, hours: number): Promise<void> {
  await query(
    `insert into game_catalog_cache (cache_key, payload, expires_at)
     values ($1, $2, now() + make_interval(secs => $3))
     on conflict (cache_key) do update set payload = excluded.payload, expires_at = excluded.expires_at, updated_at = now()`,
    [key.slice(0, 160), JSON.stringify(payload), Math.round(hours * 3600)],
  ).catch(() => undefined);
}

/** Similarity used to pick the store entry that best matches a typed title. */
function matchScore(candidate: string, wanted: string): number {
  const a = normalizeGameName(candidate).replace(/[^\p{L}\p{N} ]/gu, "");
  const b = normalizeGameName(wanted).replace(/[^\p{L}\p{N} ]/gu, "");
  if (a === b) return 3;
  if (a.startsWith(b) || b.startsWith(a)) return 2;
  if (a.includes(b) || b.includes(a)) return 1;
  return 0;
}

/** Runs one lookup per key at a time: concurrent searches for the same title share the request. */
function shared<T>(inFlight: Map<string, Promise<T>>, key: string, work: () => Promise<T>): Promise<T> {
  let pending = inFlight.get(key);
  if (!pending) {
    pending = work().finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  return pending;
}

// ── Offline catalog ────────────────────────────────────────────────────────

const MAX_RESULTS = 12;

/** Catalog titles with a word starting with the query ("ring" finds Elden Ring, "ark" not Dark Souls). */
function offline(keys: string[]): GameSearchResult[] {
  return POPULAR_GAMES.map((name, index) => ({ name, index, rank: textRank(name, keys) }))
    .filter((game) => game.rank <= WORD_MATCH)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .slice(0, MAX_RESULTS)
    .map((game) => ({ id: -(game.index + 1000), name: game.name, backgroundImage: null, released: null, source: "catalog" as const }));
}

const CATALOG_IDS = new Map(POPULAR_GAMES.map((name, index) => [gameKey(name), -(index + 1000)]));

/** Negative id of a catalog-only result: the offline catalog's, or a stable one derived from the title. */
function catalogId(name: string): number {
  const key = gameKey(name);
  const known = CATALOG_IDS.get(key);
  if (known) return known;
  let hash = 0;
  for (const char of key) hash = (Math.imul(hash, 31) + char.codePointAt(0)!) | 0;
  return -(100_000 + (Math.abs(hash) % 1_000_000_000));
}

// ── Steam (public store API, no key) ───────────────────────────────────────

interface SteamSearchItem {
  type?: string;
  id: number;
  name: string;
  tiny_image?: string | null;
}

/**
 * Store entries that are not games: soundtracks, artbooks, DLC, passes,
 * cosmetic and currency packs, edition upgrades, scenario add-ons, demos and
 * tools (Creation Kit, SKSE). The phrases are specific enough to keep games
 * such as "Costume Quest", "Upgrade Complete", "Skin Deep" or "The Jackbox
 * Party Pack".
 */
const ADD_ON = new RegExp(
  [
    String.raw`\b(?:original )?soundtracks?\b`,
    String.raw`\bost\b`,
    String.raw`\bart ?books?\b`,
    String.raw`\bwallpapers?\b`,
    String.raw`\bdlc\b`,
    String.raw`\bbonus content\b`,
    String.raw`\b(?:season|expansion|year|battle|adventure|character|story|premium|ultimate|deluxe|gold|elite|access) pass\b`,
    String.raw`\b(?:deluxe|ultimate|premium|gold|vault|collector['’]?s|edition|digital|anniversary) upgrade\b`,
    String.raw`\bupgrade (?:to|pack|kit)\b`,
    String.raw`\b(?:costume|skin|outfit|weapon|cosmetic|character|vehicle|item|starter|booster|resupply|welcome|supporter|premium|currency|coin|gem|point)s? (?:pack|set|bundle|kit)\b`,
    String.raw`\b(?:additional|bonus|extra) (?:scenarios?|content|missions?|maps?|costumes?)\b`,
    String.raw`\bscenario (?:pack|\d+)\b`,
    String.raw`\b(?:fc|cod|apex|vc) points\b`,
    String.raw`\b(?:in-?game currency|special offer)\b`,
    String.raw`\bdemo\b`,
    String.raw`\b(?:playtest|public test|test server|dedicated server|sdk|toolkit|mod tools?|redkit|redmod|creation kit|script extender|skse)\b`,
    "追加|シナリオ|サウンドトラック|コスチューム",
  ].join("|"),
  "i",
);

/** "War Thunder - Su-30MKK Pack", "Fallout 76: Mojave Bundle"; "The Jackbox Party Pack" and "The Jackbox Naughty Pack" are games. */
const TRAILING_PACK = /\b(?:pack|bundle)$/i;
const PACK_GAME = /\bparty pack$|^the jackbox /i;

export function isAddOn(name: string): boolean {
  const text = name.replace(/[™®©]/g, "").trim();
  return ADD_ON.test(text) || (TRAILING_PACK.test(text) && !PACK_GAME.test(text));
}

/**
 * Steam asset URLs for recent apps contain a content hash, so header.jpg can
 * only be derived from an unhashed capsule URL; otherwise keep the capsule.
 */
export function steamImageFromCapsule(appId: number, capsule: string | null | undefined): string {
  if (capsule) {
    const clean = capsule.split("?")[0];
    if (new RegExp(`/apps/${appId}/capsule_[^/]+$`).test(clean)) return clean.replace(/capsule_[^/]+$/, "header.jpg");
    return clean;
  }
  return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;
}

export function mapSteamSearch(items: SteamSearchItem[]): GameSearchResult[] {
  return items
    .filter((item) => (item.type ?? "app") === "app" && Number.isSafeInteger(item.id) && item.name && !isAddOn(item.name))
    .map((item) => ({
      id: item.id,
      name: item.name,
      backgroundImage: steamImageFromCapsule(item.id, item.tiny_image),
      released: null,
      source: "steam" as const,
      steamAppId: item.id,
    }));
}

const steamInFlight = new Map<string, Promise<GameSearchResult[] | null>>();

/** Steam store search; `null` when Steam did not answer and nothing is cached (unlike `[]`, "no such game"). */
export function steamSearch(term: string): Promise<GameSearchResult[] | null> {
  const key = `steam:${normalizeGameName(term)}`;
  return shared(steamInFlight, key, () => steamSearchUncached(term, key));
}

async function steamSearchUncached(term: string, key: string): Promise<GameSearchResult[] | null> {
  // Entries cached before the add-on filter learned a phrase are filtered on the way out.
  const cached = (await cacheGet<GameSearchResult[]>(key))?.filter((game) => !isAddOn(game.name));
  if (cached) return cached;
  const url = new URL("https://store.steampowered.com/api/storesearch/");
  url.searchParams.set("term", term);
  url.searchParams.set("l", "english");
  url.searchParams.set("cc", "US");
  const payload = await fetchJson<{ items?: SteamSearchItem[] }>(url.toString());
  if (!payload.ok || !payload.data) return (await cacheGet<GameSearchResult[]>(key, true)) ?? null;
  const results = mapSteamSearch(payload.data.items ?? []).slice(0, 12);
  await cachePut(key, results, SEARCH_TTL_DAYS * 24);
  return results;
}

function bestSteamMatch(results: GameSearchResult[], name: string): GameSearchResult | null {
  let best: GameSearchResult | null = null;
  let bestScore = 0;
  for (const result of results) {
    const score = matchScore(result.name, name);
    if (score > bestScore) {
      best = result;
      bestScore = score;
    }
  }
  return bestScore >= 2 ? best : null;
}

// ── Wikipedia (REST summary, no key) ───────────────────────────────────────

interface WikiSummary {
  type?: string;
  title?: string;
  /** Wikidata short description, e.g. "2020 video game". */
  description?: string;
  extract?: string;
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
}

function cleanWikiImage(url: string | undefined): string | null {
  if (!url) return null;
  return url.split("?")[0];
}

const VIDEO_GAME = /\bvideo ?games?\b|\bgame (?:developed|published)\b|компьютерн\S* игр|видеоигр/i;
/** Short descriptions are terse ("2016 mobile game", "Online game platform"), so any mention of a game counts. */
const GAME_DESCRIPTION = /\bgames?\b|(?:^|[^а-яё])игр/i;

/** The short description or the first sentence of the article says it is about a game. */
function describesVideoGame(summary: WikiSummary): boolean {
  if (GAME_DESCRIPTION.test(summary.description ?? "")) return true;
  const firstSentence = summary.extract?.split(/(?<=[.!?])\s/)[0] ?? "";
  return VIDEO_GAME.test(firstSentence);
}

const CYRILLIC = /\p{Script=Cyrillic}/u;

/**
 * The Wikipedia article about a game (`data: null` when there is none), or
 * `ok: false` when Wikipedia did not answer. "<name> (video game)" is tried
 * first; the bare title only counts when it describes a game ("Hades" alone is
 * the god, "Spider-Man" the comic character). Cyrillic titles ("Мир танков")
 * are looked up on the Russian Wikipedia, as "<name> (игра)" first.
 */
async function wikiSummary(name: string, lang: "en" | "ru" = CYRILLIC.test(name) ? "ru" : "en"): Promise<Lookup<WikiSummary | null>> {
  // "(игра)" also names board games, so on the Russian Wikipedia both must describe a game.
  const qualified = lang === "ru" ? ([`${name} (игра)`, true] as const) : ([`${name} (video game)`, false] as const);
  for (const [title, mustDescribeGame] of [qualified, [name, true] as const]) {
    const result = await fetchJson<WikiSummary>(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`,
    );
    if (!result.ok) return result;
    const summary = result.data;
    if (!summary || summary.type === "disambiguation" || !(summary.thumbnail?.source || summary.extract)) continue;
    if (mustDescribeGame && !describesVideoGame(summary)) continue;
    return { ok: true, data: summary };
  }
  return { ok: true, data: null };
}

// ── Covers ─────────────────────────────────────────────────────────────────

export interface ResolvedCover {
  coverUrl: string;
  steamAppId: number | null;
  /** Store title of the Steam app the cover belongs to (null for Wikipedia artwork). */
  title: string | null;
}

/** Exact header image for apps whose assets live under a hashed path (search only returns a small capsule). */
async function steamHeaderImage(appId: number): Promise<Lookup<string | null>> {
  const payload = await fetchJson<Record<string, { success?: boolean; data?: { header_image?: string } }>>(
    `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=us&filters=basic`,
  );
  if (!payload.ok || !payload.data) return { ok: false };
  const image = payload.data[String(appId)]?.data?.header_image;
  return { ok: true, data: image ? image.split("?")[0] : null };
}

/**
 * A cover set by hand: an enabled game_catalog_overrides row named so (or
 * with that search term) that has a background_image. It wins over the
 * providers and their cache, for games without free art (Fortnite, Roblox).
 */
async function overrideCover(name: string): Promise<ResolvedCover | null> {
  const row = await queryOne<{ background_image: string }>(
    `select background_image from game_catalog_overrides
     where enabled and coalesce(background_image, '') <> ''
       and (lower(name) = lower($1) or exists (select 1 from unnest(search_terms) t where lower(t) = lower($1)))
     order by lower(name) = lower($1) desc, updated_at desc
     limit 1`,
    [name],
  ).catch(() => null);
  return row ? { coverUrl: row.background_image, steamAppId: null, title: null } : null;
}

const coversInFlight = new Map<string, Promise<ResolvedCover | null>>();

/**
 * Finds artwork for a game title: a hand-set override, then Steam, then
 * Wikipedia. Cached. An alias of one game is looked up as that game ("гта 6"
 * -> Grand Theft Auto VI), and games that are not on Steam go to Wikipedia
 * directly: the Steam title that merely starts the same is another game
 * ("Minecraft Dungeons").
 */
export async function resolveCover(name: string): Promise<ResolvedCover | null> {
  const sanitized = sanitizeGameName(name);
  if (!sanitized) return null;
  const canonical = canonicalGame(sanitized);
  if (canonical && gameSearchKey(canonical.title) !== gameSearchKey(sanitized)) return resolveCover(canonical.title);
  const steam = canonical?.store !== "other";
  // v3: v2 entries may hold misses cached during Steam outages and bare-title
  // Wikipedia images. Games not on Steam have their own key, since a v3 entry
  // may hold the art of a Steam game with a longer title.
  const key = `${steam ? "cover3" : "cover3w"}:${normalizeGameName(sanitized)}`;
  return shared(coversInFlight, key, () => lookupCover(sanitized, key, steam, Boolean(canonical)));
}

async function lookupCover(sanitized: string, key: string, steam: boolean, known: boolean): Promise<ResolvedCover | null> {
  const override = await overrideCover(sanitized);
  if (override) return override;
  const cached = await cacheGet<{ cover: ResolvedCover | null }>(key);
  if (cached) return cached.cover;

  // When a provider does not answer, the title is not guessed from Wikipedia
  // and the empty result is kept for minutes, not as a 72 h miss.
  const failed = async () => {
    await cachePut(key, { cover: null }, FAILURE_TTL_HOURS);
    return null;
  };
  let cover: ResolvedCover | null = null;
  /** The small capsule stands in while the header lookup is down; it is replaced on the next lookup. */
  let provisional = false;
  if (steam) {
    const results = await steamSearch(sanitized);
    if (!results) return failed();
    const match = bestSteamMatch(results, sanitized);
    if (match?.backgroundImage) {
      const appId = match.steamAppId ?? match.id;
      let header: string | null = null;
      if (/\/capsule_[^/]+$/.test(match.backgroundImage)) {
        const lookup = await steamHeaderImage(appId);
        if (lookup.ok) header = lookup.data;
        else provisional = true;
      }
      cover = { coverUrl: header ?? match.backgroundImage, steamAppId: appId, title: match.name };
    }
  }
  if (!cover) {
    const wiki = await wikiSummary(sanitized);
    if (!wiki.ok) return failed();
    let image = cleanWikiImage(wiki.data?.thumbnail?.source ?? wiki.data?.originalimage?.source);
    // The English articles of Minecraft and the like have no free image, the
    // Russian one has the cover. Only for games the alias table knows, so free
    // text does not cost two more requests.
    if (!image && known && !CYRILLIC.test(sanitized)) {
      const russian = await wikiSummary(sanitized, "ru");
      if (!russian.ok) return failed();
      image = cleanWikiImage(russian.data?.thumbnail?.source ?? russian.data?.originalimage?.source);
    }
    if (image) cover = { coverUrl: image, steamAppId: null, title: null };
  }
  await cachePut(key, { cover }, provisional ? FAILURE_TTL_HOURS : cover ? COVER_TTL_DAYS * 24 : MISS_TTL_HOURS);
  return cover;
}

// ── Search ─────────────────────────────────────────────────────────────────

interface RawgGame {
  id: number;
  name: string;
  background_image: string | null;
  released: string | null;
}

async function rawgSearch(term: string, needle: string): Promise<GameSearchResult[] | null> {
  if (!config.rawgApiKey) return null;
  const key = `search:${needle}`;
  const cached = await cacheGet<GameSearchResult[]>(key);
  if (cached) return cached;
  const url = new URL("https://api.rawg.io/api/games");
  url.searchParams.set("key", config.rawgApiKey);
  url.searchParams.set("search", term);
  url.searchParams.set("page_size", "12");
  url.searchParams.set("search_precise", "true");
  const payload = await fetchJson<{ results?: RawgGame[] }>(url.toString());
  if (!payload.ok || !payload.data) return (await cacheGet<GameSearchResult[]>(key, true)) ?? null;
  const results: GameSearchResult[] = (payload.data.results ?? []).map((game) => ({
    id: game.id,
    name: game.name,
    backgroundImage: game.background_image ?? null,
    released: game.released ?? null,
    source: "rawg" as const,
  }));
  await cachePut(key, results, SEARCH_TTL_DAYS * 24);
  return results;
}

/** RAWG when it is configured and finds something, the Steam store otherwise. */
async function storeSearch(term: string): Promise<GameSearchResult[]> {
  const rawg = await rawgSearch(term, normalizeGameName(term));
  if (rawg && rawg.length) return rawg.filter((game) => !isAddOn(game.name));
  return (await steamSearch(term)) ?? [];
}

interface SearchPlan {
  /** Canonical games the query names ("гта 6" -> Grand Theft Auto VI). */
  aliases: GameAliasMatch[];
  /** What the stores are asked (at most two): canonical names instead of slang the stores do not understand, a series with its sequel. */
  terms: string[];
  /** Search keys titles are ranked against. */
  keys: string[];
}

/**
 * What the stores are asked for named games: the words every title starts
 * with ("Grand Theft Auto", "The Witcher"), or a single title without its
 * sequel number ("Counter-Strike 2" -> "Counter-Strike"), so the rest of the
 * series follows the named game instead of the store's guesses.
 */
function commonName(titles: string[]): string {
  if (titles.length === 1) {
    const series = titles[0].replace(/[\s:–—-]+(?:\d{1,2}|[ivx]+)$/i, "");
    return gameSearchKey(series).length >= 4 ? series : titles[0];
  }
  const words = titles[0].split(" ");
  for (let count = words.length; count > 0; count--) {
    const name = words.slice(0, count).join(" ").replace(/[\s:–—-]+$/, "");
    const key = gameSearchKey(name);
    if (key.length < 4) break;
    if (titles.every((title) => gameSearchKey(title) === key || gameSearchKey(title).startsWith(`${key} `))) return name;
  }
  return titles[0];
}

const ROMAN_NUMERAL = /^(?=[IVX])X{0,3}(?:IX|IV|V?I{0,3})$/;

function toRoman(value: number): string {
  return "X".repeat(Math.floor(value / 10)) + ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"][value % 10];
}

/**
 * The store names of a sequel the alias table does not have and of its
 * series: "fallout 2" -> "Fallout 2" and "Fallout", "хитман 2" -> "Hitman 2"
 * and "Hitman", "civ 4" -> "Sid Meier's Civilization IV" (the series' own
 * numbering). Null when the series has no common name and the alias is
 * Cyrillic.
 */
function sequelNames(titles: string[], sequel: { alias: string; number: number }): { sequel: string; series: string } | null {
  const shared = commonName(titles);
  const base = gameSearchKey(shared);
  const series = titles.every((title) => gameSearchKey(title) === base || gameSearchKey(title).startsWith(`${base} `))
    ? shared.split(/:\s|\s[-–—]\s/)[0].replace(/[\s:–—-]+(?:\d{1,2}|[IVX]+)$/, "")
    : /[a-z]/.test(sequel.alias) && !CYRILLIC.test(sequel.alias) ? sequel.alias : null;
  if (!series) return null;
  const words = (title: string) => title.split(/[\s:]+/);
  const roman = titles.filter((title) => words(title).some((word) => ROMAN_NUMERAL.test(word))).length;
  const digits = titles.filter((title) => words(title).some((word) => /^\d+$/.test(word))).length;
  return { sequel: `${series} ${roman > digits && sequel.number < 40 ? toRoman(sequel.number) : sequel.number}`, series };
}

function searchPlan(text: string): SearchPlan {
  const aliases = findGameAliases(text);
  const typed = gameSearchKey(text);
  const exact = aliases.filter((match) => match.exact).map((match) => match.title);
  const sequel = aliases.find((match) => match.sequel)?.sequel;
  // Steam and RAWG only know Latin titles.
  const readable = !CYRILLIC.test(text);
  // "gta 6", "cs2", "rdr2": the stores find other games for an abbreviation.
  const abbreviation = exact.length > 0 && !exact.some((title) => gameSearchKey(title).includes(typed));
  const terms: string[] = [];
  const keys = [typed];
  if (sequel) {
    // "fallout 2" is not in the table: the stores are asked for it under its
    // series' name, and for the series, whose games follow it (the series name
    // does not rank titles, so "Fallout Shelter" stays after them).
    const names = sequelNames(aliases.filter((match) => match.sequel).map((match) => match.title), sequel);
    if (names && !CYRILLIC.test(names.sequel)) {
      terms.push(names.sequel, names.series);
      keys.push(gameSearchKey(names.sequel));
    }
    // The typed Latin text only when that leaves room ("civ 4" finds other games).
    if (readable) terms.push(text);
  } else {
    const named = aliases.length && (exact.length || !readable) ? commonName(exact.length ? exact : aliases.map((match) => match.title)) : null;
    // "Мир танков" is not on the stores under its Russian name.
    if (named && !CYRILLIC.test(named)) terms.push(named);
    if (!aliases.length || (readable && !abbreviation)) terms.push(text);
    keys.push(...terms.map(gameSearchKey));
  }
  const unique = terms
    .filter((term, index) => terms.findIndex((other) => gameSearchKey(other) === gameSearchKey(term)) === index)
    .slice(0, 2);
  return { aliases, terms: unique, keys: [...new Set(keys)] };
}

const PREFIX_MATCH = 1;
const WORD_MATCH = 2;
const PART_MATCH = 3;
const NO_MATCH = 4;

/** 0 the title is the query, 1 starts with it, 2 has a word starting with it, 3 contains it, 4 not at all (the store's own fuzzy match). */
function textRank(name: string, keys: string[]): number {
  const title = gameSearchKey(name);
  let best = NO_MATCH;
  for (const key of keys) {
    if (!key) continue;
    const rank = title === key ? 0 : title.startsWith(key) ? 1 : ` ${title}`.includes(` ${key}`) ? 2 : title.includes(key) ? 3 : NO_MATCH;
    best = Math.min(best, rank);
  }
  return best;
}

/**
 * "Dead by Daylight - Chucky Chapter", "Dune: Awakening - Sardaukar Bator
 * Armor": a store entry named after another game on the list (or an edition
 * of it) followed by " - " is that game's DLC; "– The Definitive Edition" is not.
 */
function dlcOf(name: string, games: string[]): boolean {
  const dash = /\s[-–—]\s/.exec(name);
  if (!dash) return false;
  const base = name.slice(0, dash.index);
  return !isEditionOf(name, base) && games.some((game) => game !== name && isEditionOf(base, game));
}

/** "Shadow Unit - GOD OF WAR EDITION": the query only names an edition or add-on of another product. */
function onlyAfterDash(name: string, keys: string[]): boolean {
  const dash = /\s[-–—]\s/.exec(name);
  if (!dash) return false;
  const head = gameSearchKey(name.slice(0, dash.index));
  const tail = gameSearchKey(name.slice(dash.index));
  const mentions = (part: string) => keys.some((key) => key && part.includes(key));
  return mentions(tail) && !mentions(head);
}

const EDITION_WORDS = new Set(["the", "of", "year", "game", "definitive", "complete", "enhanced", "remastered", "remaster", "edition", "goty", "deluxe", "digital", "gold", "ultimate", "standard", "legendary", "special", "anniversary", "directors", "cut", "legacy", "hd"]);
const EDITION_MARKERS = new Set(["definitive", "complete", "enhanced", "remastered", "remaster", "edition", "goty", "cut", "legacy", "hd"]);

/** "Grand Theft Auto V Enhanced", "Grand Theft Auto: San Andreas – The Definitive Edition" or "Apex Legends™" is the game `title`. */
function isEditionOf(storeName: string, title: string): boolean {
  const store = gameSearchKey(storeName);
  const base = gameSearchKey(title);
  if (store === base) return true;
  if (!base || !store.startsWith(`${base} `)) return false;
  const rest = store.slice(base.length + 1).split(" ");
  return rest.every((word) => EDITION_WORDS.has(word)) && rest.some((word) => EDITION_MARKERS.has(word));
}

/** Alias table titles by search key, and the names the table gives each title (only those that name that one game). */
const TABLE_TITLES = new Map(GAME_ALIASES.map(([title]) => [gameSearchKey(title), title]));
let tableSpellings: Map<string, string[]> | null = null;

function spellingsOf(title: string): string[] {
  tableSpellings ??= new Map(
    GAME_ALIASES.map(([own, aliases]) => [own, [own, ...aliases.split("|").filter((alias) => canonicalGame(alias)?.title === own)]]),
  );
  return tableSpellings.get(title) ?? [title];
}

/** The alias table title a store or saved name is, or is an edition of: "Grand Theft Auto V Enhanced" -> "Grand Theft Auto V", "ELDEN RING" -> "Elden Ring". */
function editionTitle(name: string): string | null {
  const words = gameSearchKey(name).split(" ");
  for (let end = words.length; end > 0; end--) {
    if (end < words.length && !EDITION_WORDS.has(words[end])) break;
    const title = TABLE_TITLES.get(words.slice(0, end).join(" "));
    if (title && isEditionOf(name, title)) return title;
  }
  return null;
}

/**
 * The game a saved, typed or store name stands for: "гта 6" and "GTA VI" ->
 * "Grand Theft Auto VI", "…Skyrim Special Edition" -> "The Elder Scrolls V:
 * Skyrim"; any other name is itself.
 */
export function canonicalTitle(name: string): string {
  return canonicalGame(name)?.title ?? editionTitle(name) ?? name;
}

/**
 * Whether a saved name is the game `title`: spellings ("Apex Legends™"),
 * alias table names ("гта 6") and store editions all count. /api/players
 * lists everyone whose game passes, so every way of saving a game finds the
 * same players.
 */
export function gameMatcher(title: string): (name: string) => boolean {
  const wanted = canonicalTitle(title);
  const key = gameKey(wanted);
  const searchKey = gameSearchKey(wanted);
  return (name) => {
    const own = canonicalTitle(name);
    if (!key || !gameKey(own)) return normalizeGameName(own) === normalizeGameName(wanted);
    return gameKey(own) === key || gameSearchKey(own) === searchKey || isEditionOf(own, wanted) || isEditionOf(wanted, own);
  };
}

/** Lowercased names a saved title of the game can have, for SQL: the title, its canonical title and the alias table's names of that one game. */
export function gameSpellings(title: string): string[] {
  const canonical = canonicalTitle(title);
  return [...new Set([title, ...spellingsOf(canonical)].map((name) => name.toLowerCase()))];
}

/**
 * For SQL, before gameMatcher decides: the lowercased names of a game and the
 * longest word of each, one of which every saved name of it contains ("gta"
 * in "GTA VI", "grand" in "Grand Theft Auto V Enhanced").
 */
export function gameFilter(title: string): { names: string[]; words: string[] } {
  const names = gameSpellings(title);
  const longest = (text: string) => text.split(/[^\p{L}\p{N}]+/u).reduce((best, word) => (word.length > best.length ? word : best), "");
  const words = names.flatMap((name) => [longest(name), longest(normalizeGameName(name)), longest(gameSearchKey(name))]);
  // Short alias words ("ow", "bo", "cs") would pull in most profiles; those spellings match exactly through names.
  return { names: [...new Set(names.flatMap(typedForms))], words: [...new Set(words.filter((word) => word.length >= 4))] };
}

/** "gta 6" -> also "gta6", "gta vi" and "gtavi": the ways a saved name is typed, for exact SQL matching. */
function typedForms(name: string): string[] {
  const lower = name.toLowerCase();
  const forms = [lower];
  const number = / (\d{1,2}|[ivx]+)$/.exec(lower);
  const digits = number && (/^\d/.test(number[1]) ? number[1] : gameSearchKey(`game ${number[1]}`).split(" ")[1]);
  if (number && digits && /^\d+$/.test(digits) && Number(digits) > 0 && Number(digits) < 40) {
    const stem = lower.slice(0, number.index);
    forms.push(`${stem} ${digits}`, `${stem} ${toRoman(Number(digits)).toLowerCase()}`);
  }
  return forms.flatMap((form) => [form, form.replace(/\s+/g, "")]);
}

/**
 * For the people search, the games a query names exactly: their lowercased
 * names ("гта 6" -> "grand theft auto vi", "gta 6", "gta vi", "гта6", …) and
 * LIKE patterns for store editions older profiles saved ("grand theft auto v
 * %" finds "Grand Theft Auto V Enhanced"). No patterns for a title that starts
 * another one ("Counter-Strike" and "Counter-Strike 2").
 */
export function queryGameFilter(text: string): { names: string[]; editions: string[] } {
  const titles = findGameAliases(text).filter((match) => match.exact).map((match) => match.title);
  const names = [...new Set(titles.flatMap(spellingsOf).flatMap(typedForms))];
  const editions = titles
    .filter((title) => ![...TABLE_TITLES.keys()].some((key) => key.startsWith(`${gameSearchKey(title)} `)))
    .flatMap((title) => {
      const escaped = title.toLowerCase().replace(/[\\%_]/g, (char) => `\\${char}`);
      return [`${escaped} %`, `${escaped}:%`];
    });
  return { names, editions };
}

/** How long a search waits for the covers of catalog games it shows; slower lookups keep running and are cached for the next search. */
const COVER_BUDGET_MS = 1_500;
/** Covers that are already cached are worth a short wait even after slow stores. */
const COVER_GRACE_MS = 150;

/** Each promise's value, or null for the ones still running after `ms`. */
async function withinBudget<T>(promises: Promise<T | null>[], ms: number): Promise<(T | null)[]> {
  if (!promises.length) return [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.all(promises.map((promise) => Promise.race([promise, deadline])));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Curated overrides, then the games the query names ("гта 6", "кс2",
 * "ведьмак"), then the stores' answer for their real names with add-ons of
 * other products dropped and the closest titles first (games the query only
 * starts the name of, or other games of a series it names with an unknown
 * number, "fallout 2", are ranked among them), then the offline catalog.
 * Catalog-only results get covers within a short time budget.
 */
export async function searchGames(input: string): Promise<GameSearchResult[]> {
  const sanitized = sanitizeGameName(input);
  if (!sanitized) return [];
  const started = Date.now();
  const needle = normalizeGameName(sanitized);
  const plan = searchPlan(sanitized);

  // Covers of named games the stores do not sell are looked up while the
  // stores answer (the others take the art of their store entry); asking
  // again below joins the running lookup or reads its cached result.
  const cover = (name: string) => resolveCover(name).catch(() => null);
  for (const match of plan.aliases) if (match.store === "other") void cover(match.title);

  const [curated, answers] = await Promise.all([
    query<{ game_id: number; name: string; background_image: string | null; released: string | null }>(
      `select game_id, name, background_image, released::text as released
       from game_catalog_overrides
       where enabled and (lower(name) like '%' || $1 || '%' or lower(name) = any($2::text[])
         or exists (select 1 from unnest(search_terms) t where lower(t) like '%' || $1 || '%'))
       limit 12`,
      // "фортик", "mc": the curated row of the game the query names.
      [needle, plan.aliases.filter((match) => match.exact).map((match) => match.title.toLowerCase())],
    )
      .catch(() => [])
      .then((rows) =>
        rows.map((row): GameSearchResult => ({
          id: Number(row.game_id),
          name: row.name,
          backgroundImage: row.background_image,
          released: row.released,
          source: "catalog",
        })),
      ),
    Promise.all(plan.terms.map((term) => storeSearch(term).catch(() => []))),
  ]);

  const named = plan.aliases.map((match) => ({
    match,
    game: { id: catalogId(match.title), name: match.title, backgroundImage: null, released: null, source: "catalog", steamAppId: null } as GameSearchResult,
  }));
  // The stores' guesses for a name they were given by the alias table (no
  // word of it in the title, like "CS2D" for Counter-Strike) are left out.
  const guesses = plan.aliases.some((match) => match.exact);
  const ranked = answers
    .flat()
    .filter((game) => !onlyAfterDash(game.name, plan.keys))
    .map((game, order) => ({ game, order, rank: textRank(game.name, plan.keys) }))
    .filter((entry) => !guesses || entry.rank < NO_MATCH)
    .sort((a, b) => a.rank - b.rank || a.order - b.order);
  // A store edition of a named game ("Grand Theft Auto V Enhanced") is that
  // game: its art and Steam app go to the named card instead of a second card.
  // Editions of other games in the alias table take the table's title, so a
  // game is saved under one name whatever was typed to find it.
  const stores: { game: GameSearchResult; rank: number }[] = [];
  for (const { game, rank } of ranked) {
    const owner = named.find((entry) => isEditionOf(game.name, entry.game.name))?.game;
    if (!owner) {
      const title = editionTitle(game.name);
      stores.push({ game: title && title !== game.name ? { ...game, name: title } : game, rank });
      continue;
    }
    owner.backgroundImage ??= game.backgroundImage;
    if (!owner.steamAppId && game.steamAppId) Object.assign(owner, { id: game.steamAppId, source: "steam", steamAppId: game.steamAppId });
  }

  // Games the query only starts the name of rank as titles starting with it;
  // the series of "fallout 2" as titles containing it, after the typed game.
  // On a tie the named game (the most played) goes first.
  const followers = named
    .filter(({ match }) => !match.exact)
    .map(({ match, game }) => ({ game, rank: match.sequel ? PART_MATCH : PREFIX_MATCH, named: true }));
  const listed = [...followers, ...stores.map((entry) => ({ ...entry, named: false }))]
    .map((entry, order) => ({ ...entry, order }))
    .sort((a, b) => a.rank - b.rank || Number(b.named) - Number(a.named) || a.order - b.order);
  const first = named.filter(({ match }) => match.exact).map(({ game }) => game);
  const titles = [...first, ...listed.map(({ game }) => game)].map((game) => game.name);
  const games = listed.filter((entry) => entry.named || !dlcOf(entry.game.name, titles)).map(({ game }) => game);
  // Catalog titles a store result is an edition of are already on the list.
  const catalog = offline(plan.keys).filter((game) => !games.some((store) => isEditionOf(store.name, game.name)));
  // The card whose title is exactly what was typed goes first ("Hollow Knight" before Silksong).
  const typed = gameSearchKey(sanitized);
  const isTyped = (game: GameSearchResult) => gameSearchKey(game.name) === typed;
  const results = merge(curated, [...first, ...games, ...catalog]).sort((a, b) => Number(isTyped(b)) - Number(isTyped(a)));

  const pending = results.filter((game) => !game.backgroundImage && game.source === "catalog");
  const budget = Math.max(COVER_GRACE_MS, COVER_BUDGET_MS - (Date.now() - started));
  const found = new Map((await withinBudget(pending.map((game) => cover(game.name)), budget)).map((art, index) => [pending[index], art]));
  return results.map((game) => {
    const art = found.get(game);
    if (!art) return game;
    // The cover's Steam app is this game only when the store title is (an edition of) it.
    const appId = !game.steamAppId && art.steamAppId && art.title && isEditionOf(art.title, game.name) ? art.steamAppId : null;
    return { ...game, backgroundImage: art.coverUrl, ...(appId ? { id: appId, source: "steam" as const, steamAppId: appId } : {}) };
  });
}

/**
 * Treats "Counter-Strike 2" and "Counter Strike 2", "Assassin's Creed" and "Assassins Creed", or
 * "Apex Legends™" and "Apex Legends" as one game. Search shows one card per key; gameMatcher()
 * (/api/players) also counts these spellings as one game.
 */
export function gameKey(name: string): string {
  return normalizeGameName(name).replace(/['’`]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Keeps the first entry of each game in order, borrowing artwork from a later duplicate when it has none. */
function merge(first: GameSearchResult[], second: GameSearchResult[]): GameSearchResult[] {
  const merged: GameSearchResult[] = [];
  const position = new Map<string, number>();
  for (const game of [...first, ...second]) {
    const key = gameKey(game.name);
    const at = position.get(key);
    if (at === undefined) {
      position.set(key, merged.length);
      merged.push(game);
    } else if (!merged[at].backgroundImage && game.backgroundImage) {
      merged[at] = { ...merged[at], backgroundImage: game.backgroundImage };
    }
  }
  return merged.slice(0, MAX_RESULTS);
}

// ── Popular now ────────────────────────────────────────────────────────────

interface SteamFeaturedItem {
  id: number;
  name: string;
  header_image?: string;
  large_capsule_image?: string;
}

const NOT_A_GAME = /steam deck|steam frame|steam controller|valve index|steam link|\bbundle\b|soundtrack/i;

async function mapLimit<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await work(items[index]);
      }
    }),
  );
  return results;
}

export async function popularGames(): Promise<GameSearchResult[]> {
  // v7: earlier lists may hold titles only one player had, player titles under
  // a store name, one Steam app twice, miss a game hidden by a prefix match,
  // or name a top seller by its store edition ("Grand Theft Auto V Enhanced").
  const key = "popular:v7";
  const cached = await cacheGet<GameSearchResult[]>(key);
  if (cached && cached.length) return cached;

  const results: GameSearchResult[] = [];
  const seen = new Set<string>();
  /** One tile per Steam app: the first one wins. */
  const seenApps = new Set<number>();
  const add = (game: GameSearchResult, appKey: number | null | undefined = game.steamAppId) => {
    const normalized = normalizeGameName(game.name);
    if (!game.backgroundImage || seen.has(normalized) || (appKey && seenApps.has(appKey))) return;
    seen.add(normalized);
    if (appKey) seenApps.add(appKey);
    results.push(game);
  };
  /** A resolved title only claims its Steam app when it is the store title; a prefix match ("Minecraft" -> "Minecraft Dungeons") is another game. */
  const sameApp = (cover: ResolvedCover, name: string) => (cover.steamAppId && cover.title && matchScore(cover.title, name) === 3 ? cover.steamAppId : null);

  // 1. What UniShare players actually have. Names are typed freely, so only
  // titles that are a Steam app or in the offline catalog are shown, never
  // text the content rules reject, and only titles at least two players share
  // (one profile's games stay its own). Spellings that differ only in case
  // count together, and the tile keeps the players' own title (or the catalog
  // one, which only differs in case) so the game sheet finds them.
  const used = await query<{ name: string; count: number }>(
    `select mode() within group (order by g) as name, count(distinct u.uid)::int as count
     from users u, unnest(u.games || u.wanted_games) as g
     where u.onboarding_complete and u.account_state = 'active'
       and not exists (select 1 from content_rules r where r.is_active and g ~* r.pattern)
     group by lower(g) having count(distinct u.uid) >= 2
     order by count desc, name limit 12`,
  ).catch(() => []);
  const catalog = new Map(POPULAR_GAMES.map((name) => [normalizeGameName(name), name]));
  const usedCovers = await mapLimit(used, 4, async (row) => ({ name: row.name, cover: await resolveCover(row.name) }));
  for (const { name, cover } of usedCovers) {
    const catalogName = catalog.get(normalizeGameName(name));
    if (!cover || (!cover.steamAppId && !catalogName)) continue;
    const title = catalogName && catalogName.toLowerCase() === name.toLowerCase() ? catalogName : name;
    add({ id: cover.steamAppId ?? 0, name: title, backgroundImage: cover.coverUrl, released: null, source: cover.steamAppId ? "steam" : "catalog", steamAppId: cover.steamAppId }, sameApp(cover, name));
  }

  // 2. Steam top sellers.
  const featured = await fetchJson<{ top_sellers?: { items?: SteamFeaturedItem[] } }>(
    "https://store.steampowered.com/api/featuredcategories?cc=US&l=english",
  );
  for (const item of (featured.ok ? featured.data?.top_sellers?.items : null) ?? []) {
    if (!Number.isSafeInteger(item.id) || !item.name || NOT_A_GAME.test(item.name)) continue;
    const image = (item.header_image ?? item.large_capsule_image ?? "").split("?")[0] || steamImageFromCapsule(item.id, null);
    // Saved from this tile, the game gets the name search shows for it.
    add({ id: item.id, name: editionTitle(item.name) ?? item.name, backgroundImage: image, released: null, source: "steam", steamAppId: item.id });
  }

  // 3. Evergreen titles from the offline catalog.
  if (results.length < 24) {
    const missing = POPULAR_GAMES.filter((name) => !seen.has(normalizeGameName(name))).slice(0, 30);
    const covers = await mapLimit(missing, 4, async (name) => ({ name, cover: results.length >= 24 ? null : await resolveCover(name) }));
    for (const { name, cover } of covers) {
      if (results.length >= 24) break;
      if (cover) add({ id: cover.steamAppId ?? 0, name, backgroundImage: cover.coverUrl, released: null, source: cover.steamAppId ? "steam" : "catalog", steamAppId: cover.steamAppId }, sameApp(cover, name));
    }
  }

  const list = results.slice(0, 24);
  // Without Steam's top sellers the list is a fallback: keep it for minutes only.
  if (list.length) await cachePut(key, list, featured.ok ? POPULAR_TTL_HOURS : FAILURE_TTL_HOURS);
  else if (cached) return cached;
  return list;
}

// ── Details ────────────────────────────────────────────────────────────────

interface SteamAppDetails {
  name?: string;
  short_description?: string;
  header_image?: string;
  genres?: { description?: string }[];
  release_date?: { date?: string; coming_soon?: boolean };
  metacritic?: { score?: number };
  platforms?: { windows?: boolean; mac?: boolean; linux?: boolean };
}

function stripHtml(value: string | undefined | null): string | null {
  if (!value) return null;
  const text = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || null;
}

export function mapSteamDetails(data: SteamAppDetails, fallbackName: string): GameDetails {
  const platforms: string[] = [];
  if (data.platforms?.windows) platforms.push("PC");
  if (data.platforms?.mac) platforms.push("macOS");
  if (data.platforms?.linux) platforms.push("Linux");
  const score = data.metacritic?.score;
  return {
    name: data.name ?? fallbackName,
    image: data.header_image ? data.header_image.split("?")[0] : null,
    rating: typeof score === "number" ? Math.round((score / 20) * 10) / 10 : null,
    playtimeHours: null,
    platforms,
    genres: (data.genres ?? []).map((genre) => genre.description ?? "").filter(Boolean),
    released: data.release_date?.date || null,
    about: stripHtml(data.short_description),
    source: "steam",
  };
}

interface RawgDetails {
  name?: string;
  background_image?: string | null;
  rating?: number | null;
  playtime?: number | null;
  platforms?: { platform?: { name?: string } }[];
  genres?: { name?: string }[];
  released?: string | null;
  description_raw?: string | null;
}

/**
 * Steam's answer for one app (`data: null` when Steam has no store page for
 * it), or `ok: false` when Steam did not answer. cc=us: from the Russian-hosted
 * server Steam would otherwise answer success:false for titles not sold there.
 */
async function steamDetails(appId: number, name: string): Promise<Lookup<GameDetails | null>> {
  const payload = await fetchJson<Record<string, { success?: boolean; data?: SteamAppDetails }>>(
    `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=us&l=russian`,
  );
  if (!payload.ok || !payload.data) return { ok: false };
  const entry = payload.data[String(appId)];
  return { ok: true, data: entry?.success && entry.data ? mapSteamDetails(entry.data, name) : null };
}

export async function gameDetails(input: { name: string; steamAppId?: number | null; rawgId?: number | null }): Promise<GameDetails> {
  const name = sanitizeGameName(input.name) ?? input.name.trim().slice(0, 80);
  const rawgId = config.rawgApiKey && input.rawgId && input.rawgId > 0 ? input.rawgId : null;
  const steamAppId = input.steamAppId && input.steamAppId > 0 ? input.steamAppId : null;
  // The name is part of every key: content found by name is never served to
  // requests that only share the (client-supplied) id.
  const key = `details:${rawgId ? `rawg:${rawgId}:` : steamAppId ? `steam:${steamAppId}:` : "name:"}${normalizeGameName(name)}`;
  const cached = await cacheGet<GameDetails>(key);
  if (cached) return cached;

  let details: GameDetails | null = null;
  // A provider did not answer: the result is kept for minutes only, and a
  // failed Steam lookup is not replaced by a Wikipedia guess.
  let failed = false;
  let steamFailed = false;

  if (rawgId && config.rawgApiKey) {
    const result = await fetchJson<RawgDetails>(`https://api.rawg.io/api/games/${rawgId}?key=${encodeURIComponent(config.rawgApiKey)}`);
    if (!result.ok) failed = true;
    const data = result.ok ? result.data : null;
    if (data) {
      details = {
        name: data.name ?? name,
        image: data.background_image ?? null,
        rating: typeof data.rating === "number" && data.rating > 0 ? Math.round(data.rating * 10) / 10 : null,
        playtimeHours: data.playtime && data.playtime > 0 ? data.playtime : null,
        platforms: (data.platforms ?? []).map((item) => item.platform?.name ?? "").filter(Boolean),
        genres: (data.genres ?? []).map((genre) => genre.name ?? "").filter(Boolean),
        released: data.released ?? null,
        about: stripHtml(data.description_raw),
        source: "rawg",
      };
    }
  }

  // "гта 6" is looked up as Grand Theft Auto VI; games not on Steam skip the
  // Steam search, whose closest title would be another game ("Minecraft Dungeons").
  const canonical = canonicalGame(name);
  const title = canonical?.title ?? name;

  if (!details && name) {
    let appId = steamAppId;
    if (!appId && canonical?.store !== "other") {
      const results = await steamSearch(title);
      if (results) appId = bestSteamMatch(results, title)?.steamAppId ?? null;
      else steamFailed = true;
    }
    if (appId) {
      const steam = await steamDetails(appId, name);
      if (steam.ok) details = steam.data;
      else steamFailed = true;
    }
  }

  if (!details && name && !steamFailed) {
    const result = await wikiSummary(title);
    if (!result.ok) failed = true;
    const wiki = result.ok ? result.data : null;
    if (wiki) {
      details = {
        name: wiki.title ?? name,
        image: cleanWikiImage(wiki.originalimage?.source ?? wiki.thumbnail?.source),
        rating: null,
        playtimeHours: null,
        platforms: [],
        genres: [],
        released: null,
        about: wiki.extract ?? null,
        source: "wikipedia",
      };
    }
  }

  failed ||= steamFailed;
  const ttl = failed ? FAILURE_TTL_HOURS : details ? DETAILS_TTL_DAYS * 24 : MISS_TTL_HOURS;
  details ??= { name, image: null, rating: null, playtimeHours: null, platforms: [], genres: [], released: null, about: null, source: "catalog" };
  await cachePut(key, details, ttl);
  return details;
}

export async function purgeExpiredGameCache(): Promise<void> {
  await query(`delete from game_catalog_cache where expires_at < now() - interval '30 days'`).catch(() => undefined);
}
