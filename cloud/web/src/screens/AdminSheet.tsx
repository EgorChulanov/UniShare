// Admin panel: overview of the service, user reports, problem reports, users
// (ban / suspend / admin rights) and the audit log. Opened from Settings or a
// bot notification; every action goes through /api/admin/* and is logged there.
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Ban,
  Bug,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleX,
  Copy,
  Database,
  Flag,
  HardDriveDownload,
  Heart,
  MessageCircle,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Search,
  Server,
  ShieldBan,
  ShieldCheck,
  ShieldOff,
  Snowflake,
  TriangleAlert,
  Undo2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { create } from "zustand";
import type {
  AdminActionEntry,
  AdminActionKind,
  AdminBug,
  AdminListFilter,
  AdminOverview,
  AdminPage,
  AdminReport,
  AdminUserDetail,
  AdminUserRef,
  AdminUserRow,
  BanState,
  BugContext,
  BugState,
  ProfileCard,
  ReportAction,
  ReportState,
} from "@unishare/shared";
import { ADMIN_NOTE_MAX, BAN_REASON_MAX } from "@unishare/shared";
import { useApp, type AdminView } from "../app/store";
import { ApiError, api, mediaUrl } from "../lib/api";
import { useI18n, useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { ActionSheet, Avatar, PROVIDER_COLORS, PlatformMark, ProviderIcon, Segmented, Sheet, Spinner, copyText, relativeTime, useEscape } from "../components/ui";

type Tab = "overview" | "reports" | "bugs" | "users" | "log";

const TAB_KEY = "unishare.admin.tab";

/**
 * A report, bug or user opens as its own overlay over the panel, so the Telegram
 * Back button and the system back gesture close just that view.
 */
function openView(view: AdminView) {
  useApp.getState().push({ type: "admin", view });
}

/**
 * Bumped after every change made in a detail view: the panel under it reloads
 * its counters and refreshes the pages it already shows, and other open detail
 * views reload their item.
 */
const useAdminRevision = create<{ revision: number; bump(): void }>((set) => ({
  revision: 0,
  bump: () => set((state) => ({ revision: state.revision + 1 })),
}));
const changed = () => useAdminRevision.getState().bump();

/** The item changed under us (another admin, or another view): the server refused with 409. */
function isStale(error: unknown): boolean {
  return error instanceof ApiError && (error.code === "report_handled" || error.code === "bug_handled" || error.code === "already_restricted");
}

function storedTab(): Tab {
  try {
    const value = sessionStorage.getItem(TAB_KEY);
    return value === "reports" || value === "bugs" || value === "users" || value === "log" ? value : "overview";
  } catch {
    return "overview";
  }
}

// ── Formatting ──────────────────────────────────────────────────────────────

function useFormat() {
  const language = useI18n((state) => state.language);
  const t = useT();
  return useMemo(() => {
    const numbers = new Intl.NumberFormat(language);
    const unit = (value: number, name: string) =>
      new Intl.NumberFormat(language, { style: "unit", unit: name, maximumFractionDigits: value < 10 ? 1 : 0 }).format(value);
    return {
      n: (value: number) => numbers.format(value),
      bytes(value: number) {
        if (value < 1024) return unit(value, "byte");
        if (value < 1024 ** 2) return unit(value / 1024, "kilobyte");
        if (value < 1024 ** 3) return unit(value / 1024 ** 2, "megabyte");
        return unit(value / 1024 ** 3, "gigabyte");
      },
      duration(seconds: number) {
        const days = Math.floor(seconds / 86_400);
        const hours = Math.floor((seconds % 86_400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (days) return `${t("admin.unit.d", days)} ${t("admin.unit.h", hours)}`;
        if (hours) return `${t("admin.unit.h", hours)} ${t("admin.unit.m", minutes)}`;
        return t("admin.unit.m", minutes);
      },
      ago: (iso: string) => relativeTime(iso, language),
      date: (iso: string) =>
        new Date(iso).toLocaleString(language, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
    };
  }, [language, t]);
}

function userName(user: AdminUserRef | null, t: ReturnType<typeof useT>): string {
  if (!user) return t("admin.log.deleted");
  return user.username ?? t("admin.user.noname");
}

// ── Data loading ────────────────────────────────────────────────────────────

interface Paged<T> {
  items: T[] | null;
  nextOffset: number | null;
  busy: boolean;
  failed: boolean;
  loadMore(): void;
  reload(): void;
}

/**
 * First page on mount and whenever `deps` change; "Show more" appends the next one.
 * A new `refreshKey` reloads as many items as are already shown, so pages opened
 * with "Show more" and the scroll position survive a change made in a detail view.
 */
function usePaged<T>(load: (offset: number) => Promise<AdminPage<T>>, deps: unknown[], refreshKey: number): Paged<T> {
  const [items, setItems] = useState<T[] | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const loader = useRef(load);
  loader.current = load;
  const request = useRef(0);
  const shown = useRef(0);
  shown.current = items?.length ?? 0;

  const fetchPage = useCallback(async (offset: number) => {
    const id = ++request.current;
    setBusy(true);
    setFailed(false);
    try {
      const page = await loader.current(offset);
      if (id !== request.current) return;
      setItems((previous) => (offset === 0 ? page.items : [...(previous ?? []), ...page.items]));
      setNextOffset(page.nextOffset);
    } catch (error) {
      if (id !== request.current) return;
      setFailed(true);
      if (offset > 0) useApp.getState().toastError(error);
    } finally {
      if (id === request.current) setBusy(false);
    }
  }, []);

  const refreshShown = useCallback(async () => {
    const id = ++request.current;
    const wanted = Math.max(1, shown.current);
    setBusy(true);
    try {
      const collected: T[] = [];
      let offset: number | null = 0;
      let next: number | null = null;
      while (offset !== null && collected.length < wanted) {
        const page: AdminPage<T> = await loader.current(offset);
        if (id !== request.current) return;
        collected.push(...page.items);
        next = page.nextOffset;
        offset = page.nextOffset;
      }
      setItems(collected);
      setNextOffset(next);
      setFailed(false);
    } catch {
      // Keep what is shown; the next change or refresh tries again.
    } finally {
      if (id === request.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    void fetchPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const lastRefresh = useRef(refreshKey);
  useEffect(() => {
    if (lastRefresh.current === refreshKey) return;
    lastRefresh.current = refreshKey;
    void refreshShown();
  }, [refreshKey, refreshShown]);

  return {
    items,
    nextOffset,
    busy,
    failed,
    loadMore: () => {
      if (nextOffset !== null && !busy) void fetchPage(nextOffset);
    },
    reload: () => void fetchPage(0),
  };
}

// ── Small building blocks ───────────────────────────────────────────────────

type Tone = "orange" | "green" | "red" | "gray" | "violet";

function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`admin-badge ${tone}`}>{children}</span>;
}

const REPORT_TONES: Record<ReportState, Tone> = { open: "orange", reviewing: "orange", resolved: "green", rejected: "gray" };
const BUG_TONES: Record<BugState, Tone> = { open: "orange", resolved: "green", rejected: "gray" };

function AccountBadges({ user }: { user: AdminUserRef | null }) {
  const t = useT();
  if (!user) return null;
  return (
    <>
      {user.isAdmin && <Badge tone="violet">{t("admin.account.admin")}</Badge>}
      {user.accountState !== "active" && (
        <Badge tone={user.accountState === "banned" ? "red" : "orange"}>{t(`admin.account.${user.accountState}`)}</Badge>
      )}
    </>
  );
}

function Loading() {
  return (
    <div className="admin-center">
      <Spinner />
    </div>
  );
}

function Failed({ onRetry }: { onRetry(): void }) {
  const t = useT();
  return (
    <div className="empty admin-empty">
      <TriangleAlert size={40} color="var(--orange)" />
      <h3>{t("admin.load.error")}</h3>
      <button className="btn-plain" onClick={onRetry}>
        {t("common.retry")}
      </button>
    </div>
  );
}

function Empty({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="empty admin-empty">
      <span className="admin-empty-ico">{icon}</span>
      <h3>{title}</h3>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}

function PagedList<T>({ list, empty, children }: { list: Paged<T>; empty: ReactNode; children(items: T[]): ReactNode }) {
  const t = useT();
  if (list.items === null) return list.failed ? <Failed onRetry={list.reload} /> : <Loading />;
  if (!list.items.length) return <>{empty}</>;
  return (
    <>
      {children(list.items)}
      {list.nextOffset !== null && (
        <div className="admin-more">
          <button className="btn-plain" disabled={list.busy} onClick={list.loadMore}>
            {list.busy ? <Spinner size={18} /> : t("admin.more")}
          </button>
        </div>
      )}
    </>
  );
}

function KeyValue({ label, value, wrap }: { label: string; value: ReactNode; wrap?: boolean }) {
  return (
    <div className={`group-row admin-kv ${wrap ? "wrap" : ""}`}>
      <span className="k">{label}</span>
      <span className="v">{value}</span>
    </div>
  );
}

function Meter({ value }: { value: number }) {
  return (
    <span className="admin-meter" aria-hidden>
      <span style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }} />
    </span>
  );
}

function NoteField({ value, onChange }: { value: string; onChange(value: string): void }) {
  const t = useT();
  return (
    <textarea
      className="admin-note"
      rows={2}
      maxLength={ADMIN_NOTE_MAX}
      placeholder={t("admin.note.placeholder")}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** Ban or suspend with a reason; the reason is required by the API. */
function BanForm({
  initialState = "banned",
  defaultReason,
  busy,
  onSubmit,
  onCancel,
}: {
  initialState?: BanState;
  defaultReason: string;
  busy: boolean;
  onSubmit(ban: { state: BanState; reason: string }): void;
  onCancel(): void;
}) {
  const t = useT();
  const id = useId();
  const [state, setState] = useState<BanState>(initialState);
  const [reason, setReason] = useState(defaultReason);
  return (
    <motion.div className="admin-ban" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
      <div className="row" style={{ gap: 10 }}>
        <span className="admin-ban-ico">
          <ShieldBan size={18} />
        </span>
        <span className="grow title">{t("admin.ban.title")}</span>
        <button className="icon-circle" onClick={onCancel} aria-label={t("cancel")}>
          <X size={16} strokeWidth={2.6} />
        </button>
      </div>
      <div className="row">
        <Segmented<BanState>
          id={`admin-ban-${id}`}
          value={state}
          onChange={setState}
          options={[
            { value: "banned", label: t("admin.ban.banned") },
            { value: "suspended", label: t("admin.ban.suspended") },
          ]}
        />
      </div>
      <p className="hint">{t(`admin.ban.hint.${state}`)}</p>
      <input
        className="admin-input"
        value={reason}
        maxLength={BAN_REASON_MAX}
        placeholder={t("admin.ban.reason")}
        aria-label={t("admin.ban.reason")}
        onChange={(event) => setReason(event.target.value)}
      />
      <button className="admin-btn danger" disabled={!reason.trim() || busy} onClick={() => onSubmit({ state, reason: reason.trim() })}>
        {busy ? <Spinner size={18} /> : state === "banned" ? <Ban size={18} /> : <Snowflake size={18} />}
        {t(`admin.ban.confirm.${state}`)}
      </button>
    </motion.div>
  );
}

// ── Overview ────────────────────────────────────────────────────────────────

function StatTile({ icon, color, value, label, sub }: { icon: ReactNode; color: string; value: string; label: string; sub?: string }) {
  return (
    <div className="admin-stat glass">
      <span className="ico" style={{ background: color }}>
        {icon}
      </span>
      <span className="value">{value}</span>
      <span className="label">{label}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

const BACKUP_STALE_HOURS = 36;
/** A failed pg_dump still leaves a tiny .sql.gz behind (gzip of an empty or cut-off stream). */
const BACKUP_MIN_BYTES = 1024;

function OverviewTab({ data, failed, onRetry, onOpen }: { data: AdminOverview | null; failed: boolean; onRetry(): void; onOpen(tab: Tab): void }) {
  const t = useT();
  const f = useFormat();
  if (!data) return failed ? <Failed onRetry={onRetry} /> : <Loading />;
  const { users, activity, database, backups, app } = data;
  const latest = backups?.latest ?? null;
  const previous = backups?.files.find((file) => latest && file.name !== latest.name) ?? null;
  const backupAgeHours = latest ? (Date.now() - Date.parse(latest.modifiedAt)) / 3_600_000 : null;
  // Fresh but suspiciously small: under 1 KB, or less than half of the copy before it.
  const backupTooSmall = Boolean(latest && (latest.sizeBytes < BACKUP_MIN_BYTES || (previous && latest.sizeBytes < previous.sizeBytes / 2)));
  const backupWarning = !backups
    ? t("admin.backups.unavailable")
    : !latest
      ? t("admin.backups.none")
      : backupAgeHours! > BACKUP_STALE_HOURS
        ? t("admin.backups.stale")
        : backupTooSmall
          ? t("admin.backups.small", f.bytes(latest.sizeBytes), previous ? f.bytes(previous.sizeBytes) : "—")
          : null;
  const largest = Math.max(1, ...database.tables.map((table) => table.totalBytes));
  const telegram = app.telegram;
  const telegramState = !telegram
    ? { dot: "off", label: t("admin.telegram.off") }
    : telegram.error
      ? { dot: "bad", label: t("admin.telegram.error") }
      : telegram.configured
        ? { dot: "ok", label: t("admin.telegram.ok") }
        : { dot: "warn", label: telegram.mode === "off" ? t("admin.telegram.off") : t("admin.telegram.pending") };

  return (
    <div className="admin-pane">
      {activity.openReports > 0 && (
        <button className="admin-alert red" onClick={() => onOpen("reports")}>
          <Flag size={19} />
          <span className="grow">{t("admin.attention.reports", f.n(activity.openReports))}</span>
          <ChevronRight size={17} />
        </button>
      )}
      {activity.openBugs > 0 && (
        <button className="admin-alert orange" onClick={() => onOpen("bugs")}>
          <Bug size={19} />
          <span className="grow">{t("admin.attention.bugs", f.n(activity.openBugs))}</span>
          <ChevronRight size={17} />
        </button>
      )}

      <div className="admin-stats">
        <StatTile icon={<Users size={18} />} color="#5c48df" value={f.n(users.total)} label={t("admin.stat.users")} sub={t("admin.stat.users.sub", f.n(users.onboarded))} />
        <StatTile icon={<Activity size={18} />} color="#28b14c" value={f.n(users.online)} label={t("admin.stat.online")} sub={t("admin.stat.online.sub", f.n(users.active24h))} />
        <StatTile icon={<UserPlus size={18} />} color="#0a7cff" value={f.n(users.new7d)} label={t("admin.stat.new")} sub={t("admin.stat.new.sub", f.n(users.new24h))} />
        <StatTile icon={<MessageCircle size={18} />} color="#7f6ef0" value={f.n(activity.messages24h)} label={t("admin.stat.messages")} sub={t("admin.stat.messages.sub", f.n(activity.chats))} />
        <StatTile icon={<Heart size={18} />} color="#e8365d" value={f.n(activity.likes24h)} label={t("admin.stat.likes")} sub={t("admin.stat.likes.sub", f.n(activity.requests24h))} />
        <StatTile
          icon={<ShieldBan size={18} />}
          color="#e07800"
          value={f.n(users.banned + users.suspended)}
          label={t("admin.stat.restricted")}
          sub={t("admin.stat.restricted.sub", f.n(users.banned), f.n(users.suspended))}
        />
      </div>

      <div className="group-title admin-group-title">
        <Database size={16} /> {t("admin.db.title")}
      </div>
      <div className="group">
        <KeyValue label={t("admin.db.size")} value={f.bytes(database.sizeBytes)} />
        <KeyValue label={t("admin.db.version")} value={database.version.split(" ")[0]} />
        <div className="group-row admin-kv stacked">
          <div className="row" style={{ justifyContent: "space-between", width: "100%" }}>
            <span className="k">{t("admin.db.connections")}</span>
            <span className="v">
              {f.n(database.connections)} / {f.n(database.maxConnections)}
            </span>
          </div>
          <Meter value={database.connections / Math.max(1, database.maxConnections)} />
        </div>
      </div>
      <div className="group-title">{t("admin.db.tables")}</div>
      <div className="group admin-tables">
        <div className="admin-table-row head">
          <span>{t("admin.db.col.table")}</span>
          <span>{t("admin.db.col.rows")}</span>
          <span>{t("admin.db.col.size")}</span>
        </div>
        {database.tables.map((table) => (
          <div className="admin-table-row" key={table.name}>
            <span className="name">
              <span className="ellipsis">{table.name}</span>
              <Meter value={table.totalBytes / largest} />
            </span>
            <span className="num">{f.n(table.rowEstimate)}</span>
            <span className="num">{f.bytes(table.totalBytes)}</span>
          </div>
        ))}
      </div>

      <div className="group-title admin-group-title">
        <HardDriveDownload size={16} /> {t("admin.backups.title")}
      </div>
      {backupWarning && (
        <div className="admin-alert orange static">
          <TriangleAlert size={19} />
          <span className="grow">{backupWarning}</span>
        </div>
      )}
      {backups && latest && (
        <div className="group" style={{ marginTop: backupWarning ? 10 : 0 }}>
          <KeyValue label={t("admin.backups.latest")} value={<span className="mono">{latest.name}</span>} />
          <KeyValue
            label={t("admin.backups.age")}
            value={<span style={{ color: backupAgeHours! > BACKUP_STALE_HOURS ? "var(--orange)" : undefined }}>{f.ago(latest.modifiedAt)}</span>}
          />
          <KeyValue label={t("admin.db.size")} value={<span style={{ color: backupTooSmall ? "var(--orange)" : undefined }}>{f.bytes(latest.sizeBytes)}</span>} />
          <KeyValue label={t("admin.backups.count")} value={f.n(backups.count)} />
          <KeyValue label={t("admin.backups.total")} value={f.bytes(backups.totalBytes)} />
        </div>
      )}

      <div className="group-title admin-group-title">
        <Server size={16} /> {t("admin.server.title")}
      </div>
      <div className="group">
        <KeyValue label={t("admin.server.uptime")} value={f.duration(app.uptimeSeconds)} />
        <KeyValue label={t("admin.server.node")} value={app.nodeVersion} />
        <KeyValue label={t("admin.server.memory")} value={t("admin.server.memory.value", f.n(app.memoryMb))} />
        <div className="group-row admin-kv stacked">
          <div className="row" style={{ justifyContent: "space-between", width: "100%" }}>
            <span className="k">{t("admin.server.telegram")}</span>
            <span className="v row" style={{ gap: 7 }}>
              <span className={`admin-dot ${telegramState.dot}`} />
              {telegramState.label}
            </span>
          </div>
          {telegram?.error && <span className="admin-error-text">{telegram.error}</span>}
        </div>
      </div>
      {telegram && !telegram.webhookSecured && (
        <div className="admin-alert orange static" style={{ marginTop: 10 }}>
          <TriangleAlert size={19} />
          <span className="grow">{t("admin.telegram.insecure")}</span>
        </div>
      )}
      <div className="group-footer">{t("admin.updated", f.ago(data.generatedAt))}</div>
    </div>
  );
}

// ── Reports ─────────────────────────────────────────────────────────────────

function FilterBar<T extends string>({ id, value, onChange, options }: { id: string; value: T; onChange(value: T): void; options: { value: T; label: string }[] }) {
  return (
    <div className="admin-filter">
      <Segmented<T> id={id} value={value} onChange={onChange} options={options} />
    </div>
  );
}

function useStateFilters(): { value: AdminListFilter; label: string }[] {
  const t = useT();
  return [
    { value: "open", label: t("admin.filter.open") },
    { value: "resolved", label: t("admin.filter.resolved") },
    { value: "rejected", label: t("admin.filter.rejected") },
    { value: "all", label: t("admin.filter.all") },
  ];
}

function ReportCard({ report, onClick }: { report: AdminReport; onClick(): void }) {
  const t = useT();
  const f = useFormat();
  return (
    <button className="admin-card glass" onClick={onClick}>
      <div className="head">
        <Avatar url={report.subject?.avatarUrl} size={42} />
        <div className="grow col" style={{ gap: 3, minWidth: 0 }}>
          <div className="row admin-name-row">
            <span className="title ellipsis">{userName(report.subject, t)}</span>
            <AccountBadges user={report.subject} />
          </div>
          <span className="meta ellipsis">
            {t(report.reason)} · {f.ago(report.createdAt)}
          </span>
        </div>
        <Badge tone={REPORT_TONES[report.state]}>{t(`admin.report.state.${report.state}`)}</Badge>
      </div>
      {report.details && <div className="text clamp">{report.details}</div>}
      <div className="foot">
        <span className="meta ellipsis">{t("admin.report.from", userName(report.reporter, t))}</span>
        {report.subjectReportCount > 1 && <Badge tone="red">{t("admin.report.count", report.subjectReportCount)}</Badge>}
      </div>
    </button>
  );
}

function ReportsTab({ refreshKey }: { refreshKey: number }) {
  const t = useT();
  const [filter, setFilter] = useState<AdminListFilter>("open");
  const filters = useStateFilters();
  const list = usePaged((offset) => api.admin.reports(filter, offset), [filter], refreshKey);
  return (
    <div className="admin-pane">
      <FilterBar<AdminListFilter> id="admin-reports-filter" value={filter} onChange={setFilter} options={filters} />
      <PagedList list={list} empty={<Empty icon={<Flag size={28} />} title={t("admin.reports.empty")} subtitle={t("admin.reports.empty.subtitle")} />}>
        {(items) => items.map((report) => <ReportCard key={report.id} report={report} onClick={() => openView({ kind: "report", report })} />)}
      </PagedList>
    </div>
  );
}

function PersonRow({ label, user, onOpen }: { label: string; user: AdminUserRef | null; onOpen(uid: string): void }) {
  const t = useT();
  return (
    <button className="group-row admin-person" disabled={!user} onClick={() => user && onOpen(user.uid)}>
      <Avatar url={user?.avatarUrl} size={36} />
      <span className="grow col" style={{ minWidth: 0 }}>
        <span className="caption">{label}</span>
        <span className="row admin-name-row">
          <span className="ellipsis" style={{ fontWeight: 700 }}>
            {userName(user, t)}
          </span>
          <AccountBadges user={user} />
        </span>
      </span>
      {user && <ChevronRight size={16} className="secondary" style={{ opacity: 0.6 }} />}
    </button>
  );
}

function ReportDetail({ initial }: { initial: AdminReport }) {
  const t = useT();
  const f = useFormat();
  const toast = useApp((state) => state.toast);
  const toastError = useApp((state) => state.toastError);
  const push = useApp((state) => state.push);
  const revision = useAdminRevision((state) => state.revision);
  const [report, setReport] = useState(initial);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [banOpen, setBanOpen] = useState(false);
  const isOpen = report.state === "open" || report.state === "reviewing";
  const subject = report.subject;
  const canBan = Boolean(subject && !subject.isAdmin && subject.accountState === "active");

  // The list snapshot may be old (another admin, a Telegram button): show the current state.
  const reload = useCallback(async () => {
    try {
      setReport(await api.admin.report(initial.id));
    } catch {
      /* keep what is shown */
    }
  }, [initial.id]);
  useEffect(() => {
    void reload();
  }, [reload, revision]);
  useEffect(() => {
    if (!isOpen || !canBan) setBanOpen(false);
  }, [isOpen, canBan]);

  const act = async (action: ReportAction, ban?: { state: BanState; reason: string }) => {
    setBusy(ban ? "ban" : action);
    try {
      const updated = await api.admin.moderateReport(report.id, { action, note: note.trim() || undefined, ban });
      setReport(updated);
      setNote("");
      setBanOpen(false);
      toast(ban ? t(`admin.ban.done.${ban.state}`, userName(subject, t)) : t(`admin.report.done.${action}`), "success");
      changed();
    } catch (error) {
      toastError(error);
      if (isStale(error)) changed();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="admin-pane">
      <div className="admin-hero">
        <Avatar url={subject?.avatarUrl} size={76} />
        <div className="name">{userName(subject, t)}</div>
        <div className="row admin-badges">
          <Badge tone={REPORT_TONES[report.state]}>{t(`admin.report.state.${report.state}`)}</Badge>
          <AccountBadges user={subject} />
          {report.subjectReportCount > 1 && <Badge tone="red">{t("admin.report.count", report.subjectReportCount)}</Badge>}
        </div>
      </div>

      <div className="group">
        <PersonRow label={t("admin.report.subject")} user={subject} onOpen={(uid) => openView({ kind: "user", uid })} />
        <PersonRow label={t("admin.report.reporter")} user={report.reporter} onOpen={(uid) => openView({ kind: "user", uid })} />
      </div>

      <div className="group-title">{t("admin.report.reason")}</div>
      <div className="group">
        <div className="group-row admin-text">
          <span className="lead-line">{t(report.reason)}</span>
          {report.details && <p>{report.details}</p>}
        </div>
      </div>

      <div className="group" style={{ marginTop: 12 }}>
        <KeyValue label={t("admin.report.received")} value={f.date(report.createdAt)} />
        {report.resolvedAt && <KeyValue label={t("admin.report.closed")} value={f.date(report.resolvedAt)} />}
        {report.adminNote && <KeyValue label={t("admin.report.note")} value={report.adminNote} wrap />}
      </div>

      {isOpen ? (
        <>
          <div className="group-title">{t("admin.report.note")}</div>
          <NoteField value={note} onChange={setNote} />
          <AnimatePresence initial={false}>
            {banOpen && subject && (
              <BanForm
                key="ban"
                defaultReason={t(report.reason)}
                busy={busy === "ban"}
                onSubmit={(ban) => void act("resolve", ban)}
                onCancel={() => setBanOpen(false)}
              />
            )}
          </AnimatePresence>
          <div className="admin-actions">
            {canBan && !banOpen && (
              <button className="admin-btn danger" disabled={Boolean(busy)} onClick={() => setBanOpen(true)}>
                <Ban size={18} /> {t("admin.report.ban")}
              </button>
            )}
            <div className="admin-actions-row">
              <button className="admin-btn ok" disabled={Boolean(busy)} onClick={() => void act("resolve")}>
                {busy === "resolve" ? <Spinner size={18} /> : <CircleCheck size={18} />} {t("admin.report.resolve")}
              </button>
              <button className="admin-btn" disabled={Boolean(busy)} onClick={() => void act("reject")}>
                {busy === "reject" ? <Spinner size={18} /> : <CircleX size={18} />} {t("admin.report.reject")}
              </button>
            </div>
          </div>
          {subject?.isAdmin && <div className="group-footer">{t("admin.user.protected")}</div>}
        </>
      ) : (
        <div className="admin-actions">
          <button className="admin-btn" disabled={Boolean(busy)} onClick={() => void act("reopen")}>
            {busy === "reopen" ? <Spinner size={18} /> : <RotateCcw size={18} />} {t("admin.report.reopen")}
          </button>
        </div>
      )}
      {subject && subject.accountState === "active" && (
        <div className="admin-more">
          <button className="btn-plain" onClick={() => push({ type: "profile", uid: subject.uid })}>
            {t("admin.user.openProfile")}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Bugs ────────────────────────────────────────────────────────────────────

function deviceLine(context: BugContext): string {
  return [context.client, context.platform, context.appVersion].filter(Boolean).join(" · ");
}

function BugCard({ bug, onClick }: { bug: AdminBug; onClick(): void }) {
  const t = useT();
  const f = useFormat();
  const device = deviceLine(bug.context);
  return (
    <button className="admin-card glass" onClick={onClick}>
      <div className="head">
        <Avatar url={bug.user?.avatarUrl} size={36} />
        <div className="grow col" style={{ gap: 2, minWidth: 0 }}>
          <span className="title ellipsis">{bug.user ? userName(bug.user, t) : t("admin.bug.author.deleted")}</span>
          <span className="meta ellipsis">
            {f.ago(bug.createdAt)}
            {device && ` · ${device}`}
          </span>
        </div>
        <Badge tone={BUG_TONES[bug.state]}>{t(`admin.bug.state.${bug.state}`)}</Badge>
      </div>
      <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
        <div className="text clamp grow">{bug.text}</div>
        {bug.screenshotUrl && <img className="admin-thumb" src={mediaUrl(bug.screenshotUrl) ?? undefined} alt="" loading="lazy" />}
      </div>
    </button>
  );
}

function BugsTab({ refreshKey }: { refreshKey: number }) {
  const t = useT();
  const [filter, setFilter] = useState<AdminListFilter>("open");
  const filters = useStateFilters();
  const list = usePaged((offset) => api.admin.bugs(filter, offset), [filter], refreshKey);
  return (
    <div className="admin-pane">
      <FilterBar<AdminListFilter> id="admin-bugs-filter" value={filter} onChange={setFilter} options={filters} />
      <PagedList list={list} empty={<Empty icon={<Bug size={28} />} title={t("admin.bugs.empty")} subtitle={t("admin.bugs.empty.subtitle")} />}>
        {(items) => items.map((bug) => <BugCard key={bug.id} bug={bug} onClick={() => openView({ kind: "bug", bug })} />)}
      </PagedList>
    </div>
  );
}

const CONTEXT_ROWS: (keyof BugContext)[] = ["client", "platform", "appVersion", "screen", "language", "theme", "timezone", "url", "userAgent"];

function BugDetail({ initial }: { initial: AdminBug }) {
  const t = useT();
  const f = useFormat();
  const toast = useApp((state) => state.toast);
  const toastError = useApp((state) => state.toastError);
  const revision = useAdminRevision((state) => state.revision);
  const [bug, setBug] = useState(initial);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<BugState | null>(null);
  const [zoom, setZoom] = useState(false);
  useEscape(() => setZoom(false), zoom);
  const screenshot = mediaUrl(bug.screenshotUrl);

  // Current state and a fresh signed screenshot link (the list's may be about to expire).
  const reload = useCallback(async () => {
    try {
      setBug(await api.admin.bug(initial.id));
    } catch {
      /* keep what is shown */
    }
  }, [initial.id]);
  useEffect(() => {
    void reload();
  }, [reload, revision]);

  const setState = async (state: BugState) => {
    setBusy(state);
    try {
      setBug(await api.admin.setBugState(bug.id, state, note.trim() || undefined));
      setNote("");
      toast(t("common.saved"), "success");
      changed();
    } catch (error) {
      toastError(error);
      if (isStale(error)) changed();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="admin-pane">
      <div className="group" style={{ marginTop: 8 }}>
        <PersonRow label={t("admin.bug.author")} user={bug.user} onOpen={(uid) => openView({ kind: "user", uid })} />
        <KeyValue label={t("admin.report.received")} value={f.date(bug.createdAt)} />
        <KeyValue label={t("admin.state")} value={<Badge tone={BUG_TONES[bug.state]}>{t(`admin.bug.state.${bug.state}`)}</Badge>} />
      </div>

      <div className="group-title">{t("admin.report.details")}</div>
      <div className="group">
        <div className="group-row admin-text">
          <p style={{ margin: 0 }}>{bug.text}</p>
        </div>
      </div>

      {screenshot && (
        <>
          <div className="group-title">{t("admin.bug.screenshot")}</div>
          <button className="admin-shot" onClick={() => setZoom(true)}>
            <img src={screenshot} alt={t("admin.bug.screenshot")} />
          </button>
        </>
      )}

      <div className="group-title">{t("admin.bug.device")}</div>
      <div className="group">
        {CONTEXT_ROWS.filter((key) => bug.context[key]).map((key) => (
          <KeyValue key={key} label={t(`admin.bug.ctx.${key}`)} value={<span className={key === "userAgent" || key === "url" ? "mono" : undefined}>{bug.context[key]}</span>} wrap={key === "userAgent" || key === "url"} />
        ))}
        {!CONTEXT_ROWS.some((key) => bug.context[key]) && <div className="group-row secondary">—</div>}
      </div>

      {bug.adminNote && (
        <div className="group" style={{ marginTop: 12 }}>
          <KeyValue label={t("admin.report.note")} value={bug.adminNote} wrap />
        </div>
      )}

      <div className="group-title">{t("admin.report.note")}</div>
      <NoteField value={note} onChange={setNote} />
      <div className="admin-actions">
        {bug.state === "open" ? (
          <div className="admin-actions-row">
            <button className="admin-btn ok" disabled={Boolean(busy)} onClick={() => void setState("resolved")}>
              {busy === "resolved" ? <Spinner size={18} /> : <CircleCheck size={18} />} {t("admin.bug.resolve")}
            </button>
            <button className="admin-btn" disabled={Boolean(busy)} onClick={() => void setState("rejected")}>
              {busy === "rejected" ? <Spinner size={18} /> : <CircleX size={18} />} {t("admin.bug.reject")}
            </button>
          </div>
        ) : (
          <button className="admin-btn" disabled={Boolean(busy)} onClick={() => void setState("open")}>
            {busy === "open" ? <Spinner size={18} /> : <RotateCcw size={18} />} {t("admin.bug.reopen")}
          </button>
        )}
      </div>

      <AnimatePresence>
        {zoom && screenshot && (
          <motion.div className="lightbox" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setZoom(false)}>
            <img src={screenshot} alt="" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Users ───────────────────────────────────────────────────────────────────

type UserFilter = "all" | "restricted" | "admins";

function ProviderDots({ providers }: { providers: string[] }) {
  return (
    <>
      {providers
        .filter((provider): provider is "telegram" | "vk" => provider === "telegram" || provider === "vk")
        .map((provider) => (
          <span key={provider} className="platform-badge" style={{ width: 18, height: 18, background: PROVIDER_COLORS[provider], color: "#fff" }}>
            <ProviderIcon provider={provider} size={10} />
          </span>
        ))}
    </>
  );
}

function UserRowItem({ user, onClick }: { user: AdminUserRow; onClick(): void }) {
  const t = useT();
  const f = useFormat();
  return (
    <button className="group-row admin-user-row" onClick={onClick}>
      <Avatar url={user.avatarUrl} size={42} online={user.isOnline} />
      <span className="grow col" style={{ gap: 3, minWidth: 0 }}>
        <span className="row admin-name-row">
          <span className="ellipsis" style={{ fontWeight: 700 }}>
            {userName(user, t)}
          </span>
          <AccountBadges user={user} />
        </span>
        <span className="row meta" style={{ gap: 5, minWidth: 0 }}>
          <ProviderDots providers={user.providers} />
          <span className="ellipsis">
            {t("admin.user.created", f.ago(user.createdAt))}
            {!user.onboardingComplete && ` · ${t("admin.user.draft")}`}
          </span>
        </span>
      </span>
      {user.openReports > 0 && <Badge tone="red">{user.openReports}</Badge>}
      <ChevronRight size={16} className="secondary" style={{ opacity: 0.6 }} />
    </button>
  );
}

function UsersTab({ refreshKey }: { refreshKey: number }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<UserFilter>("all");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const list = usePaged((offset) => api.admin.users(search, filter, offset), [search, filter], refreshKey);
  return (
    <div className="admin-pane">
      <label className="search-field compact glass admin-search">
        <Search size={18} strokeWidth={2.4} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("admin.users.search")}
          enterKeyHint="search"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {query && (
          <button className="icon-circle" style={{ width: 24, height: 24 }} onClick={() => setQuery("")} aria-label={t("common.close")}>
            <X size={13} strokeWidth={3} />
          </button>
        )}
      </label>
      <FilterBar<UserFilter>
        id="admin-users-filter"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: t("admin.users.filter.all") },
          { value: "restricted", label: t("admin.users.filter.restricted") },
          { value: "admins", label: t("admin.users.filter.admins") },
        ]}
      />
      <PagedList list={list} empty={<Empty icon={<Users size={28} />} title={t("admin.users.empty")} subtitle={search ? t("admin.users.empty.subtitle") : undefined} />}>
        {(items) => (
          <div className="group">
            {items.map((user) => (
              <UserRowItem key={user.uid} user={user} onClick={() => openView({ kind: "user", uid: user.uid })} />
            ))}
          </div>
        )}
      </PagedList>
    </div>
  );
}

/** What the profile shows to other players, as text: what got reported is usually here. */
function ProfileContent({ card }: { card: ProfileCard }) {
  const t = useT();
  const names = (games: { name: string }[]) => games.map((game) => game.name).join(", ");
  const platformsWithGames = card.platforms.map((id) => ({ id, games: card.platformGames[id] ?? [] }));
  const listed = new Set(Object.values(card.platformGames).flatMap((games) => (games ?? []).map((game) => game.name.toLowerCase())));
  const otherGames = card.games.filter((game) => !listed.has(game.name.toLowerCase()));
  const empty =
    !card.platforms.length && !otherGames.length && !card.wantedGames.length && !card.skills.length && !card.skillsDescription && !card.subscriptions.length;
  return (
    <>
      <div className="group-title">{t("admin.card.title")}</div>
      <div className="group admin-profile">
        {empty && <div className="group-row secondary">{t("admin.card.empty")}</div>}
        {platformsWithGames.map(({ id, games }) => (
          <div key={id} className="group-row admin-profile-row">
            <PlatformMark platform={id} size={30} />
            <span className="grow col" style={{ minWidth: 0, gap: 2 }}>
              <span className="k">{id}</span>
              <span className="v">{games.length ? names(games) : t("admin.card.noGames")}</span>
            </span>
          </div>
        ))}
        {otherGames.length > 0 && <KeyValue label={t("admin.card.games")} value={names(otherGames)} wrap />}
        {card.wantedGames.length > 0 && <KeyValue label={t("admin.card.wanted")} value={names(card.wantedGames)} wrap />}
        {card.skills.length > 0 && (
          <div className="group-row admin-text">
            <span className="caption">{t("admin.card.skills")}</span>
            <div className="flow admin-chips">
              {card.skills.map((skill) => (
                <span key={skill} className="chip">
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}
        {card.skillsDescription && (
          <div className="group-row admin-text">
            <span className="caption">{t("admin.card.about")}</span>
            <p>{card.skillsDescription}</p>
          </div>
        )}
        {card.subscriptions.length > 0 && (
          <KeyValue
            label={t("admin.card.subscriptions")}
            value={card.subscriptions.map((item) => (item.planName ? `${item.name} (${item.planName})` : item.name)).join(", ")}
            wrap
          />
        )}
        {card.reviewCount > 0 && <KeyValue label={t("admin.card.rating")} value={`★ ${card.rating.toFixed(1)} · ${card.reviewCount}`} />}
      </div>
    </>
  );
}

function UserDetail({ uid }: { uid: string }) {
  const t = useT();
  const f = useFormat();
  const me = useApp((state) => state.profile);
  const setProfile = useApp((state) => state.setProfile);
  const push = useApp((state) => state.push);
  const toast = useApp((state) => state.toast);
  const toastError = useApp((state) => state.toastError);
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [banForm, setBanForm] = useState<BanState | null>(null);
  const [confirmAdmin, setConfirmAdmin] = useState(false);
  const revision = useAdminRevision((state) => state.revision);
  const isSelf = me?.uid === uid;

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setUser(await api.admin.user(uid));
    } catch {
      setFailed(true);
    }
  }, [uid]);
  useEffect(() => {
    void load();
  }, [load, revision]);

  const run = async (key: string, work: () => Promise<AdminUserDetail>, done: string) => {
    setBusy(key);
    try {
      setUser(await work());
      setBanForm(null);
      toast(done, "success");
      changed();
    } catch (error) {
      toastError(error);
      if (isStale(error)) changed();
    } finally {
      setBusy(null);
    }
  };

  if (!user) return failed ? <Failed onRetry={() => void load()} /> : <Loading />;
  const name = userName(user, t);
  const restricted = user.accountState !== "active";

  const toggleAdmin = async () => {
    setConfirmAdmin(false);
    await run("admin", () => api.admin.setAdmin(uid, !user.isAdmin), t("admin.user.adminDone"));
    // Dropping your own rights closes the panel (see the isAdmin effect in AdminPanel).
    if (isSelf) await api.me().then(setProfile).catch(() => undefined);
  };

  return (
    <div className="admin-pane">
      <div className="admin-hero">
        <Avatar url={user.avatarUrl} size={88} online={user.isOnline} />
        <div className="name">{name}</div>
        <div className="row admin-badges">
          <AccountBadges user={user} />
          {user.isOnline && <Badge tone="green">{t("admin.user.online")}</Badge>}
          {!user.onboardingComplete && <Badge tone="gray">{t("admin.user.draft")}</Badge>}
          {isSelf && <Badge tone="violet">{t("admin.user.you")}</Badge>}
        </div>
        {user.status && <p className="status">{user.status}</p>}
      </div>

      <div className="admin-mini-stats">
        {(
          [
            ["chats", user.counts.chats],
            ["messages", user.counts.messages],
            ["against", user.counts.reportsAgainst],
            ["by", user.counts.reportsBy],
            ["bugs", user.counts.bugs],
          ] as const
        ).map(([key, value]) => (
          <div key={key} className={`admin-mini glass ${key === "against" && value > 0 ? "alert" : ""}`}>
            <span className="value">{f.n(value)}</span>
            <span className="label">{t(`admin.user.stat.${key}`)}</span>
          </div>
        ))}
      </div>

      <AnimatePresence initial={false}>
        {banForm && (
          <BanForm key={banForm} initialState={banForm} defaultReason="" busy={busy === "ban"} onCancel={() => setBanForm(null)} onSubmit={(ban) => void run("ban", () => api.admin.ban(uid, ban.state, ban.reason), t(`admin.ban.done.${ban.state}`, name))} />
        )}
      </AnimatePresence>

      <div className="admin-actions">
        {restricted ? (
          <button className="admin-btn ok" disabled={Boolean(busy)} onClick={() => void run("unban", () => api.admin.unban(uid), t("admin.unban.done"))}>
            {busy === "unban" ? <Spinner size={18} /> : <Undo2 size={18} />} {t("admin.unban")}
          </button>
        ) : (
          !isSelf &&
          !user.isAdmin &&
          !banForm && (
            <div className="admin-actions-row">
              <button className="admin-btn danger" disabled={Boolean(busy)} onClick={() => setBanForm("banned")}>
                <Ban size={18} /> {t("admin.user.ban")}
              </button>
              <button className="admin-btn warn" disabled={Boolean(busy)} onClick={() => setBanForm("suspended")}>
                <Snowflake size={18} /> {t("admin.user.suspend")}
              </button>
            </div>
          )
        )}
        {(user.isAdmin || !restricted) && (
          <button className="admin-btn" disabled={Boolean(busy)} onClick={() => setConfirmAdmin(true)}>
            {busy === "admin" ? <Spinner size={18} /> : user.isAdmin ? <ShieldOff size={18} /> : <ShieldCheck size={18} />}
            {user.isAdmin ? t("admin.user.removeAdmin") : t("admin.user.makeAdmin")}
          </button>
        )}
        {user.onboardingComplete && !restricted && !isSelf && (
          <button className="btn-plain" onClick={() => push({ type: "profile", uid })}>
            {t("admin.user.openProfile")}
          </button>
        )}
      </div>
      {user.isAdmin && !isSelf && <div className="group-footer">{t("admin.user.protected")}</div>}

      <ProfileContent card={user.card} />

      <div className="group-title">{t("admin.user.account")}</div>
      <div className="group">
        <button
          className="group-row admin-kv"
          onClick={async () => {
            if (await copyText(user.uid)) toast(t("common.copied"), "success");
          }}
        >
          <span className="k">{t("admin.user.uid")}</span>
          <span className="v row mono" style={{ gap: 6 }}>
            <span className="ellipsis">{user.uid}</span>
            <Copy size={14} className="secondary" />
          </span>
        </button>
        <KeyValue label={t("admin.user.joined")} value={f.date(user.createdAt)} />
        {user.lastSeen && <KeyValue label={t("admin.user.lastSeen")} value={user.isOnline ? t("admin.user.online") : f.ago(user.lastSeen)} />}
        <KeyValue label={t("admin.user.language")} value={user.language.toUpperCase()} />
        {user.banReason && <KeyValue label={t("admin.user.banReason")} value={user.banReason} wrap />}
        {user.bannedAt && <KeyValue label={t("admin.user.bannedAt")} value={f.date(user.bannedAt)} />}
      </div>

      {user.identities.length > 0 && (
        <>
          <div className="group-title">{t("admin.user.identities")}</div>
          <div className="group">
            {user.identities.map((identity) => (
              <div key={`${identity.provider}:${identity.providerUserId}`} className="group-row admin-identity">
                {identity.provider === "telegram" || identity.provider === "vk" ? (
                  <span className="platform-badge" style={{ width: 30, height: 30, background: PROVIDER_COLORS[identity.provider], color: "#fff" }}>
                    <ProviderIcon provider={identity.provider} size={15} />
                  </span>
                ) : (
                  <span className="platform-badge admin-provider-text">{identity.provider.slice(0, 2).toUpperCase()}</span>
                )}
                <span className="grow col" style={{ minWidth: 0 }}>
                  <span className="ellipsis" style={{ fontWeight: 700 }}>
                    {identity.username ? `@${identity.username}` : identity.displayName ?? identity.provider}
                  </span>
                  <span className="meta ellipsis">
                    {identity.provider} · <span className="mono">{identity.providerUserId}</span>
                  </span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {user.recentReports.length > 0 && (
        <>
          <div className="group-title">{t("admin.user.reports")}</div>
          {user.recentReports.map((report) => (
            <ReportCard key={report.id} report={report} onClick={() => openView({ kind: "report", report })} />
          ))}
        </>
      )}

      {user.recentActions.length > 0 && (
        <>
          <div className="group-title">{t("admin.user.actions")}</div>
          <div className="group">
            {user.recentActions.map((entry) => (
              <LogRow key={entry.id} entry={entry} />
            ))}
          </div>
        </>
      )}

      <AnimatePresence>
        {confirmAdmin && (
          <ActionSheet
            title={user.isAdmin ? t("admin.user.removeAdmin.title", name) : t("admin.user.makeAdmin.title", name)}
            message={user.isAdmin ? (isSelf ? t("admin.user.removeAdmin.self") : undefined) : t("admin.user.makeAdmin.message")}
            actions={[{ label: user.isAdmin ? t("admin.user.removeAdmin") : t("admin.user.makeAdmin"), destructive: user.isAdmin, onSelect: () => void toggleAdmin() }]}
            cancelLabel={t("cancel")}
            onCancel={() => setConfirmAdmin(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Audit log ───────────────────────────────────────────────────────────────

const ACTION_LOOK: Record<AdminActionKind, { icon: ReactNode; tone: Tone }> = {
  claim_admin: { icon: <ShieldCheck size={16} />, tone: "violet" },
  grant_admin: { icon: <ShieldCheck size={16} />, tone: "violet" },
  revoke_admin: { icon: <ShieldOff size={16} />, tone: "gray" },
  ban: { icon: <Ban size={16} />, tone: "red" },
  suspend: { icon: <Snowflake size={16} />, tone: "orange" },
  unban: { icon: <Undo2 size={16} />, tone: "green" },
  report_resolve: { icon: <Flag size={16} />, tone: "green" },
  report_reject: { icon: <Flag size={16} />, tone: "gray" },
  report_reopen: { icon: <RotateCcw size={16} />, tone: "orange" },
  bug_resolve: { icon: <Bug size={16} />, tone: "green" },
  bug_reject: { icon: <Bug size={16} />, tone: "gray" },
  bug_reopen: { icon: <RotateCcw size={16} />, tone: "orange" },
};

function LogRow({ entry, onOpenUser }: { entry: AdminActionEntry; onOpenUser?(uid: string): void }) {
  const t = useT();
  const f = useFormat();
  const look = ACTION_LOOK[entry.action];
  const actor = entry.adminName ?? t("admin.log.deleted");
  const target = entry.targetName ?? (entry.targetUid ? t("admin.user.noname") : null);
  const sameUser = entry.adminUid && entry.adminUid === entry.targetUid;
  const clickable = Boolean(onOpenUser && entry.targetUid);
  const content = (
    <>
      <span className={`admin-log-ico ${look.tone}`}>{look.icon}</span>
      <span className="grow col" style={{ gap: 2, minWidth: 0 }}>
        <span style={{ fontWeight: 700 }}>{t(`admin.action.${entry.action}`)}</span>
        <span className="meta ellipsis">{sameUser || !target ? actor : `${actor} → ${target}`}</span>
        {entry.reason && <span className="meta reason">«{entry.reason}»</span>}
      </span>
      <span className="meta" style={{ whiteSpace: "nowrap", alignSelf: "flex-start", paddingTop: 2 }}>
        {f.ago(entry.createdAt)}
      </span>
    </>
  );
  return clickable ? (
    <button className="group-row admin-log-row" onClick={() => onOpenUser!(entry.targetUid!)}>
      {content}
    </button>
  ) : (
    <div className="group-row admin-log-row">{content}</div>
  );
}

function LogTab({ refreshKey }: { refreshKey: number }) {
  const t = useT();
  const list = usePaged((offset) => api.admin.actions(offset), [], refreshKey);
  return (
    <div className="admin-pane" style={{ paddingTop: 14 }}>
      <PagedList list={list} empty={<Empty icon={<ScrollText size={28} />} title={t("admin.log.empty")} subtitle={t("admin.log.empty.subtitle")} />}>
        {(items) => (
          <div className="group">
            {items.map((entry) => (
              <LogRow key={entry.id} entry={entry} onOpenUser={(uid) => openView({ kind: "user", uid })} />
            ))}
          </div>
        )}
      </PagedList>
    </div>
  );
}

// ── Sheet ───────────────────────────────────────────────────────────────────

function AdminTabs({ tab, onChange, counts }: { tab: Tab; onChange(tab: Tab): void; counts: { reports: number; bugs: number } }) {
  const t = useT();
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: t("admin.tab.overview") },
    { id: "reports", label: t("admin.tab.reports"), count: counts.reports },
    { id: "bugs", label: t("admin.tab.bugs"), count: counts.bugs },
    { id: "users", label: t("admin.tab.users") },
    { id: "log", label: t("admin.tab.log") },
  ];
  const ref = useRef<HTMLDivElement>(null);
  // All five fit on a phone; the row only scrolls (with a fade) when a translation does not.
  const [overflowing, setOverflowing] = useState(false);
  useLayoutEffect(() => {
    const row = ref.current;
    if (!row || typeof ResizeObserver === "undefined") return;
    const check = () => setOverflowing(row.scrollWidth > row.clientWidth + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(row);
    return () => observer.disconnect();
  }, [tabs.map((item) => `${item.label}${item.count ?? ""}`).join()]);
  useEffect(() => {
    const active = ref.current?.querySelector<HTMLElement>("[aria-selected=true]");
    active?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [tab]);
  return (
    <div className="admin-tabs-wrap">
      <div className="segmented liquid admin-tabs">
        <div ref={ref} className={`admin-tabs-scroll ${overflowing ? "overflowing" : ""}`} role="tablist">
          {tabs.map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={tab === item.id}
              className={`${tab === item.id ? "active" : ""} ${item.count ? "has-count" : ""}`}
              onClick={() => {
                if (tab !== item.id) platform.haptic("light");
                onChange(item.id);
              }}
            >
              {tab === item.id && <motion.span layoutId="admin-tab" className="thumb" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <span className="label">
                {item.label}
                {Boolean(item.count) && <span className="count">{item.count! > 99 ? "99+" : item.count}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A report, bug or user opened over the panel (see openView). */
function AdminDetailSheet({ view }: { view: AdminView }) {
  const t = useT();
  const pop = useApp((state) => state.pop);
  const title = view.kind === "report" ? t("admin.report.title") : view.kind === "bug" ? t("admin.bug.title") : t("admin.user.title");
  return (
    <Sheet
      title={title}
      lead={
        <button className="btn-plain" onClick={pop}>
          <ChevronLeft size={20} strokeWidth={2.6} style={{ marginLeft: -6 }} /> {t("admin.back")}
        </button>
      }
      trail={null}
    >
      <div className="container admin-root">
        {view.kind === "report" && <ReportDetail initial={view.report} />}
        {view.kind === "bug" && <BugDetail initial={view.bug} />}
        {view.kind === "user" && <UserDetail uid={view.uid} />}
      </div>
    </Sheet>
  );
}

export function AdminSheet({ view }: { view?: AdminView }) {
  return view ? <AdminDetailSheet view={view} /> : <AdminPanel />;
}

function AdminPanel() {
  const t = useT();
  const isAdmin = useApp((state) => state.profile?.isAdmin ?? false);
  const revision = useAdminRevision((state) => state.revision);
  const [tab, setTabState] = useState<Tab>(storedTab);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [overviewFailed, setOverviewFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  /** Bumped by the refresh button; lists reload the items they show. */
  const [version, setVersion] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await api.admin.overview());
      setOverviewFailed(false);
    } catch {
      setOverviewFailed(true);
    }
  }, []);
  useEffect(() => {
    void loadOverview();
  }, [loadOverview, revision]);

  // Rights removed while the panel is open (here or by another admin): close it and every view over it.
  useEffect(() => {
    if (isAdmin) return;
    const { overlays, popOverlays } = useApp.getState();
    const index = overlays.findIndex((overlay) => overlay.type === "admin" && !overlay.view);
    if (index >= 0) popOverlays(overlays.length - index);
  }, [isAdmin]);

  const setTab = (next: Tab) => {
    setTabState(next);
    try {
      sessionStorage.setItem(TAB_KEY, next);
    } catch {
      /* ignored */
    }
    const body = root.current?.closest<HTMLElement>(".sheet-body");
    if (body) body.scrollTop = 0;
  };

  const refresh = async () => {
    setRefreshing(true);
    setVersion((value) => value + 1);
    await loadOverview();
    setTimeout(() => setRefreshing(false), 400);
  };

  const refreshKey = version + revision;
  const counts = { reports: overview?.activity.openReports ?? 0, bugs: overview?.activity.openBugs ?? 0 };

  return (
    <Sheet
      title={t("admin.title")}
      lead={
        <button className="close-btn" onClick={() => void refresh()} aria-label={t("admin.refresh")} disabled={refreshing}>
          <RefreshCw size={18} strokeWidth={2.4} className={refreshing ? "admin-spin" : undefined} />
        </button>
      }
    >
      <div ref={root} className="container admin-root">
        <AdminTabs tab={tab} onChange={setTab} counts={counts} />
        {tab === "overview" && <OverviewTab data={overview} failed={overviewFailed} onRetry={() => void loadOverview()} onOpen={setTab} />}
        {tab === "reports" && <ReportsTab refreshKey={refreshKey} />}
        {tab === "bugs" && <BugsTab refreshKey={refreshKey} />}
        {tab === "users" && <UsersTab refreshKey={refreshKey} />}
        {tab === "log" && <LogTab refreshKey={refreshKey} />}
      </div>
    </Sheet>
  );
}
