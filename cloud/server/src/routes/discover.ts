import type { FastifyInstance } from "fastify";
import {
  PLATFORMS,
  isPlatform,
  normalizeGameName,
  sanitizeGameName,
  type AirShareResult,
  type GameDetails,
  type GameSearchResult,
  type ProfileCard,
  type SearchResults,
} from "@unishare/shared";
import { query } from "../db";
import { requireSession } from "../auth/session";
import { badRequest } from "../lib/errors";
import { USER_COLUMNS, toProfileCard, type UserRow } from "../lib/profiles";
import { blockedPair } from "../lib/sql";
import { SlidingWindowLimit } from "../lib/ratelimit";
import { gameDetails, gameKey, popularGames, searchGames } from "../games";
import { airshareLeave, airsharePing } from "../airshare";

function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function optionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

export async function discoverRoutes(app: FastifyInstance): Promise<void> {
  // Per-user limits: these reads scan users and call Steam/RAWG/Wikipedia.
  const searchLimit = new SlidingWindowLimit(60, 60_000);
  const playersLimit = new SlidingWindowLimit(60, 60_000);
  const detailsLimit = new SlidingWindowLimit(30, 60_000);

  // In-app search by username, game, platform, subscription or skill.
  app.get<{ Querystring: { q?: string; platform?: string } }>("/api/search", async (request): Promise<SearchResults> => {
    const session = await requireSession(request);
    searchLimit.assert(session.userId);
    const q = String(request.query.q ?? "").trim().slice(0, 80);
    const platform = request.query.platform && isPlatform(request.query.platform) ? request.query.platform : null;
    if (!q && !platform) return { users: [], games: [], platforms: [] };

    const pattern = q ? likePattern(q) : null;
    const usersPromise = query<UserRow>(
      `select ${USER_COLUMNS}
       from users u
       where u.uid <> $1
         and u.onboarding_complete
         and u.account_state = 'active'
         and not ${blockedPair("$1", "u.uid")}
         and ($3::text is null or $3 = any(u.platforms))
         and ($2::text is null
           or u.username::text ilike $2 escape '\\'
           or exists (select 1 from unnest(u.games || u.wanted_games) as g where g ilike $2 escape '\\')
           or exists (select 1 from unnest(u.platforms) as p where p ilike $2 escape '\\')
           or exists (select 1 from unnest(u.skills) as s where s ilike $2 escape '\\')
           or exists (select 1 from jsonb_array_elements(u.subscriptions) as sub where sub->>'name' ilike $2 escape '\\'))
       order by ($2::text is not null and u.username::text ilike $2 escape '\\') desc, u.updated_at desc
       limit $4`,
      [session.userId, pattern, platform, q ? 20 : 30],
    );
    const gamesPromise: Promise<GameSearchResult[]> = q.length >= 2 ? searchGames(q) : Promise.resolve([]);
    const [users, games] = await Promise.all([usersPromise, gamesPromise]);
    const needle = q.toLocaleLowerCase();
    return {
      users: users.map(toProfileCard),
      games,
      platforms: q ? PLATFORMS.filter((item) => item.toLocaleLowerCase().includes(needle)) : [],
    };
  });

  // Players of one game (the game sheet): exact, case-insensitive match on
  // games or wanted games, online people first.
  app.get<{ Querystring: { game?: string } }>("/api/players", async (request): Promise<ProfileCard[]> => {
    const session = await requireSession(request);
    playersLimit.assert(session.userId);
    const game = sanitizeGameName(String(request.query.game ?? ""));
    if (!game) throw badRequest("game is required");
    // Same title as search shows it: case, ™/® and punctuation aside ("Apex Legends™" lists the
    // players of "Apex Legends"). SQL narrows by the longest word, gameKey() decides.
    const key = gameKey(game);
    const word = key.split(" ").reduce((longest, part) => (part.length > longest.length ? part : longest), "");
    const rows = await query<UserRow>(
      `select ${USER_COLUMNS}
       from users u
       where u.uid <> $1
         and u.onboarding_complete
         and u.account_state = 'active'
         and not ${blockedPair("$1", "u.uid")}
         and exists (select 1 from unnest(u.games || u.wanted_games) as g where lower(g) = lower($2) or ($3 <> '' and strpos(lower(g), $3) > 0))
       order by u.is_online desc, u.updated_at desc
       limit 500`,
      [session.userId, game, word],
    );
    return rows
      .filter((row) => [...row.games, ...row.wanted_games].some((name) => (key ? gameKey(name) === key : normalizeGameName(name) === normalizeGameName(game))))
      .slice(0, 50)
      .map(toProfileCard);
  });

  app.get("/api/games/popular", async (request): Promise<GameSearchResult[]> => {
    await requireSession(request);
    return popularGames();
  });

  app.get<{ Querystring: { name?: string; steamAppId?: string; rawgId?: string } }>(
    "/api/games/details",
    async (request): Promise<GameDetails> => {
      const session = await requireSession(request);
      detailsLimit.assert(session.userId);
      const name = String(request.query.name ?? "").trim();
      if (name.length < 2 || name.length > 160) throw badRequest("name is required");
      return gameDetails({
        name,
        steamAppId: optionalNumber(request.query.steamAppId),
        rawgId: optionalNumber(request.query.rawgId),
      });
    },
  );

  // AirShare: discover people who opened AirShare nearby at the same time.
  app.post<{ Body: { lat?: number; lng?: number; accuracy?: number; locating?: boolean } }>("/api/airshare/ping", async (request): Promise<AirShareResult> => {
    const session = await requireSession(request);
    const body = request.body ?? {};
    if (body.locating !== undefined && typeof body.locating !== "boolean") throw badRequest("locating must be a boolean");
    for (const [field, limit] of [["lat", 90], ["lng", 180]] as const) {
      const value = body[field];
      if (value !== undefined && value !== null && (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > limit)) {
        throw badRequest(`${field} is out of range`);
      }
    }
    const ids = airsharePing(session.userId, body, request.ip ?? null);
    if (!ids.length) return { profiles: [] };
    const rows = await query<UserRow>(
      `select ${USER_COLUMNS} from users u
       where u.uid = any($2::uuid[]) and u.onboarding_complete and u.account_state = 'active'
         and not ${blockedPair("$1", "u.uid")}
       order by array_position($2::uuid[], u.uid)
       limit 20`,
      [session.userId, ids],
    );
    return { profiles: rows.map(toProfileCard) };
  });

  app.delete("/api/airshare", async (request) => {
    const session = await requireSession(request);
    airshareLeave(session.userId);
    return { ok: true };
  });
}
