// Admin panel API (/api/admin/*) and in-app bug reports (/api/bugs).
import { randomUUID } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  BUG_SCREENSHOT_MAX_BYTES,
  BUG_TEXT_MAX,
  BUG_TEXT_MIN,
  type AccountState,
  type AdminActionEntry,
  type AdminActionKind,
  type AdminBackupFile,
  type AdminBug,
  type AdminListFilter,
  type AdminOverview,
  type AdminPage,
  type AdminReport,
  type AdminUserDetail,
  type AdminUserRef,
  type AdminUserRow,
  type BugContext,
  type BugReportInput,
  type BugState,
  type ReportState,
} from "@unishare/shared";
import { config } from "../config";
import { query, queryOne } from "../db";
import { requireSession } from "../auth/session";
import { badRequest, forbidden, notFound, tooMany } from "../lib/errors";
import { signMediaUrl, verifyMediaSignature } from "../lib/media";
import { SlidingWindowLimit } from "../lib/ratelimit";
import { USER_COLUMNS, toProfileCard, type UserRow } from "../lib/profiles";
import { detectImage, storage } from "../lib/storage";
import { activeAdmin, banUser, moderateReport, setAdminRights, setBugState, unbanUser } from "../admin";
import { adminButtonsEnabled, notifyAdminsAboutBug, telegramStatus } from "../bot/telegram";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 30;
const BUGS_PER_HOUR = 5;
const startedAt = new Date().toISOString();

const adminReads = new SlidingWindowLimit(240, 60_000);
const adminWrites = new SlidingWindowLimit(60, 60_000);

/** Signed-in admin, else 401/403; also rate-limits the admin per minute. */
async function requireAdmin(request: FastifyRequest): Promise<string> {
  const session = await requireSession(request);
  if (!(await activeAdmin(session.userId))) throw forbidden();
  (request.method === "GET" ? adminReads : adminWrites).assert(session.userId);
  return session.userId;
}

function uuidParam(value: string, what = "Not found"): string {
  if (!UUID_PATTERN.test(value)) throw notFound(what);
  return value.toLowerCase();
}

function pageParams(raw: { offset?: string }): { offset: number; limit: number } {
  const offset = Number.parseInt(raw.offset ?? "0", 10);
  return { offset: Number.isFinite(offset) ? Math.min(Math.max(offset, 0), 100_000) : 0, limit: PAGE_SIZE };
}

/** Fetches one extra row to know whether another page exists. */
function toPage<T>(items: T[], offset: number, limit: number): AdminPage<T> {
  return { items: items.slice(0, limit), nextOffset: items.length > limit ? offset + limit : null };
}

function listFilter(value: string | undefined): AdminListFilter {
  return value === "resolved" || value === "rejected" || value === "all" ? value : "open";
}

// ── Row mapping ─────────────────────────────────────────────────────────────

/** Columns of a joined users row (alias `table`) under a prefix, read back by toRef. */
const refColumns = (table: string, prefix: string) =>
  `${table}.uid as ${prefix}_uid, ${table}.username as ${prefix}_username, ${table}.avatar_url as ${prefix}_avatar,
   ${table}.account_state as ${prefix}_state, ${table}.is_admin as ${prefix}_admin`;

function toRef(row: Record<string, unknown>, prefix: string): AdminUserRef | null {
  const uid = row[`${prefix}_uid`] as string | null;
  if (!uid) return null;
  return {
    uid,
    username: row[`${prefix}_username`] as string | null,
    avatarUrl: row[`${prefix}_avatar`] as string | null,
    accountState: row[`${prefix}_state`] as AccountState,
    isAdmin: Boolean(row[`${prefix}_admin`]),
  };
}

const REPORT_SELECT = `
  select r.id, r.reason, r.details, r.state, r.admin_note, r.created_at, r.resolved_at,
         (select count(*)::int from reports x where x.subject_id = r.subject_id) as subject_reports,
         ${refColumns("rp", "reporter")}, ${refColumns("sb", "subject")}
  from reports r
  left join users rp on rp.uid = r.reporter_id
  left join users sb on sb.uid = r.subject_id`;

type ReportRow = Record<string, unknown> & {
  id: string; reason: string; details: string; state: ReportState; admin_note: string | null;
  created_at: string; resolved_at: string | null; subject_reports: number;
};

