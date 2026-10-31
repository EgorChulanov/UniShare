import { queryOne, type Queryable } from "../db";
import { badRequest, tooMany } from "./errors";

/** Rejects text matching an active content rule (credentials, payment data, threats, abuse). */
export async function assertContentAllowed(texts: (string | null | undefined)[], db?: Queryable): Promise<void> {
  const values = texts.filter((text): text is string => typeof text === "string" && text.trim().length > 0);
  if (!values.length) return;
  const row = await queryOne<{ blocked: boolean }>(
    `select exists (
       select 1 from content_rules r, unnest($1::text[]) as t(value)
       where r.is_active and t.value ~* r.pattern
     ) as blocked`,
    [values],
    db,
  );
  if (row?.blocked) throw badRequest("Content violates community rules", "content_blocked");
}

const LIMITS = {
  messages: { table: "messages", column: "sender_id", window: "1 minute", max: 30 },
  likes: { table: "like_requests", column: "from_uid", window: "1 minute", max: 40 },
  swipes: { table: "swipe_decisions", column: "user_id", window: "1 minute", max: 120 },
  reports: { table: "reports", column: "reporter_id", window: "1 hour", max: 5 },
  reviews: { table: "reviews", column: "from_uid", window: "1 hour", max: 10 },
} as const;

/** Per-user write limits (port of enforce_user_write_rate_limit). */
export async function assertRateLimit(kind: keyof typeof LIMITS, userId: string, db?: Queryable): Promise<void> {
  const limit = LIMITS[kind];
  const timeColumn = kind === "swipes" ? "updated_at" : "created_at";
  const row = await queryOne<{ count: number }>(
    `select count(*)::int as count from ${limit.table}
     where ${limit.column} = $1 and ${timeColumn} >= now() - interval '${limit.window}'`,
    [userId],
    db,
  );
  if ((row?.count ?? 0) >= limit.max) throw tooMany("Too many actions, please slow down");
}
