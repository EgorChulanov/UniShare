import { AnimatePresence, motion } from "framer-motion";
import { AtSign, Camera, ChevronLeft, Circle, PlusCircle, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  AVATAR_PRESETS,
  AVATAR_PRESET_PREFIX,
  LIMITS,
  PLATFORMS,
  SUBSCRIPTION_SERVICES,
  normalizeGameName,
  sanitizePickedAvatar,
  sanitizeUsername,
  suggestUsername,
  type GameTag,
  type Platform,
} from "@unishare/shared";
import { useApp } from "../app/store";
import { api } from "../lib/api";
import { errorMessage, useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { Avatar, BrandIcon, PlatformBadge, PresetAvatar, SelectedDot, Spinner, platformColor } from "../components/ui";
import { GamePicker, GamePlatformTabs } from "../components/GamePicker";
import { AvatarPickerSheet, type AvatarChoice } from "./AvatarPickerSheet";

/** One-tap picks on the avatar step; the picker has the rest. */
const QUICK_PRESETS = AVATAR_PRESETS.slice(0, 5);

const STEPS = ["username", "avatar", "platform", "games", "skills", "subscriptions"] as const;
type Step = (typeof STEPS)[number];

const TITLES: Record<Step, string> = {
  username: "onboarding.title.username",
  avatar: "onboarding.title.avatar",
  platform: "onboarding.title.platform",
  games: "onboarding.title.games",
  skills: "onboarding.title.skills",
  subscriptions: "onboarding.title.subscriptions",
};

/** Port of UniShare/Features/Onboarding/OnboardingView.swift (six steps). */
export function Onboarding() {
  const t = useT();
  const profile = useApp((state) => state.profile)!;
  const setProfile = useApp((state) => state.setProfile);
  const toastError = useApp((state) => state.toastError);

  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [username, setUsername] = useState(
    profile.username ?? suggestUsername(profile.suggestions?.username, profile.identities[0]?.displayName) ?? "",
  );
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatarUrl ?? null);
  const [avatarFile, setAvatarFile] = useState<Blob | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>(profile.platforms);
  const [activePlatform, setActivePlatform] = useState<Platform | null>(profile.platforms[0] ?? null);
  const [games, setGames] = useState<Partial<Record<Platform, GameTag[]>>>({});
  const [skills, setSkills] = useState<string[]>(profile.skills);
  const [skillInput, setSkillInput] = useState("");
  const [subscriptions, setSubscriptions] = useState<string[]>(profile.subscriptions.map((sub) => sub.name));
  const [saving, setSaving] = useState(false);
  const [avatarPicker, setAvatarPicker] = useState(false);

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const platformPhoto = profile.suggestions?.avatarUrl ?? null;

  useEffect(() => {
    platform.setClosingConfirmation(true);
    return () => platform.setClosingConfirmation(false);
  }, []);

  useEffect(() => {
    if (!avatarFile) return;
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  useEffect(() => {
    if (!activePlatform || !platforms.includes(activePlatform)) setActivePlatform(platforms[0] ?? null);
  }, [platforms, activePlatform]);

  const canContinue = useMemo(() => {
    if (step === "username") return Boolean(sanitizeUsername(username));
    if (step === "platform") return platforms.length > 0;
    return true;
  }, [step, username, platforms]);

  const go = (delta: number) => {
    platform.haptic("light");
    setDirection(delta);
    setStepIndex((index) => Math.min(Math.max(index + delta, 0), STEPS.length - 1));
  };

  const next = async () => {
    if (step === "username") {
      const clean = sanitizeUsername(username);
      if (!clean) return setUsernameError(t("error.invalid_username"));
      const { available } = await api.usernameAvailable(clean).catch(() => ({ available: true }));
      if (!available) return setUsernameError(t("error.username_taken"));
      setUsernameError(null);
    }
    if (isLast) return void finish();
    go(1);
  };

  const finish = async () => {
    setSaving(true);
    try {
      // Presets and game art are saved through their own endpoint; PATCH only takes photo URLs.
      const avatarPatch: { avatarUrl?: string | null } = {};
      // The picker already compressed the photo.
      if (avatarFile) avatarPatch.avatarUrl = (await api.uploadAvatar(avatarFile)).avatarUrl;
      else if (avatarUrl !== profile.avatarUrl) {
        if (avatarUrl && sanitizePickedAvatar(avatarUrl)) await api.pickAvatar(avatarUrl);
        else avatarPatch.avatarUrl = avatarUrl;
      }
      const platformGames: Partial<Record<Platform, string[]>> = {};
      const gameMetadata: Record<string, GameTag> = {};
      for (const selected of platforms) {
        const tags = games[selected] ?? [];
        if (tags.length) platformGames[selected] = tags.map((tag) => tag.name);
        for (const tag of tags) gameMetadata[normalizeGameName(tag.name)] = tag;
      }
      const updated = await api.updateMe({
        username: sanitizeUsername(username)!,
        ...avatarPatch,
        platforms,
        platformGames,
        gameMetadata,
        skills,
        subscriptions: subscriptions.map((name) => ({ id: crypto.randomUUID(), name })),
        onboardingComplete: true,
      });
      platform.haptic("success");
      useApp.setState({ showGreeting: true });
      setProfile(updated);
    } catch (error) {
      if ((error as { code?: string }).code === "username_taken" || (error as { code?: string }).code === "invalid_username") {
        setUsernameError(errorMessage(error));
        setDirection(-1);
        setStepIndex(0);
      }
      toastError(error);
    } finally {
      setSaving(false);
    }
  };

  const toggleGame = (tag: GameTag) => {
    if (!activePlatform) return;
    setGames((current) => {
      const list = current[activePlatform] ?? [];
      const key = normalizeGameName(tag.name);
      const exists = list.some((game) => normalizeGameName(game.name) === key);
      return { ...current, [activePlatform]: exists ? list.filter((game) => normalizeGameName(game.name) !== key) : [...list, tag] };
    });
  };

  const chooseAvatar = (choice: AvatarChoice) => {
    if (choice.kind === "file") return setAvatarFile(choice.blob);
    setAvatarFile(null);
    setAvatarPreview(null);
    setAvatarUrl(choice.url);
  };

  const addSkill = () => {
    const value = skillInput.trim().slice(0, 40);
    if (value.length < 2 || skills.some((skill) => skill.toLowerCase() === value.toLowerCase()) || skills.length >= LIMITS.skills) return;
    platform.haptic("selection");
    setSkills([...skills, value]);
    setSkillInput("");
  };

  const platformTabs = PLATFORMS.filter((id) => platforms.includes(id));

  return (
    <div className="onboarding">
      <div className="progress-caps" style={{ padding: "calc(var(--safe-top) + 16px) 24px 8px" }}>
        {STEPS.map((item, index) => (
          <span key={item} className={index <= stepIndex ? "on" : ""} />
        ))}
      </div>

      <div className="onboarding-body">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={step}
            className="col"
            style={{ gap: 24, padding: "24px 24px 16px", maxWidth: 560, margin: "0 auto", width: "100%" }}
            initial={{ opacity: 0, x: direction * 36 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -36 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>{t(TITLES[step])}</h1>

            {step === "username" && (
              <div className="col" style={{ gap: 16, alignItems: "center" }}>
                <label className={`field glass ${sanitizeUsername(username) ? "gradient-border" : ""}`} style={{ width: "100%" }}>
                  <AtSign size={18} className="secondary" />
                  <input
                    value={username}
                    autoFocus
                    maxLength={LIMITS.usernameMax}
                    autoCapitalize="off"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t("onboarding.username.placeholder")}
                    onChange={(event) => {
                      setUsername(event.target.value);
                      setUsernameError(null);
                    }}
                    onKeyDown={(event) => event.key === "Enter" && canContinue && void next()}
                  />
                </label>
                {usernameError ? (
                  <span style={{ fontSize: 13, color: "var(--red)" }}>{usernameError}</span>
                ) : (
                  username.length > 0 &&
                  username.trim().length < 3 && <span style={{ fontSize: 13, color: "var(--accent-text)" }}>{t("onboarding.username.minimum")}</span>
                )}
              </div>
            )}

            {step === "avatar" && (
              <div className="col" style={{ alignItems: "center", gap: 22 }}>
                <button className="onboarding-avatar" onClick={() => setAvatarPicker(true)} aria-label={t("avatar.choose")}>
                  <span className="gradient-border" style={{ borderRadius: "50%", padding: 3, display: "flex" }}>
                    <Avatar url={avatarPreview ?? avatarUrl} size={140} />
                  </span>
                  <span className="camera">
                    <Camera size={17} strokeWidth={2.4} />
                  </span>
                </button>
                <div className="quick-presets" role="group" aria-label={t("avatar.presets")}>
                  {QUICK_PRESETS.map((preset) => {
                    const value = `${AVATAR_PRESET_PREFIX}${preset.id}`;
                    const selected = !avatarFile && avatarUrl === value;
                    return (
                      <button
                        key={preset.id}
                        className={`avatar-tile ${selected ? "selected" : ""}`}
                        aria-pressed={selected}
                        aria-label={t(`avatar.preset.${preset.id}`)}
                        onClick={() => {
                          platform.haptic("selection");
                          chooseAvatar({ kind: "url", url: value });
                        }}
                      >
                        <span className="disc">
                          <PresetAvatar preset={preset} size={52} />
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button className="glass row" style={{ gap: 8, padding: "14px 24px", borderRadius: 16, color: "var(--accent-text)", fontSize: 15, fontWeight: 700 }} onClick={() => setAvatarPicker(true)}>
                  <Sparkles size={18} /> {t("avatar.choose")}
                </button>
                {platformPhoto && (avatarFile || avatarUrl !== platformPhoto) && (
                  <button
                    className="btn-plain"
                    style={{ fontSize: 15 }}
                    onClick={() => {
                      setAvatarFile(null);
                      setAvatarPreview(null);
                      setAvatarUrl(platformPhoto);
                    }}
                  >
                    {t("onboarding.avatar.platform")}
                  </button>
                )}
                <span className="secondary" style={{ fontSize: 13, textAlign: "center" }}>
                  {t("avatar.onboarding.hint")}
                </span>
              </div>
            )}

            {step === "platform" && (
              <div className="col" style={{ gap: 10 }}>
                {PLATFORMS.map((id) => {
                  const selected = platforms.includes(id);
                  return (
                    <button
                      key={id}
                      className={`check-row glass ${selected ? "selected-2" : ""}`}
                      style={{ padding: "14px 16px", borderRadius: 14, gap: 14 }}
                      onClick={() => {
                        platform.haptic("light");
                        setPlatforms(selected ? platforms.filter((p) => p !== id) : [...platforms, id]);
                      }}
                    >
                      <PlatformBadge platform={id} size={32} />
                      <span className="grow ellipsis" style={{ fontSize: 15, fontWeight: 500 }}>
                        {id}
                      </span>
                      {selected ? <SelectedDot size={22} /> : <Circle size={22} strokeWidth={1.6} className="secondary" />}
                    </button>
                  );
                })}
              </div>
            )}

            {step === "games" && activePlatform && (
              <div className="col" style={{ gap: 16 }}>
                <GamePlatformTabs
                  tabs={platformTabs.map((id) => ({ id, label: id, count: games[id]?.length ?? 0 }))}
                  active={activePlatform}
                  onChange={(id) => id !== "wanted" && setActivePlatform(id)}
                  label={t("onboarding.title.games")}
                />
                <GamePicker key={activePlatform} selected={games[activePlatform] ?? []} onToggle={toggleGame} limit={LIMITS.gamesPerPlatform} chipColor={platformColor(activePlatform)} />
              </div>
            )}

            {step === "skills" && (
              <div className="col" style={{ gap: 16 }}>
                <form
                  className="field glass"
                  onSubmit={(event) => {
                    event.preventDefault();
                    addSkill();
                  }}
                >
                  <input value={skillInput} onChange={(event) => setSkillInput(event.target.value)} placeholder={t("onboarding.skills.placeholder")} maxLength={40} />
                  <button type="submit" aria-label="add" style={{ display: "flex", color: "var(--primary)" }}>
                    <PlusCircle size={24} fill="currentColor" color="var(--bg)" />
                  </button>
                </form>
                <div className="flow">
                  {skills.map((skill) => (
                    <span key={skill} className="chip" style={{ background: "color-mix(in srgb, var(--primary) 20%, transparent)", fontSize: 14 }}>
                      {skill}
                      <button onClick={() => setSkills(skills.filter((item) => item !== skill))} aria-label={t("delete")} style={{ display: "flex" }} className="secondary">
                        <X size={12} strokeWidth={3} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {step === "subscriptions" && (
              <div className="col" style={{ gap: 10 }}>
                {SUBSCRIPTION_SERVICES.map((service) => {
                  const selected = subscriptions.includes(service.name);
                  return (
                    <button
                      key={service.name}
                      className={`check-row glass ${selected ? "selected" : ""}`}
                      style={{ padding: 16, borderRadius: 14 }}
                      onClick={() => {
                        platform.haptic("light");
                        setSubscriptions(selected ? subscriptions.filter((name) => name !== service.name) : [...subscriptions, service.name]);
                      }}
                    >
                      <span style={{ width: 28, display: "flex", justifyContent: "center", color: "var(--accent-text)" }}>{service.brand && <BrandIcon file={service.brand} size={22} />}</span>
                      <span className="grow ellipsis" style={{ fontSize: 15 }}>
                        {service.name}
                      </span>
                      {selected ? <SelectedDot size={22} /> : <Circle size={22} strokeWidth={1.6} className="secondary" />}
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="row onboarding-nav">
        {stepIndex > 0 && (
          <button className="glass center" style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0 }} onClick={() => go(-1)} aria-label={t("back")}>
            <ChevronLeft size={22} strokeWidth={2.6} />
          </button>
        )}
        <button className="btn-primary" disabled={!canContinue || saving} onClick={() => void next()}>
          {saving ? <Spinner size={20} /> : isLast ? t("onboarding.complete") : t("next")}
        </button>
        {step === "games" && (
          <button className="btn-plain secondary" style={{ fontSize: 14, flexShrink: 0 }} onClick={() => go(1)}>
            {t("skip")}
          </button>
        )}
      </div>

      {/* Overlays live in the main shell, which onboarding does not have yet: the picker is drawn here. */}
      <AnimatePresence>
        {avatarPicker && <AvatarPickerSheet current={avatarPreview ?? avatarUrl} onChoose={chooseAvatar} onClose={() => setAvatarPicker(false)} />}
      </AnimatePresence>
    </div>
  );
}
