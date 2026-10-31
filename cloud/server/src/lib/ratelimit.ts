// In-memory per-key sliding-window limits for cheap or outbound-heavy reads
// (search, game lookups, AirShare sessions). State lives in this process only.
import { tooMany } from "./errors";

export class SlidingWindowLimit {
  private readonly hits = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Records a hit for `key`; returns false (and records nothing) when the window is full. */
  take(key: string, now = Date.now()): boolean {
    this.sweep(now);
    const since = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((time) => time > since);
    const allowed = recent.length < this.max;
    if (allowed) recent.push(now);
    this.hits.set(key, recent);
    return allowed;
  }

  /** Like take(), but answers 429 when the window is full. */
  assert(key: string, now = Date.now()): void {
    if (!this.take(key, now)) throw tooMany("Too many requests, please slow down");
  }

  clear(): void {
    this.hits.clear();
    this.lastSweep = 0;
  }

  /** Drops keys without recent hits, at most once per window. */
  private sweep(now: number): void {
    if (now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    for (const [key, times] of this.hits) {
      if (!times.length || times[times.length - 1] <= now - this.windowMs) this.hits.delete(key);
    }
  }
}
