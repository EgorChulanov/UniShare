// Port of UniShare/Features/Profile/ProfileView.swift.
import { BadgeCheck, Camera, ChevronRight, Gamepad2, MonitorSmartphone, Pencil, Plus, RefreshCw, Settings, Sparkles, Star, UserCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { normalizeGameName, subscriptionService, type DiscoveryKind, type GameTag, type MyProfile, type Subscription } from "@unishare/shared";
import { collapseOnScroll, useApp } from "../app/store";
import { useI18n, useT } from "../i18n/i18n";
import { Avatar, BrandIcon, GameCircle, PlatformBadgeRow, PlatformMark, platformColor } from "../components/ui";
import { ProfileCardFace, type CardFaceData } from "../components/ProfileCardFace";

export function tagFor(profile: Pick<MyProfile, "gameMetadata">, name: string): GameTag {
  const known = profile.gameMetadata[normalizeGameName(name)];
  return { name, coverUrl: known?.coverUrl ?? null, rawgId: known?.rawgId ?? null, steamAppId: known?.steamAppId ?? null };
}

export function ProfileScreen() {
  const t = useT();
  const profile = useApp((state) => state.profile);
  const push = useApp((state) => state.push);
  const onScroll = useMemo(() => collapseOnScroll(), []);
  if (!profile) return null;

  return (
    <div className="screen" onScroll={onScroll}>
      <ProfileHero profile={profile} />
      <div className="container">
        <div className="col" style={{ gap: 18, paddingTop: 24 }}>
          <ProfileCardPreview profile={profile} />
          <GamesCard profile={profile} />
          {profile.subscriptions.length > 0 && <SubscriptionsSection subscriptions={profile.subscriptions} />}
          <SkillsProfileButton profile={profile} />
        </div>
      </div>
    </div>
  );
}

/** Store screenshots: a violet hero with the avatar, name, status and three stats. */
function ProfileHero({ profile }: { profile: MyProfile }) {
  const t = useT();
  const push = useApp((state) => state.push);
  const edit = () => push({ type: "edit" });
  const gameCount = new Set([...profile.games, ...Object.values(profile.platformGames).flat()].map((name) => normalizeGameName(name ?? ""))).size;
  return (
    <header className="profile-hero">
      <button className="hero-settings liquid" onClick={() => push({ type: "settings" })} aria-label={t("profile.settings")}>
        <Settings size={20} strokeWidth={2.2} />
      </button>
      <div className="hero-body">
        <div className="profile-avatar">
          <button onClick={edit} aria-label={t("profile.change.avatar")}>
            <Avatar url={profile.avatarUrl} size={112} />
          </button>
          <button className="camera" onClick={edit} aria-label={t("profile.change.avatar")}>
            <Camera size={15} strokeWidth={2.4} />
          </button>
        </div>
        <div className="col grow" style={{ gap: 6, minWidth: 0 }}>
          <div className="row" style={{ gap: 7, minWidth: 0 }}>
            <h1 className="hero-name ellipsis">{profile.username}</h1>
            {profile.rating >= 4.5 && <BadgeCheck size={22} fill="#fff" color="var(--primary)" />}
          </div>
          {profile.status && <p className="hero-status clamp-2">{profile.status}</p>}
          <button className="hero-edit" onClick={edit}>
            <Pencil size={12} strokeWidth={2.6} /> {t("profile.edit")}
          </button>
        </div>
      </div>
      <div className="hero-stats">
        <span aria-label={profile.rating > 0 ? t("profile.stats.reviews", profile.rating.toFixed(1)) : t("profile.stats.no_reviews")}>
          <Star size={16} fill="currentColor" strokeWidth={0} />
          {profile.rating > 0 ? `${profile.rating.toFixed(1)} · ${profile.reviewCount}` : t("profile.stats.no_reviews")}
        </span>
        <span aria-label={t("profile.stats.games", gameCount)}>
          <Gamepad2 size={18} strokeWidth={2.2} />
          {gameCount}
        </span>
        <span aria-label={t("profile.stats.platforms", profile.platforms.length)}>
          <MonitorSmartphone size={17} strokeWidth={2.2} />
          {profile.platforms.length}
        </span>
        {profile.platforms.length > 0 && (
          <span className="hero-platforms">
            <PlatformBadgeRow platforms={profile.platforms} size={26} />
          </span>
        )}
      </div>
    </header>
  );
}

/** The card exactly as others see it in the feed, with a switch between Exchange and Skills. */
function ProfileCardPreview({ profile }: { profile: MyProfile }) {
  const t = useT();
  const push = useApp((state) => state.push);
  const [kind, setKind] = useState<DiscoveryKind>("teammates");
  const card: CardFaceData = {
    username: profile.username ?? "",
    avatarUrl: profile.avatarUrl,
    status: profile.status,
    platforms: profile.platforms,
    platformGames: Object.fromEntries(profile.platforms.map((id) => [id, (profile.platformGames[id] ?? []).map((name) => tagFor(profile, name))])),
    games: profile.games.map((name) => tagFor(profile, name)),
    wantedGames: profile.wantedGames.map((name) => tagFor(profile, name)),
    skills: profile.skills,
    rating: profile.rating,
  };
  const other: DiscoveryKind = kind === "teammates" ? "skills" : "teammates";
  return (
    <section className="col" style={{ gap: 10 }}>
      <div className="row px" style={{ gap: 10 }}>
        <h2 className="section-title grow">{t("profile.card.title")}</h2>
        <button className="capsule-btn" onClick={() => setKind(other)}>
          <RefreshCw size={13} strokeWidth={2.6} /> {t(other === "skills" ? "feed.segment.skills" : "feed.segment.teammates")}
        </button>
      </div>
      <p className="secondary px" style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
        {t("profile.card.hint")}
      </p>
      <div className="card-face" role="button" tabIndex={0} onClick={() => push({ type: kind === "skills" ? "skills" : "edit" })} onKeyDown={(event) => event.key === "Enter" && push({ type: kind === "skills" ? "skills" : "edit" })}>
        <ProfileCardFace card={card} kind={kind} footer={false} />
      </div>
    </section>
  );
}

/** Games card: one row per platform, alternating leading / trailing alignment, then the wanted games; tap to edit. */
function GamesCard({ profile }: { profile: MyProfile }) {
  const t = useT();
  const push = useApp((state) => state.push);
  if (!profile.platforms.length && !profile.wantedGames.length) return null;
  return (
    <div className="card-surface games-card" role="button" tabIndex={0} onClick={() => push({ type: "edit" })} onKeyDown={(event) => event.key === "Enter" && push({ type: "edit" })}>
      <div className="row" style={{ padding: "16px 16px 4px", gap: 8 }}>
        <span className="grow" style={{ fontSize: 17, fontWeight: 800 }}>
          {t("profile.games")}
        </span>
        <ChevronRight size={18} strokeWidth={2.6} className="secondary" />
      </div>
      {profile.platforms.map((id, index) => (
        <div key={id}>
          {index > 0 && <div className="divider" style={{ margin: "0 16px" }} />}
          <GamesRow title={id} mark={<PlatformMark platform={id} size={22} />} color={platformColor(id)} games={(profile.platformGames[id] ?? []).map((name) => tagFor(profile, name))} />
        </div>
      ))}
      {profile.wantedGames.length > 0 && (
        <div>
          {profile.platforms.length > 0 && <div className="divider" style={{ margin: "0 16px" }} />}
          <GamesRow title={t("profile.wanted")} color="var(--accent-text)" games={profile.wantedGames.map((name) => tagFor(profile, name))} />
        </div>
      )}
      <div style={{ height: 8 }} />
    </div>
  );
}

function GamesRow({ title, mark, color, games }: { title: string; mark?: React.ReactNode; color: string; games: GameTag[] }) {
  const t = useT();
  return (
    <div className="col" style={{ gap: 10, padding: "12px 16px" }}>
      <span className="row" style={{ gap: 8, fontSize: 13, fontWeight: 700, color: "var(--text-2)" }}>
        {mark}
        {title}
      </span>
      {games.length === 0 ? (
        <span className="secondary" style={{ fontSize: 13 }}>
          {t("profile.games.add.hint")}
        </span>
      ) : (
        <div className="h-scroll" style={{ gap: 12 }}>
          {games.map((game) => (
            <div key={game.name} className="game-item" style={{ width: 60 }}>
              <GameCircle game={game} color={color} size={52} />
              <span style={{ width: 60, fontSize: 11 }}>{game.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function subscriptionProgress(subscription: Subscription): { fraction: number; days: number } | null {
  if (!subscription.expiresAt || !subscription.startedAt) return null;
  const expires = new Date(subscription.expiresAt).getTime();
  const started = new Date(subscription.startedAt).getTime();
  if (!(expires > started)) return null;
  const now = Date.now();
  return {
    fraction: Math.min(1, Math.max(0, (expires - now) / (expires - started))),
    days: Math.max(0, Math.ceil((expires - now) / 86_400_000)),
  };
}

function SubscriptionsSection({ subscriptions }: { subscriptions: Subscription[] }) {
  const t = useT();
  const language = useI18n((state) => state.language);
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="caption px">{t("profile.subscriptions")}</div>
      <div className="col" style={{ gap: 8 }}>
        {subscriptions.map((subscription) => {
          const service = subscriptionService(subscription.name);
          const progress = subscriptionProgress(subscription);
          return (
            <div key={subscription.id} className="glass" style={{ margin: "0 16px", padding: "14px 16px", borderRadius: 20 }}>
              <div className="row" style={{ gap: 12 }}>
                <span style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent-text)" }}>
                  {service?.brand ? <BrandIcon file={service.brand} size={20} /> : <Sparkles size={18} />}
                </span>
                <div className="grow col" style={{ gap: 2 }}>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>{subscription.name}</span>
                  {subscription.planName && (
                    <span className="secondary" style={{ fontSize: 13 }}>
                      {subscription.planName}
                    </span>
                  )}
                  {subscription.expiresAt && (
                    <span className="secondary" style={{ fontSize: 13 }}>
                      {t("subscription.expires", new Date(subscription.expiresAt).toLocaleDateString(language, { day: "numeric", month: "short", year: "numeric" }))}
                    </span>
                  )}
                </div>
                {subscription.autoRenew && <RefreshCw size={13} strokeWidth={2.6} color="var(--accent-text)" />}
              </div>
              {progress && (
                <div className="col" style={{ gap: 6, marginTop: 9 }}>
                  <div className="progress-bar">
                    <span style={{ width: `${progress.fraction * 100}%` }} />
                  </div>
                  <span className="secondary" style={{ fontSize: 12, fontWeight: 600 }}>
                    {t("subscription.days.remaining", progress.days)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SkillsProfileButton({ profile }: { profile: MyProfile }) {
  const t = useT();
  const push = useApp((state) => state.push);
  return (
    <button className="skills-cta" onClick={() => push({ type: "skills" })}>
      <span className="ico">{profile.hasSkillsProfile ? <UserCheck size={17} /> : <Plus size={18} strokeWidth={2.6} />}</span>
      <div className="grow col" style={{ gap: 2, textAlign: "left", minWidth: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{t(profile.hasSkillsProfile ? "profile.skills.edit" : "profile.skills.create")}</span>
        <span className="secondary ellipsis" style={{ fontSize: 12 }}>
          {profile.hasSkillsProfile ? profile.skills.slice(0, 3).join(", ") : t("profile.skills.subtitle")}
        </span>
      </div>
      <ChevronRight size={14} className="secondary" />
    </button>
  );
}
