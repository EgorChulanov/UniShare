// Game catalog: curated overrides, RAWG (when RAWG_API_KEY is set), the
// public Steam store API and Wikipedia (no keys needed), plus an offline list
// of popular titles. Every provider response is cached in PostgreSQL and no
// provider failure ever reaches the caller.
import {
  POPULAR_GAMES,
  normalizeGameName,
  sanitizeGameName,
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

// ── Offline catalog ────────────────────────────────────────────────────────

function offline(needle: string): GameSearchResult[] {
  return POPULAR_GAMES.map((name, index) => ({ name, index, normalized: normalizeGameName(name) }))
    .filter((game) => game.normalized.includes(needle))
    .sort((a, b) => Number(!a.normalized.startsWith(needle)) - Number(!b.normalized.startsWith(needle)) || a.name.localeCompare(b.name))
    .slice(0, 12)
    .map((game) => ({ id: -(game.index + 1000), name: game.name, backgroundImage: null, released: null, source: "catalog" as const }));
}

// ── Steam (public store API, no key) ───────────────────────────────────────

interface SteamSearchItem {
  type?: string;
  id: number;
  name: string;
  tiny_image?: string | null;
}

const NON_GAME = /\b(soundtrack|ost|dlc|season pass|demo|artbook|art book|wallpaper|costume pack|expansion pass|upgrade|bundle)\b/i;

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
    .filter((item) => (item.type ?? "app") === "app" && Number.isSafeInteger(item.id) && item.name && !NON_GAME.test(item.name))
    .map((item) => ({
      id: item.id,
      name: item.name,
      backgroundImage: steamImageFromCapsule(item.id, item.tiny_image),
      released: null,
      source: "steam" as const,
      steamAppId: item.id,
    }));
}

