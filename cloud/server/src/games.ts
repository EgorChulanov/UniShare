// Game catalog search: curated overrides + RAWG (server-side key, cached in
// PostgreSQL) + an offline list of popular titles as the last fallback.
import { POPULAR_GAMES, normalizeGameName, sanitizeGameName, type GameSearchResult } from "@unishare/shared";
import { config } from "./config";
import { query, queryOne } from "./db";

const CACHE_TTL_DAYS = 14;

function offline(needle: string): GameSearchResult[] {
  return POPULAR_GAMES.map((name, index) => ({ name, index, normalized: normalizeGameName(name) }))
    .filter((game) => game.normalized.includes(needle))
    .sort((a, b) => Number(!a.normalized.startsWith(needle)) - Number(!b.normalized.startsWith(needle)) || a.name.localeCompare(b.name))
    .slice(0, 12)
    .map((game) => ({ id: -(game.index + 1000), name: game.name, backgroundImage: null, released: null }));
}

interface RawgGame {
  id: number;
  name: string;
  background_image: string | null;
  released: string | null;
}

export async function searchGames(input: string): Promise<GameSearchResult[]> {
  const sanitized = sanitizeGameName(input);
  if (!sanitized) return [];
  const needle = normalizeGameName(sanitized);
  const cacheKey = `search:${needle}`.slice(0, 160);

  const curated = (await query<{ game_id: number; name: string; background_image: string | null; released: string | null }>(
    `select game_id, name, background_image, released::text as released
     from game_catalog_overrides
     where enabled and (lower(name) like '%' || $1 || '%' or exists (select 1 from unnest(search_terms) t where lower(t) like '%' || $1 || '%'))
     limit 12`,
    [needle],
  ).catch(() => [])).map((row) => ({ id: Number(row.game_id), name: row.name, backgroundImage: row.background_image, released: row.released }));

  const cached = await queryOne<{ payload: GameSearchResult[] }>(
    `select payload from game_catalog_cache where cache_key = $1 and expires_at > now()`,
    [cacheKey],
  ).catch(() => null);
  if (cached) return merge(curated, cached.payload);

  if (!config.rawgApiKey) return merge(curated, offline(needle));

  try {
    const url = new URL("https://api.rawg.io/api/games");
    url.searchParams.set("key", config.rawgApiKey);
    url.searchParams.set("search", sanitized);
    url.searchParams.set("page_size", "12");
    url.searchParams.set("search_precise", "true");
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`RAWG ${response.status}`);
    const payload = (await response.json()) as { results?: RawgGame[] };
    const results: GameSearchResult[] = (payload.results ?? []).map((game) => ({
      id: game.id,
      name: game.name,
      backgroundImage: game.background_image ?? null,
      released: game.released ?? null,
    }));
    await query(
      `insert into game_catalog_cache (cache_key, payload, expires_at)
       values ($1, $2, now() + make_interval(days => $3))
       on conflict (cache_key) do update set payload = excluded.payload, expires_at = excluded.expires_at, updated_at = now()`,
      [cacheKey, JSON.stringify(results), CACHE_TTL_DAYS],
    ).catch(() => undefined);
    return merge(curated, results.length ? results : offline(needle));
  } catch {
    const stale = await queryOne<{ payload: GameSearchResult[] }>(
      `select payload from game_catalog_cache where cache_key = $1`,
      [cacheKey],
    ).catch(() => null);
    return merge(curated, stale?.payload ?? offline(needle));
  }
}

function merge(first: GameSearchResult[], second: GameSearchResult[]): GameSearchResult[] {
  const seen = new Set(first.map((game) => normalizeGameName(game.name)));
  return [...first, ...second.filter((game) => !seen.has(normalizeGameName(game.name)))].slice(0, 12);
}

export async function purgeExpiredGameCache(): Promise<void> {
  await query(`delete from game_catalog_cache where expires_at < now() - interval '30 days'`).catch(() => undefined);
}
