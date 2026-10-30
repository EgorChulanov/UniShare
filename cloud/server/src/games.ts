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
const TIMEOUT_MS = 6_000;
const USER_AGENT = "UniShare/1.0 (https://github.com/EgorChulanov/UniShare; official@egorchulanov.ru)";

// ── HTTP + cache helpers ───────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
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
     values ($1, $2, now() + make_interval(hours => $3))
     on conflict (cache_key) do update set payload = excluded.payload, expires_at = excluded.expires_at, updated_at = now()`,
    [key.slice(0, 160), JSON.stringify(payload), hours],
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

export async function steamSearch(term: string): Promise<GameSearchResult[]> {
  const needle = normalizeGameName(term);
  const key = `steam:${needle}`;
  const cached = await cacheGet<GameSearchResult[]>(key);
  if (cached) return cached;
  const url = new URL("https://store.steampowered.com/api/storesearch/");
  url.searchParams.set("term", term);
  url.searchParams.set("l", "english");
  url.searchParams.set("cc", "US");
  const payload = await fetchJson<{ items?: SteamSearchItem[] }>(url.toString());
  if (!payload) return (await cacheGet<GameSearchResult[]>(key, true)) ?? [];
  const results = mapSteamSearch(payload.items ?? []).slice(0, 12);
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
  extract?: string;
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
}

function cleanWikiImage(url: string | undefined): string | null {
  if (!url) return null;
  return url.split("?")[0];
}

async function wikiSummary(name: string): Promise<WikiSummary | null> {
  for (const title of [name, `${name} (video game)`]) {
    const summary = await fetchJson<WikiSummary>(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`,
    );
    if (summary && summary.type !== "disambiguation" && (summary.thumbnail?.source || summary.extract)) return summary;
  }
  return null;
}

// ── Covers ─────────────────────────────────────────────────────────────────

export interface ResolvedCover {
  coverUrl: string;
  steamAppId: number | null;
}

/** Exact header image for apps whose assets live under a hashed path (search only returns a small capsule). */
async function steamHeaderImage(appId: number): Promise<string | null> {
  const payload = await fetchJson<Record<string, { success?: boolean; data?: { header_image?: string } }>>(
    `https://store.steampowered.com/api/appdetails?appids=${appId}&filters=basic`,
  );
  const image = payload?.[String(appId)]?.data?.header_image;
  return image ? image.split("?")[0] : null;
}

/** Finds artwork for a game title: Steam first, then Wikipedia. Cached. */
export async function resolveCover(name: string): Promise<ResolvedCover | null> {
  const sanitized = sanitizeGameName(name);
  if (!sanitized) return null;
  const key = `cover2:${normalizeGameName(sanitized)}`;
  const cached = await cacheGet<{ cover: ResolvedCover | null }>(key);
  if (cached) return cached.cover;

  let cover: ResolvedCover | null = null;
  const steam = bestSteamMatch(await steamSearch(sanitized), sanitized);
  if (steam?.backgroundImage) {
    const appId = steam.steamAppId ?? steam.id;
    const header = /\/capsule_[^/]+$/.test(steam.backgroundImage) ? await steamHeaderImage(appId) : null;
    cover = { coverUrl: header ?? steam.backgroundImage, steamAppId: appId };
  }
  if (!cover) {
    const wiki = await wikiSummary(sanitized);
    const image = cleanWikiImage(wiki?.thumbnail?.source ?? wiki?.originalimage?.source);
    if (image) cover = { coverUrl: image, steamAppId: null };
  }
  // Misses are cached for a shorter time so new store entries show up.
  await cachePut(key, { cover }, cover ? COVER_TTL_DAYS * 24 : 72);
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
  if (!payload) return (await cacheGet<GameSearchResult[]>(key, true)) ?? null;
  const results: GameSearchResult[] = (payload.results ?? []).map((game) => ({
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

  const steam = await steamSearch(sanitized);
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
  const key = "popular:v2";
  const cached = await cacheGet<GameSearchResult[]>(key);
  if (cached && cached.length) return cached;

  const results: GameSearchResult[] = [];
  const seen = new Set<string>();
  const add = (game: GameSearchResult) => {
    const normalized = normalizeGameName(game.name);
    if (!game.backgroundImage || seen.has(normalized)) return;
    seen.add(normalized);
    results.push(game);
  };

  // 1. What UniShare players actually have.
  const used = await query<{ name: string; count: number }>(
    `select g as name, count(*)::int as count
     from users u, unnest(u.games || u.wanted_games) as g
     where u.onboarding_complete and u.account_state = 'active'
     group by g order by count desc, g limit 12`,
  ).catch(() => []);
  const usedCovers = await mapLimit(used, 4, async (row) => ({ name: row.name, cover: await resolveCover(row.name) }));
  for (const { name, cover } of usedCovers) {
    if (cover) add({ id: cover.steamAppId ?? 0, name, backgroundImage: cover.coverUrl, released: null, source: cover.steamAppId ? "steam" : "catalog", steamAppId: cover.steamAppId });
  }

  // 2. Steam top sellers.
  const featured = await fetchJson<{ top_sellers?: { items?: SteamFeaturedItem[] } }>(
    "https://store.steampowered.com/api/featuredcategories?cc=US&l=english",
  );
  for (const item of featured?.top_sellers?.items ?? []) {
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
  if (list.length) await cachePut(key, list, POPULAR_TTL_HOURS);
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

async function steamDetails(appId: number, name: string): Promise<GameDetails | null> {
  const payload = await fetchJson<Record<string, { success?: boolean; data?: SteamAppDetails }>>(
    `https://store.steampowered.com/api/appdetails?appids=${appId}&l=russian`,
  );
  const entry = payload?.[String(appId)];
  if (!entry?.success || !entry.data) return null;
  return mapSteamDetails(entry.data, name);
}

export async function gameDetails(input: { name: string; steamAppId?: number | null; rawgId?: number | null }): Promise<GameDetails> {
  const name = sanitizeGameName(input.name) ?? input.name.trim().slice(0, 80);
  const key = `details:${input.rawgId ? `rawg:${input.rawgId}` : input.steamAppId ? `steam:${input.steamAppId}` : `name:${normalizeGameName(name)}`}`;
  const cached = await cacheGet<GameDetails>(key);
  if (cached) return cached;

  let details: GameDetails | null = null;

  if (config.rawgApiKey && input.rawgId && input.rawgId > 0) {
    const data = await fetchJson<RawgDetails>(`https://api.rawg.io/api/games/${input.rawgId}?key=${encodeURIComponent(config.rawgApiKey)}`);
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
    let appId = input.steamAppId && input.steamAppId > 0 ? input.steamAppId : null;
    if (!appId) appId = bestSteamMatch(await steamSearch(name), name)?.steamAppId ?? null;
    if (appId) details = await steamDetails(appId, name);
  }

  if (!details && name) {
    const wiki = await wikiSummary(name);
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

  if (!details) {
    return { name, image: null, rating: null, playtimeHours: null, platforms: [], genres: [], released: null, about: null, source: "catalog" };
  }
  await cachePut(key, details, DETAILS_TTL_DAYS * 24);
  return details;
}

export async function purgeExpiredGameCache(): Promise<void> {
  await query(`delete from game_catalog_cache where expires_at < now() - interval '30 days'`).catch(() => undefined);
}
