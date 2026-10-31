// Port of UniShare/Features/Profile/ProfileView.swift, laid out like the latest store
// screenshot (docs/assets/store-mockups/iphone-1.jpg): the hero and one profile card.
import { AnimatePresence, motion } from "framer-motion";
import { BadgeCheck, Camera, Gamepad2, MonitorSmartphone, Pencil, Plus, RefreshCw, Settings, Sparkles, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { normalizeGameName, subscriptionService, type DiscoveryKind, type GameTag, type MyProfile, type Subscription } from "@unishare/shared";
import { collapseOnScroll, useApp } from "../app/store";
import { useI18n, useT } from "../i18n/i18n";
import { Avatar, BrandIcon, PlatformBadgeRow } from "../components/ui";
import { ProfileCardFace, type CardFaceData } from "../components/ProfileCardFace";

export function tagFor(profile: Pick<MyProfile, "gameMetadata">, name: string): GameTag {
  const known = profile.gameMetadata[normalizeGameName(name)];
  return { name, coverUrl: known?.coverUrl ?? null, rawgId: known?.rawgId ?? null, steamAppId: known?.steamAppId ?? null };
}

export function ProfileScreen() {
  const profile = useApp((state) => state.profile);
  const onScroll = useMemo(() => collapseOnScroll(), []);
  if (!profile) return null;

  return (
    <div className="screen" onScroll={onScroll}>
      <ProfileHero profile={profile} />
      <div className="container">
        <div className="col" style={{ gap: 26, paddingTop: 24 }}>
          <ProfileCardPreview profile={profile} />
          {profile.subscriptions.length > 0 && <SubscriptionsSection subscriptions={profile.subscriptions} />}
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
  const pickAvatar = () => push({ type: "avatar" });
  const gameCount = new Set([...profile.games, ...Object.values(profile.platformGames).flat()].map((name) => normalizeGameName(name ?? ""))).size;
  return (
    <header className="profile-hero">
      <button className="hero-settings liquid" onClick={() => push({ type: "settings" })} aria-label={t("profile.settings")}>
        <Settings size={20} strokeWidth={2.2} />
      </button>
      <div className="hero-body">
        <div className="profile-avatar">
          <button onClick={pickAvatar} aria-label={t("profile.change.avatar")}>
            <Avatar url={profile.avatarUrl} size={112} />
          </button>
          <button className="camera" onClick={pickAvatar} aria-label={t("profile.change.avatar")}>
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

/**
 * The one card on My Profile, exactly as others see it in the feed, with a switch
 * between Exchange and Skills. Tapping it edits what that card shows.
 */
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
  const noSkills = kind === "skills" && !profile.hasSkillsProfile;
  const hint = kind === "teammates" ? "profile.card.hint.teammates" : noSkills ? "profile.card.hint.skills.empty" : "profile.card.hint.skills";
  const open = () => push({ type: kind === "skills" ? "skills" : "edit" });

  return (
    <section className="col" style={{ gap: 10 }}>
      <div className="row px" style={{ gap: 10 }}>
        <h2 className="section-title grow">{t("profile.card.title")}</h2>
        <button className="capsule-btn" onClick={() => setKind(other)} aria-label={t("profile.card.switch", t(other === "skills" ? "feed.segment.skills" : "feed.segment.teammates"))}>
          <RefreshCw size={13} strokeWidth={2.6} /> {t(other === "skills" ? "feed.segment.skills" : "feed.segment.teammates")}
        </button>
      </div>
      <p className="card-hint secondary px">{t(hint)}</p>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={kind}
          className="card-face"
          role="button"
          tabIndex={0}
          aria-label={t(hint)}
          onClick={open}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            open();
          }}
          initial={{ opacity: 0, y: 10, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.985 }}
          whileTap={{ scale: 0.985 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <ProfileCardFace card={card} kind={kind} footer={false} skillsInvite={noSkills ? <SkillsInvite /> : undefined} />
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

/** In place of an empty skills card: what the skills profile is for, and the way to create it. */
function SkillsInvite() {
  const t = useT();
  return (
    <div className="skills-invite">
      <span className="emblem">
        <Sparkles size={22} strokeWidth={2.2} />
      </span>
      <div className="col" style={{ gap: 4, minWidth: 0 }}>
        <span className="title">{t("profile.skills.create")}</span>
        <span className="text">{t("profile.card.skills.invite")}</span>
      </div>
      <span className="cta">
        <Plus size={15} strokeWidth={2.8} /> {t("profile.card.skills.cta")}
      </span>
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
    <section className="col" style={{ gap: 12 }}>
      <h2 className="section-title px">{t("profile.subscriptions")}</h2>
      <div className="col" style={{ gap: 8 }}>
        {subscriptions.map((subscription) => {
          const service = subscriptionService(subscription.name);
          const progress = subscriptionProgress(subscription);
          return (
            <div key={subscription.id} className="glass" style={{ margin: "0 16px", padding: "14px 16px", borderRadius: 20 }}>
              <div className="row" style={{ gap: 12 }}>
                <span className="sub-icon">{service?.brand ? <BrandIcon file={service.brand} size={20} /> : <Sparkles size={18} />}</span>
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
    </section>
  );
}
