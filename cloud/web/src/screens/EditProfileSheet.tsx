import { Camera, Check, ChevronDown, Trash2 } from "lucide-react";
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  CYCLES,
  LIMITS,
  PLATFORMS,
  SUBSCRIPTION_SERVICES,
  normalizeGameName,
  sanitizeUsername,
  subscriptionService,
  type GameTag,
  type Platform,
  type Subscription,
} from "@unishare/shared";
import { useApp } from "../app/store";
import { api, compressImage } from "../lib/api";
import { errorMessage, useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { GamePicker } from "../components/GamePicker";
import { Avatar, BrandIcon, PlatformBadge, Sheet, Spinner, Toggle } from "../components/ui";
import { tagFor } from "./ProfileScreen";

function toggleTag(list: GameTag[], tag: GameTag, limit: number): GameTag[] {
  const key = normalizeGameName(tag.name);
  if (list.some((item) => normalizeGameName(item.name) === key)) return list.filter((item) => normalizeGameName(item.name) !== key);
  return list.length >= limit ? list : [...list, tag];
}

function dateInputValue(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

export function EditProfileSheet() {
  const t = useT();
  const profile = useApp((state) => state.profile)!;
  const setProfile = useApp((state) => state.setProfile);
  const toast = useApp((state) => state.toast);
  const toastError = useApp((state) => state.toastError);
  const pop = useApp((state) => state.pop);

  const [username, setUsername] = useState(profile.username ?? "");
  const [status, setStatus] = useState(profile.status ?? "");
  const [platforms, setPlatforms] = useState<Platform[]>(profile.platforms);
  const [platformGames, setPlatformGames] = useState<Partial<Record<Platform, GameTag[]>>>(() => {
    const result: Partial<Record<Platform, GameTag[]>> = {};
    for (const id of PLATFORMS) {
      const names = profile.platformGames[id];
      if (names?.length) result[id] = names.map((name) => tagFor(profile, name));
    }
    return result;
  });
  const [wanted, setWanted] = useState<GameTag[]>(profile.wantedGames.map((name) => tagFor(profile, name)));
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(profile.subscriptions);
  const [openPlatform, setOpenPlatform] = useState<Platform | "wanted" | null>(null);
  const [saving, setSaving] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const validUsername = useMemo(() => sanitizeUsername(username), [username]);

  const togglePlatform = (id: Platform) => {
    platform.haptic("selection");
    setPlatforms((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const onAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setAvatarUploading(true);
    try {
      await api.uploadAvatar(await compressImage(file, 800));
      const fresh = await api.me();
      setProfile(fresh);
    } catch (error) {
      toastError(error);
    } finally {
      setAvatarUploading(false);
    }
  };

  const save = async () => {
    if (!validUsername) {
      setUsernameError(t("error.invalid_username"));
      return;
    }
    setSaving(true);
    setUsernameError(null);
    const gameMetadata = { ...profile.gameMetadata };
    const remember = (tag: GameTag) => {
      const key = normalizeGameName(tag.name);
      const known = gameMetadata[key];
      gameMetadata[key] = { name: tag.name, coverUrl: tag.coverUrl ?? known?.coverUrl ?? null, rawgId: tag.rawgId ?? known?.rawgId ?? null };
    };
    const names: Partial<Record<Platform, string[]>> = {};
    for (const id of platforms) {
      const tags = platformGames[id] ?? [];
      tags.forEach(remember);
      if (tags.length) names[id] = tags.map((tag) => tag.name);
    }
    wanted.forEach(remember);
    try {
      const updated = await api.updateMe({
        username: validUsername,
        status: status.trim() || null,
        platforms,
        platformGames: names,
        wantedGames: wanted.map((tag) => tag.name),
        gameMetadata,
        subscriptions,
      });
      setProfile(updated);
      toast(t("common.saved"), "success");
      pop();
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "username_taken" || code === "invalid_username") setUsernameError(errorMessage(error));
      else toastError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      full
      wide
      title={t("profile.edit")}
      footer={
        <button className="btn btn-primary btn-block" disabled={saving || platforms.length === 0 || !validUsername} onClick={save}>
          {saving ? <Spinner size={20} /> : <Check size={18} />} {t("save")}
        </button>
      }
    >
      <div className="col" style={{ gap: 18 }}>
        <div className="center" style={{ flexDirection: "column", gap: 10 }}>
          <button style={{ position: "relative" }} onClick={() => fileInput.current?.click()}>
            <Avatar url={profile.avatarUrl} name={username || profile.username} size={96} ring />
            <span
              className="center"
              style={{ position: "absolute", right: -2, bottom: -2, width: 32, height: 32, borderRadius: "50%", background: "var(--primary)", color: "#fff", border: "3px solid var(--bg)" }}
            >
              {avatarUploading ? <Spinner size={14} /> : <Camera size={15} />}
            </span>
          </button>
          <button className="btn-ghost btn" onClick={() => fileInput.current?.click()}>
            {t("profile.change.avatar")}
          </button>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onAvatar} />
        </div>

        <div>
          <label className="label" htmlFor="edit-username">{t("profile.username")}</label>
          <input
            id="edit-username"
            className="field"
            value={username}
            maxLength={LIMITS.usernameMax}
            autoComplete="off"
            autoCapitalize="off"
            onChange={(event) => {
              setUsername(event.target.value);
              setUsernameError(null);
            }}
            placeholder={t("onboarding.username.placeholder")}
          />
          {usernameError ? <div className="error-text">{usernameError}</div> : !validUsername && username && <div className="error-text">{t("error.invalid_username")}</div>}
        </div>

        <div>
          <label className="label" htmlFor="edit-status">{t("profile.status")}</label>
          <textarea
            id="edit-status"
            className="field"
            rows={2}
            maxLength={LIMITS.statusMax}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            placeholder={t("profile.status.placeholder")}
          />
          <div className="hint" style={{ textAlign: "right" }}>{status.length}/{LIMITS.statusMax}</div>
        </div>

        <div>
          <span className="label">{t("profile.platforms")}</span>
          <div className="platform-grid">
            {PLATFORMS.map((id) => (
              <button key={id} className={`platform-tile glass ${platforms.includes(id) ? "selected" : ""}`} onClick={() => togglePlatform(id)} aria-pressed={platforms.includes(id)}>
                <PlatformBadge platform={id} size={34} />
                <span className="grow">{id}</span>
                {platforms.includes(id) && <Check size={18} color="var(--primary)" />}
              </button>
            ))}
          </div>
          {platforms.length === 0 && <div className="error-text">{t("error.platform_required")}</div>}
        </div>

        <div className="col" style={{ gap: 8 }}>
          <span className="label">{t("profile.games")}</span>
          {platforms.map((id) => {
            const tags = platformGames[id] ?? [];
            const open = openPlatform === id;
            return (
              <div key={id} className="glass" style={{ borderRadius: 20, padding: 12 }}>
                <button className="row" style={{ width: "100%", textAlign: "left" }} onClick={() => setOpenPlatform(open ? null : id)}>
                  <PlatformBadge platform={id} size={30} />
                  <b className="grow">{t("onboarding.games.for", id)}</b>
                  <span className="pill">{tags.length}</span>
                  <ChevronDown size={18} style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 0.2s" }} />
                </button>
                {open && (
                  <div style={{ marginTop: 12 }}>
                    <GamePicker
                      selected={tags}
                      limit={LIMITS.gamesPerPlatform}
                      onToggle={(tag) => setPlatformGames((current) => ({ ...current, [id]: toggleTag(current[id] ?? [], tag, LIMITS.gamesPerPlatform) }))}
                    />
                  </div>
                )}
              </div>
            );
          })}
          <div className="glass" style={{ borderRadius: 20, padding: 12 }}>
            <button className="row" style={{ width: "100%", textAlign: "left" }} onClick={() => setOpenPlatform(openPlatform === "wanted" ? null : "wanted")}>
              <b className="grow">{t("profile.wanted")}</b>
              <span className="pill">{wanted.length}</span>
              <ChevronDown size={18} style={{ transform: openPlatform === "wanted" ? "rotate(180deg)" : undefined, transition: "transform 0.2s" }} />
            </button>
            {openPlatform === "wanted" && (
              <div style={{ marginTop: 12 }}>
                <GamePicker selected={wanted} limit={LIMITS.wantedGames} onToggle={(tag) => setWanted((current) => toggleTag(current, tag, LIMITS.wantedGames))} />
              </div>
            )}
          </div>
        </div>

        <SubscriptionsEditor value={subscriptions} onChange={setSubscriptions} />
      </div>
    </Sheet>
  );
}

function SubscriptionsEditor({ value, onChange }: { value: Subscription[]; onChange(value: Subscription[]): void }) {
  const t = useT();
  const enabled = new Map(value.map((item) => [item.name, item]));

  const toggleService = (name: string) => {
    platform.haptic("selection");
    if (enabled.has(name)) {
      onChange(value.filter((item) => item.name !== name));
      return;
    }
    if (value.length >= LIMITS.subscriptions) return;
    const service = subscriptionService(name);
    const plan = service?.plans[0];
    onChange([
      ...value,
      {
        id: crypto.randomUUID(),
        name,
        planName: plan?.name ?? null,
        billingCycleId: plan?.cycles[0] ?? null,
        startedAt: new Date().toISOString(),
        expiresAt: null,
        autoRenew: true,
      },
    ]);
  };

  const update = (name: string, patch: Partial<Subscription>) => {
    onChange(value.map((item) => (item.name === name ? { ...item, ...patch } : item)));
  };

  return (
    <div className="col" style={{ gap: 8 }}>
      <span className="label">{t("profile.subscriptions")}</span>
      <div className="hint" style={{ marginTop: -4, marginBottom: 4 }}>{t("onboarding.subscriptions.hint")}</div>
      <div className="chips">
        {SUBSCRIPTION_SERVICES.map((service) => (
          <button key={service.name} className={`chip ${enabled.has(service.name) ? "selected" : ""}`} onClick={() => toggleService(service.name)}>
            {service.brand && <BrandIcon file={service.brand} size={15} />}
            {service.name}
          </button>
        ))}
      </div>
      {value.map((subscription) => {
        const service = subscriptionService(subscription.name);
        const plan = service?.plans.find((item) => item.name === subscription.planName) ?? service?.plans[0];
        return (
          <div key={subscription.id} className="glass col" style={{ borderRadius: 20, padding: 14, gap: 12 }}>
            <div className="row">
              {service?.brand && <BrandIcon file={service.brand} size={20} />}
              <b className="grow">{subscription.name}</b>
              <button className="icon-btn small" aria-label={t("subscription.remove")} onClick={() => toggleService(subscription.name)}>
                <Trash2 size={16} color="var(--danger)" />
              </button>
            </div>
            {service && (
              <div>
                <span className="label">{t("subscription.plan")}</span>
                <div className="chips">
                  {service.plans.map((item) => (
                    <button
                      key={item.name}
                      className={`chip ${plan?.name === item.name ? "selected" : ""}`}
                      onClick={() => update(subscription.name, { planName: item.name, billingCycleId: (item.cycles as string[]).includes(subscription.billingCycleId ?? "") ? subscription.billingCycleId : item.cycles[0] })}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {plan && (
              <div>
                <span className="label">{t("subscription.period")}</span>
                <div className="chips">
                  {plan.cycles.map((cycle) => (
                    <button
                      key={cycle}
                      className={`chip ${subscription.billingCycleId === cycle ? "selected" : ""}`}
                      onClick={() => {
                        const started = subscription.startedAt ? new Date(subscription.startedAt) : new Date();
                        const expires = new Date(started.getTime() + CYCLES[cycle].days * 86_400_000);
                        update(subscription.name, { billingCycleId: cycle, startedAt: started.toISOString(), expiresAt: expires.toISOString() });
                      }}
                    >
                      {t(`subscription.period.${cycle}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
              <div className="grow" style={{ minWidth: 160 }}>
                <span className="label">{t("subscription.expiry")}</span>
                <input
                  type="date"
                  className="field"
                  value={dateInputValue(subscription.expiresAt)}
                  onChange={(event) => update(subscription.name, { expiresAt: event.target.value ? new Date(`${event.target.value}T12:00:00`).toISOString() : null })}
                />
              </div>
              <div className="row" style={{ gap: 10, paddingTop: 18 }}>
                <span style={{ fontWeight: 700 }}>{t("subscription.auto.renew")}</span>
                <Toggle on={Boolean(subscription.autoRenew)} onChange={(on) => update(subscription.name, { autoRenew: on })} label={t("subscription.auto.renew")} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