function toReport(row: ReportRow): AdminReport {
  return {
    id: row.id,
    reporter: toRef(row, "reporter"),
    subject: toRef(row, "subject"),
    reason: row.reason,
    details: row.details,
    state: row.state,
    adminNote: row.admin_note,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    subjectReportCount: row.subject_reports,
  };
}

const BUG_SELECT = `
  select b.id, b.text, b.context, b.screenshot_key, b.state, b.admin_note, b.created_at, b.resolved_at, ${refColumns("u", "author")}
  from bug_reports b
  left join users u on u.uid = b.user_id`;

type BugRow = Record<string, unknown> & {
  id: string; text: string; context: BugContext; screenshot_key: string | null; state: BugState;
  admin_note: string | null; created_at: string; resolved_at: string | null;
};

function toBug(row: BugRow): AdminBug {
  return {
    id: row.id,
    user: toRef(row, "author"),
    text: row.text,
    context: row.context ?? {},
    screenshotUrl: row.screenshot_key ? signMediaUrl(`/api/media/${row.screenshot_key}`) : null,
    state: row.state,
    adminNote: row.admin_note,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

const USER_FIELDS = `
  u.uid, u.username, u.avatar_url, u.account_state, u.is_admin, u.onboarding_complete, u.is_online, u.last_seen, u.created_at,
  array(select i.provider from user_identities i where i.user_id = u.uid and i.provider in ('telegram', 'vk') order by i.provider) as providers,
  (select count(*)::int from reports r where r.subject_id = u.uid and r.state in ('open', 'reviewing')) as open_reports`;

type UserListRow = {
  uid: string; username: string | null; avatar_url: string | null; account_state: AccountState; is_admin: boolean;
  onboarding_complete: boolean; is_online: boolean; last_seen: string | null; created_at: string; providers: string[]; open_reports: number;
};

function toUserRow(row: UserListRow): AdminUserRow {
  return {
    uid: row.uid,
    username: row.username,
    avatarUrl: row.avatar_url,
    accountState: row.account_state,
    isAdmin: row.is_admin,
    onboardingComplete: row.onboarding_complete,
    isOnline: row.is_online,
    lastSeen: row.last_seen,
    createdAt: row.created_at,
    providers: row.providers ?? [],
    openReports: row.open_reports,
  };
}

const ACTION_SELECT = `
  select a.id, a.action, a.reason, a.created_at, a.report_id, a.bug_id, a.admin_id, a.target_user_id,
         coalesce(ad.username::text, a.admin_username) as admin_name, coalesce(tg.username::text, a.target_username) as target_name
  from admin_actions a
  left join users ad on ad.uid = a.admin_id
  left join users tg on tg.uid = a.target_user_id`;

type ActionRow = {
  id: string; action: AdminActionKind; reason: string | null; created_at: string; report_id: string | null; bug_id: string | null;
  admin_id: string | null; target_user_id: string | null; admin_name: string | null; target_name: string | null;
};

function toAction(row: ActionRow): AdminActionEntry {
  return {
    id: row.id,
    action: row.action,
    adminName: row.admin_name,
    adminUid: row.admin_id,
    targetName: row.target_name,
    targetUid: row.target_user_id,
    reportId: row.report_id,
    bugId: row.bug_id,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

// ── Bug report input ────────────────────────────────────────────────────────

const CONTEXT_FIELDS: Record<keyof BugContext, number> = {
  client: 20,
  platform: 40,
  appVersion: 40,
  url: 300,
  userAgent: 400,
  screen: 40,
  language: 20,
  theme: 20,
  timezone: 60,
};

/** Known keys only, short strings only; the URL keeps origin and path (a hash can carry Telegram initData). */
export function sanitizeBugContext(value: unknown): BugContext {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw badRequest("context must be an object");
  const source = value as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const [key, max] of Object.entries(CONTEXT_FIELDS)) {
    const raw = source[key];
    let text = typeof raw === "string" ? raw : typeof raw === "number" && Number.isFinite(raw) ? String(raw) : "";
    if (key === "url" && text) {
      try {
        const url = new URL(text);
        text = /^https?:$/.test(url.protocol) ? `${url.origin}${url.pathname}` : "";
      } catch {
        text = "";
      }
    }
    text = text.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
    if (text) result[key] = text;
  }
  return result;
}

const DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=\r\n]+)$/;

function decodeScreenshot(value: unknown): { body: Buffer; extension: string; contentType: string } {
  if (typeof value !== "string") throw badRequest("screenshot must be a data URL", "unsupported_image");
  // Base64 is 4/3 of the bytes; reject before decoding anything oversized.
  if (value.length > Math.ceil((BUG_SCREENSHOT_MAX_BYTES * 4) / 3) + 64) throw badRequest("The screenshot is too large", "image_too_large");
  const match = DATA_URL.exec(value);
  if (!match) throw badRequest("Only JPEG, PNG and WebP screenshots are supported", "unsupported_image");
  const body = Buffer.from(match[1], "base64");
  if (!body.length) throw badRequest("The screenshot is empty", "unsupported_image");
  if (body.length > BUG_SCREENSHOT_MAX_BYTES) throw badRequest("The screenshot is too large", "image_too_large");
  // The declared type is not trusted: the bytes must be a real JPEG/PNG/WebP (as for avatars and chat photos).
  const image = detectImage(body);
  if (!image) throw badRequest("Only JPEG, PNG and WebP screenshots are supported", "unsupported_image");
  return { body, ...image };
}

// ── Overview ────────────────────────────────────────────────────────────────

async function listBackups(): Promise<AdminOverview["backups"]> {
  const dir = config.admin.backupsDir;
  if (!dir) return null;
  try {
    const names = (await readdir(dir)).filter((name) => name.endsWith(".sql.gz"));
    const stats = await Promise.allSettled(
      names.map(async (name): Promise<AdminBackupFile> => {
        const info = await stat(join(dir, name));
        return { name, sizeBytes: info.size, modifiedAt: info.mtime.toISOString() };
      }),
    );
    const files = stats
      .filter((result): result is PromiseFulfilledResult<AdminBackupFile> => result.status === "fulfilled")
      .map((result) => result.value)
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    return {
      count: files.length,
      totalBytes: files.reduce((sum, file) => sum + file.sizeBytes, 0),
      latest: files[0] ?? null,
      files: files.slice(0, 10),
    };
  } catch {
    return null;
  }
}

async function overview(): Promise<AdminOverview> {
  const [counts, tables, backups] = await Promise.all([
    queryOne<Record<string, number | string>>(
      `select
         (select count(*)::int from users) as users_total,
         (select count(*)::int from users where onboarding_complete) as users_onboarded,
         (select count(*)::int from users where created_at > now() - interval '1 day') as users_new_24h,
         (select count(*)::int from users where created_at > now() - interval '7 days') as users_new_7d,
         (select count(*)::int from users where is_online or last_seen > now() - interval '1 day') as users_active_24h,
         (select count(*)::int from users where is_online) as users_online,
         (select count(*)::int from users where account_state = 'banned') as users_banned,
         (select count(*)::int from users where account_state = 'suspended') as users_suspended,
         (select count(*)::int from users where is_admin) as users_admins,
         (select count(*)::int from chats) as chats,
         (select count(*)::int from messages where created_at > now() - interval '1 day') as messages_24h,
         (select count(*)::int from swipe_decisions where decision = 'like' and updated_at > now() - interval '1 day') as likes_24h,
         (select count(*)::int from like_requests where created_at > now() - interval '1 day') as requests_24h,
         (select count(*)::int from reports where state in ('open', 'reviewing')) as open_reports,
         (select count(*)::int from bug_reports where state = 'open') as open_bugs,
         pg_database_size(current_database()) as db_size,
         pg_size_pretty(pg_database_size(current_database())) as db_size_pretty,
         current_setting('server_version') as db_version,
         (select count(*)::int from pg_stat_activity where datname = current_database()) as db_connections,
         current_setting('max_connections')::int as db_max_connections`,
    ),
    query<{ name: string; total_bytes: number; total_pretty: string; row_estimate: number }>(
      `select c.relname as name, pg_total_relation_size(c.oid) as total_bytes,
              pg_size_pretty(pg_total_relation_size(c.oid)) as total_pretty,
              coalesce(s.n_live_tup, greatest(c.reltuples, 0))::bigint as row_estimate
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       left join pg_stat_user_tables s on s.relid = c.oid
       where c.relkind in ('r', 'p') and n.nspname = current_schema()
       order by pg_total_relation_size(c.oid) desc
       limit 8`,
    ),
    listBackups(),
  ]);
  const n = (key: string) => Number(counts?.[key] ?? 0);
  return {
    generatedAt: new Date().toISOString(),
    users: {
      total: n("users_total"),
      onboarded: n("users_onboarded"),
      new24h: n("users_new_24h"),
      new7d: n("users_new_7d"),
      active24h: n("users_active_24h"),
      online: n("users_online"),
      banned: n("users_banned"),
      suspended: n("users_suspended"),
      admins: n("users_admins"),
    },
    activity: {
      chats: n("chats"),
      messages24h: n("messages_24h"),
      likes24h: n("likes_24h"),
      requests24h: n("requests_24h"),
      openReports: n("open_reports"),
      openBugs: n("open_bugs"),
    },
    database: {
      sizeBytes: n("db_size"),
      sizePretty: String(counts?.db_size_pretty ?? ""),
      version: String(counts?.db_version ?? ""),
      connections: n("db_connections"),
      maxConnections: n("db_max_connections"),
      tables: tables.map((row) => ({ name: row.name, totalBytes: row.total_bytes, totalPretty: row.total_pretty, rowEstimate: row.row_estimate })),
    },
    backups,
    app: {
      uptimeSeconds: Math.round(process.uptime()),
      startedAt,
      nodeVersion: process.version,
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      telegram: config.telegram.botToken
        ? {
            mode: config.telegram.mode,
            configured: telegramStatus.configured,
            route: telegramStatus.route,
            error: telegramStatus.error,
            checkedAt: telegramStatus.checkedAt,
            webhookSecured: adminButtonsEnabled(),
          }
        : null,
    },
  };
}

// ── Users ───────────────────────────────────────────────────────────────────

async function userDetail(uid: string): Promise<AdminUserDetail> {
  const row = await queryOne<UserListRow & {
    status: string | null; language: string; ban_reason: string | null; banned_at: string | null;
    chats: number; messages: number; reports_against: number; reports_by: number; bugs: number;
  }>(
    `select ${USER_FIELDS}, u.status, u.language, u.ban_reason, u.banned_at,
       (select count(*)::int from chats c where c.user_low = u.uid or c.user_high = u.uid) as chats,
       (select count(*)::int from messages m where m.sender_id = u.uid) as messages,
       (select count(*)::int from reports r where r.subject_id = u.uid) as reports_against,
       (select count(*)::int from reports r where r.reporter_id = u.uid) as reports_by,
       (select count(*)::int from bug_reports b where b.user_id = u.uid) as bugs
     from users u where u.uid = $1`,
    [uid],
  );
  if (!row) throw notFound("User not found");
  const [profile, identities, reports, actions] = await Promise.all([
    // The public card (games, skills description...): what other users saw and may have reported.
    queryOne<UserRow>(`select ${USER_COLUMNS} from users u where u.uid = $1`, [uid]),
    query<{ provider: string; provider_user_id: string; username: string | null; display_name: string | null; created_at: string }>(
      `select provider, provider_user_id, username, display_name, created_at from user_identities where user_id = $1 order by created_at`,
      [uid],
    ),
    query<ReportRow>(`${REPORT_SELECT} where r.subject_id = $1 order by r.created_at desc limit 10`, [uid]),
    query<ActionRow>(`${ACTION_SELECT} where a.target_user_id = $1 order by a.created_at desc limit 10`, [uid]),
  ]);
  return {
    ...toUserRow(row),
    card: toProfileCard(profile!),
    status: row.status,
    language: row.language,
    banReason: row.ban_reason,
    bannedAt: row.banned_at,
    identities: identities.map((identity) => ({
      provider: identity.provider,
      providerUserId: identity.provider_user_id,
      username: identity.username,
      displayName: identity.display_name,
      createdAt: identity.created_at,
    })),
    counts: {
      chats: row.chats,
      messages: row.messages,
      reportsAgainst: row.reports_against,
      reportsBy: row.reports_by,
      bugs: row.bugs,
    },
    recentReports: reports.map(toReport),
    recentActions: actions.map(toAction),
  };
}

// ── Routes ──────────────────────────────────────────────────────────────────

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // Any signed-in user can report a problem; admins get a Telegram message.
  app.post<{ Body: BugReportInput }>("/api/bugs", { bodyLimit: 5 * 1024 * 1024 }, async (request) => {
    const session = await requireSession(request);
    const body = request.body ?? ({} as BugReportInput);
    const text = typeof body.text === "string" ? body.text.trim() : "";
    // Code points, as PostgreSQL char_length counts them (an emoji is one).
    const length = [...text].length;
    if (length < BUG_TEXT_MIN || length > BUG_TEXT_MAX) {
      throw badRequest(`Describe the problem in ${BUG_TEXT_MIN}–${BUG_TEXT_MAX} characters`, "invalid_text");
    }
    const context = sanitizeBugContext(body.context);
    const recent = await queryOne<{ count: number }>(
      `select count(*)::int as count from bug_reports where user_id = $1 and created_at > now() - interval '1 hour'`,
      [session.userId],
    );
    if ((recent?.count ?? 0) >= BUGS_PER_HOUR) throw tooMany("Too many reports, please try again later");
    const screenshot = body.screenshot ? decodeScreenshot(body.screenshot) : null;

    const id = randomUUID();
    const key = screenshot ? `bugs/${id}.${screenshot.extension}` : null;
    if (screenshot && key) await storage.put(key, screenshot.body, screenshot.contentType);
    try {
      await query(
        `insert into bug_reports (id, user_id, text, context, screenshot_key) values ($1, $2, $3, $4::jsonb, $5)`,
        [id, session.userId, text, JSON.stringify(context), key],
      );
    } catch (error) {
      if (key) void storage.remove([key]).catch(() => undefined);
      throw error;
    }
    void notifyAdminsAboutBug(id).catch(() => undefined);
    return { ok: true, id };
  });

  // Screenshots: the signed URL is only ever handed out by the admin API.
  app.get<{ Params: { file: string }; Querystring: { exp?: string; sig?: string } }>("/api/media/bugs/:file", async (request, reply) => {
    const file = request.params.file;
    if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(file)) return reply.status(404).send({ error: "Not found" });
    const path = `/api/media/bugs/${file}`;
    if (!verifyMediaSignature(path, request.query.exp, request.query.sig)) return reply.status(403).send({ error: "Link expired" });
    const object = await storage.get(`bugs/${file}`);
    if (!object) return reply.status(404).send({ error: "Not found" });
    return reply.header("Cache-Control", "private, max-age=3600").type(object.contentType).send(object.body);
  });

  app.get("/api/admin/overview", async (request): Promise<AdminOverview> => {
    await requireAdmin(request);
    return overview();
  });

  // ── Reports ───────────────────────────────────────────────────────────────

  app.get<{ Querystring: { state?: string; offset?: string } }>("/api/admin/reports", async (request): Promise<AdminPage<AdminReport>> => {
    await requireAdmin(request);
    const filter = listFilter(request.query.state);
    const { offset, limit } = pageParams(request.query);
    const rows = await query<ReportRow>(
      `${REPORT_SELECT}
       where case $1 when 'all' then true when 'open' then r.state in ('open', 'reviewing') else r.state = $1 end
       order by r.created_at desc, r.id desc
       limit $2 offset $3`,
      [filter, limit + 1, offset],
    );
    return toPage(rows.map(toReport), offset, limit);
  });

  app.get<{ Params: { id: string } }>("/api/admin/reports/:id", async (request): Promise<AdminReport> => {
    await requireAdmin(request);
    const row = await queryOne<ReportRow>(`${REPORT_SELECT} where r.id = $1`, [uuidParam(request.params.id, "Report not found")]);
    if (!row) throw notFound("Report not found");
    return toReport(row);
  });

  app.post<{ Params: { id: string } }>("/api/admin/reports/:id", async (request): Promise<AdminReport> => {
    const adminId = await requireAdmin(request);
    const id = uuidParam(request.params.id, "Report not found");
    await moderateReport(adminId, id, request.body);
    const row = await queryOne<ReportRow>(`${REPORT_SELECT} where r.id = $1`, [id]);
    return toReport(row!);
  });

  // ── Bugs ──────────────────────────────────────────────────────────────────

  app.get<{ Querystring: { state?: string; offset?: string } }>("/api/admin/bugs", async (request): Promise<AdminPage<AdminBug>> => {
    await requireAdmin(request);
    const filter = listFilter(request.query.state);
    const { offset, limit } = pageParams(request.query);
    const rows = await query<BugRow>(
      `${BUG_SELECT}
       where $1 = 'all' or b.state = $1
       order by b.created_at desc, b.id desc
       limit $2 offset $3`,
      [filter, limit + 1, offset],
    );
    return toPage(rows.map(toBug), offset, limit);
  });

  app.get<{ Params: { id: string } }>("/api/admin/bugs/:id", async (request): Promise<AdminBug> => {
    await requireAdmin(request);
    const row = await queryOne<BugRow>(`${BUG_SELECT} where b.id = $1`, [uuidParam(request.params.id, "Bug report not found")]);
    if (!row) throw notFound("Bug report not found");
    return toBug(row);
  });

  app.post<{ Params: { id: string } }>("/api/admin/bugs/:id", async (request): Promise<AdminBug> => {
    const adminId = await requireAdmin(request);
    const id = uuidParam(request.params.id, "Bug report not found");
    await setBugState(adminId, id, request.body);
    const row = await queryOne<BugRow>(`${BUG_SELECT} where b.id = $1`, [id]);
    return toBug(row!);
  });

  // ── Users ─────────────────────────────────────────────────────────────────

  app.get<{ Querystring: { q?: string; filter?: string; offset?: string } }>("/api/admin/users", async (request): Promise<AdminPage<AdminUserRow>> => {
    await requireAdmin(request);
    const { offset, limit } = pageParams(request.query);
    const q = String(request.query.q ?? "").trim().slice(0, 64);
    const name = q.replace(/^@/, "");
    const like = `%${name.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    const filter = request.query.filter === "restricted" || request.query.filter === "admins" ? request.query.filter : "all";
    const rows = await query<UserListRow>(
      `select ${USER_FIELDS} from users u
       where ($1 = '' or u.username::text ilike $2 escape '\\' or u.uid::text = lower($1) or exists (
               select 1 from user_identities i
               where i.user_id = u.uid and (i.provider_user_id = $1 or i.username ilike $2 escape '\\')))
         and case $3 when 'restricted' then u.account_state <> 'active' when 'admins' then u.is_admin else true end
       order by u.created_at desc, u.uid
       limit $4 offset $5`,
      [q, like, filter, limit + 1, offset],
    );
    return toPage(rows.map(toUserRow), offset, limit);
  });

  app.get<{ Params: { uid: string } }>("/api/admin/users/:uid", async (request): Promise<AdminUserDetail> => {
    await requireAdmin(request);
    return userDetail(uuidParam(request.params.uid, "User not found"));
  });

  app.post<{ Params: { uid: string }; Body: { state?: string; reason?: string } }>("/api/admin/users/:uid/ban", async (request) => {
    const adminId = await requireAdmin(request);
    const uid = uuidParam(request.params.uid, "User not found");
    await banUser(adminId, uid, request.body);
    return userDetail(uid);
  });

  app.post<{ Params: { uid: string } }>("/api/admin/users/:uid/unban", async (request) => {
    const adminId = await requireAdmin(request);
    const uid = uuidParam(request.params.uid, "User not found");
    await unbanUser(adminId, uid);
    return userDetail(uid);
  });

  app.post<{ Params: { uid: string }; Body: { isAdmin?: boolean } }>("/api/admin/users/:uid/admin", async (request) => {
    const adminId = await requireAdmin(request);
    const uid = uuidParam(request.params.uid, "User not found");
    if (typeof request.body?.isAdmin !== "boolean") throw badRequest("isAdmin must be a boolean");
    await setAdminRights(adminId, uid, request.body.isAdmin);
    return userDetail(uid);
  });

  // ── Audit log ─────────────────────────────────────────────────────────────

  app.get<{ Querystring: { offset?: string } }>("/api/admin/actions", async (request): Promise<AdminPage<AdminActionEntry>> => {
    await requireAdmin(request);
    const { offset, limit } = pageParams(request.query);
    const rows = await query<ActionRow>(`${ACTION_SELECT} order by a.created_at desc, a.id desc limit $1 offset $2`, [limit + 1, offset]);
    return toPage(rows.map(toAction), offset, limit);
  });
}
