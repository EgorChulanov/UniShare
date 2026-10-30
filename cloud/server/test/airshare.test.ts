// Unit tests for AirShare privacy rules (distance beats a shared IP, server-side
// radius, frozen session position, relocation limit, locating clients, leave race) and the
// in-memory sliding-window limiter. No database is involved.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

const airshare = await import("../src/airshare");
const { HttpError } = await import("../src/lib/errors");
const { SlidingWindowLimit } = await import("../src/lib/ratelimit");

afterEach(() => airshare.resetAirshare());

// Red Square; one degree of latitude is about 111 km.
const LAT = 55.7539;
const LNG = 37.6208;
const north = (meters: number) => ({ lat: LAT + meters / 111_195, lng: LNG });

const isTooMany = (error: unknown) => error instanceof HttpError && error.status === 429;

test("AirShare: a shared IP does not match people whose coordinates are far apart", () => {
  const t = 10_000_000;
  // Same carrier NAT / VPN exit, about 600 km apart.
  airshare.airsharePing("moscow", { lat: LAT, lng: LNG, accuracy: 20 }, "203.0.113.7", t);
  assert.deepEqual(airshare.airsharePing("far", { lat: 50.35, lng: 37.62, accuracy: 20 }, "203.0.113.7", t + 10), []);
  assert.deepEqual(airshare.airsharePing("moscow", { lat: LAT, lng: LNG, accuracy: 20 }, "203.0.113.7", t + 2_000), []);
  // Without any location, the shared network is the only signal left.
  assert.deepEqual(airshare.airsharePing("nogps", {}, "203.0.113.7", t + 2_010).sort(), ["far", "moscow"]);
  assert.deepEqual(airshare.airsharePing("moscow", {}, "203.0.113.7", t + 4_000), ["nogps"]);
});

test("AirShare matches nobody while a client is still waiting for its location", () => {
  const t = 10_500_000;
  airshare.airsharePing("moscow", { lat: LAT, lng: LNG, accuracy: 20 }, "203.0.113.7", t);
  airshare.airsharePing("waiting", {}, "203.0.113.7", t + 5);
  // The permission prompt is open: no IP-only matches in either direction.
  assert.deepEqual(airshare.airsharePing("far", { locating: true }, "203.0.113.7", t + 10), []);
  assert.deepEqual(airshare.airsharePing("moscow", {}, "203.0.113.7", t + 1_000), ["waiting"]);
  // The fix arrives 600 km away: still nobody.
  assert.deepEqual(airshare.airsharePing("far", { lat: 50.35, lng: 37.62, accuracy: 20 }, "203.0.113.7", t + 2_000), ["waiting"]);
  assert.deepEqual(airshare.airsharePing("moscow", {}, "203.0.113.7", t + 3_000), ["waiting"]);
});

test("AirShare: coarse or city-level fixes fall back to the shared network", () => {
  const t = 10_800_000;
  airshare.airsharePing("laptop", { lat: LAT, lng: LNG, accuracy: 5_000 }, "203.0.113.20", t);
  assert.deepEqual(airshare.airsharePing("phone", { ...north(3_000), accuracy: 15 }, "203.0.113.20", t + 10), ["laptop"]);
  assert.deepEqual(airshare.airsharePing("elsewhere", { ...north(100), accuracy: 15 }, "203.0.113.21", t + 20), []);
});

test("AirShare: the match radius stays within 250 m to 1 km", () => {
  const t = 11_000_000;
  airshare.airsharePing("a", { lat: LAT, lng: LNG, accuracy: 900 }, "198.51.100.1", t);
  assert.deepEqual(airshare.airsharePing("b", { ...north(3_000), accuracy: 900 }, "198.51.100.2", t + 10), []);
  // 900 + 900 m of claimed accuracy still caps the radius at 1 km.
  assert.deepEqual(airshare.airsharePing("c", { ...north(800), accuracy: 900 }, "198.51.100.3", t + 20), ["a"]);
  airshare.resetAirshare();
  airshare.airsharePing("a", { lat: LAT, lng: LNG, accuracy: 20 }, "198.51.100.1", t);
  assert.deepEqual(airshare.airsharePing("b", { ...north(100), accuracy: 20 }, "198.51.100.2", t + 10), ["a"]);
  assert.deepEqual(airshare.airsharePing("c", { ...north(-600), accuracy: 20 }, "198.51.100.3", t + 20), []);
});

test("AirShare returns candidates closest first, then the shared network", () => {
  const t = 12_000_000;
  for (let i = 0; i < 70; i++) {
    airshare.airsharePing(`p${i}`, { ...north(10 + i * 3), accuracy: 20 }, `192.0.2.${i}`, t + i);
  }
  const found = airshare.airsharePing("me", { lat: LAT, lng: LNG, accuracy: 20 }, "198.51.100.9", t + 100);
  assert.equal(found.length, airshare.MAX_CANDIDATES);
  airshare.resetAirshare();
  airshare.airsharePing("near", { ...north(600), accuracy: 400 }, "192.0.2.1", t);
  airshare.airsharePing("nearer", { ...north(100), accuracy: 400 }, "192.0.2.2", t + 1);
  airshare.airsharePing("network", {}, "198.51.100.9", t + 2);
  assert.deepEqual(airshare.airsharePing("me", { lat: LAT, lng: LNG, accuracy: 400 }, "198.51.100.9", t + 3), ["nearer", "near", "network"]);
});

