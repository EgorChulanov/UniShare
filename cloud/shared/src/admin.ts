// Types of the admin panel (/api/admin/*) and in-app bug reports (/api/bugs).
import type { ProfileCard } from "./types";

export type AccountState = "active" | "suspended" | "banned";
/** States an admin can put an account into; both sign the user out everywhere. */
export type BanState = Exclude<AccountState, "active">;
export type ReportState = "open" | "reviewing" | "resolved" | "rejected";
export type BugState = "open" | "resolved" | "rejected";
/** List filters: "open" also includes reports under review. */
export type AdminListFilter = "open" | "resolved" | "rejected" | "all";

export const BUG_TEXT_MIN = 5;
export const BUG_TEXT_MAX = 2000;
/** Screenshot size after base64 decoding. */
export const BUG_SCREENSHOT_MAX_BYTES = 3 * 1024 * 1024;
export const ADMIN_NOTE_MAX = 1000;
export const BAN_REASON_MAX = 500;

/** Every entry of the audit log (admin_actions.action has the same check list). */
export const ADMIN_ACTIONS = [
  "claim_admin",
  "grant_admin",
  "revoke_admin",
  "ban",
  "suspend",
  "unban",
  "report_resolve",
  "report_reject",
  "report_reopen",
  "bug_resolve",
  "bug_reject",
  "bug_reopen",
] as const;
export type AdminActionKind = (typeof ADMIN_ACTIONS)[number];

/** Device details attached to a bug report; every field is optional and size-capped by the server. */
export interface BugContext {
  /** telegram | vk | web */
  client?: string;
  /** OS or Telegram platform (ios, android, tdesktop, macos, ...). */
  platform?: string;
  appVersion?: string;
  url?: string;
  userAgent?: string;
  /** "390x844@3" */
  screen?: string;
  language?: string;
  theme?: string;
  timezone?: string;
}

export interface BugReportInput {
  text: string;
  context?: BugContext;
  /** data:image/jpeg|png|webp;base64,... (at most BUG_SCREENSHOT_MAX_BYTES once decoded). */
  screenshot?: string | null;
}

/** A user as the panel shows it in lists and next to reports. */
export interface AdminUserRef {
  uid: string;
  username: string | null;
  avatarUrl: string | null;
  accountState: AccountState;
  isAdmin: boolean;
}

export interface AdminPage<T> {
  items: T[];
  /** Pass as ?offset= to load the next page; null on the last page. */
  nextOffset: number | null;
}

export interface AdminBackupFile {
  name: string;
  sizeBytes: number;
  modifiedAt: string;
}

export interface AdminOverview {
  generatedAt: string;
  users: {
    total: number;
    onboarded: number;
    new24h: number;
    new7d: number;
    active24h: number;
    online: number;
    banned: number;
    suspended: number;
    admins: number;
  };
  activity: {
    chats: number;
    messages24h: number;
    likes24h: number;
    requests24h: number;
    openReports: number;
    openBugs: number;
  };
  database: {
    sizeBytes: number;
    sizePretty: string;
    version: string;
    connections: number;
    maxConnections: number;
    tables: { name: string; totalBytes: number; totalPretty: string; rowEstimate: number }[];
  };
  /** Null when BACKUPS_DIR is not set or cannot be read. */
  backups: { count: number; totalBytes: number; latest: AdminBackupFile | null; files: AdminBackupFile[] } | null;
  app: {
    uptimeSeconds: number;
    startedAt: string;
    nodeVersion: string;
    memoryMb: number;
    /**
     * Null when TELEGRAM_BOT_TOKEN is not set. `webhookSecured` is false in webhook
     * mode without TELEGRAM_WEBHOOK_SECRET; the ban/dismiss buttons in Telegram are off then.
     */
    telegram: { mode: string; configured: boolean; route: string; error: string | null; checkedAt: string | null; webhookSecured: boolean } | null;
  };
}

export interface AdminReport {
  id: string;
  reporter: AdminUserRef | null;
  subject: AdminUserRef | null;
  /** i18n key from REPORT_REASONS (report.reason.*). */
  reason: string;
  details: string;
  state: ReportState;
  adminNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  /** All reports ever filed against the subject, this one included. */
  subjectReportCount: number;
}

export type ReportAction = "resolve" | "reject" | "reopen";

export interface ReportActionInput {
  action: ReportAction;
  note?: string;
  /** Only with "resolve": also bans or suspends the subject. */
  ban?: { state: BanState; reason: string };
}

export interface AdminBug {
  id: string;
  user: AdminUserRef | null;
  text: string;
  context: BugContext;
  /** Signed, expiring URL; only ever returned to admins. */
  screenshotUrl: string | null;
  state: BugState;
  adminNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AdminUserRow extends AdminUserRef {
  onboardingComplete: boolean;
  isOnline: boolean;
  lastSeen: string | null;
  createdAt: string;
  /** Linked sign-in providers (telegram, vk). */
  providers: string[];
  /** Reports against the user that are still open. */
  openReports: number;
}

export interface AdminIdentity {
  provider: string;
  providerUserId: string;
  username: string | null;
  displayName: string | null;
  createdAt: string;
}

export interface AdminUserDetail extends AdminUserRow {
  /** What the profile shows to others (games, skills description, ...), also for banned users. */
  card: ProfileCard;
  status: string | null;
  language: string;
  banReason: string | null;
  bannedAt: string | null;
  identities: AdminIdentity[];
  counts: { chats: number; messages: number; reportsAgainst: number; reportsBy: number; bugs: number };
  recentReports: AdminReport[];
  recentActions: AdminActionEntry[];
}

export interface AdminActionEntry {
  id: string;
  action: AdminActionKind;
  /** Current username, or the one recorded with the action if the account is gone. */
  adminName: string | null;
  adminUid: string | null;
  targetName: string | null;
  targetUid: string | null;
  reportId: string | null;
  bugId: string | null;
  reason: string | null;
  createdAt: string;
}
