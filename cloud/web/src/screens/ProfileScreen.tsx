import { Camera, ChevronRight, Gamepad2, Monitor, Pencil, QrCode as QrIcon, Settings, Share2, Sparkles, Star } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { PLATFORM_INFO, normalizeGameName, subscriptionService, type GameTag, type MyProfile, type Platform } from "@unishare/shared";
import { useApp } from "../app/store";
import { api, compressImage } from "../lib/api";
import { useT, useI18n } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { Avatar, BrandIcon, GamesRow, PROVIDER_COLORS, PlatformBadge, PlatformGlyph, ProviderIcon, Spinner, Stars } from "../components/ui";
import { shareProfile } from "./profileShare";

export function tagFor(profile: Pick<MyProfile, "gameMetadata">, name: string): GameTag {
  const known = profile.gameMetadata[normalizeGameName(name)];
  return { name, coverUrl: known?.coverUrl ?? null, rawgId: known?.rawgId ?? null };
}

export function ProfileScreen() {
  const t = useT();
  const profile = useApp((state) => state.profile);
  const push = useApp((state) => state.push);
  if (!profile) return null;

  return (
    <div className="screen">
      <div className="screen-narrow">
        <ProfileHero profile={profile} />

        <div className="section-title">{t("profile.card.title")}</div>
        <CardPreview profile={profile} />

        <div className="section-title">
          <Gamepad2 size={19} /> {t("profile.games")}
        </div>
        <div className="glass card col" style={{ gap: 16 }}>
          {profile.platforms.length === 0 && <div className="muted">{t("feed.platforms.empty")}</div>}
          {profile.platforms.map((id) => {
            const games = (profile.platformGames[id] ?? []).map((name) => tagFor(profile, name));
            return (
              <div key={id} className="col" style={{ gap: 8 }}>
                <div className="row">
                  <PlatformBadge platform={id} size={30} />
                  <b className="grow">{id}</b>
                  <span className="faint" style={{ fontSize: 13, fontWeight: 700 }}>{games.length}</span>
                </div>
                {games.length ? (
                  <GamesRow games={games} size={58} titles />
                ) : (
                  <button className="hint" style={{ textAlign: "left" }} onClick={() => push({ type: "edit" })}>
                    {t("profile.games.add.hint")}
                  </button>
                )}
              </div>
            );
          })}
          <div className="col" style={{ gap: 8 }}>
            <div className="row">
              <span className="platform-badge" style={{ width: 30, height: 30, background: "var(--chip)" }}>
                <Sparkles size={15} />
              </span>
              <b className="grow">{t("profile.wanted")}</b>
            </div>
            {profile.wantedGames.length ? (
              <GamesRow games={profile.wantedGames.map((name) => tagFor(profile, name))} size={58} titles />
            ) : (
              <button className="hint" style={{ textAlign: "left" }} onClick={() => push({ type: "edit" })}>
                {t("profile.wanted.hint")}
              </button>
            )}
          </div>
        </div>

        <div className="section-title">{t("profile.skills")}</div>
        <div className="glass card col">
          {profile.skills.length ? (
            <div className="chips">
              {profile.skills.map((skill) => (
                <span key={skill} className="chip">{skill}</span>
              ))}
            </div>
          ) : (
            <div className="muted">{t("skills.empty")}</div>
          )}
          {profile.skillsDescription && <div className="muted" style={{ fontSize: 14 }}>{profile.skillsDescription}</div>}
          <button className="list-item" style={{ padding: "10px 4px" }} onClick={() => push({ type: "skills" })}>
            <span className="platform-badge" style={{ width: 38, height: 38, background: "color-mix(in srgb, var(--primary) 16%, transparent)", color: "var(--primary)" }}>
              <Star size={18} />
            </span>
            <div className="grow">
              <div className="title">{t(profile.hasSkillsProfile ? "profile.skills.edit" : "profile.skills.create")}</div>
              <div className="subtitle">{t("profile.skills.subtitle")}</div>
            </div>
            <ChevronRight size={18} className="faint" />
          </button>
        </div>

        {profile.subscriptions.length > 0 && <Subscriptions profile={profile} />}

        <div className="section-title">{t("profile.linked")}</div>
        <div className="glass card col" style={{ gap: 8 }}>
          {(["telegram", "vk"] as const).map((provider) => {
            const identity = profile.identities.find((item) => item.provider === provider);
            return (
              <button key={provider} className="identity-row" style={{ width: "100%", textAlign: "left" }} onClick={() => push({ type: "link" })}>
                <span className="ico" style={{ background: PROVIDER_COLORS[provider] }}>
                  <ProviderIcon provider={provider} size={20} />
                </span>
                <div className="grow">
                  <div style={{ fontWeight: 800 }}>{provider === "telegram" ? "Telegram" : "ВКонтакте"}</div>
                  <div className="muted ellipsis" style={{ fontSize: 13 }}>
                    {identity
                      ? identity.username
                        ? provider === "telegram" ? `@${identity.username}` : identity.username
                        : identity.displayName ?? t("profile.connected")
                      : t(provider === "telegram" ? "profile.link.telegram" : "profile.link.vk")}
                  </div>
                </div>
                {identity ? <span className="pill" style={{ color: "var(--success)" }}>{t("profile.connected")}</span> : <ChevronRight size={18} className="faint" />}
              </button>
            );
          })}
          <div className="hint">{t("profile.linked.hint")}</div>
        </div>
      </div>
    </div>
  );
}

