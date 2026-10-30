// Fills in missing game artwork (feed cards, profile) in the background so
// saving a profile never waits for Steam or Wikipedia.
import { normalizeGameName, type GameTag } from "@unishare/shared";
import { query, queryOne } from "./db";
import { resolveCover } from "./games";

const LOOKUP_INTERVAL_MS = 200; // ≈5 lookups per second
const inFlight = new Set<string>();

export function coverEnrichmentEnabled(): boolean {
  return process.env.COVER_ENRICHMENT !== "0";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Looks up covers for the user's games that have none and merges them in. */
export async function enrichUserCovers(userId: string): Promise<number> {
  if (!coverEnrichmentEnabled() || inFlight.has(userId)) return 0;
  inFlight.add(userId);
  try {
    const row = await queryOne<{ games: string[]; wanted_games: string[]; game_metadata: Record<string, GameTag> }>(
      `select games, wanted_games, game_metadata from users where uid = $1`,
      [userId],
    );
    if (!row) return 0;
    const metadata = row.game_metadata ?? {};
    const names = [...new Set([...(row.games ?? []), ...(row.wanted_games ?? [])])].filter(
      (name) => !metadata[normalizeGameName(name)]?.coverUrl,
    );
    const additions: Record<string, GameTag> = {};
    for (const name of names) {
      const cover = await resolveCover(name);
      if (cover) {
        const existing = metadata[normalizeGameName(name)];
        additions[normalizeGameName(name)] = {
          name: existing?.name ?? name,
          coverUrl: cover.coverUrl,
          rawgId: existing?.rawgId ?? null,
          steamAppId: cover.steamAppId,
        };
      }
      await sleep(LOOKUP_INTERVAL_MS);
    }
    if (!Object.keys(additions).length) return 0;
    await query(`update users set game_metadata = game_metadata || $2::jsonb where uid = $1`, [userId, JSON.stringify(additions)]);
    return Object.keys(additions).length;
  } catch {
    return 0;
  } finally {
    inFlight.delete(userId);
  }
}

/** One-off pass over every profile after startup. */
export async function backfillCovers(log: (message: string) => void = () => undefined): Promise<void> {
  if (!coverEnrichmentEnabled()) return;
  const users = await query<{ uid: string }>(
    `select uid from users where onboarding_complete and account_state = 'active' and cardinality(games || wanted_games) > 0`,
  ).catch(() => []);
  let updated = 0;
  for (const user of users) updated += await enrichUserCovers(user.uid);
  if (updated) log(`game covers added: ${updated}`);
}
