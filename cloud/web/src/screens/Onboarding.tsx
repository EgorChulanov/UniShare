import { AnimatePresence, motion } from "framer-motion";
import { Camera, Check, ChevronLeft, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  LIMITS,
  PLATFORMS,
  SUBSCRIPTION_SERVICES,
  normalizeGameName,
  sanitizeUsername,
  suggestUsername,
  type GameTag,
  type Platform,
} from "@unishare/shared";
import { useApp } from "../app/store";
import { api, compressImage } from "../lib/api";
import { errorMessage, useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { Avatar, BrandIcon, PlatformBadge, Spinner } from "../components/ui";
import { GamePicker } from "../components/GamePicker";

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

/** Six-step profile setup (OnboardingView.swift). */
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
  const fileInput = useRef<HTMLInputElement>(null);

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
      let finalAvatar = avatarUrl;
      if (avatarFile) finalAvatar = (await api.uploadAvatar(await compressImage(avatarFile, 800))).avatarUrl;
      const platformGames: Partial<Record<Platform, string[]>> = {};
      const gameMetadata: Record<string, GameTag> = {};
      for (const selected of platforms) {
        const tags = games[selected] ?? [];
        if (tags.length) platformGames[selected] = tags.map((tag) => tag.name);
        for (const tag of tags) gameMetadata[normalizeGameName(tag.name)] = tag;
      }
      const updated = await api.updateMe({
        username: sanitizeUsername(username)!,
        avatarUrl: finalAvatar,
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

  const addSkill = () => {
    const value = skillInput.trim().slice(0, 40);
    if (value.length < 2 || skills.some((skill) => skill.toLowerCase() === value.toLowerCase()) || skills.length >= LIMITS.skills) return;
    platform.haptic("selection");
    setSkills([...skills, value]);
    setSkillInput("");
  };

  return (
    <div className="main" style={{ maxWidth: 640, margin: "0 auto", width: "100%" }}>
      <div style={{ padding: "calc(var(--safe-top) + 14px) 20px 6px" }}>
        <div className="row" style={{ marginBottom: 14 }}>
          {stepIndex > 0 ? (
            <button className="icon-btn small" onClick={() => go(-1)} aria-label={t("back")}>
              <ChevronLeft size={20} />
            </button>
          ) : (
            <span style={{ width: 36 }} />
          )}
          <div className="progress grow">
            <span style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} />
          </div>
          <span className="faint" style={{ fontWeight: 800, fontSize: 13, width: 36, textAlign: "right" }}>
            {stepIndex + 1}/{STEPS.length}
          </span>
        </div>
        <h1 className="screen-title" style={{ margin: "4px 0 0" }}>{t(TITLES[step])}</h1>
      </div>

      <div className="screen" style={{ paddingTop: 12, paddingBottom: 24 }}>
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            initial={{ opacity: 0, x: direction * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -40 }}
            transition={{ duration: 0.22 }}
          >
            {step === "username" && (
              <div className="col">
                <input
                  className="field"
                  value={username}
                  autoFocus
                  maxLength={LIMITS.usernameMax}
                  placeholder={t("onboarding.username.placeholder")}
                  onChange={(event) => {
                    setUsername(event.target.value);
                    setUsernameError(null);
                  }}
                  onKeyDown={(event) => event.key === "Enter" && canContinue && void next()}
                  style={{ fontSize: 20, fontWeight: 700 }}
                />
                {usernameError ? <div className="error-text">{usernameError}</div> : <div className="hint">{t("onboarding.username.minimum")}</div>}
              </div>
            )}

            {step === "avatar" && (
              <div className="col" style={{ alignItems: "center", gap: 18, paddingTop: 12 }}>
                <button onClick={() => fileInput.current?.click()} style={{ position: "relative" }}>
                  <Avatar url={avatarPreview ?? avatarUrl} name={username} size={148} ring />
                  <span className="icon-btn" style={{ position: "absolute", right: 2, bottom: 2, background: "var(--primary)", color: "#fff" }}>
                    <Camera size={20} />
                  </span>
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) setAvatarFile(file);
                    event.target.value = "";
                  }}
                />
                <button className="btn btn-glass" onClick={() => fileInput.current?.click()}>
                  <Camera size={18} /> {t("onboarding.avatar.upload")}
                </button>
                {platformPhoto && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      setAvatarFile(null);
                      setAvatarPreview(null);
                      setAvatarUrl(platformPhoto);
                    }}
                  >
                    {t("onboarding.avatar.platform")}
                  </button>
                )}
                <div className="hint">{t("onboarding.avatar.hint")}</div>
              </div>
            )}

            {step === "platform" && (
              <div className="platform-grid">
                {PLATFORMS.map((id) => {
                  const selected = platforms.includes(id);
                  return (
                    <button
                      key={id}
                      className={`platform-tile glass ${selected ? "selected" : ""}`}
                      onClick={() => {
                        platform.haptic("selection");
                        setPlatforms(selected ? platforms.filter((p) => p !== id) : [...platforms, id]);
                      }}
                    >
                      <PlatformBadge platform={id} size={38} />
                      <span className="grow">{id}</span>
                      {selected && <Check size={18} color="var(--primary)" />}
                    </button>
                  );
                })}
              </div>
            )}

            {step === "games" && activePlatform && (
              <div className="col" style={{ gap: 14 }}>
                <div className="row" style={{ overflowX: "auto", paddingBottom: 4 }}>
                  {platforms.map((id) => (
                    <button key={id} className={`chip ${id === activePlatform ? "selected" : ""}`} onClick={() => setActivePlatform(id)}>
                      <PlatformBadge platform={id} size={20} /> {id}
                      {(games[id]?.length ?? 0) > 0 && <span className="badge" style={{ background: "var(--primary)" }}>{games[id]!.length}</span>}
                    </button>
                  ))}
                </div>
                <div className="muted" style={{ fontWeight: 700 }}>{t("onboarding.games.for", activePlatform)}</div>
                <GamePicker key={activePlatform} selected={games[activePlatform] ?? []} onToggle={toggleGame} limit={LIMITS.gamesPerPlatform} />
              </div>
            )}

            {step === "skills" && (
              <div className="col">
                <form
                  className="row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    addSkill();
                  }}
                >
                  <input className="field grow" value={skillInput} onChange={(event) => setSkillInput(event.target.value)} placeholder={t("onboarding.skills.placeholder")} maxLength={40} />
                  <button className="icon-btn" type="submit" aria-label="add" style={{ width: 52, height: 52 }}>
                    <Plus size={22} />
                  </button>
                </form>
                <div className="chips">
                  {skills.map((skill) => (
                    <button key={skill} className="chip selected" onClick={() => setSkills(skills.filter((item) => item !== skill))}>
                      {skill} <X size={14} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === "subscriptions" && (
              <div className="col">
                <div className="hint" style={{ marginTop: 0 }}>{t("onboarding.subscriptions.hint")}</div>
                {SUBSCRIPTION_SERVICES.map((service) => {
                  const selected = subscriptions.includes(service.name);
                  return (
                    <button
                      key={service.name}
                      className={`platform-tile glass ${selected ? "selected" : ""}`}
                      onClick={() => {
                        platform.haptic("selection");
                        setSubscriptions(selected ? subscriptions.filter((name) => name !== service.name) : [...subscriptions, service.name]);
                      }}
                    >
                      {service.brand && <BrandIcon file={service.brand} size={24} />}
                      <span className="grow">{service.name}</span>
                      {selected && <Check size={18} color="var(--primary)" />}
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div style={{ padding: "8px 20px calc(var(--safe-bottom) + 16px)" }} className="col">
        <button className="btn btn-primary btn-block" disabled={!canContinue || saving} onClick={() => void next()}>
          {saving ? <Spinner size={20} /> : isLast ? t("onboarding.complete") : t("next")}
        </button>
        {(step === "avatar" || step === "games" || step === "skills" || step === "subscriptions") && !isLast && (
          <button className="btn btn-ghost" onClick={() => go(1)}>
            {t("skip")}
          </button>
        )}
      </div>
    </div>
  );
}
