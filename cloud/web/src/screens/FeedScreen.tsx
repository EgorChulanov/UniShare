// FeedView.swift + FeedCardsOverlay.swift + SkillCardsOverlay.swift + CommunityStoriesRail.
import { AnimatePresence, animate, motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { Radio, Heart, UsersRound, X } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { create } from "zustand";
import type { DiscoveryKind, ProfileCard, Story } from "@unishare/shared";
import { useApp } from "../app/store";
import { api } from "../lib/api";
import { useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { Segmented, Spinner } from "../components/ui";
import { ProfileCardFace } from "../components/ProfileCardFace";
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
  const dragStart = useRef<{ x: number; y: number } | null>(null);

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
      onPointerDown={(event) => (dragStart.current = { x: event.clientX, y: event.clientY })}
      onPointerMove={(event) => {
        if (dragStart.current === null) return;
        // A mouse with no button held was released outside the window: this is a hover.
        if (event.pointerType === "mouse" && event.buttons === 0) {
          dragStart.current = null;
          return;
        }
        const dx = event.clientX - dragStart.current.x;
        const dy = event.clientY - dragStart.current.y;
        // FeedView.swift: only a mostly vertical upward drag, not a card swipe that arcs up.
        if (dy < -22 && Math.abs(dy) > Math.abs(dx) && !storiesCollapsed && stories.length) setStoriesCollapsed(true);
      }}
      onPointerUp={() => (dragStart.current = null)}
      onPointerCancel={() => (dragStart.current = null)}
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
      <ProfileCardFace card={card} kind={kind} />

      {isTop && (
        <>
          <motion.div className="swipe-indicator" style={{ opacity: likeOpacity }}>
            <span className="swipe-badge like">
              <Heart size={58} fill="#fff" color="#fff" />
            </span>
          </motion.div>
          <motion.div className="swipe-indicator" style={{ opacity: passOpacity }}>
            <span className="swipe-badge pass">
              <X size={64} color="#fff" strokeWidth={3.4} />
            </span>
          </motion.div>
        </>
      )}
    </motion.div>
  );
});
