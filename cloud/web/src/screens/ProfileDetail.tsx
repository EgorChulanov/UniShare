import { Flag, Heart, MessageCircle, Search, Share2, ShieldOff, Sparkles, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PLATFORM_INFO, subscriptionService, telegramAppLink, vkAppLink, webLink, type DiscoveryKind, type ProfileCard, type Review } from "@unishare/shared";
import { useApp } from "../app/store";
import { api } from "../lib/api";
import { useT, useI18n } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { Avatar, BrandIcon, GameCircle, PlatformBadge, PROVIDER_COLORS, ProviderIcon, Sheet, Spinner, Stars, relativeTime } from "../components/ui";
import { useFeed } from "./FeedScreen";

/** Full profile of another player (ProfileDetailSheet.swift + actions). */
export function ProfileDetailSheet({ uid, card: initial }: { uid: string; card?: ProfileCard }) {
  const t = useT();
  const language = useI18n((state) => state.language);
  const me = useApp((state) => state.profile);
  const config = useApp((state) => state.config);
  const chats = useApp((state) => state.chats);
  const push = useApp((state) => state.push);
  const pop = useApp((state) => state.pop);
  const toast = useApp((state) => state.toast);
  const toastError = useApp((state) => state.toastError);
  const [card, setCard] = useState<ProfileCard | null>(initial ?? null);
  const [liked, setLiked] = useState<DiscoveryKind[]>([]);
  const [reviews, setReviews] = useState<Review[] | null>(null);
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
    api.reviews(uid).then(setReviews).catch(() => setReviews([]));
  }, [uid]);

  const existingChat = chats.find((chat) => chat.partner.uid === uid);
  const isMe = me?.uid === uid;

  const filter = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return <T extends { name: string }>(items: T[]) => (needle ? items.filter((item) => item.name.toLowerCase().includes(needle)) : items);
  }, [query]);

  if (missing && !card) {
    return (
      <Sheet title="UniShare">
        <div className="empty">
          <h3>{t("error.generic")}</h3>
        </div>
      </Sheet>
    );
  }
  if (!card) {
    return (
      <Sheet title="">
        <div className="center" style={{ padding: 60 }}>
          <Spinner />
        </div>
      </Sheet>
    );
  }

  const like = async (kind: DiscoveryKind) => {
    setBusy(true);
    try {
      platform.haptic("medium");
      const result = await api.swipe(card.uid, kind, "like");
      useFeed.getState().remove(kind, card.uid);
      setLiked((current) => [...current, kind]);
      if (result.matched && result.chatId) {
        pop();
        useApp.getState().showMatch(result.chatId, card);
        void useApp.getState().loadChats();
      } else {
        toast(t("profile.liked"), "success");
      }
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    const link = { kind: "profile" as const, uid: card.uid };
    const url =
      platform.kind === "telegram" && config?.telegramBotUsername
        ? telegramAppLink(config.telegramBotUsername, config.telegramAppShortName, link)
        : platform.kind === "vk" && config?.vkAppId
          ? vkAppLink(config.vkAppId, link)
          : webLink(config?.publicUrl ?? location.origin, link);
    await platform.share({ url, text: `${card.username} — UniShare` });
  };

  const block = async () => {
    if (!window.confirm(t("chat.block.confirmation"))) return;
    try {
      await api.block(card.uid);
      useFeed.getState().remove("teammates", card.uid);
      useFeed.getState().remove("skills", card.uid);
      toast(t("chat.blocked"));
      pop();
    } catch (error) {
      toastError(error);
    }
  };

  const ownedTotal = Object.values(card.platformGames).reduce((sum, games) => sum + (games?.length ?? 0), 0);

  return (
    <Sheet title={card.username} full wide>
      <div className="col" style={{ gap: 18, maxWidth: 680, margin: "0 auto" }}>
        <div className="profile-hero glass">
          <div className="bg" />
          <div className="row" style={{ position: "relative", gap: 16 }}>
            <Avatar url={card.avatarUrl} name={card.username} size={84} online={card.isOnline} ring />
            <div className="grow">
              <div style={{ fontSize: 24, fontWeight: 800 }} className="ellipsis">{card.username}</div>
              {card.status && <div className="muted" style={{ fontWeight: 600 }}>{card.status}</div>}
              <div className="row" style={{ marginTop: 8, gap: 12, flexWrap: "wrap" }}>
                <span className="stat">
                  <Star size={14} fill="#FFB020" color="#FFB020" /> {card.rating > 0 ? `${card.rating.toFixed(1)} · ${card.reviewCount}` : t("profile.reviews.empty")}
                </span>
                {card.providers.map((provider) => (
                  <span key={provider} style={{ color: PROVIDER_COLORS[provider] }} title={provider}>
                    <ProviderIcon provider={provider} size={18} />
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="row" style={{ position: "relative", marginTop: 14, gap: 8, flexWrap: "wrap" }}>
            {card.platforms.map((id) => (
              <PlatformBadge key={id} platform={id} size={34} />
            ))}
          </div>
        </div>

        {!isMe && (
          <div className="row" style={{ gap: 10 }}>
            {existingChat ? (
              <button
                className="btn btn-primary grow"
                onClick={() => {
                  pop();
                  useApp.getState().setTab("chats");
                  setTimeout(() => push({ type: "chat", chatId: existingChat.id }), 30);
                }}
              >
                <MessageCircle size={18} /> {t("profile.write")}
              </button>
            ) : (
              <>
                <button className="btn btn-primary grow" disabled={busy || liked.includes("teammates")} onClick={() => void like("teammates")}>
                  <Heart size={18} fill={liked.includes("teammates") ? "#fff" : "none"} />
                  {liked.includes("teammates") ? t("profile.liked") : t("profile.like")}
                </button>
                {card.skills.length > 0 && (
                  <button className="btn btn-glass" disabled={busy || liked.includes("skills")} onClick={() => void like("skills")} title={t("feed.segment.skills")}>
                    <Sparkles size={18} />
                  </button>
                )}
              </>
            )}
            <button className="icon-btn" style={{ width: 50, height: 50 }} onClick={() => void share()} aria-label={t("profile.share")}>
              <Share2 size={19} />
            </button>
          </div>
        )}

        {ownedTotal > 6 && (
          <label className="search">
            <Search size={18} className="faint" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("feed.search.placeholder")} />
          </label>
        )}

        {card.platforms.map((id) => {
          const games = filter(card.platformGames[id] ?? []);
          if (!games.length) return null;
          return (
            <section key={id}>
              <div className="section-title" style={{ marginTop: 0 }}>
                <span style={{ color: PLATFORM_INFO[id].color === "#1B2838" || PLATFORM_INFO[id].color === "#313131" ? "var(--text)" : PLATFORM_INFO[id].color }}>
                  <PlatformBadge platform={id} size={28} />
                </span>
                {id}
                <span className="pill">{games.length}</span>
              </div>
              <div className="col" style={{ gap: 8 }}>
                {games.map((game) => (
                  <div key={game.name} className="list-item glass" style={{ borderRadius: 20 }}>
                    <GameCircle game={game} size={52} />
                    <span className="title grow">{game.name}</span>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        {filter(card.wantedGames).length > 0 && (
          <section>
            <div className="section-title" style={{ marginTop: 0 }}>{t("profile.wanted")}</div>
            <div className="chips">
              {filter(card.wantedGames).map((game) => (
                <span key={game.name} className="chip">
                  <GameCircle game={game} size={24} /> {game.name}
                </span>
              ))}
            </div>
          </section>
        )}

        {card.skills.length > 0 && (
          <section>
            <div className="section-title" style={{ marginTop: 0 }}>
              <Sparkles size={18} /> {t("profile.skills")}
            </div>
            <div className="chips">
              {card.skills.map((skill) => (
                <span key={skill} className="chip">{skill}</span>
              ))}
            </div>
            {card.skillsDescription && <p className="muted" style={{ margin: "12px 4px 0", lineHeight: 1.5 }}>{card.skillsDescription}</p>}
          </section>
        )}

        {card.subscriptions.length > 0 && (
          <section>
            <div className="section-title" style={{ marginTop: 0 }}>{t("profile.subscriptions")}</div>
            <div className="chips">
              {card.subscriptions.map((sub) => {
                const brand = subscriptionService(sub.name)?.brand;
                return (
                  <span key={sub.id} className="chip">
                    {brand && <BrandIcon file={brand} size={16} />} {sub.name}
                    {sub.planName ? <span className="faint">· {sub.planName}</span> : null}
                  </span>
                );
              })}
            </div>
          </section>
        )}

        <section>
          <div className="section-title" style={{ marginTop: 0 }}>{t("profile.reviews")}</div>
          {reviews === null ? (
            <Spinner />
          ) : reviews.length === 0 ? (
            <div className="faint" style={{ padding: "0 4px" }}>{t("profile.reviews.empty")}</div>
          ) : (
            <div className="col" style={{ gap: 8 }}>
              {reviews.map((review) => (
                <div key={review.id} className="glass card" style={{ padding: 14, borderRadius: 20 }}>
                  <div className="row">
                    <span className="grow" style={{ fontWeight: 800 }}>{review.fromUsername ?? "—"}</span>
                    <Stars value={review.rating} />
                  </div>
                  {review.text && <div style={{ marginTop: 6 }}>{review.text}</div>}
                  <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>{relativeTime(review.createdAt, language)}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {!isMe && (
          <div className="row" style={{ justifyContent: "center", gap: 8, paddingBottom: 12 }}>
            <button className="btn btn-ghost" onClick={() => push({ type: "report", uid: card.uid, username: card.username })}>
              <Flag size={16} /> {t("chat.report")}
            </button>
            <button className="btn btn-ghost" style={{ color: "var(--danger)" }} onClick={() => void block()}>
              <ShieldOff size={16} /> {t("chat.block")}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
