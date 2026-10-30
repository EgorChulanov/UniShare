// Port of UniShare/Features/Profile/ProfileView.swift.
import { BadgeCheck, Camera, ChevronRight, Pencil, Plus, RefreshCw, Settings, Sparkles, Star, UserCheck } from "lucide-react";
import { useMemo } from "react";
import { normalizeGameName, subscriptionService, type GameTag, type MyProfile, type Subscription } from "@unishare/shared";
import { collapseOnScroll, useApp } from "../app/store";
import { useI18n, useT } from "../i18n/i18n";
import { Avatar, BrandIcon, GameCircle, PlatformBadgeRow, platformColor } from "../components/ui";

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
      <div className="container">
        <ProfileHero profile={profile} />
        <div className="col" style={{ gap: 16, paddingTop: 20 }}>
          <GamesCard profile={profile} />
          {profile.skills.length > 0 && (
            <div className="col" style={{ gap: 10 }}>
              <div className="caption px">{t("profile.skills")}</div>
              <div className="flow px">
                {profile.skills.map((skill) => (
                  <span key={skill} className="chip tertiary">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
          {profile.subscriptions.length > 0 && <SubscriptionsSection subscriptions={profile.subscriptions} />}
          <SkillsProfileButton profile={profile} />
          <button className="settings-row glass" onClick={() => push({ type: "settings" })}>
            <Settings size={20} fill="var(--primary)" color="var(--bg)" strokeWidth={2} />
            <span className="grow" style={{ fontSize: 15 }}>
              {t("profile.settings")}
            </span>
            <ChevronRight size={14} className="secondary" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileHero({ profile }: { profile: MyProfile }) {
  const t = useT();
  const push = useApp((state) => state.push);
  const edit = () => push({ type: "edit" });
  return (
    <div className="col" style={{ gap: 16, padding: "18px 20px 8px" }}>
      <div className="row" style={{ gap: 18 }}>
        <div className="profile-avatar">
          <span className="halo" />
          <button onClick={edit} aria-label={t("profile.change.avatar")}>
            <Avatar url={profile.avatarUrl} size={100} ring />
          </button>
          <button className="camera" onClick={edit} aria-label={t("profile.change.avatar")}>
            <Camera size={12} fill="#fff" color="var(--primary)" strokeWidth={2} />
          </button>
        </div>
        <div className="col grow" style={{ gap: 7, alignItems: "flex-start" }}>
          <div className="row" style={{ gap: 7, maxWidth: "100%" }}>
            <span className="ellipsis" style={{ fontSize: 21, fontWeight: 700 }}>
              @{profile.username}
            </span>
            {profile.rating >= 4.5 && <BadgeCheck size={20} fill="var(--primary)" color="var(--bg)" />}
          </div>
          {profile.status && (
            <span className="secondary clamp-2" style={{ fontSize: 13, fontWeight: 500 }}>
              {profile.status}
            </span>
          )}
          <button className="capsule-btn" onClick={edit}>
            <Pencil size={12} strokeWidth={2.6} /> {t("profile.edit")}
          </button>
        </div>
      </div>
      {(profile.platforms.length > 0 || profile.rating > 0) && (
        <div className="row" style={{ gap: 8 }}>
          <PlatformBadgeRow platforms={profile.platforms} size={30} />
          <span className="grow" />
          {profile.rating > 0 && (
            <span className="capsule-btn" style={{ border: 0, padding: "6px 10px" }}>
              <Star size={12} fill="currentColor" /> {profile.rating.toFixed(1)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Games card: one row per platform, alternating leading / trailing alignment, then the wanted games; tap to edit. */
function GamesCard({ profile }: { profile: MyProfile }) {
  const t = useT();
  const push = useApp((state) => state.push);
  if (!profile.platforms.length && !profile.wantedGames.length) return null;
  return (
    <div className="card-surface games-card" role="button" tabIndex={0} onClick={() => push({ type: "edit" })} onKeyDown={(event) => event.key === "Enter" && push({ type: "edit" })}>
      <div className="caption" style={{ fontSize: 14, padding: "14px 16px 8px" }}>
        {t("profile.games")}
      </div>
      {profile.platforms.map((id, index) => (
        <div key={id}>
          {index > 0 && <div className="divider" style={{ margin: "0 16px" }} />}
          <GamesRow title={id} color={platformColor(id)} games={(profile.platformGames[id] ?? []).map((name) => tagFor(profile, name))} trailing={index % 2 === 1} />
        </div>
      ))}
      {profile.wantedGames.length > 0 && (
        <div>
          {profile.platforms.length > 0 && <div className="divider" style={{ margin: "0 16px" }} />}
          <GamesRow title={t("profile.wanted")} color="var(--accent-text)" games={profile.wantedGames.map((name) => tagFor(profile, name))} trailing={profile.platforms.length % 2 === 1} />
        </div>
      )}
      <div style={{ height: 8 }} />
    </div>
  );
}

function GamesRow({ title, color, games, trailing }: { title: string; color: string; games: GameTag[]; trailing: boolean }) {
  const t = useT();
  return (
    <div className="col" style={{ gap: 8, padding: "12px 16px", alignItems: trailing ? "flex-end" : "flex-start" }}>
      <span style={{ fontSize: 11, fontWeight: 600, color }}>{title}</span>
      <div className="row" style={{ gap: 10 }}>
        {games.length === 0 ? (
          <span className="secondary" style={{ fontSize: 12 }}>
            {t("profile.games.add.hint")}
          </span>
        ) : (
          games.slice(0, 5).map((game) => (
            <div key={game.name} className="game-item" style={{ width: 44 }}>
              <GameCircle game={game} color={color} size={44} />
              <span style={{ width: 44, fontSize: 8 }}>{game.name}</span>
            </div>
          ))
        )}
      </div>
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
            <div key={subscription.id} className="glass" style={{ margin: "0 16px", padding: "10px 16px", borderRadius: 12 }}>
              <div className="row" style={{ gap: 12 }}>
                <span style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent-text)" }}>
                  {service?.brand ? <BrandIcon file={service.brand} size={20} /> : <Sparkles size={18} />}
                </span>
                <div className="grow col" style={{ gap: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{subscription.name}</span>
                  {subscription.planName && (
                    <span className="secondary" style={{ fontSize: 11 }}>
                      {subscription.planName}
                    </span>
                  )}
                  {subscription.expiresAt && (
                    <span className="secondary" style={{ fontSize: 11 }}>
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
                  <span className="secondary" style={{ fontSize: 10, fontWeight: 500 }}>
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
