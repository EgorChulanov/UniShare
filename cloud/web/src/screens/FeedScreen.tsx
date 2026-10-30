// FeedView.swift + FeedCardsOverlay.swift + SkillCardsOverlay.swift + CommunityStoriesRail.
import { AnimatePresence, animate, motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { Radio, Heart, Maximize2, Star, UsersRound, X } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { create } from "zustand";
import type { DiscoveryKind, ProfileCard, Story } from "@unishare/shared";
import { useApp } from "../app/store";
import { api } from "../lib/api";
import { useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { Avatar, BrandIcon, GameCirclesRow, PlatformGlyph, Segmented, Spinner } from "../components/ui";
import { PLATFORM_INFO } from "@unishare/shared";
import { StoryGlyph } from "./StoryViewer";

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

/** CommunityStoryCard (106×106). */
function StoryCard({ story, onClick }: { story: Story; onClick(): void }) {
  const accent = `#${story.accentHex}`;
  return (
    <button
      className="story-card"
      onClick={onClick}
      style={{
        background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 95%, transparent), color-mix(in srgb, ${accent} 46%, transparent), var(--card))`,
        opacity: story.isSeen ? 0.72 : 1,
      }}
    >
      {story.imageUrl ? <img src={story.imageUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.82)" }} /> : <span className="deco" />}
      <span className="shade" />
      <span className="inner">
        <span className="sym">
          <StoryGlyph symbol={story.symbol} size={15} />
        </span>
        <span className="t">{story.title}</span>
      </span>
      <span className="stroke" style={{ boxShadow: story.isSeen ? "inset 0 0 0 1px rgba(255,255,255,0.12)" : `inset 0 0 0 2.5px ${accent}` }} />
    </button>
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

// ── Screen ─────────────────────────────────────────────────────────────────

export function FeedScreen() {
  const t = useT();
  const kind = useFeed((state) => state.kind);
  const deck = useFeed((state) => state.decks[state.kind]);
  const stories = useStories((state) => state.stories);
  const push = useApp((state) => state.push);
  const topRef = useRef<SwipeHandle>(null);
  const [storiesCollapsed, setStoriesCollapsed] = useState(false);
  const dragStart = useRef<number | null>(null);

  useEffect(() => {
    const feed = useFeed.getState();
    // Reload when returning to an empty deck: new profiles may have appeared.
    if (!feed.decks[kind].loaded || (feed.decks[kind].cards.length === 0 && !feed.decks[kind].loading)) void feed.load(kind, true);
    const other: DiscoveryKind = kind === "teammates" ? "skills" : "teammates";
    if (!feed.decks[other].loaded) void feed.load(other);
    void useStories.getState().load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decide = useCallback(
    async (card: ProfileCard, decision: "like" | "dislike") => {
      const feed = useFeed.getState();
      feed.remove(kind, card.uid);
      if (decision === "dislike") useFeed.setState((state) => ({ undoStack: [...state.undoStack.slice(-2), { card, kind }] }));
      try {
        const result = await api.swipe(card.uid, kind, decision);
        if (result.matched && result.chatId) {
          platform.haptic("success");
          useApp.getState().toast(`${t("feed.swipe.match")} · ${card.username}`, "success");
          void useApp.getState().loadChats();
        }
      } catch (error) {
        feed.restore(kind, card);
        useApp.getState().toastError(error);
      }
    },
    [kind, t],
  );

  // Keyboard on desktop: ← pass, → like.
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
      style={{ display: "flex", flexDirection: "column", overflow: "hidden", paddingBottom: "var(--tabbar-space)" }}
      onPointerDown={(event) => (dragStart.current = event.clientY)}
      onPointerMove={(event) => {
        if (dragStart.current === null) return;
        const dy = event.clientY - dragStart.current;
        if (dy < -22 && !storiesCollapsed && stories.length) setStoriesCollapsed(true);
      }}
      onPointerUp={() => (dragStart.current = null)}
    >
      <div className="container feed-column" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {stories.length > 0 && (
          <AnimatePresence initial={false} mode="popLayout">
            {storiesCollapsed ? (
              <motion.button key="handle" className="stories-handle" onClick={() => setStoriesCollapsed(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <span className="bar" />
                <svg width="10" height="7" viewBox="0 0 10 7" aria-hidden>
                  <path d="M1 1.5l4 4 4-4" stroke="var(--text-2)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                </svg>
              </motion.button>
            ) : (
              <motion.div key="rail" initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ type: "spring", stiffness: 380, damping: 34 }}>
                <div className="stories-rail">
                  {stories.map((story, index) => (
                    <StoryCard key={story.id} story={story} onClick={() => push({ type: "story", index })} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        <div className="row" style={{ gap: 10, padding: "6px 16px 10px" }}>
          <Segmented
            id="feed"
            value={kind}
            onChange={(value) => useFeed.getState().setKind(value)}
            options={[
              { value: "teammates", label: t("feed.segment.teammates") },
              { value: "skills", label: t("feed.segment.skills") },
            ]}
          />
          <button className="liquid center" style={{ width: 42, height: 42, borderRadius: "50%" }} onClick={() => push({ type: "airshare" })} aria-label={t("feed.airshare.nearby")}>
            <Radio size={19} strokeWidth={2.4} />
          </button>
        </div>

        <div className="feed-stage">
          {!deck.loaded || (deck.loading && !deck.cards.length) ? (
            <div className="center" style={{ height: "100%" }}>
              <Spinner size={30} />
            </div>
          ) : cards.length === 0 ? (
            <div className="center col" style={{ height: "100%", gap: 14, textAlign: "center", padding: 28 }}>
              <UsersRound size={42} strokeWidth={1.8} />
              <div style={{ fontSize: 19, fontWeight: 700 }}>{t("feed.empty")}</div>
              <div className="secondary" style={{ fontSize: 14, fontWeight: 500 }}>{t("feed.empty.subtitle")}</div>
            </div>
          ) : (
            [...cards].reverse().map((card) => {
              const depth = cards.indexOf(card);
              return (
                <SwipeCard
                  key={card.uid}
                  ref={depth === 0 ? topRef : undefined}
                  card={card}
                  kind={kind}
                  depth={depth}
                  onDecide={(decision) => void decide(card, decision)}
                  onOpen={() => push({ type: "profile", uid: card.uid, card, source: "feed" })}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ── Swipe card ─────────────────────────────────────────────────────────────

interface SwipeHandle {
  swipe(direction: "left" | "right"): void;
}

const SWIPE_THRESHOLD = 105;

const SwipeCard = forwardRef<SwipeHandle, {
  card: ProfileCard;
  kind: DiscoveryKind;
  depth: number;
  onDecide(decision: "like" | "dislike"): void;
  onOpen(): void;
}>(function SwipeCard({ card, kind, depth, onDecide, onOpen }, ref) {
  const t = useT();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, (value) => (value / Math.max(window.innerWidth, 1)) * 12);
  const likeOpacity = useTransform(x, [24, SWIPE_THRESHOLD], [0, 1]);
  const passOpacity = useTransform(x, [-SWIPE_THRESHOLD, -24], [1, 0]);
  const yScaled = useTransform(y, (value) => value * 0.24);
  const leaving = useRef(false);
  const isTop = depth === 0;

  const flyOff = useCallback(
    (direction: "left" | "right") => {
      if (leaving.current) return;
      leaving.current = true;
      void animate(x, direction === "right" ? 720 : -720, { duration: 0.24, ease: "easeIn" }).then(() => {
        if (direction === "right") {
          platform.haptic("medium");
          setTimeout(() => platform.haptic("light"), 100);
        } else {
          platform.haptic("light");
        }
        onDecide(direction === "right" ? "like" : "dislike");
      });
    },
    [onDecide, x],
  );

  useImperativeHandle(ref, () => ({ swipe: flyOff }), [flyOff]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > SWIPE_THRESHOLD) flyOff("right");
    else if (info.offset.x < -SWIPE_THRESHOLD) flyOff("left");
    else {
      void animate(x, 0, { type: "spring", stiffness: 380, damping: 30 });
      void animate(y, 0, { type: "spring", stiffness: 380, damping: 30 });
    }
  };

  const featured = card.platforms.find((id) => (card.platformGames[id]?.length ?? 0) > 0) ?? card.platforms[0] ?? null;
  const playing = featured && card.platformGames[featured]?.length ? card.platformGames[featured]! : card.games;

  return (
    <motion.div
      className="swipe-card"
      style={{
        x: isTop ? x : 0,
        y: isTop ? yScaled : depth * 10,
        rotate: isTop ? rotate : depth % 2 === 0 ? -1 : 1,
        zIndex: 10 - depth,
      }}
      initial={{ scale: 0.94, opacity: 0 }}
      animate={{ scale: isTop ? 1 : 1 - depth * 0.035, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      drag={isTop ? "x" : false}
      dragElastic={1}
      dragMomentum={false}
      onDrag={(_, info) => y.set(info.offset.y)}
      onDragEnd={onDragEnd}
      onTap={() => isTop && Math.abs(x.get()) < 8 && onOpen()}
      aria-hidden={!isTop}
    >
      <span className="deco" />
      <div className="content">
        <div className="row" style={{ gap: 13 }}>
          <span style={{ borderRadius: "50%", boxShadow: "0 0 0 1px rgba(255,255,255,0.22)" }}>
            <Avatar url={card.avatarUrl} size={54} />
          </span>
          <div className="grow">
            <div className="name ellipsis">{card.username}</div>
            {card.status && <div className="status ellipsis">{card.status}</div>}
          </div>
          {kind === "teammates" && card.rating > 0 && (
            <span className="rating-pill">
              <Star size={11} fill="#fff" color="#fff" /> {card.rating.toFixed(1)}
            </span>
          )}
        </div>

        <div style={{ flex: 1, minHeight: 18 }} />

        {featured && (
          <div style={{ marginBottom: kind === "skills" ? 24 : 20 }}>
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
                {card.skills.map((skill) => (
                  <span key={skill} className="skill-chip">{skill}</span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.48)" }}>{t("skills.empty")}</div>
            )}
          </div>
        ) : (
          <div>
            <h4>{t("profile.games")}</h4>
            {playing.length ? (
              <GameCirclesRow games={playing} color="#ffffff" size={58} padding={22} />
            ) : (
              <div style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.45)" }}>{t("profile.games.add.hint")}</div>
            )}
            {card.wantedGames.length > 0 && (
              <div style={{ marginTop: 22 }}>
                <h4>{t("profile.wanted")}</h4>
                <GameCirclesRow games={card.wantedGames} color="#ffffff" size={58} padding={22} />
              </div>
            )}
          </div>
        )}

        <div style={{ flex: 1, minHeight: 12 }} />
        <div className="card-footer">
          <span className="grow">{t("feed.card.tap_details")}</span>
          <Maximize2 size={11} strokeWidth={2.6} />
        </div>
      </div>

      {isTop && (
        <>
          <motion.div className="swipe-indicator" style={{ opacity: likeOpacity }}>
            <Heart size={82} fill="#32D875" color="#32D875" />
          </motion.div>
          <motion.div className="swipe-indicator" style={{ opacity: passOpacity }}>
            <X size={82} color="#FF453A" strokeWidth={4} />
          </motion.div>
        </>
      )}
    </motion.div>
  );
});
