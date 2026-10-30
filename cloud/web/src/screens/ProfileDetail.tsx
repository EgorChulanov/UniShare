// Port of ProfileDetailSheet in UniShare/Features/Feed/FeedCardsOverlay.swift.
// Opened from search, chats or AirShare it also gets a Like / Message button.
import { Heart, MessageCircle, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DiscoveryKind, GameTag, Platform, ProfileCard } from "@unishare/shared";
import { useApp } from "../app/store";
import { api } from "../lib/api";
import { useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { Avatar, GameCircle, PlatformBadgeRow, PlatformGlyph, Sheet, Spinner, platformColor } from "../components/ui";
import { useFeed } from "./FeedScreen";

export function ProfileDetailSheet({ uid, card: initial, source }: { uid: string; card?: ProfileCard; source?: "feed" }) {
  const t = useT();
  const me = useApp((state) => state.profile);
  const chats = useApp((state) => state.chats);
  const pop = useApp((state) => state.pop);
  const [card, setCard] = useState<ProfileCard | null>(initial ?? null);
  const [liked, setLiked] = useState<DiscoveryKind[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    api
      .user(uid)
      .then((result) => {
        setCard(result.profile);
        setLiked(result.likedKinds);
      })
      .catch(() => setMissing(true));
  }, [uid]);

  const filter = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (tags: GameTag[]) => (needle ? tags.filter((tag) => tag.name.toLocaleLowerCase().includes(needle)) : tags);
  }, [query]);

  const existingChat = chats.find((chat) => chat.partner.uid === uid);
  const showActions = source !== "feed" && me?.uid !== uid;

  const like = async () => {
    if (!card) return;
    setBusy(true);
    try {
      const result = await api.swipe(card.uid, "teammates", "like");
      useFeed.getState().remove("teammates", card.uid);
      setLiked((current) => [...current, "teammates"]);
      if (result.matched && result.chatId) {
        platform.haptic("success");
        useApp.getState().toast(`${t("feed.swipe.match")} · ${card.username}`, "success");
        await useApp.getState().loadChats();
        useApp.getState().closeOverlay();
        useApp.getState().push({ type: "chat", chatId: result.chatId });
      } else {
        platform.haptic("medium");
        useApp.getState().toast(t("profile.liked"), "success");
      }
    } catch (error) {
      useApp.getState().toastError(error);
    } finally {
      setBusy(false);
    }
  };

  const footer =
    showActions && card ? (
      <div className="sheet-footer">
        {existingChat ? (
          <button
            className="btn-primary"
            style={{ borderRadius: 16 }}
            onClick={() => {
              useApp.getState().closeOverlay();
              useApp.getState().push({ type: "chat", chatId: existingChat.id });
            }}
          >
            <MessageCircle size={18} fill="currentColor" /> {t("profile.write")}
          </button>
        ) : (
          <button className="btn-primary" style={{ borderRadius: 16 }} disabled={busy || liked.includes("teammates")} onClick={() => void like()}>
            {busy ? <Spinner size={18} /> : <Heart size={18} fill="currentColor" />} {liked.includes("teammates") ? t("profile.liked") : t("airshare.like")}
          </button>
        )}
      </div>
    ) : undefined;

  return (
    <Sheet title={card?.username ?? ""} footer={footer}>
      <div className="brand-bg" style={{ position: "absolute", zIndex: -1 }} aria-hidden />
      {!card ? (
        <div className="center" style={{ padding: 60 }}>
          {missing ? <span className="secondary">{t("error.generic")}</span> : <Spinner />}
        </div>
      ) : (
        <div className="container col" style={{ gap: 20, padding: "4px 20px 20px" }}>
          <label className="search-bar">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("feed.search.placeholder")} enterKeyHint="search" />
          </label>

          <div className="row" style={{ gap: 16 }}>
            <Avatar url={card.avatarUrl} size={76} ring online={card.isOnline} />
            <div className="col grow" style={{ gap: 6, minWidth: 0 }}>
              <span className="ellipsis" style={{ fontSize: 24, fontWeight: 700 }}>
                {card.username}
              </span>
              {card.status && (
                <span className="secondary" style={{ fontSize: 14, fontWeight: 500 }}>
                  {card.status}
                </span>
              )}
              <PlatformBadgeRow platforms={card.platforms} size={28} />
            </div>
          </div>

          {card.platforms.map((id) => {
            const tags = filter(card.platformGames[id] ?? []);
            return tags.length ? <GameList key={id} title={id} platform={id} tags={tags} /> : null;
          })}
          {filter(card.wantedGames).length > 0 && <GameList title={t("profile.wanted")} tags={filter(card.wantedGames)} />}

          {card.skills.length > 0 && (
            <div className="col" style={{ gap: 10 }}>
              <span style={{ fontSize: 18, fontWeight: 700 }}>{t("profile.skills")}</span>
              <div className="flow">
                {card.skills.map((skill) => (
                  <span key={skill} className="chip" style={{ background: "var(--card)", fontWeight: 600, padding: "8px 12px" }}>
                    {skill}
                  </span>
                ))}
              </div>
              {card.skillsDescription && (
                <span className="secondary" style={{ fontSize: 14 }}>
                  {card.skillsDescription}
                </span>
              )}
            </div>
          )}
        </div>
      )}
      {missing && !card && (
        <div className="center">
          <button className="btn-plain" onClick={pop}>
            {t("common.close")}
          </button>
        </div>
      )}
    </Sheet>
  );
}

function GameList({ title, platform: id, tags }: { title: string; platform?: Platform; tags: GameTag[] }) {
  const push = useApp((state) => state.push);
  const color = id ? platformColor(id) : "var(--primary)";
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 8 }}>
        {id && (
          <span style={{ color, display: "flex" }}>
            <PlatformGlyph platform={id} size={18} />
          </span>
        )}
        <span style={{ fontSize: 18, fontWeight: 700 }}>{title}</span>
      </div>
      {tags.map((tag) => (
        <button key={tag.name} className="detail-game" onClick={() => push({ type: "game", game: tag })}>
          <GameCircle game={tag} color={color} size={58} />
          <span className="grow ellipsis" style={{ fontSize: 15, fontWeight: 600 }}>
            {tag.name}
          </span>
        </button>
      ))}
    </div>
  );
}
