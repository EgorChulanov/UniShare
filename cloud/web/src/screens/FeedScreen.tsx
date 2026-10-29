import { AnimatePresence, animate, motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { Heart, Layers, Maximize2, QrCode, RefreshCw, RotateCcw, Sparkles, Star, X } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { create } from "zustand";
import { LIMITS, PLATFORM_INFO, type DiscoveryKind, type ProfileCard, type Story } from "@unishare/shared";
import { useApp } from "../app/store";
import { api } from "../lib/api";
import { useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { Avatar, Empty, GamesRow, PlatformGlyph, ProviderIcon, Segmented, Spinner } from "../components/ui";
import { storyBackground, StoryGlyph } from "./StoryViewer";

// ── Stories ────────────────────────────────────────────────────────────────

interface StoriesState {
  stories: Story[];
  load(): Promise<void>;
  markViewed(story: Story): void;
}

export const useStories = create<StoriesState>((set) => ({
  stories: [],
  async load() {
    const stories = await api.stories().catch(() => null);
    if (stories) set({ stories });
  },
  markViewed(story) {
    set((state) => ({ stories: state.stories.map((item) => (item.id === story.id ? { ...item, isSeen: true } : item)) }));
    void api.viewStory(story.id).catch(() => undefined);
  },
}));

function StoriesRail() {
  const stories = useStories((state) => state.stories);
  const push = useApp((state) => state.push);
  if (!stories.length) return null;
  return (
    <div className="stories">
      {stories.map((story, index) => (
        <button
          key={story.id}
          className={`story-tile ${story.isSeen ? "" : "unseen"}`}
          style={{ background: storyBackground(story.accentHex) }}
          onClick={() => {
            platform.haptic("light");
            push({ type: "story", index });
          }}
        >
          <StoryGlyph symbol={story.symbol} size={22} />
          <span className="t">{story.title}</span>
        </button>
      ))}
    </div>
  );
}

// ── Feed state (kept across tab switches) ─────────────────────────────────

interface Deck {
  cards: ProfileCard[];
  loading: boolean;
  loaded: boolean;
  exhausted: boolean;
}

interface FeedState {
  kind: DiscoveryKind;
  decks: Record<DiscoveryKind, Deck>;
  undoStack: { card: ProfileCard; kind: DiscoveryKind }[];
  setKind(kind: DiscoveryKind): void;
  load(kind: DiscoveryKind, reset?: boolean): Promise<void>;
  remove(kind: DiscoveryKind, uid: string): void;
  restore(kind: DiscoveryKind, card: ProfileCard): void;
}

const emptyDeck = (): Deck => ({ cards: [], loading: false, loaded: false, exhausted: false });

export const useFeed = create<FeedState>((set, get) => ({
  kind: "teammates",
  decks: { teammates: emptyDeck(), skills: emptyDeck() },
  undoStack: [],
  setKind(kind) {
    set({ kind });
    if (!get().decks[kind].loaded) void get().load(kind);
  },
  async load(kind, reset = false) {
    const deck = get().decks[kind];
    if (deck.loading) return;
    set((state) => ({ decks: { ...state.decks, [kind]: { ...(reset ? emptyDeck() : deck), loading: true } } }));
    try {
      const current = reset ? [] : get().decks[kind].cards;
      const batch = await api.feed(kind, 12, current.map((card) => card.uid));
      set((state) => ({
        decks: {
          ...state.decks,
          [kind]: { cards: [...current, ...batch.filter((card) => !current.some((c) => c.uid === card.uid))], loading: false, loaded: true, exhausted: batch.length < 12 },
        },
      }));
    } catch (error) {
      set((state) => ({ decks: { ...state.decks, [kind]: { ...state.decks[kind], loading: false, loaded: true } } }));
      useApp.getState().toastError(error);
    }
  },
  remove(kind, uid) {
    set((state) => ({ decks: { ...state.decks, [kind]: { ...state.decks[kind], cards: state.decks[kind].cards.filter((card) => card.uid !== uid) } } }));
    const deck = get().decks[kind];
    if (deck.cards.length < 4 && !deck.exhausted) void get().load(kind);
  },
  restore(kind, card) {
    set((state) => ({ decks: { ...state.decks, [kind]: { ...state.decks[kind], cards: [card, ...state.decks[kind].cards.filter((c) => c.uid !== card.uid)] } } }));
  },
}));

const UNDO_KEY = "unishare.undo";
function undoAllowance(): { date: string; count: number } {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const stored = JSON.parse(localStorage.getItem(UNDO_KEY) ?? "null") as { date: string; count: number } | null;
    return stored?.date === today ? stored : { date: today, count: 0 };
  } catch {
    return { date: today, count: 0 };
  }
}

// ── Screen ─────────────────────────────────────────────────────────────────

export function FeedScreen() {
  const t = useT();
  const kind = useFeed((state) => state.kind);
  const deck = useFeed((state) => state.decks[state.kind]);
  const undoStack = useFeed((state) => state.undoStack);
  const push = useApp((state) => state.push);
  const toast = useApp((state) => state.toast);
  const topRef = useRef<SwipeHandle>(null);
  const [storiesCollapsed, setStoriesCollapsed] = useState(false);

  useEffect(() => {
    if (!useFeed.getState().decks[kind].loaded) void useFeed.getState().load(kind);
    void useStories.getState().load();
    // Load the other deck in the background so switching is instant.
    const other: DiscoveryKind = kind === "teammates" ? "skills" : "teammates";
    if (!useFeed.getState().decks[other].loaded) void useFeed.getState().load(other);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decide = useCallback(
    async (card: ProfileCard, decision: "like" | "dislike") => {
      const feed = useFeed.getState();
      feed.remove(kind, card.uid);
      if (decision === "dislike") {
        useFeed.setState((state) => ({ undoStack: [...state.undoStack.slice(-2), { card, kind }] }));
      }
      try {
        const result = await api.swipe(card.uid, kind, decision);
        if (result.matched && result.chatId) {
          useApp.getState().showMatch(result.chatId, card);
          void useApp.getState().loadChats();
        } else if (decision === "like") {
          toast(t("feed.liked"));
        }
      } catch (error) {
        feed.restore(kind, card);
        useApp.getState().toastError(error);
      }
    },
    [kind, t, toast],
  );

  const undo = async () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    const allowance = undoAllowance();
    if (allowance.count >= LIMITS.maxUndoPerDay) {
      toast(t("feed.undo.limit"));
      return;
    }
    useFeed.setState((state) => ({ undoStack: state.undoStack.slice(0, -1) }));
    const { restored } = await api.undo(last.card.uid, last.kind).catch(() => ({ restored: false }));
    if (restored) {
      useFeed.getState().restore(last.kind, last.card);
      platform.haptic("medium");
      try {
        localStorage.setItem(UNDO_KEY, JSON.stringify({ date: allowance.date, count: allowance.count + 1 }));
      } catch {
        /* ignored */
      }
    }
  };

  // Keyboard shortcuts on desktop: ← pass, → like.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (useApp.getState().overlays.length || (event.target as HTMLElement)?.tagName === "INPUT") return;
      if (event.key === "ArrowRight") topRef.current?.swipe("right");
      if (event.key === "ArrowLeft") topRef.current?.swipe("left");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const cards = deck.cards.slice(0, 3);

  return (
    <div
      className="screen"
      style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}
      onTouchMove={undefined}
    >
      <div style={{ maxWidth: 520, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <AnimatePresence initial={false}>
          {!storiesCollapsed ? (
            <motion.div key="stories" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden", flexShrink: 0 }}>
              <StoriesRail />
            </motion.div>
          ) : (
            <motion.button
              key="handle"
              className="center"
              style={{ width: "100%", padding: "2px 0 8px" }}
              onClick={() => setStoriesCollapsed(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <span style={{ width: 34, height: 4, borderRadius: 2, background: "var(--text-3)" }} />
            </motion.button>
          )}
        </AnimatePresence>

        <div className="row" style={{ marginBottom: 10, flexShrink: 0 }}>
          <Segmented
            id="feed"
            value={kind}
            onChange={(value) => useFeed.getState().setKind(value)}
            options={[
              { value: "teammates", label: t("feed.segment.teammates") },
              { value: "skills", label: t("feed.segment.skills") },
            ]}
          />
          <button className="icon-btn" style={{ width: 46, height: 46 }} onClick={() => push({ type: "nearby" })} aria-label={t("feed.nearby")}>
            <QrCode size={20} />
          </button>
        </div>

        <div
          className="feed-stage"
          onPointerDown={() => !storiesCollapsed && useStories.getState().stories.length > 0 && setStoriesCollapsed(true)}
        >
          {!deck.loaded || (deck.loading && !deck.cards.length) ? (
            <div className="swipe-card center" style={{ cursor: "default" }}>
              <Spinner size={36} />
            </div>
          ) : cards.length === 0 ? (
            <div className="glass center" style={{ position: "absolute", inset: 0, borderRadius: "var(--radius-xl)" }}>
              <Empty icon={<Layers size={30} />} title={t("feed.empty")} subtitle={t("feed.empty.subtitle")}>
                <button className="btn btn-glass" onClick={() => void useFeed.getState().load(kind, true)}>
                  <RefreshCw size={16} /> {t("feed.refresh")}
                </button>
              </Empty>
            </div>
          ) : (
            [...cards]
              .reverse()
              .map((card) => {
                const depth = cards.indexOf(card);
                return (
                  <SwipeCard
                    key={card.uid}
                    ref={depth === 0 ? topRef : undefined}
                    card={card}
                    kind={kind}
                    depth={depth}
                    onDecide={(decision) => void decide(card, decision)}
                    onOpen={() => push({ type: "profile", uid: card.uid, card })}
                  />
                );
              })
          )}
        </div>

        <div className="feed-actions">
          <button className="feed-action small glass" onClick={() => void undo()} disabled={!undoStack.length} aria-label={t("feed.undo")} style={{ opacity: undoStack.length ? 1 : 0.4 }}>
            <RotateCcw size={20} color="var(--warning)" />
          </button>
          <button className="feed-action pass glass" onClick={() => topRef.current?.swipe("left")} disabled={!cards.length} aria-label={t("feed.swipe.pass")}>
            <X size={30} strokeWidth={3} />
          </button>
          <button className="feed-action like" onClick={() => topRef.current?.swipe("right")} disabled={!cards.length} aria-label={t("feed.swipe.like")}>
            <Heart size={28} fill="#fff" />
          </button>
          <button
            className="feed-action small glass"
            onClick={() => cards[0] && push({ type: "profile", uid: cards[0].uid, card: cards[0] })}
            disabled={!cards.length}
            aria-label={t("feed.card.tap_details")}
          >
            <Maximize2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Swipe card ─────────────────────────────────────────────────────────────

interface SwipeHandle {
  swipe(direction: "left" | "right"): void;
}

const SWIPE_THRESHOLD = 110;

const SwipeCard = forwardRef<SwipeHandle, {
  card: ProfileCard;
  kind: DiscoveryKind;
  depth: number;
  onDecide(decision: "like" | "dislike"): void;
  onOpen(): void;
}>(function SwipeCard({ card, kind, depth, onDecide, onOpen }, ref) {
  const t = useT();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-14, 0, 14]);
  const likeOpacity = useTransform(x, [20, SWIPE_THRESHOLD], [0, 1]);
  const passOpacity = useTransform(x, [-SWIPE_THRESHOLD, -20], [1, 0]);
  const leaving = useRef(false);
  const isTop = depth === 0;

  const flyOff = useCallback(
    (direction: "left" | "right") => {
      if (leaving.current) return;
      leaving.current = true;
      platform.haptic(direction === "right" ? "medium" : "light");
      const target = (direction === "right" ? 1 : -1) * (window.innerWidth + 200);
      void animate(x, target, { duration: 0.32, ease: [0.4, 0, 0.9, 0.6] }).then(() => onDecide(direction === "right" ? "like" : "dislike"));
    },
    [onDecide, x],
  );

  useImperativeHandle(ref, () => ({ swipe: flyOff }), [flyOff]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > SWIPE_THRESHOLD || info.velocity.x > 700) flyOff("right");
    else if (info.offset.x < -SWIPE_THRESHOLD || info.velocity.x < -700) flyOff("left");
    else void animate(x, 0, { type: "spring", stiffness: 500, damping: 32 });
  };

  const featured = card.platforms.find((id) => (card.platformGames[id]?.length ?? 0) > 0) ?? card.platforms[0] ?? null;
  const featuredGames = (featured && card.platformGames[featured]?.length ? card.platformGames[featured]! : card.games).slice(0, 12);
  const accent = featured ? PLATFORM_INFO[featured].color : "#0057FF";

  return (
    <motion.div
      className="swipe-card"
      style={{ x: isTop ? x : 0, rotate: isTop ? rotate : 0, zIndex: 10 - depth, ["--accent" as string]: accent === "#1B2838" || accent === "#313131" ? "#4d8bff" : accent }}
      initial={{ scale: 0.92, y: 24, opacity: 0 }}
      animate={{ scale: 1 - depth * 0.04, y: depth * 12, opacity: depth > 2 ? 0 : 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      drag={isTop ? "x" : false}
      dragElastic={0.9}
      dragMomentum={false}
      onDragEnd={onDragEnd}
      onTap={() => isTop && Math.abs(x.get()) < 6 && onOpen()}
      aria-hidden={!isTop}
    >
      <div className="glow" />
      <div className="sheen" />
      {isTop && (
        <>
          <motion.div className="stamp like" style={{ opacity: likeOpacity }}>{t("feed.swipe.like")}</motion.div>
          <motion.div className="stamp pass" style={{ opacity: passOpacity }}>{t("feed.swipe.pass")}</motion.div>
        </>
      )}
      <div className="content">
        <div className="row" style={{ gap: 13 }}>
          <span style={{ borderRadius: "50%", boxShadow: "0 0 0 1px rgba(255,255,255,0.22)" }}>
            <Avatar url={card.avatarUrl} name={card.username} size={56} online={card.isOnline} />
          </span>
          <div className="grow">
            <div className="row" style={{ gap: 6 }}>
              <span className="name ellipsis">{card.username}</span>
              {card.providers.map((provider) => (
                <span key={provider} style={{ opacity: 0.7 }}>
                  <ProviderIcon provider={provider} size={14} />
                </span>
              ))}
            </div>
            {card.status && <div className="sub ellipsis">{card.status}</div>}
          </div>
          {card.rating > 0 && (
            <span className="rating-pill">
              <Star size={12} fill="#FFB020" color="#FFB020" /> {card.rating.toFixed(1)}
            </span>
          )}
        </div>

        <div style={{ flex: 1, minHeight: 18 }} />

        {kind === "skills" ? (
          <div>
            <h4 className="row" style={{ gap: 6 }}>
              <Sparkles size={16} /> {t("profile.skills")}
            </h4>
            <div className="chips" style={{ marginBottom: 14 }}>
              {card.skills.length ? (
                card.skills.slice(0, 10).map((skill) => (
                  <span key={skill} className="chip" style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}>{skill}</span>
                ))
              ) : (
                <span className="sub">{t("skills.empty")}</span>
              )}
            </div>
            {card.skillsDescription && (
              <p className="sub" style={{ fontSize: 14, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden", margin: 0 }}>
                {card.skillsDescription}
              </p>
            )}
          </div>
        ) : (
          <div>
            {featured && (
              <div className="row" style={{ marginBottom: 16, flexWrap: "wrap", gap: 6 }}>
                {card.platforms.slice(0, 3).map((id) => (
                  <span key={id} className="platform-pill">
                    <PlatformGlyph platform={id} size={14} /> {id}
                  </span>
                ))}
                {card.platforms.length > 3 && <span className="platform-pill">+{card.platforms.length - 3}</span>}
              </div>
            )}
            <h4>{t("profile.games")}</h4>
            {featuredGames.length ? <GamesRow games={featuredGames} size={58} /> : <div className="sub">{t("feed.platforms.empty")}</div>}
            {card.wantedGames.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <h4>{t("profile.wanted")}</h4>
                <GamesRow games={card.wantedGames.slice(0, 10)} size={50} />
              </div>
            )}
          </div>
        )}

        <div style={{ flex: 1, minHeight: 12 }} />
        <div className="row sub" style={{ fontSize: 11 }}>
          <span className="grow">{t("feed.card.tap_details")}</span>
          <Maximize2 size={12} />
        </div>
      </div>
    </motion.div>
  );
});
