// AirShare on the web: people who open AirShare at the same time and are
// physically close (geolocation) or on the same network (public IP) find each
// other. Presence lives in memory only and expires quickly.
//
// The server bounds what a ping can reveal about others: when both sides have
// coordinates only the distance counts (one public IP may be a carrier NAT or a
// VPN), the radius stays within 250 m-1 km whatever accuracy the client claims,
// a session keeps its first position (later fixes may only refine it), and
// starting new sessions is rate-limited.
import { tooMany } from "./lib/errors";
import { SlidingWindowLimit } from "./lib/ratelimit";

export const PRESENCE_TTL_MS = 45_000;
const MIN_PING_INTERVAL_MS = 1_000;
const MIN_RADIUS_M = 250;
const MAX_RADIUS_M = 1_000;
/** How far later fixes may move a session from its first coordinates (GPS refinement). */
const MAX_DRIFT_M = 1_000;
const MAX_NEARBY = 20;
/** Pings this soon after leaving are ignored, so a request still in flight cannot re-add the user. */
export const LEAVE_GRACE_MS = 3_000;
const sessionStarts = new SlidingWindowLimit(10, 10 * 60_000);

interface Presence {
  lat: number | null;
  lng: number | null;
  accuracy: number;
  /** First coordinates of this session. */
  origin: { lat: number; lng: number } | null;
  ip: string | null;
  lastSeen: number;
}

type Fix = Pick<Presence, "lat" | "lng" | "accuracy" | "origin">;

export interface PingInput {
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
}

const presence = new Map<string, Presence>();
const leftAt = new Map<string, number>();

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

function prune(now: number): void {
  for (const [userId, entry] of presence) {
    if (now - entry.lastSeen > PRESENCE_TTL_MS) presence.delete(userId);
  }
  for (const [userId, time] of leftAt) {
    if (now - time >= LEAVE_GRACE_MS) leftAt.delete(userId);
  }
}

/** The session's position after this ping: the first fix anchors it, later ones may only refine it. */
function nextFix(previous: Presence | undefined, input: PingInput): Fix {
  const kept: Fix = {
    lat: previous?.lat ?? null,
    lng: previous?.lng ?? null,
    accuracy: previous?.accuracy ?? 0,
    origin: previous?.origin ?? null,
  };
  if (!validCoordinate(input.lat, 90) || !validCoordinate(input.lng, 180)) return kept;
  const origin = kept.origin ?? { lat: input.lat, lng: input.lng };
  // A bigger jump is spoofing or probing, not GPS refinement.
  if (distanceMeters(origin.lat, origin.lng, input.lat, input.lng) > MAX_DRIFT_M) return kept;
  const accuracy =
    typeof input.accuracy === "number" && Number.isFinite(input.accuracy) && input.accuracy > 0
      ? Math.min(input.accuracy, MAX_RADIUS_M)
      : kept.accuracy;
  return { lat: input.lat, lng: input.lng, accuracy, origin };
}

/** Records the caller's presence and returns the ids of people nearby, closest first. */
export function airsharePing(userId: string, input: PingInput, ip: string | null, now = Date.now()): string[] {
  prune(now);
  if (leftAt.has(userId)) return [];
  const previous = presence.get(userId);
  if (!previous && !sessionStarts.take(userId, now)) throw tooMany("Too many AirShare sessions, please try again later");
  if (!previous || now - previous.lastSeen >= MIN_PING_INTERVAL_MS) {
    presence.set(userId, { ...nextFix(previous, input), ip: ip ?? previous?.ip ?? null, lastSeen: now });
  }
  const me = presence.get(userId)!;
  const located: { id: string; distance: number }[] = [];
  const sameNetwork: string[] = [];
  for (const [otherId, other] of presence) {
    if (otherId === userId) continue;
    if (me.lat !== null && me.lng !== null && other.lat !== null && other.lng !== null) {
      // Both located: the distance decides, a shared IP alone is not enough.
      const radius = Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, me.accuracy + other.accuracy));
      const distance = distanceMeters(me.lat, me.lng, other.lat, other.lng);
      if (distance <= radius) located.push({ id: otherId, distance });
    } else if (me.ip && other.ip && me.ip === other.ip) {
      sameNetwork.push(otherId);
    }
  }
  located.sort((a, b) => a.distance - b.distance);
  return [...located.map((entry) => entry.id), ...sameNetwork].slice(0, MAX_NEARBY);
}

export function airshareLeave(userId: string, now = Date.now()): void {
  presence.delete(userId);
  leftAt.set(userId, now);
}

/** Test helper. */
export function resetAirshare(): void {
  presence.clear();
  leftAt.clear();
  sessionStarts.clear();
}