/** Steam store search; `null` when Steam did not answer and nothing is cached (unlike `[]`, "no such game"). */
export async function steamSearch(term: string): Promise<GameSearchResult[] | null> {
  const needle = normalizeGameName(term);
  const key = `steam:${needle}`;
  const cached = await cacheGet<GameSearchResult[]>(key);
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

/**
 * The Wikipedia article about a game (`data: null` when there is none), or
 * `ok: false` when Wikipedia did not answer. "<name> (video game)" is tried
 * first; the bare title only counts when it describes a game ("Hades" alone is
 * the god, "Spider-Man" the comic character).
 */
async function wikiSummary(name: string): Promise<Lookup<WikiSummary | null>> {
  for (const [title, mustDescribeGame] of [[`${name} (video game)`, false], [name, true]] as const) {
    const result = await fetchJson<WikiSummary>(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`,
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

/** Finds artwork for a game title: Steam first, then Wikipedia. Cached. */
export async function resolveCover(name: string): Promise<ResolvedCover | null> {
  const sanitized = sanitizeGameName(name);
  if (!sanitized) return null;
  // v3: v2 entries may hold misses cached during Steam outages and bare-title Wikipedia images.
  const key = `cover3:${normalizeGameName(sanitized)}`;
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
  const results = await steamSearch(sanitized);
  if (!results) return failed();
  const steam = bestSteamMatch(results, sanitized);
  if (steam?.backgroundImage) {
    const appId = steam.steamAppId ?? steam.id;
    let header: string | null = null;
    if (/\/capsule_[^/]+$/.test(steam.backgroundImage)) {
      const lookup = await steamHeaderImage(appId);
      if (lookup.ok) header = lookup.data;
      else provisional = true;
    }
    cover = { coverUrl: header ?? steam.backgroundImage, steamAppId: appId, title: steam.name };
  }
  if (!cover) {
    const wiki = await wikiSummary(sanitized);
    if (!wiki.ok) return failed();
    const image = cleanWikiImage(wiki.data?.thumbnail?.source ?? wiki.data?.originalimage?.source);
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

export async function searchGames(input: string): Promise<GameSearchResult[]> {
  const sanitized = sanitizeGameName(input);
  if (!sanitized) return [];
  const needle = normalizeGameName(sanitized);

  const curated = (await query<{ game_id: number; name: string; background_image: string | null; released: string | null }>(
    `select game_id, name, background_image, released::text as released
     from game_catalog_overrides
     where enabled and (lower(name) like '%' || $1 || '%' or exists (select 1 from unnest(search_terms) t where lower(t) like '%' || $1 || '%'))
     limit 12`,
    [needle],
  ).catch(() => [])).map((row) => ({
    id: Number(row.game_id),
    name: row.name,
    backgroundImage: row.background_image,
    released: row.released,
    source: "catalog" as const,
  }));

  const rawg = await rawgSearch(sanitized, needle);
  if (rawg && rawg.length) return merge(curated, rawg);

  const steam = (await steamSearch(sanitized)) ?? [];
  return merge(merge(curated, steam), offline(needle));
}

function merge(first: GameSearchResult[], second: GameSearchResult[]): GameSearchResult[] {
  const seen = new Set(first.map((game) => normalizeGameName(game.name)));
  return [...first, ...second.filter((game) => !seen.has(normalizeGameName(game.name)))].slice(0, 12);
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
  // v5: earlier lists may hold titles only one player had, player titles under
  // a store name, or one Steam app twice.
  const key = "popular:v5";
  const cached = await cacheGet<GameSearchResult[]>(key);
  if (cached && cached.length) return cached;

  const results: GameSearchResult[] = [];
  const seen = new Set<string>();
  /** One tile per Steam app: the first one (players' own title in step 1) wins. */
  const seenApps = new Set<number>();
  const add = (game: GameSearchResult) => {
    const normalized = normalizeGameName(game.name);
    if (!game.backgroundImage || seen.has(normalized) || (game.steamAppId && seenApps.has(game.steamAppId))) return;
    seen.add(normalized);
    if (game.steamAppId) seenApps.add(game.steamAppId);
    results.push(game);
  };

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
    add({ id: cover.steamAppId ?? 0, name: title, backgroundImage: cover.coverUrl, released: null, source: cover.steamAppId ? "steam" : "catalog", steamAppId: cover.steamAppId });
  }

  // 2. Steam top sellers.
  const featured = await fetchJson<{ top_sellers?: { items?: SteamFeaturedItem[] } }>(
    "https://store.steampowered.com/api/featuredcategories?cc=US&l=english",
  );
  for (const item of (featured.ok ? featured.data?.top_sellers?.items : null) ?? []) {
    if (!Number.isSafeInteger(item.id) || !item.name || NOT_A_GAME.test(item.name)) continue;
    const image = (item.header_image ?? item.large_capsule_image ?? "").split("?")[0] || steamImageFromCapsule(item.id, null);
    add({ id: item.id, name: item.name, backgroundImage: image, released: null, source: "steam", steamAppId: item.id });
  }

  // 3. Evergreen titles from the offline catalog.
  if (results.length < 24) {
    const missing = POPULAR_GAMES.filter((name) => !seen.has(normalizeGameName(name))).slice(0, 30);
    const covers = await mapLimit(missing, 4, async (name) => ({ name, cover: results.length >= 24 ? null : await resolveCover(name) }));
    for (const { name, cover } of covers) {
      if (results.length >= 24) break;
      if (cover) add({ id: cover.steamAppId ?? 0, name, backgroundImage: cover.coverUrl, released: null, source: cover.steamAppId ? "steam" : "catalog", steamAppId: cover.steamAppId });
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

  if (!details && name) {
    let appId = steamAppId;
    if (!appId) {
      const results = await steamSearch(name);
      if (results) appId = bestSteamMatch(results, name)?.steamAppId ?? null;
      else steamFailed = true;
    }
    if (appId) {
      const steam = await steamDetails(appId, name);
      if (steam.ok) details = steam.data;
      else steamFailed = true;
    }
  }

  if (!details && name && !steamFailed) {
    const result = await wikiSummary(name);
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
