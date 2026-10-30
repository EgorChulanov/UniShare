// Port of ProfileDetailSheet in UniShare/Features/Feed/FeedCardsOverlay.swift.
// Opened from search, chats or AirShare it also gets a Like / Message button.
// Other people's profiles get Report / Block in the top-left menu, as in ChatView.
import { AnimatePresence, motion } from "framer-motion";
import { Ellipsis, Flag, Gamepad2, Heart, MessageCircle, Search, Star, UserX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DiscoveryKind, GameTag, Platform, ProfileCard } from "@unishare/shared";
import { useApp } from "../app/store";
import { api } from "../lib/api";
import { useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { ActionSheet, Avatar, PlatformBadgeRow, PlatformMark, Sheet, Spinner, gameInitials, useEscape } from "../components/ui";
import { useFeed } from "./FeedScreen";

export function ProfileDetailSheet({ uid, card: initial, source }: { uid: string; card?: ProfileCard; source?: "feed" }) {
  const t = useT();
  const me = useApp((state) => state.profile);
  const chats = useApp((state) => state.chats);
  // A like request from this user (e.g. opened from the requests row in Chats).
  const request = useApp((state) => state.requests.find((item) => item.from.uid === uid));
  const pop = useApp((state) => state.pop);
  const [card, setCard] = useState<ProfileCard | null>(initial ?? null);
  const [liked, setLiked] = useState<DiscoveryKind[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  useEscape(() => setMenuOpen(false), menuOpen);

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
  const isOther = me?.uid !== uid;
  const showActions = source !== "feed" && isOther;
  // The server matches only a like of the same kind as the request.
  const kind: DiscoveryKind = request?.kind ?? "teammates";

  /** Still the top overlay: the user may close the sheet while a request runs. */
  const isOpen = () => {
    const top = useApp.getState().overlays.at(-1);
    return top?.type === "profile" && top.uid === uid;
  };

  const like = async () => {
    if (!card) return;
    setBusy(true);
    try {
      let chatId: string | null = null;
      if (request) {
        // Accepting creates the chat; another like would only send a request back.
        chatId = (await api.acceptRequest(request.id)).chatId;
        useApp.setState((state) => ({ requests: state.requests.filter((item) => item.id !== request.id) }));
      } else {
        const result = await api.swipe(card.uid, kind, "like");
        if (result.matched && result.chatId) chatId = result.chatId;
      }
      useFeed.getState().remove(kind, card.uid);
      setLiked((current) => [...current, kind]);
      if (chatId) {
        platform.haptic("success");
        useApp.getState().toast(`${t("feed.swipe.match")} · ${card.username}`, "success");
        await useApp.getState().loadChats();
        if (isOpen()) useApp.getState().replace({ type: "chat", chatId });
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

  const block = async () => {
    setConfirmBlock(false);
    if (!card) return;
    // Opened from the chat with this person: that chat goes away too. Checked before
    // the request, since the realtime update may drop the chat while it is in flight.
    const below = useApp.getState().overlays.at(-2);
    const fromTheirChat = below?.type === "chat" && useApp.getState().chats.some((chat) => chat.id === below.chatId && chat.partner.uid === card.uid);
    try {
      await api.block(card.uid);
      useFeed.getState().remove("teammates", card.uid);
      useFeed.getState().remove("skills", card.uid);
      useApp.setState((state) => ({
        chats: state.chats.filter((chat) => chat.partner.uid !== card.uid),
        requests: state.requests.filter((item) => item.from.uid !== card.uid),
      }));
      useApp.getState().toast(t("chat.blocked"), "success");
      if (isOpen()) {
        if (fromTheirChat) useApp.getState().popOverlays(2);
        else pop();
      }
    } catch (error) {
      useApp.getState().toastError(error);
    }
  };

  const menu =
    isOther && card ? (
      <div style={{ position: "relative" }}>
        <button className="close-btn" onClick={() => setMenuOpen((open) => !open)} aria-label={t("chat.more")} aria-expanded={menuOpen}>
          <Ellipsis size={20} strokeWidth={2.6} color="var(--accent-text)" />
        </button>
        <AnimatePresence>
          {menuOpen && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 4 }} onClick={() => setMenuOpen(false)} />
              <motion.div
                className="menu-pop material"
                style={{ left: 0, right: "auto", transformOrigin: "top left" }}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ type: "spring", stiffness: 520, damping: 34 }}
              >
                <button
                  className="destructive"
                  onClick={() => {
                    setMenuOpen(false);
                    useApp.getState().push({ type: "report", uid: card.uid, username: card.username });
                  }}
                >
                  {t("chat.report")} <Flag size={18} />
                </button>
                <button
                  className="destructive"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmBlock(true);
                  }}
                >
                  {t("chat.block")} <UserX size={18} />
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    ) : undefined;

  const footer =
    showActions && card ? (
      <div className="sheet-footer">
        {existingChat ? (
          <button
            className="btn-primary"
            style={{ borderRadius: 16 }}
            onClick={() => useApp.getState().replace({ type: "chat", chatId: existingChat.id })}
          >
            <MessageCircle size={18} fill="currentColor" /> {t("profile.write")}
          </button>
        ) : (
          <button className="btn-primary" style={{ borderRadius: 16 }} disabled={busy || liked.includes(kind)} onClick={() => void like()}>
            {busy ? <Spinner size={18} /> : <Heart size={18} fill="currentColor" />} {liked.includes(kind) ? t("profile.liked") : t("airshare.like")}
          </button>
        )}
      </div>
    ) : undefined;

  return (
    <>
      <Sheet title={card?.username ?? ""} lead={menu} footer={footer}>
        <div className="brand-bg" style={{ position: "absolute", zIndex: -1 }} aria-hidden />
        {!card ? (
          <div className="center" style={{ padding: 60 }}>
            {missing ? <span className="secondary">{t("error.generic")}</span> : <Spinner />}
          </div>
        ) : (
          <div className="container col" style={{ gap: 20, padding: "4px 20px 20px" }}>
            <DetailHero card={card} />

            <label className="search-field glass compact">
              <Search size={18} strokeWidth={2.4} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("feed.search.placeholder")} enterKeyHint="search" />
            </label>

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
      {/* Outside the sheet: on wide screens its transform would hold this fixed layer. */}
      <AnimatePresence>
        {confirmBlock && (
          <ActionSheet
            title={t("chat.block.confirmation")}
            actions={[{ label: t("chat.block"), destructive: true, onSelect: () => void block() }]}
            cancelLabel={t("cancel")}
            onCancel={() => setConfirmBlock(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/** Hero in the card's language: the player's game artwork behind a dark veil, avatar, name and stats. */
function DetailHero({ card }: { card: ProfileCard }) {
  const t = useT();
  const art = [...Object.values(card.platformGames).flat(), ...card.games, ...card.wantedGames].find((game) => game?.coverUrl)?.coverUrl ?? null;
  const [artFailed, setArtFailed] = useState(false);
  const gameCount = new Set([...card.games, ...Object.values(card.platformGames).flat()].map((game) => game?.name.toLowerCase())).size;
  return (
    <div className="detail-hero">
      <span className="card-art" aria-hidden>
        {art && !artFailed && <img src={art} alt="" draggable={false} onError={() => setArtFailed(true)} />}
      </span>
      <div className="row" style={{ position: "relative", gap: 16 }}>
        <span className="card-avatar">
          <Avatar url={card.avatarUrl} size={80} online={card.isOnline} />
        </span>
        <div className="col grow" style={{ gap: 4, minWidth: 0 }}>
          <span className="ellipsis" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em" }}>
            {card.username}
          </span>
          {card.status && <span className="clamp-2" style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>{card.status}</span>}
        </div>
      </div>
      <div className="hero-stats" style={{ position: "relative", marginTop: 18 }}>
        <span>
          <Star size={16} fill="currentColor" strokeWidth={0} />
          {card.rating > 0 ? `${card.rating.toFixed(1)} · ${card.reviewCount}` : t("profile.stats.no_reviews")}
        </span>
        <span aria-label={t("profile.stats.games", gameCount)}>
          <Gamepad2 size={18} strokeWidth={2.2} />
          {gameCount}
        </span>
        {card.platforms.length > 0 && (
          <span className="hero-platforms">
            <PlatformBadgeRow platforms={card.platforms} size={26} />
          </span>
        )}
      </div>
    </div>
  );
}

/** One platform's games as a grid of covers; tap opens the game page. */
function GameList({ title, platform: id, tags }: { title: string; platform?: Platform; tags: GameTag[] }) {
  const push = useApp((state) => state.push);
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 10 }}>
        {id && <PlatformMark platform={id} size={28} />}
        <span style={{ fontSize: 18, fontWeight: 800 }}>{title}</span>
        <span className="secondary" style={{ fontSize: 14, fontWeight: 700 }}>
          {tags.length}
        </span>
      </div>
      <div className="game-grid detail-grid">
        {tags.map((tag) => (
          <DetailGameCard key={tag.name} tag={tag} onClick={() => push({ type: "game", game: tag })} />
        ))}
      </div>
    </div>
  );
}

function DetailGameCard({ tag, onClick }: { tag: GameTag; onClick(): void }) {
  const [failed, setFailed] = useState(false);
  return (
    <button className="game-card" onClick={onClick}>
      {tag.coverUrl && !failed ? (
        <img src={tag.coverUrl} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} />
      ) : (
        <span className="game-card-blank" aria-hidden>
          {gameInitials(tag.name)}
        </span>
      )}
      <span className="shade" />
      <span className="name">{tag.name}</span>
    </button>
  );
}