function ProfileHero({ profile }: { profile: MyProfile }) {
  const t = useT();
  const push = useApp((state) => state.push);
  const config = useApp((state) => state.config);
  const setProfile = useApp((state) => state.setProfile);
  const toastError = useApp((state) => state.toastError);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const gamesCount = new Set([...profile.games, ...profile.wantedGames]).size;

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const image = await compressImage(file, 800);
      await api.uploadAvatar(image);
      setProfile(await api.me());
      platform.haptic("success");
    } catch (error) {
      toastError(error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="profile-hero glass">
      <div className="bg" />
      <div style={{ position: "relative" }}>
        <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
          <button className="icon-btn small" aria-label={t("nearby.title")} onClick={() => push({ type: "nearby" })}>
            <QrIcon size={18} />
          </button>
          <button className="icon-btn small" aria-label={t("profile.settings")} onClick={() => push({ type: "settings" })}>
            <Settings size={18} />
          </button>
        </div>
        <div className="row" style={{ gap: 16, alignItems: "center", marginTop: 4 }}>
          <button style={{ position: "relative", flexShrink: 0 }} onClick={() => fileInput.current?.click()} aria-label={t("profile.change.avatar")}>
            <Avatar url={profile.avatarUrl} name={profile.username} size={92} ring />
            <span
              className="center"
              style={{ position: "absolute", right: -2, bottom: -2, width: 32, height: 32, borderRadius: "50%", background: "var(--primary)", color: "#fff", border: "3px solid var(--bg)" }}
            >
              {uploading ? <Spinner size={14} /> : <Camera size={15} />}
            </span>
          </button>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onFile} />
          <div className="grow">
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }} className="ellipsis">
              @{profile.username}
            </div>
            {profile.status && <div className="muted" style={{ fontSize: 14, marginTop: 2 }}>{profile.status}</div>}
            <div className="row" style={{ gap: 6, marginTop: 8 }}>
              {profile.identities.map((identity) => (
                <span key={identity.provider} className="platform-badge" style={{ width: 24, height: 24, background: PROVIDER_COLORS[identity.provider], color: "#fff" }}>
                  <ProviderIcon provider={identity.provider} size={13} />
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="row" style={{ gap: 16, marginTop: 16, flexWrap: "wrap" }}>
          <span className="stat">
            {profile.reviewCount > 0 ? (
              <>
                <Stars value={profile.rating} size={13} /> {profile.rating.toFixed(1)} · {profile.reviewCount}
              </>
            ) : (
              <>
                <Star size={15} /> {t("profile.reviews.empty")}
              </>
            )}
          </span>
          <span className="stat">
            <Gamepad2 size={16} /> {gamesCount}
          </span>
          <span className="stat">
            <Monitor size={16} /> {profile.platforms.length}
          </span>
        </div>
        <div className="row" style={{ gap: 10, marginTop: 16 }}>
          <button className="btn btn-primary grow" onClick={() => push({ type: "edit" })}>
            <Pencil size={17} /> {t("profile.edit")}
          </button>
          <button
            className="btn btn-glass"
            onClick={() => void shareProfile(config, profile.uid, `UniShare: @${profile.username}`)}
            aria-label={t("profile.share")}
          >
            <Share2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

function CardPreview({ profile }: { profile: MyProfile }) {
  const t = useT();
  const featured: Platform | undefined = profile.platforms.find((id) => (profile.platformGames[id]?.length ?? 0) > 0) ?? profile.platforms[0];
  const games = (featured ? profile.platformGames[featured] ?? [] : profile.games).map((name) => tagFor(profile, name));
  const wanted = profile.wantedGames.map((name) => tagFor(profile, name));
  return (
    <div className="swipe-card" style={{ position: "relative", inset: "auto", height: 270, cursor: "default", ["--accent" as string]: featured ? PLATFORM_INFO[featured].color : undefined }}>
      <div className="sheen" />
      <div className="glow" />
      <div className="content" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 12 }}>
          <Avatar url={profile.avatarUrl} name={profile.username} size={48} />
          <div className="grow">
            <div className="name ellipsis">{profile.username}</div>
            {profile.status && <div className="sub ellipsis">{profile.status}</div>}
          </div>
          {profile.rating > 0 && (
            <span className="rating-pill">
              <Star size={11} fill="#fff" /> {profile.rating.toFixed(1)}
            </span>
          )}
        </div>
        {featured && (
          <span className="platform-pill" style={{ alignSelf: "flex-start" }}>
            <PlatformGlyph platform={featured} size={14} /> {featured}
          </span>
        )}
        <div>
          <h4>{t("profile.games")}</h4>
          {games.length ? <GamesRow games={games} size={50} /> : <div className="sub">{t("profile.games.add.hint")}</div>}
        </div>
        {wanted.length > 0 && (
          <div>
            <h4 style={{ marginBottom: 6 }}>{t("profile.wanted")}</h4>
            <GamesRow games={wanted} size={40} />
          </div>
        )}
      </div>
    </div>
  );
}

function Subscriptions({ profile }: { profile: MyProfile }) {
  const t = useT();
  const language = useI18n((state) => state.language);
  return (
    <>
      <div className="section-title">{t("profile.subscriptions")}</div>
      <div className="glass card col" style={{ gap: 14 }}>
        {profile.subscriptions.map((subscription) => {
          const service = subscriptionService(subscription.name);
          const expires = subscription.expiresAt ? new Date(subscription.expiresAt) : null;
          const started = subscription.startedAt ? new Date(subscription.startedAt) : null;
          const daysLeft = expires ? Math.max(0, Math.ceil((expires.getTime() - Date.now()) / 86_400_000)) : null;
          const fraction =
            expires && started && expires > started
              ? Math.min(1, Math.max(0, (expires.getTime() - Date.now()) / (expires.getTime() - started.getTime())))
              : null;
          return (
            <div key={subscription.id} className="col" style={{ gap: 6 }}>
              <div className="row">
                <span className="platform-badge" style={{ width: 38, height: 38, background: "var(--chip)" }}>
                  {service?.brand ? <BrandIcon file={service.brand} size={20} /> : <Sparkles size={18} />}
                </span>
                <div className="grow">
                  <div style={{ fontWeight: 800 }}>{subscription.name}</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    {[subscription.planName, expires ? t("subscription.expires", expires.toLocaleDateString(language, { day: "numeric", month: "short", year: "numeric" })) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                {daysLeft !== null && <span className="pill">{t("subscription.days.remaining", daysLeft)}</span>}
              </div>
              {fraction !== null && (
                <div className="progress">
                  <span style={{ width: `${fraction * 100}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
