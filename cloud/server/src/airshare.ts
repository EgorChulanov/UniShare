// AirShare on the web: people who open AirShare at the same time and are
// physically close (geolocation) or on the same network (public IP) find each
// other. Presence lives in memory only and expires quickly.
//
// The server bounds what a ping can reveal about others:
// - when both sides have a precise fix only the distance counts (one public IP
//   may be a carrier NAT or a VPN), and the radius stays within 250 m-1 km;
// - a session keeps its first fix (snapped to a ~150 m grid) for its whole
//   life, so one session cannot be moved around to measure distances;
// - reopening AirShare within 250 m of the last place reuses that place's fix
//   (position and accuracy), so leaving and rejoining reveals nothing new;
// - starting sessions at new places (or with a newly precise fix) is rate-limited;
// - a client still waiting for its location is matched with nobody.
import { tooMany } from "./lib/errors";
import { SlidingWindowLimit } from "./lib/ratelimit";

export const PRESENCE_TTL_MS = 45_000;
const MIN_RADIUS_M = 250;
const MAX_RADIUS_M = 1_000;
/** Fixes coarser than this (city-level or IP-based) cannot place anyone "nearby". */
const MAX_PRECISE_ACCURACY_M = 1_000;
/** Assumed accuracy when the platform does not report one. */
const DEFAULT_ACCURACY_M = 100;
/** Stored coordinates are snapped to this grid (about 150 m of latitude). */
const GRID_DEG = 0.00135;
/**
 * A session started this close to the last counted place reuses that place's
 * fix; farther away it counts as a new place. Kept at the smallest match
 * radius so a reused fix never hides people standing next to the user.
 */
const REOPEN_M = MIN_RADIUS_M;
/** Candidates returned per ping; the route drops blocked and inactive users, then keeps 20. */
export const MAX_CANDIDATES = 60;
/** Pings this soon after leaving are ignored, so a request still in flight cannot re-add the user. */
export const LEAVE_GRACE_MS = 3_000;
const RELOCATION_WINDOW_MS = 10 * 60_000;
const relocations = new SlidingWindowLimit(10, RELOCATION_WINDOW_MS);

interface Fix {
  lat: number;
  lng: number;
  accuracy: number;
}

interface Presence {
  /** First fix of this session; never changes afterwards. */
  fix: Fix | null;
  /** The client is still waiting for its location (permission prompt open). */
  locating: boolean;
  ip: string | null;
  lastSeen: number;
}

export interface PingInput {
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  locating?: boolean | null;
}

const presence = new Map<string, Presence>();
const leftAt = new Map<string, number>();
/** The fix of each user's last counted session, reused when they reopen nearby. */
const lastPlace = new Map<string, Fix & { at: number }>();

export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function validCoordinate(value: unknown, limit: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit;
}

const snap = (value: number) => Math.round(value / GRID_DEG) * GRID_DEG;

function prune(now: number): void {
  for (const [userId, entry] of presence) {
    if (now - entry.lastSeen > PRESENCE_TTL_MS) presence.delete(userId);
  }
  for (const [userId, time] of leftAt) {
    if (now - time >= LEAVE_GRACE_MS) leftAt.delete(userId);
  }
  for (const [userId, place] of lastPlace) {
    if (now - place.at > RELOCATION_WINDOW_MS) lastPlace.delete(userId);
  }
}

/** The fix sent with this ping, if any (snapped, accuracy bounded). */
function readFix(input: PingInput): Fix | null {
  if (!validCoordinate(input.lat, 90) || !validCoordinate(input.lng, 180)) return null;
  const accuracy =
    typeof input.accuracy === "number" && Number.isFinite(input.accuracy) && input.accuracy > 0 ? Math.min(input.accuracy, 50_000) : DEFAULT_ACCURACY_M;
  return { lat: snap(input.lat), lng: snap(input.lng), accuracy };
}

const precise = (entry: Presence): entry is Presence & { fix: Fix } => entry.fix !== null && entry.fix.accuracy <= MAX_PRECISE_ACCURACY_M;

/** Records the caller's presence and returns candidate ids of people nearby, closest first. */
export function airsharePing(userId: string, input: PingInput, ip: string | null, now = Date.now()): string[] {
  prune(now);
  if (leftAt.has(userId)) return [];
  const previous = presence.get(userId);

  let fix = previous?.fix ?? null;
  if (!fix) {
    const sent = readFix(input);
    if (sent) {
      // Reopening near the last place is free but reuses that place's fix, and
      // does not move it; a new place, or a precise fix after a coarse one, is
      // counted. The stored place expires ten minutes after it was counted.
      const last = lastPlace.get(userId);
      const reopening =
        last !== undefined &&
        distanceMeters(last.lat, last.lng, sent.lat, sent.lng) <= REOPEN_M &&
        (last.accuracy <= MAX_PRECISE_ACCURACY_M || sent.accuracy > MAX_PRECISE_ACCURACY_M);
      if (reopening) {
        fix = { lat: last.lat, lng: last.lng, accuracy: last.accuracy };
      } else {
        if (!relocations.take(userId, now)) throw tooMany("Too many AirShare sessions, please try again later");
        lastPlace.set(userId, { ...sent, at: now });
        fix = sent;
      }
    }
  }
  const me: Presence = { fix, locating: !fix && input.locating === true, ip: ip ?? previous?.ip ?? null, lastSeen: now };
  presence.set(userId, me);
  if (me.locating) return [];

  const located: { id: string; distance: number }[] = [];
  const sameNetwork: string[] = [];
  for (const [otherId, other] of presence) {
    if (otherId === userId || other.locating) continue;
    if (precise(me) && precise(other)) {
      // Both precisely located: the distance decides, a shared IP alone is not enough.
      const radius = Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, me.fix.accuracy + other.fix.accuracy));
      const distance = distanceMeters(me.fix.lat, me.fix.lng, other.fix.lat, other.fix.lng);
      if (distance <= radius) located.push({ id: otherId, distance });
    } else if (me.ip && other.ip && me.ip === other.ip) {
      sameNetwork.push(otherId);
    }
  }
  located.sort((a, b) => a.distance - b.distance);
  return [...located.map((entry) => entry.id), ...sameNetwork].slice(0, MAX_CANDIDATES);
}

export function airshareLeave(userId: string, now = Date.now()): void {
  presence.delete(userId);
  leftAt.set(userId, now);
}

/** Test helper. */
export function resetAirshare(): void {
  presence.clear();
  leftAt.clear();
  lastPlace.clear();
  relocations.clear();
}