test("AirShare keeps a session's first fix for the whole session", () => {
  const t = 13_000_000;
  airshare.airsharePing("probe", { lat: LAT, lng: LNG, accuracy: 20 }, "198.51.100.1", t);
  // Later coordinates and accuracy are ignored: a session cannot be moved to measure distances.
  airshare.airsharePing("probe", { ...north(700), accuracy: 20 }, "198.51.100.1", t + 1_000);
  assert.deepEqual(airshare.airsharePing("mid", { ...north(750), accuracy: 20 }, "198.51.100.4", t + 1_010), []);
  assert.deepEqual(airshare.airsharePing("here", { ...north(100), accuracy: 20 }, "198.51.100.3", t + 1_020), ["probe"]);
  airshare.airsharePing("probe", { lat: LAT, lng: LNG, accuracy: 900 }, "198.51.100.1", t + 2_000);
  assert.deepEqual(airshare.airsharePing("ring", { ...north(-600), accuracy: 20 }, "198.51.100.5", t + 2_010), []);
});

test("AirShare limits starting sessions at new places, not reopening at the same place", () => {
  const t = 14_000_000;
  let now = t;
  for (let i = 0; i < 10; i++) {
    airshare.airsharePing("hopper", { ...north(i * 5_000), accuracy: 20 }, "198.51.100.1", now);
    airshare.airshareLeave("hopper", now + 1_500);
    now += airshare.LEAVE_GRACE_MS + 2_000;
  }
  assert.throws(() => airshare.airsharePing("hopper", { ...north(60_000), accuracy: 20 }, "198.51.100.1", now), isTooMany);
  // Reopening at the last place and sessions without a location are not limited.
  assert.deepEqual(airshare.airsharePing("hopper", { ...north(45_000), accuracy: 20 }, "198.51.100.1", now + 100), []);
  airshare.airshareLeave("hopper", now + 200);
  assert.deepEqual(airshare.airsharePing("hopper", {}, "198.51.100.1", now + 200 + airshare.LEAVE_GRACE_MS), []);
  assert.deepEqual(airshare.airsharePing("other", { ...north(60_000), accuracy: 20 }, "198.51.100.2", now + 5_000), []);
  // Ten minutes after the first session there is room again.
  airshare.airshareLeave("hopper", now + 6_000);
  assert.deepEqual(airshare.airsharePing("hopper", { ...north(60_000), accuracy: 20 }, "198.51.100.1", t + 10 * 60_000 + 1), []);
});

test("AirShare: reopening nearby reuses the stored fix, so rejoining cannot probe distances", () => {
  const t = 14_500_000;
  airshare.airsharePing("target", { ...north(0), accuracy: 20 }, "198.51.100.9", t);
  const probe = (accuracy: number, at: number) => {
    const found = airshare.airsharePing("prober", { ...north(600), accuracy }, "198.51.100.8", at);
    airshare.airshareLeave("prober", at + 10);
    airshare.airsharePing("target", { ...north(0), accuracy: 20 }, "198.51.100.9", at + 20);
    return found;
  };
  // The first session counts and fixes accuracy 200 (radius 250 m < 600 m).
  let now = t + 1_000;
  assert.deepEqual(probe(200, now), []);
  // Rejoining with any other accuracy gives the same answer instead of a distance threshold.
  for (const accuracy of [600, 800, 980]) {
    now += airshare.LEAVE_GRACE_MS + 100;
    assert.deepEqual(probe(accuracy, now), []);
  }
});

test("AirShare: steps under 1 km do not move the stored place, so walking around is still limited", () => {
  const t = 14_800_000;
  let now = t;
  let hits = 0;
  for (let i = 0; i < 40; i++) {
    try {
      airshare.airsharePing("walker", { ...north(i * 900), accuracy: 20 }, "198.51.100.7", now);
      hits++;
    } catch (error) {
      assert.ok(isTooMany(error));
    }
    airshare.airshareLeave("walker", now + 10);
    now += airshare.LEAVE_GRACE_MS + 100;
  }
  // Every other step is more than 1 km from the stored place and counts; at most ten count.
  assert.ok(hits <= 21, `hits=${hits}`);
  assert.throws(() => airshare.airsharePing("walker", { ...north(100_000), accuracy: 20 }, "198.51.100.7", now), isTooMany);
});

test("AirShare ignores a ping that arrives right after leaving", () => {
  const t = 15_000_000;
  airshare.airsharePing("a", {}, "192.0.2.50", t);
  airshare.airsharePing("b", {}, "192.0.2.50", t + 10);
  airshare.airshareLeave("a", t + 1_000);
  // The ping that was in flight when "a" closed the sheet must not re-add them.
  assert.deepEqual(airshare.airsharePing("a", {}, "192.0.2.50", t + 1_100), []);
  assert.deepEqual(airshare.airsharePing("b", {}, "192.0.2.50", t + 1_200), []);
  assert.deepEqual(airshare.airsharePing("a", {}, "192.0.2.50", t + 1_000 + airshare.LEAVE_GRACE_MS - 1), []);
  assert.deepEqual(airshare.airsharePing("b", {}, "192.0.2.50", t + 4_000), []);
  // Opening AirShare again later works as usual.
  assert.deepEqual(airshare.airsharePing("a", {}, "192.0.2.50", t + 1_000 + airshare.LEAVE_GRACE_MS), ["b"]);
});

test("sliding-window limit counts only accepted hits per key", () => {
  const limit = new SlidingWindowLimit(2, 60_000);
  assert.equal(limit.take("u1", 0), true);
  assert.equal(limit.take("u1", 10), true);
  assert.equal(limit.take("u1", 20), false);
  assert.equal(limit.take("u2", 20), true);
  assert.throws(() => limit.assert("u1", 59_999), isTooMany);
  // The first hit leaves the window at 60 s, the second at 60.01 s.
  assert.equal(limit.take("u1", 60_000), true);
  assert.equal(limit.take("u1", 60_005), false);
  assert.equal(limit.take("u1", 60_010), true);
});
