// The profile card ("анкета") as the latest App Store screenshots show it: the
// player's game artwork fills the card behind a dark veil, with a large name,
// the featured platform and round game covers. Used by the feed and by the
// "Your profile card" preview on My Profile, so both always look the same.
import { Maximize2, Star } from "lucide-react";
import { useState } from "react";
import { PLATFORM_INFO, type DiscoveryKind, type GameTag, type Platform } from "@unishare/shared";
import { useT } from "../i18n/i18n";
import { Avatar, BrandIcon, GameCirclesRow, PlatformGlyph } from "./ui";

/** Skills shown on the card; the rest are summed up in a "+N" chip so the card never cuts a row in half. */
const MAX_SKILL_CHIPS = 8;

export interface CardFaceData {
  username: string;
  avatarUrl: string | null;
  status: string | null;
  platforms: Platform[];
  platformGames: Partial<Record<Platform, GameTag[]>>;
  games: GameTag[];
  wantedGames: GameTag[];
  skills: string[];
  rating: number;
}

/** Platform shown on the card: the first one with games, else the first one. */
export function featuredPlatform(card: CardFaceData): Platform | null {
  return card.platforms.find((id) => (card.platformGames[id]?.length ?? 0) > 0) ?? card.platforms[0] ?? null;
}

export function ProfileCardFace({ card, kind, footer = true }: { card: CardFaceData; kind: DiscoveryKind; footer?: boolean }) {
  const t = useT();
  const featured = featuredPlatform(card);
  const playing = featured && card.platformGames[featured]?.length ? card.platformGames[featured]! : card.games;
  const art = [...playing, ...card.games, ...card.wantedGames].find((game) => game.coverUrl)?.coverUrl ?? null;
  const [artFailed, setArtFailed] = useState(false);

  return (
    <>
      <span className="card-art" aria-hidden>
        {art && !artFailed && <img src={art} alt="" draggable={false} onError={() => setArtFailed(true)} />}
      </span>
      <div className="content">
        <div className="row" style={{ gap: 14 }}>
          <span className="card-avatar">
            <Avatar url={card.avatarUrl} size={64} />
          </span>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="name ellipsis">{card.username}</div>
            {card.status && <div className="status clamp-2">{card.status}</div>}
          </div>
          {kind === "teammates" && card.rating > 0 && (
            <span className="rating-pill">
              <Star size={11} fill="#fff" color="#fff" /> {card.rating.toFixed(1)}
            </span>
          )}
        </div>

        <div style={{ flex: 1, minHeight: 18 }} />

        {featured && (
          <div style={{ marginBottom: 18 }}>
            <span className="platform-pill">
              {PLATFORM_INFO[featured].brand ? <BrandIcon file={PLATFORM_INFO[featured].brand!} size={15} /> : <PlatformGlyph platform={featured} size={15} />}
              {featured}
            </span>
          </div>
        )}

        {kind === "skills" ? (
          <div>
            <h4>{t("profile.skills")}</h4>
            {card.skills.length ? (
              <div className="flow" style={{ gap: 9 }}>
                {card.skills.slice(0, MAX_SKILL_CHIPS).map((skill) => (
                  <span key={skill} className="skill-chip">
                    {skill}
                  </span>
                ))}
                {card.skills.length > MAX_SKILL_CHIPS && <span className="skill-chip more">+{card.skills.length - MAX_SKILL_CHIPS}</span>}
              </div>
            ) : (
              <div className="card-muted">{t("skills.empty")}</div>
            )}
          </div>
        ) : (
          <div>
            {playing.length ? (
              <GameCirclesRow games={playing} color="#ffffff" size={66} padding={22} />
            ) : (
              <div className="card-muted">{t("profile.games.add.hint")}</div>
            )}
            {card.wantedGames.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <h4>{t("profile.wanted")}</h4>
                <GameCirclesRow games={card.wantedGames} color="#ffffff" size={54} padding={22} />
              </div>
            )}
          </div>
        )}

        {footer && (
          <>
            <div style={{ flex: 1, minHeight: 12 }} />
            <div className="card-footer">
              <span className="grow">{t("feed.card.tap_details")}</span>
              <Maximize2 size={12} strokeWidth={2.6} />
            </div>
          </>
        )}
      </div>
    </>
  );
}
