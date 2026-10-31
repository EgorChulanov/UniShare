// Moderation actions shared by the admin API (routes/admin.ts) and the admin
// buttons of the Telegram bot, so both paths check the same rules and every
// change lands in the admin_actions audit log.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import {
  ADMIN_NOTE_MAX,
  BAN_REASON_MAX,
  type AdminActionKind,
  type BanState,
  type BugState,
  type ReportAction,
  type ReportActionInput,
} from "@unishare/shared";
import { config } from "./config";
import { queryOne, transaction, type Queryable } from "./db";
import { badRequest, conflict, notFound } from "./lib/errors";
import { SlidingWindowLimit } from "./lib/ratelimit";
import { disconnectUser, publish } from "./realtime";

/** Trimmed text or null; longer than `max` is a 400, not a silent cut (it is an admin's own note). */
export function cleanText(value: unknown, max: number, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw badRequest(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw badRequest(`${field} is too long`, "too_long");
  return trimmed || null;
}

/** True for an admin whose account is not banned or suspended. */
export async function activeAdmin(userId: string, db?: Queryable): Promise<boolean> {
  const row = await queryOne<{ ok: boolean }>(
    `select (is_admin and account_state = 'active') as ok from users where uid = $1`,
    [userId],
    db,
  );
  return Boolean(row?.ok);
}

interface ActionEntry {
  adminId: string | null;
  action: AdminActionKind;
  targetId?: string | null;
  reportId?: string | null;
  bugId?: string | null;
  reason?: string | null;
  details?: Record<string, unknown>;
}

/** clock_timestamp(): several entries of one transaction (resolve + ban) keep their order. */
export async function logAdminAction(db: Queryable, entry: ActionEntry): Promise<void> {
  await db.query(
    `insert into admin_actions (admin_id, admin_username, target_user_id, target_username, report_id, bug_id, action, reason, details, created_at)
     values ($1::uuid, (select username from users where uid = $1::uuid), $2::uuid, (select username from users where uid = $2::uuid),
             $3, $4, $5, $6, $7::jsonb, clock_timestamp())`,
    [
      entry.adminId,
      entry.targetId ?? null,
      entry.reportId ?? null,
      entry.bugId ?? null,
      entry.action,
      entry.reason ?? null,
      JSON.stringify(entry.details ?? {}),
    ],
  );
}

// ── Bans ────────────────────────────────────────────────────────────────────

function parseBan(ban: unknown): { state: BanState; reason: string } {
  const value = (ban ?? {}) as { state?: unknown; reason?: unknown };
  if (value.state !== "banned" && value.state !== "suspended") throw badRequest("state must be banned or suspended");
  const reason = cleanText(value.reason, BAN_REASON_MAX, "reason");
  if (!reason) throw badRequest("Give a reason for the ban", "reason_required");
  return { state: value.state, reason };
}

/**
 * Bans or suspends inside an open transaction: signs the user out everywhere and
 * closes the other open reports about them. The caller disconnects their sockets
 * after commit. An account that is already restricted keeps its first ban
 * (reason, date): unban it first to change the state.
 */
async function applyBan(db: PoolClient, adminId: string, targetId: string, ban: { state: BanState; reason: string }, reportId: string | null) {
  if (targetId === adminId) throw badRequest("You cannot ban yourself", "cannot_ban_self");
  const target = (await db.query<{ is_admin: boolean; account_state: string }>(
    `select is_admin, account_state from users where uid = $1 for update`,
    [targetId],
  )).rows[0];
  if (!target) throw notFound("User not found");
  if (target.is_admin) throw badRequest("Admins cannot be banned; revoke admin rights first", "cannot_ban_admin");
  if (target.account_state !== "active") throw conflict("The account is already restricted", "already_restricted");
  await db.query(
    `update users set account_state = $2, ban_reason = $3, banned_at = now(), is_online = false where uid = $1`,
    [targetId, ban.state, ban.reason],
  );
  await db.query(`delete from sessions where user_id = $1`, [targetId]);
  const closed = await db.query(
    `update reports set state = 'resolved', resolved_at = now(), handled_by = $2
     where subject_id = $1 and state in ('open', 'reviewing')`,
    [targetId, adminId],
  );
  await logAdminAction(db, {
    adminId,
    action: ban.state === "banned" ? "ban" : "suspend",
    targetId,
    reportId,
    reason: ban.reason,
    details: { closedReports: closed.rowCount ?? 0 },
  });
}

export async function banUser(adminId: string, targetId: string, input: unknown): Promise<void> {
  const ban = parseBan(input);
  await transaction((db) => applyBan(db, adminId, targetId, ban, null));
  disconnectUser(targetId);
}

/** Restores an account; false when it was not restricted. */
export async function unbanUser(adminId: string, targetId: string): Promise<boolean> {
  return transaction(async (db) => {
    const target = (await db.query<{ account_state: string; ban_reason: string | null }>(
      `select account_state, ban_reason from users where uid = $1 for update`,
      [targetId],
    )).rows[0];
    if (!target) throw notFound("User not found");
    if (target.account_state === "active") return false;
    await db.query(`update users set account_state = 'active', ban_reason = null, banned_at = null where uid = $1`, [targetId]);
    await logAdminAction(db, {
      adminId,
      action: "unban",
      targetId,
      details: { previousState: target.account_state, previousReason: target.ban_reason },
    });
    return true;
  });
}

// ── Admin rights ────────────────────────────────────────────────────────────

/** Grants or revokes admin rights; there is always at least one admin left. */
export async function setAdminRights(adminId: string, targetId: string, makeAdmin: boolean): Promise<void> {
  const changed = await transaction(async (db) => {
    // Locks every admin row, so two admins revoking each other cannot both succeed.
    const admins = (await db.query<{ uid: string }>(`select uid from users where is_admin for update`)).rows;
    const target = (await db.query<{ is_admin: boolean; account_state: string }>(
      `select is_admin, account_state from users where uid = $1 for update`,
      [targetId],
    )).rows[0];
    if (!target) throw notFound("User not found");
    if (target.is_admin === makeAdmin) return false;
    if (makeAdmin && target.account_state !== "active") throw badRequest("Unban the account first", "account_restricted");
    if (!makeAdmin && admins.length <= 1) throw badRequest("The last admin cannot be removed", "last_admin");
    await db.query(`update users set is_admin = $2 where uid = $1`, [targetId, makeAdmin]);
    await logAdminAction(db, { adminId, action: makeAdmin ? "grant_admin" : "revoke_admin", targetId });
    return true;
  });
  // Shows or hides the admin panel in the target's open app.
  if (changed) publish(targetId, { type: "profile_updated" });
}

// ── User reports ────────────────────────────────────────────────────────────

const REPORT_STATES: Record<ReportAction, string> = { resolve: "resolved", reject: "rejected", reopen: "open" };
const OPEN_REPORT_STATES = new Set(["open", "reviewing"]);

export async function moderateReport(adminId: string, reportId: string, input: unknown): Promise<{ subjectId: string; banned: boolean }> {
  const body = (input ?? {}) as Partial<ReportActionInput>;
  const action = body.action;
  if (action !== "resolve" && action !== "reject" && action !== "reopen") throw badRequest("action must be resolve, reject or reopen");
  const note = cleanText(body.note, ADMIN_NOTE_MAX, "note");
  const ban = body.ban ? parseBan(body.ban) : null;
  if (ban && action !== "resolve") throw badRequest("A ban can only come with resolve");

  const subjectId = await transaction(async (db) => {
    const report = (await db.query<{ subject_id: string; state: string }>(`select subject_id, state from reports where id = $1 for update`, [reportId])).rows[0];
    if (!report) throw notFound("Report not found");
    // Resolve and reject only close an open report, reopen only opens a closed one: a stale
    // panel or an old Telegram message never overwrites what another admin already decided.
    if (OPEN_REPORT_STATES.has(report.state) === (action === "reopen")) {
      throw conflict(action === "reopen" ? "The report is already open" : "The report is already closed", "report_handled");
    }
    const state = REPORT_STATES[action];
    await db.query(
      `update reports set state = $2, resolved_at = case when $2 = 'open' then null else now() end,
         admin_note = coalesce($3, admin_note), handled_by = $4
       where id = $1`,
      [reportId, state, note, adminId],
    );
    await logAdminAction(db, { adminId, action: `report_${action}`, targetId: report.subject_id, reportId, reason: note });
    if (ban) await applyBan(db, adminId, report.subject_id, ban, reportId);
    return report.subject_id;
  });
  if (ban) disconnectUser(subjectId);
  return { subjectId, banned: Boolean(ban) };
}

// ── Bug reports ─────────────────────────────────────────────────────────────

const BUG_ACTIONS: Record<BugState, AdminActionKind> = { resolved: "bug_resolve", rejected: "bug_reject", open: "bug_reopen" };

export async function setBugState(adminId: string, bugId: string, input: unknown): Promise<void> {
  const body = (input ?? {}) as { state?: unknown; note?: unknown };
  const state = body.state;
  if (state !== "open" && state !== "resolved" && state !== "rejected") throw badRequest("state must be open, resolved or rejected");
  const note = cleanText(body.note, ADMIN_NOTE_MAX, "note");
  await transaction(async (db) => {
    const bug = (await db.query<{ user_id: string | null; state: BugState }>(`select user_id, state from bug_reports where id = $1 for update`, [bugId])).rows[0];
    if (!bug) throw notFound("Bug report not found");
    // Same rule as for user reports: open -> resolved | rejected, and closed -> open.
    if ((bug.state === "open") === (state === "open")) throw conflict(state === "open" ? "The report is already open" : "The report is already closed", "bug_handled");
    await db.query(
      `update bug_reports set state = $2, resolved_at = case when $2 = 'open' then null else now() end,
         admin_note = coalesce($3, admin_note)
       where id = $1`,
      [bugId, state, note],
    );
    await logAdminAction(db, { adminId, action: BUG_ACTIONS[state], targetId: bug.user_id, bugId, reason: note });
  });
}

// ── Claiming admin rights with the bot command /admin <code> ────────────────

const claimsPerTelegramUser = new SlidingWindowLimit(5, 60 * 60_000);
// Many Telegram accounts guessing together still get few tries.
const claimsOverall = new SlidingWindowLimit(50, 60 * 60_000);

/** Keyed digest: equal-length buffers for timingSafeEqual, and nothing reversible in the audit log. */
function codeDigest(code: string): Buffer {
  return createHmac("sha256", config.sessionSecret).update(`admin-claim:${code}`).digest();
}

function claimCodeMatches(input: string): boolean {
  const expected = config.admin.claimCode;
  if (!expected) return false;
  return timingSafeEqual(codeDigest(input.trim()), codeDigest(expected));
}

export type ClaimResult =
  | { status: "claimed" | "already_admin"; userId: string }
  | { status: "invalid" | "no_account" | "rate_limited" };

/**
 * Makes the UniShare account linked to this Telegram id an admin when `code`
 * equals ADMIN_CLAIM_CODE. Each code value works once: after a claim, the
 * owner grants rights from the panel (or sets a new code).
 */
export async function claimAdmin(telegramId: string, code: string): Promise<ClaimResult> {
  if (!claimsPerTelegramUser.take(telegramId) || !claimsOverall.take("all")) return { status: "rate_limited" };
  const user = await queryOne<{ uid: string; is_admin: boolean; account_state: string }>(
    `select u.uid, u.is_admin, u.account_state from user_identities i join users u on u.uid = i.user_id
     where i.provider = 'telegram' and i.provider_user_id = $1`,
    [telegramId],
  );
  if (!user) return { status: "no_account" };
  if (!claimCodeMatches(code) || user.account_state !== "active") return { status: "invalid" };
  if (user.is_admin) return { status: "already_admin", userId: user.uid };

  const fingerprint = codeDigest(config.admin.claimCode!).toString("hex").slice(0, 16);
  const claimed = await transaction(async (db) => {
    await db.query(`select pg_advisory_xact_lock(7212412213)`);
    const used = await db.query(`select 1 from admin_actions where action = 'claim_admin' and details ->> 'code' = $1 limit 1`, [fingerprint]);
    if (used.rowCount) return false;
    await db.query(`update users set is_admin = true where uid = $1`, [user.uid]);
    await logAdminAction(db, { adminId: user.uid, action: "claim_admin", targetId: user.uid, details: { code: fingerprint, telegramId } });
    return true;
  });
  if (!claimed) return { status: "invalid" };
  publish(user.uid, { type: "profile_updated" });
  return { status: "claimed", userId: user.uid };
}

/** Test hook: forget claim attempts between scenarios. */
export function resetClaimLimits(): void {
  claimsPerTelegramUser.clear();
  claimsOverall.clear();
}
