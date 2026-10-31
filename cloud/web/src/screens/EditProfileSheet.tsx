// Port of UniShare/Features/Profile/EditProfileSheet.swift (+ SubscriptionEditorSheet).
import { AtSign, Camera, ChevronRight, Circle, Hash, Image as ImageIcon, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import {
  CYCLES,
  LIMITS,
  PLATFORMS,
  PLATFORM_INFO,
  SUBSCRIPTION_SERVICES,
  normalizeGameName,
  sanitizeUsername,
  subscriptionService,
  type BillingCycle,
  type GameTag,
  type Platform,
  type Subscription,
} from "@unishare/shared";
import { useApp } from "../app/store";
import { api } from "../lib/api";
import { errorMessage, useI18n, useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { GamePicker, GamePlatformTabs, type GameTab } from "../components/GamePicker";
import { Avatar, BrandIcon, PlatformMark, SelectedDot, Sheet, Spinner, Toggle, platformColor } from "../components/ui";
import { subscriptionProgress, tagFor } from "./ProfileScreen";

/** A platform's games, or the wanted games tab after the platform tabs. */
type GamesTab = Platform | "wanted";

interface EditDraft {
  username: string;
  status: string;
  platforms: Platform[];
  games: Partial<Record<Platform, GameTag[]>>;
  wanted: GameTag[];
  active: GamesTab | null;
  subscriptions: Subscription[];
}

/** Shared between the edit sheet and the subscription editor pushed on top of it. */
const useEditDraft = create<EditDraft>(() => ({ username: "", status: "", platforms: [], games: {}, wanted: [], active: null, subscriptions: [] }));

/** Calendar.date(byAdding: .day): adds local calendar days, so a DST change cannot shift the date. */
function addDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

/** SubscriptionEditorSheet.normalizeDraft: valid plan / cycle, start date and expiry. */
function normalizeSubscription(subscription: Subscription, recalculateExpiry: boolean): Subscription {
  const service = subscriptionService(subscription.name);
  if (!service) return subscription;
  const plan = service.plans.find((item) => item.name === subscription.planName) ?? service.plans[0];
  const cycle = (plan.cycles as string[]).includes(subscription.billingCycleId ?? "") ? (subscription.billingCycleId as BillingCycle["id"]) : plan.cycles[0];
  const startedAt = subscription.startedAt ?? new Date().toISOString();
  const next: Subscription = { ...subscription, planName: plan.name, billingCycleId: cycle, startedAt, autoRenew: subscription.autoRenew ?? false };
  if (recalculateExpiry || !next.expiresAt) next.expiresAt = addDays(startedAt, CYCLES[cycle].days);
  return next;
}

export function EditProfileSheet() {
  const t = useT();
  const profile = useApp((state) => state.profile)!;
  const steamImport = useApp((state) => Boolean(state.config?.steamImport));
  const setProfile = useApp((state) => state.setProfile);
  const push = useApp((state) => state.push);
  const pop = useApp((state) => state.pop);
  const toast = useApp((state) => state.toast);
  // ProfileViewModel.startEditing — seeds the draft before this component subscribes to it.
  useState(() => {
    const games: Partial<Record<Platform, GameTag[]>> = {};
    for (const id of PLATFORMS) {
      const names = profile.platformGames[id];
      if (names?.length) games[id] = names.map((name) => tagFor(profile, name));
    }
    useEditDraft.setState({
      username: profile.username ?? "",
      status: profile.status ?? "",
      platforms: PLATFORMS.filter((id) => profile.platforms.includes(id)),
      games,
      wanted: profile.wantedGames.map((name) => tagFor(profile, name)),
      active: PLATFORMS.find((id) => profile.platforms.includes(id)) ?? null,
      subscriptions: profile.subscriptions,
    });
    return null;
  });
  const draft = useEditDraft();
  const [saving, setSaving] = useState(false);

  // The Steam import opened from here saves straight to the profile: fold the games it
  // added into the draft, so saving this sheet afterwards does not drop them.
  const seenProfile = useRef(profile);
  useEffect(() => {
    const before = seenProfile.current;
    seenProfile.current = profile;
    if (before === profile) return;
    const state = useEditDraft.getState();
    const games = { ...state.games };
    let platforms = state.platforms;
    let active = state.active;
    let changed = false;
    for (const id of PLATFORMS) {
      const had = new Set((before.platformGames[id] ?? []).map(normalizeGameName));
      const list = games[id] ?? [];
      const keys = new Set(list.map((tag) => normalizeGameName(tag.name)));
      const added = (profile.platformGames[id] ?? []).filter((name) => !had.has(normalizeGameName(name)) && !keys.has(normalizeGameName(name)));
      if (!added.length) continue;
      games[id] = [...list, ...added.map((name) => tagFor(profile, name))].slice(0, LIMITS.gamesPerPlatform);
      platforms = PLATFORMS.filter((item) => item === id || platforms.includes(item));
      active = id;
      changed = true;
    }
    if (changed) useEditDraft.setState({ games, platforms, active });
  }, [profile]);

  const username = useMemo(() => sanitizeUsername(draft.username), [draft.username]);
  const canSave = Boolean(username) && draft.platforms.length > 0 && draft.status.length <= LIMITS.statusMax;
  // togglePlatform moves `active` off a removed platform, so it is null only when no platform is selected.
  const gamesTab: GamesTab = draft.active ?? "wanted";

  const togglePlatform = (id: Platform) => {
    platform.haptic("light");
    const selected = draft.platforms.includes(id);
    const platforms = selected ? draft.platforms.filter((item) => item !== id) : PLATFORMS.filter((item) => item === id || draft.platforms.includes(item));
    let active = draft.active;
    if (selected && active === id) active = platforms[0] ?? null;
    if (!selected && !active) active = id;
    useEditDraft.setState({ platforms, active });
  };

  const toggleGame = (tag: GameTag, tab: GamesTab) => {
    const list = tab === "wanted" ? draft.wanted : (draft.games[tab] ?? []);
    const key = normalizeGameName(tag.name);
    const next = list.some((item) => normalizeGameName(item.name) === key) ? list.filter((item) => normalizeGameName(item.name) !== key) : [...list, tag];
    useEditDraft.setState(tab === "wanted" ? { wanted: next } : { games: { ...draft.games, [tab]: next } });
  };

  const openSubscription = (name: string) => {
    platform.haptic("light");
    if (!draft.subscriptions.some((item) => item.name === name)) {
      if (draft.subscriptions.length >= LIMITS.subscriptions) return;
      const added = normalizeSubscription({ id: crypto.randomUUID(), name }, true);
      useEditDraft.setState({ subscriptions: [...draft.subscriptions, added] });
    }
    push({ type: "subscription", name });
  };

  const save = async () => {
    if (!username) return toast(t("profile.error.username"), "error");
    if (!draft.platforms.length) return toast(t("profile.error.platform.required"), "error");
    if (draft.status.length > LIMITS.statusMax) return toast(t("profile.error.status.length"), "error");
    setSaving(true);
    try {
      const gameMetadata = { ...useApp.getState().profile!.gameMetadata };
      const addMetadata = (tags: GameTag[]) => {
        for (const tag of tags) {
          const key = normalizeGameName(tag.name);
          const known = gameMetadata[key];
          gameMetadata[key] = {
            name: tag.name,
            coverUrl: tag.coverUrl ?? known?.coverUrl ?? null,
            rawgId: tag.rawgId ?? known?.rawgId ?? null,
            steamAppId: tag.steamAppId ?? known?.steamAppId ?? null,
          };
        }
      };
      const platformGames: Partial<Record<Platform, string[]>> = {};
      for (const id of draft.platforms) {
        const tags = draft.games[id] ?? [];
        addMetadata(tags);
        if (tags.length) platformGames[id] = tags.map((tag) => tag.name);
      }
      addMetadata(draft.wanted);
      const updated = await api.updateMe({
        username,
        status: draft.status.trim() || null,
        platforms: draft.platforms,
        platformGames,
        wantedGames: draft.wanted.map((tag) => tag.name),
        gameMetadata,
        subscriptions: draft.subscriptions,
      });
      setProfile(updated);
      platform.haptic("success");
      pop();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setSaving(false);
    }
  };

  const tabs: GameTab[] = [
    ...draft.platforms.map((id) => ({ id, label: id, count: draft.games[id]?.length ?? 0 })),
    { id: "wanted" as const, label: t("profile.wanted"), count: draft.wanted.length },
  ];

  return (
    <Sheet
      title={t("profile.edit")}
      lead={
        <button className="btn-plain secondary" onClick={pop}>
          {t("cancel")}
        </button>
      }
      trail={
        <button className="btn-plain" style={{ fontWeight: 600 }} disabled={saving || !canSave} onClick={save}>
          {saving ? <Spinner size={18} /> : t("save")}
        </button>
      }
    >
      <div className="container col edit-profile">
        <div className="edit-avatar">
          <span className="glow" aria-hidden />
          <button className="pic" onClick={() => push({ type: "avatar" })} aria-label={t("profile.change.avatar")}>
            <Avatar url={profile.avatarUrl} size={104} />
            <span className="camera">
              <Camera size={15} strokeWidth={2.4} />
            </span>
          </button>
          <button className="capsule-btn change" onClick={() => push({ type: "avatar" })}>
            <ImageIcon size={13} strokeWidth={2.6} /> {t("profile.change.avatar")}
          </button>
        </div>

        <EditField title={t("edit.about")}>
          <div className="edit-card">
            <label className="edit-row">
              <span className="ico">
                <AtSign size={17} strokeWidth={2.4} />
              </span>
              <span className="col grow" style={{ gap: 2, minWidth: 0 }}>
                <span className="label">{t("profile.username")}</span>
                <input
                  value={draft.username}
                  maxLength={LIMITS.usernameMax}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder={t("profile.username")}
                  onChange={(event) => useEditDraft.setState({ username: event.target.value })}
                />
              </span>
            </label>
            <label className="edit-row">
              <span className="ico">
                <Hash size={17} strokeWidth={2.4} />
              </span>
              <span className="col grow" style={{ gap: 2, minWidth: 0 }}>
                <span className="label">{t("profile.status")}</span>
                <input value={draft.status} maxLength={LIMITS.statusMax} placeholder={t("profile.status.placeholder")} onChange={(event) => useEditDraft.setState({ status: event.target.value })} />
              </span>
              {draft.status.length > LIMITS.statusMax * 0.7 && (
                <span className={`edit-counter ${draft.status.length >= LIMITS.statusMax ? "full" : ""}`}>
                  {draft.status.length}/{LIMITS.statusMax}
                </span>
              )}
            </label>
          </div>
          {draft.username.trim() && !username && <span style={{ fontSize: 13, color: "var(--red)", margin: "0 4px" }}>{t("error.invalid_username")}</span>}
        </EditField>

        <EditField title={t("profile.platforms")} hint={t("edit.platforms.hint")}>
          <div className="platform-picks">
            {PLATFORMS.map((id) => {
              const selected = draft.platforms.includes(id);
              return (
                <button key={id} className={`platform-pick ${selected ? "selected" : ""}`} style={{ ["--brand" as string]: PLATFORM_INFO[id].color }} onClick={() => togglePlatform(id)} aria-pressed={selected}>
                  <span className="top">
                    <PlatformMark platform={id} size={36} />
                    <CheckMark on={selected} />
                  </span>
                  <span className="name">{id}</span>
                </button>
              );
            })}
          </div>
        </EditField>

        {(draft.platforms.length > 0 || profile.wantedGames.length > 0 || steamImport) && (
          <EditField title={t("profile.games")} hint={t("edit.games.hint")}>
            <div className="col" style={{ gap: 14 }}>
              {/* Above the tabs, so it is there whichever tab is open; the import adds Steam itself if needed. */}
              {steamImport && (
                <button className="steam-import-row" onClick={() => push({ type: "steamImport" })}>
                  <span className="mark">
                    <BrandIcon file="steam.svg" size={20} />
                  </span>
                  <span className="col grow" style={{ gap: 2, minWidth: 0 }}>
                    <span className="t">{t("game.picker.steam")}</span>
                    <span className="s">{t("game.picker.steam.hint")}</span>
                  </span>
                  <ChevronRight size={18} strokeWidth={2.4} className="secondary" />
                </button>
              )}
              <GamePlatformTabs tabs={tabs} active={gamesTab} onChange={(id) => useEditDraft.setState({ active: id })} label={t("profile.games")} />
              <GamePicker
                key={gamesTab}
                selected={gamesTab === "wanted" ? draft.wanted : (draft.games[gamesTab] ?? [])}
                limit={gamesTab === "wanted" ? LIMITS.wantedGames : LIMITS.gamesPerPlatform}
                chipColor={gamesTab === "wanted" ? "var(--primary)" : platformColor(gamesTab)}
                onToggle={(tag) => toggleGame(tag, gamesTab)}
              />
            </div>
          </EditField>
        )}

        <EditField title={t("profile.subscriptions")}>
          <div className="col" style={{ gap: 8 }}>
            {SUBSCRIPTION_SERVICES.map((service) => {
              const existing = draft.subscriptions.find((item) => item.name === service.name);
              return (
                <button key={service.name} className={`check-row sub-row ${existing ? "selected" : ""}`} onClick={() => openSubscription(service.name)}>
                  <span className="sub-icon">{service.brand ? <BrandIcon file={service.brand} size={20} /> : <Sparkles size={18} />}</span>
                  <span className="grow col" style={{ gap: 2, minWidth: 0 }}>
                    <span className="ellipsis" style={{ fontSize: 16, fontWeight: 600 }}>
                      {service.name}
                    </span>
                    {existing && <SubscriptionSummary subscription={existing} />}
                  </span>
                  <CheckMark on={Boolean(existing)} />
                </button>
              );
            })}
          </div>
        </EditField>
      </div>
    </Sheet>
  );
}

function SubscriptionSummary({ subscription }: { subscription: Subscription }) {
  const t = useT();
  const language = useI18n((state) => state.language);
  const text = subscription.planName
    ? subscription.planName
    : subscription.expiresAt
      ? t("subscription.expires", new Date(subscription.expiresAt).toLocaleDateString(language, { day: "numeric", month: "short", year: "numeric" }))
      : null;
  if (!text) return null;
  return (
    <span className="secondary ellipsis" style={{ fontSize: 13 }}>
      {text}
    </span>
  );
}

function EditField({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="col" style={{ gap: 10 }}>
      <div className="col" style={{ gap: 3, margin: "0 4px" }}>
        <h3 className="edit-title">{title}</h3>
        {hint && <p className="edit-hint">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function CheckMark({ on }: { on: boolean }) {
  return on ? <SelectedDot size={22} /> : <Circle size={22} className="secondary" strokeWidth={1.6} />;
}

// ── SubscriptionEditorSheet (Form) ─────────────────────────────────────────

function toDateInput(iso: string | null | undefined): string {
  const date = iso ? new Date(iso) : new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function fromDateInput(value: string): string {
  return new Date(`${value}T12:00:00`).toISOString();
}

/** The date as text in a pill, like the iOS compact DatePicker; the native picker opens from a transparent input on top. */
function DatePill({ value, min, onChange }: { value: string | null | undefined; min?: string; onChange(value: string): void }) {
  const language = useI18n((state) => state.language);
  const label = new Date(value ?? Date.now()).toLocaleDateString(language, { day: "numeric", month: "short", year: "numeric" });
  return (
    <span className="date-pill">
      {label}
      <input
        type="date"
        min={min}
        value={toDateInput(value)}
        onClick={(event) => {
          try {
            event.currentTarget.showPicker?.();
          } catch {
            // Some embedded browsers refuse showPicker(); the input still opens its own picker.
          }
        }}
        onChange={(event) => event.target.value && onChange(event.target.value)}
      />
    </span>
  );
}

export function SubscriptionEditorSheet({ name }: { name: string }) {
  const t = useT();
  const pop = useApp((state) => state.pop);
  const stored = useEditDraft((state) => state.subscriptions.find((item) => item.name === name));
  const [draft, setDraft] = useState<Subscription>(() => normalizeSubscription(stored ?? { id: crypto.randomUUID(), name }, !stored?.expiresAt));
  const service = subscriptionService(name);
  const plan = service?.plans.find((item) => item.name === draft.planName) ?? service?.plans[0];
  const cycles = plan?.cycles ?? ["1m"];
  const progress = subscriptionProgress(draft);

  const recalc = (next: Subscription) => {
    const cycle = (next.billingCycleId as BillingCycle["id"]) ?? cycles[0];
    const start = next.startedAt ?? new Date().toISOString();
    return { ...next, startedAt: start, expiresAt: addDays(start, CYCLES[cycle].days) };
  };

  const save = () => {
    const subscriptions = useEditDraft.getState().subscriptions;
    useEditDraft.setState({ subscriptions: subscriptions.some((item) => item.name === name) ? subscriptions.map((item) => (item.name === name ? draft : item)) : [...subscriptions, draft] });
    pop();
  };

  const remove = () => {
    useEditDraft.setState({ subscriptions: useEditDraft.getState().subscriptions.filter((item) => item.name !== name) });
    pop();
  };

  return (
    <Sheet
      title={t("subscription.edit")}
      lead={
        <button className="btn-plain secondary" onClick={pop}>
          {t("cancel")}
        </button>
      }
      trail={
        <button className="btn-plain" style={{ fontWeight: 600 }} onClick={save}>
          {t("save")}
        </button>
      }
    >
      <div className="container form">
        <div className="group" style={{ marginTop: 20 }}>
          <div className="group-row" style={{ gap: 12 }}>
            <span style={{ color: "var(--accent-text)", display: "flex" }}>{service?.brand ? <BrandIcon file={service.brand} size={28} /> : <Sparkles size={26} />}</span>
            <span style={{ fontSize: 17, fontWeight: 600 }}>{name}</span>
          </div>
        </div>

        {service && plan && (
          <>
            <div className="group-title">{t("subscription.details")}</div>
            <div className="group">
              <label className="group-row">
                <span className="grow">{t("subscription.plan")}</span>
                <select className="form-select" value={plan.name} onChange={(event) => setDraft((current) => recalc(normalizeSubscription({ ...current, planName: event.target.value }, false)))}>
                  {service.plans.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="group-row">
                <span className="grow">{t("subscription.period")}</span>
                <select className="form-select" value={draft.billingCycleId ?? cycles[0]} onChange={(event) => setDraft((current) => recalc({ ...current, billingCycleId: event.target.value }))}>
                  {cycles.map((cycle) => (
                    <option key={cycle} value={cycle}>
                      {t(`subscription.period.${cycle}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        )}

        <div className="group-title">{t("subscription.duration")}</div>
        <div className="group">
          <label className="group-row">
            <span className="grow">{t("subscription.started")}</span>
            <DatePill value={draft.startedAt} onChange={(value) => setDraft((current) => recalc({ ...current, startedAt: fromDateInput(value) }))} />
          </label>
          <label className="group-row">
            <span className="grow">{t("subscription.expiry")}</span>
            <DatePill value={draft.expiresAt} min={toDateInput(draft.startedAt)} onChange={(value) => setDraft((current) => ({ ...current, expiresAt: fromDateInput(value) }))} />
          </label>
          <div className="group-row">
            <span className="grow">{t("subscription.auto.renew")}</span>
            <Toggle on={Boolean(draft.autoRenew)} onChange={(on) => setDraft((current) => ({ ...current, autoRenew: on }))} label={t("subscription.auto.renew")} />
          </div>
        </div>

        {progress && (
          <>
            <div className="group-title">{t("subscription.remaining")}</div>
            <div className="group">
              <div className="group-row col" style={{ alignItems: "stretch", gap: 8 }}>
                <div className="progress-bar">
                  <span style={{ width: `${progress.fraction * 100}%` }} />
                </div>
                <span className="secondary" style={{ fontSize: 13 }}>
                  {t("subscription.days.remaining", progress.days)}
                </span>
              </div>
            </div>
          </>
        )}

        <div className="group" style={{ marginTop: 34 }}>
          <button className="group-row destructive" onClick={remove}>
            {t("subscription.remove")}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
