// Port of UniShare/Features/Profile/EditProfileSheet.swift (+ SubscriptionEditorSheet).
import { AtSign, Camera, CheckCircle2, Circle, Hash, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { create } from "zustand";
import {
  CYCLES,
  LIMITS,
  PLATFORMS,
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
import { api, compressImage } from "../lib/api";
import { errorMessage, useI18n, useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { GamePicker } from "../components/GamePicker";
import { Avatar, BrandIcon, PlatformBadge, Sheet, Spinner, Toggle, platformColor } from "../components/ui";
import { subscriptionProgress, tagFor } from "./ProfileScreen";

interface EditDraft {
  username: string;
  status: string;
  platforms: Platform[];
  games: Partial<Record<Platform, GameTag[]>>;
  active: Platform | null;
  subscriptions: Subscription[];
}

/** Shared between the edit sheet and the subscription editor pushed on top of it. */
const useEditDraft = create<EditDraft>(() => ({ username: "", status: "", platforms: [], games: {}, active: null, subscriptions: [] }));

const DAY_MS = 86_400_000;

/** SubscriptionEditorSheet.normalizeDraft: valid plan / cycle, start date and expiry. */
function normalizeSubscription(subscription: Subscription, recalculateExpiry: boolean): Subscription {
  const service = subscriptionService(subscription.name);
  if (!service) return subscription;
  const plan = service.plans.find((item) => item.name === subscription.planName) ?? service.plans[0];
  const cycle = (plan.cycles as string[]).includes(subscription.billingCycleId ?? "") ? (subscription.billingCycleId as BillingCycle["id"]) : plan.cycles[0];
  const startedAt = subscription.startedAt ?? new Date().toISOString();
  const next: Subscription = { ...subscription, planName: plan.name, billingCycleId: cycle, startedAt, autoRenew: subscription.autoRenew ?? false };
  if (recalculateExpiry || !next.expiresAt) next.expiresAt = new Date(new Date(startedAt).getTime() + CYCLES[cycle].days * DAY_MS).toISOString();
  return next;
}

export function EditProfileSheet() {
  const t = useT();
  const profile = useApp((state) => state.profile)!;
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
      active: PLATFORMS.find((id) => profile.platforms.includes(id)) ?? null,
      subscriptions: profile.subscriptions,
    });
    return null;
  });
  const draft = useEditDraft();
  const [saving, setSaving] = useState(false);
  const [avatar, setAvatar] = useState<{ blob: Blob; url: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (avatar) URL.revokeObjectURL(avatar.url);
  }, [avatar]);

  const username = useMemo(() => sanitizeUsername(draft.username), [draft.username]);
  const canSave = Boolean(username) && draft.platforms.length > 0 && draft.status.length <= LIMITS.statusMax;

  const togglePlatform = (id: Platform) => {
    platform.haptic("light");
    const selected = draft.platforms.includes(id);
    const platforms = selected ? draft.platforms.filter((item) => item !== id) : PLATFORMS.filter((item) => item === id || draft.platforms.includes(item));
    let active = draft.active;
    if (selected && active === id) active = platforms[0] ?? null;
    if (!selected && !active) active = id;
    useEditDraft.setState({ platforms, active });
  };

  const toggleGame = (tag: GameTag, id: Platform) => {
    const list = draft.games[id] ?? [];
    const key = normalizeGameName(tag.name);
    const next = list.some((item) => normalizeGameName(item.name) === key) ? list.filter((item) => normalizeGameName(item.name) !== key) : [...list, tag];
    useEditDraft.setState({ games: { ...draft.games, [id]: next } });
  };

  const onAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const blob = await compressImage(file, 800);
    setAvatar({ blob, url: URL.createObjectURL(blob) });
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
      if (avatar) await api.uploadAvatar(avatar.blob);
      const gameMetadata = { ...profile.gameMetadata };
      const platformGames: Partial<Record<Platform, string[]>> = {};
      for (const id of draft.platforms) {
        const tags = draft.games[id] ?? [];
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
        if (tags.length) platformGames[id] = tags.map((tag) => tag.name);
      }
      const updated = await api.updateMe({
        username,
        status: draft.status.trim() || null,
        platforms: draft.platforms,
        platformGames,
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
      <div className="container col" style={{ gap: 24, padding: "8px 16px 32px" }}>
        <div className="col" style={{ alignItems: "center", gap: 10 }}>
          <button style={{ position: "relative" }} onClick={() => fileInput.current?.click()} aria-label={t("profile.change.avatar")}>
            {avatar ? <img src={avatar.url} alt="" style={{ width: 90, height: 90, borderRadius: "50%", objectFit: "cover" }} /> : <Avatar url={profile.avatarUrl} size={90} />}
            <span className="center" style={{ position: "absolute", right: 0, bottom: 0, width: 26, height: 26, borderRadius: "50%", background: "var(--primary)" }}>
              <Camera size={11} fill="#fff" color="var(--primary)" />
            </span>
          </button>
          <button className="btn-plain" style={{ fontSize: 14, padding: 0 }} onClick={() => fileInput.current?.click()}>
            {t("profile.change.avatar")}
          </button>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onAvatar} />
        </div>

        <EditField title={t("profile.username")}>
          <label className="field glass">
            <AtSign size={18} className="secondary" />
            <input
              value={draft.username}
              maxLength={LIMITS.usernameMax}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={t("profile.username")}
              onChange={(event) => useEditDraft.setState({ username: event.target.value })}
            />
          </label>
        </EditField>

        <EditField title={t("profile.status")}>
          <label className="field glass">
            <Hash size={18} className="secondary" />
            <input value={draft.status} maxLength={LIMITS.statusMax} placeholder={t("profile.status.placeholder")} onChange={(event) => useEditDraft.setState({ status: event.target.value })} />
          </label>
        </EditField>

        <EditField title={t("profile.platforms")}>
          <div className="col" style={{ gap: 8 }}>
            {PLATFORMS.map((id) => {
              const selected = draft.platforms.includes(id);
              return (
                <button key={id} className={`check-row glass ${selected ? "selected" : ""}`} style={{ padding: 12, borderRadius: 12 }} onClick={() => togglePlatform(id)} aria-pressed={selected}>
                  <PlatformBadge platform={id} size={28} />
                  <span className="grow ellipsis" style={{ fontSize: 14 }}>
                    {id}
                  </span>
                  <CheckMark on={selected} />
                </button>
              );
            })}
          </div>
        </EditField>

        {draft.platforms.length > 0 && (
          <EditField title={t("profile.games")}>
            <div className="col" style={{ gap: 12 }}>
              <div className="h-scroll" style={{ margin: 0, padding: 0, gap: 8 }}>
                {draft.platforms.map((id) => (
                  <button key={id} className={`platform-tab ${draft.active === id ? "active" : ""}`} onClick={() => useEditDraft.setState({ active: id })}>
                    <PlatformBadge platform={id} size={18} />
                    {id}
                  </button>
                ))}
              </div>
              {draft.active && (
                <GamePicker
                  key={draft.active}
                  selected={draft.games[draft.active] ?? []}
                  limit={LIMITS.gamesPerPlatform}
                  chipColor={platformColor(draft.active)}
                  onToggle={(tag) => toggleGame(tag, draft.active!)}
                />
              )}
            </div>
          </EditField>
        )}

        <EditField title={t("profile.subscriptions")}>
          <div className="col" style={{ gap: 8 }}>
            {SUBSCRIPTION_SERVICES.map((service) => {
              const existing = draft.subscriptions.find((item) => item.name === service.name);
              return (
                <button key={service.name} className={`check-row sub-row ${existing ? "selected" : ""}`} onClick={() => openSubscription(service.name)}>
                  <span style={{ width: 26, display: "flex", justifyContent: "center", color: "var(--accent-text)" }}>
                    {service.brand ? <BrandIcon file={service.brand} size={22} /> : <Sparkles size={20} />}
                  </span>
                  <span className="grow col" style={{ gap: 2, minWidth: 0 }}>
                    <span className="ellipsis" style={{ fontSize: 14, fontWeight: 500 }}>
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
    <span className="secondary ellipsis" style={{ fontSize: 11 }}>
      {text}
    </span>
  );
}

function EditField({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="col" style={{ gap: 8 }}>
      <span className="caption">{title}</span>
      {children}
    </div>
  );
}

function CheckMark({ on }: { on: boolean }) {
  return on ? <CheckCircle2 size={22} fill="var(--primary)" color="var(--bg)" strokeWidth={2.2} /> : <Circle size={22} className="secondary" strokeWidth={1.6} />;
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
    return { ...next, startedAt: start, expiresAt: new Date(new Date(start).getTime() + CYCLES[cycle].days * DAY_MS).toISOString() };
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
        <button className="btn-plain" onClick={pop}>
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
            <input type="date" className="date-pill" value={toDateInput(draft.startedAt)} onChange={(event) => event.target.value && setDraft((current) => recalc({ ...current, startedAt: fromDateInput(event.target.value) }))} />
          </label>
          <label className="group-row">
            <span className="grow">{t("subscription.expiry")}</span>
            <input
              type="date"
              className="date-pill"
              min={toDateInput(draft.startedAt)}
              value={toDateInput(draft.expiresAt)}
              onChange={(event) => event.target.value && setDraft((current) => ({ ...current, expiresAt: fromDateInput(event.target.value) }))}
            />
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
