// AirShare on the web: people who open AirShare at the same time and are
// physically close (geolocation) or on the same network (public IP) find each
// other. Presence lives in memory only and expires quickly.

export const PRESENCE_TTL_MS = 45_000;
const MIN_PING_INTERVAL_MS = 1_000;
const MIN_RADIUS_M = 250;

interface Presence {
  lat: number | null;
  lng: number | null;
  accuracy: number;
  ip: string | null;
  lastSeen: number;
}

export interface PingInput {
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
}

const presence = new Map<string, Presence>();

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
}

/** Records the caller's presence and returns the ids of people nearby. */
export function airsharePing(userId: string, input: PingInput, ip: string | null, now = Date.now()): string[] {
  prune(now);
  const previous = presence.get(userId);
  const hasCoordinates = validCoordinate(input.lat, 90) && validCoordinate(input.lng, 180);
  if (!previous || now - previous.lastSeen >= MIN_PING_INTERVAL_MS) {
    presence.set(userId, {
      lat: hasCoordinates ? (input.lat as number) : previous?.lat ?? null,
      lng: hasCoordinates ? (input.lng as number) : previous?.lng ?? null,
      accuracy:
        typeof input.accuracy === "number" && Number.isFinite(input.accuracy) && input.accuracy > 0
          ? Math.min(input.accuracy, 5_000)
          : previous?.accuracy ?? 0,
      ip: ip ?? previous?.ip ?? null,
      lastSeen: now,
    });
  }
  const me = presence.get(userId)!;
  const nearby: string[] = [];
  for (const [otherId, other] of presence) {
    if (otherId === userId) continue;
    const sameNetwork = Boolean(me.ip && other.ip && me.ip === other.ip);
    let close = false;
    if (me.lat !== null && me.lng !== null && other.lat !== null && other.lng !== null) {
      const radius = Math.max(MIN_RADIUS_M, me.accuracy + other.accuracy);
      close = distanceMeters(me.lat, me.lng, other.lat, other.lng) <= radius;
    }
    if (sameNetwork || close) nearby.push(otherId);
  }
  return nearby;
}

export function airshareLeave(userId: string): void {
  presence.delete(userId);
}

/** Test helper. */
export function resetAirshare(): void {
  presence.clear();
}
