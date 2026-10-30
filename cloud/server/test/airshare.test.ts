// Unit tests for AirShare privacy rules (distance beats a shared IP, server-side
// radius, anchored session position, session rate limit, leave race) and the
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
  // Same carrier NAT / VPN exit, Moscow vs. about 600 km away.
  airshare.airsharePing("moscow", { lat: LAT, lng: LNG, accuracy: 20 }, "203.0.113.7", t);
  assert.deepEqual(airshare.airsharePing("far", { lat: 50.35, lng: 37.62, accuracy: 20 }, "203.0.113.7", t + 10), []);
  assert.deepEqual(airshare.airsharePing("moscow", { lat: LAT, lng: LNG, accuracy: 20 }, "203.0.113.7", t + 2_000), []);
  // Without coordinates on one side the network is the only signal left.
  assert.deepEqual(airshare.airsharePing("nogps", {}, "203.0.113.7", t + 2_010).sort(), ["far", "moscow"]);
  assert.deepEqual(airshare.airsharePing("moscow", {}, "203.0.113.7", t + 4_000), ["nogps"]);
});

test("AirShare: the match radius stays within 250 m to 1 km whatever accuracy is sent", () => {
  const t = 11_000_000;
  airshare.airsharePing("a", { lat: LAT, lng: LNG, accuracy: 5_000 }, "198.51.100.1", t);
  // 3 km away: matched before with a 10 km radius, now out of range.
  assert.deepEqual(airshare.airsharePing("b", { ...north(3_000), accuracy: 5_000 }, "198.51.100.2", t + 10), []);
  // 900 m away: inside the 1 km cap.
  assert.deepEqual(airshare.airsharePing("c", { ...north(900), accuracy: 5_000 }, "198.51.100.3", t + 20), ["a"]);

  airshare.resetAirshare();
  airshare.airsharePing("a", { lat: LAT, lng: LNG, accuracy: 0 }, "198.51.100.1", t);
  assert.deepEqual(airshare.airsharePing("b", { ...north(200), accuracy: 0 }, "198.51.100.2", t + 10), ["a"]);
  assert.deepEqual(airshare.airsharePing("c", { ...north(-400), accuracy: 0 }, "198.51.100.3", t + 20), []);
});

test("AirShare returns at most 20 people, closest first", () => {
  const t = 12_000_000;
  for (let i = 0; i < 25; i++) {
    airshare.airsharePing(`p${i}`, { ...north(10 + i * 8), accuracy: 0 }, `192.0.2.${i}`, t + i);
  }
  airshare.airsharePing("nogps", {}, "198.51.100.9", t + 30);
  const found = airshare.airsharePing("me", { lat: LAT, lng: LNG, accuracy: 0 }, "198.51.100.9", t + 40);
  assert.deepEqual(found, Array.from({ length: 20 }, (_, i) => `p${i}`));

  airshare.resetAirshare();
  airshare.airsharePing("near", { ...north(150), accuracy: 0 }, "192.0.2.1", t);
  airshare.airsharePing("nearer", { ...north(50), accuracy: 0 }, "192.0.2.2", t + 1);
  airshare.airsharePing("network", {}, "198.51.100.9", t + 2);
  assert.deepEqual(airshare.airsharePing("me", { lat: LAT, lng: LNG }, "198.51.100.9", t + 3), ["nearer", "near", "network"]);
});

test("AirShare keeps a session's first coordinates and only lets later fixes refine them", () => {
  const t = 13_000_000;
  airshare.airsharePing("probe", { lat: LAT, lng: LNG, accuracy: 0 }, "198.51.100.1", t);
  // Jumping 5 km to probe another place is ignored...
  airshare.airsharePing("probe", { ...north(5_000), accuracy: 0 }, "198.51.100.1", t + 1_000);
  assert.deepEqual(airshare.airsharePing("there", { ...north(5_000), accuracy: 0 }, "198.51.100.2", t + 1_010), []);
  assert.deepEqual(airshare.airsharePing("here", { ...north(100), accuracy: 0 }, "198.51.100.3", t + 1_020), ["probe"]);
  // ...so is a larger claimed accuracy sent with it.
  airshare.airsharePing("probe", { ...north(5_000), accuracy: 900 }, "198.51.100.1", t + 2_000);
  assert.deepEqual(airshare.airsharePing("there", {}, "198.51.100.2", t + 2_010), []);

  // A GPS refinement of 700 m is accepted; the next 700 m step is 1.4 km from
  // the first fix and is ignored (drift counts from the start, not the last ping).
  airshare.airsharePing("probe", { ...north(700), accuracy: 0 }, "198.51.100.1", t + 3_000);
  assert.deepEqual(airshare.airsharePing("mid", { ...north(750), accuracy: 0 }, "198.51.100.4", t + 3_010), ["probe"]);
  airshare.airsharePing("probe", { ...north(1_400), accuracy: 0 }, "198.51.100.1", t + 4_000);
  assert.deepEqual(airshare.airsharePing("mid", {}, "198.51.100.4", t + 4_010), ["probe"]);
  assert.deepEqual(airshare.airsharePing("far", { ...north(1_400), accuracy: 0 }, "198.51.100.5", t + 4_020), []);
});

test("AirShare rate-limits new sessions per user", () => {
  const t = 14_000_000;
  let now = t;
  for (let i = 0; i < 10; i++) {
    airshare.airsharePing("hopper", { ...north(i * 5_000) }, "198.51.100.1", now);
    // Pings within one session do not count.
    airshare.airsharePing("hopper", {}, "198.51.100.1", now + 1_000);
    airshare.airshareLeave("hopper", now + 1_500);
    now += airshare.LEAVE_GRACE_MS + 2_000;
  }
  assert.throws(() => airshare.airsharePing("hopper", {}, "198.51.100.1", now), isTooMany);
  // A refused attempt is not counted, and other users are not affected.
  assert.throws(() => airshare.airsharePing("hopper", {}, "198.51.100.1", now + 2_500), isTooMany);
  assert.deepEqual(airshare.airsharePing("other", {}, "198.51.100.1", now + 2_600), []);
  // Ten minutes after the first session there is room again.
  assert.deepEqual(airshare.airsharePing("hopper", {}, "198.51.100.1", t + 10 * 60_000 + 1), []);
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
