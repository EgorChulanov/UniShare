// Port of CommunityStoryViewer in UniShare/Features/Chat/CommunityStoriesView.swift.
// Tapping the right / left side moves between the stories of the rail.
import { motion, useIsPresent } from "framer-motion";
import { ChevronLeft, ChevronRight, Gamepad2, Heart, Link2, ShieldCheck, Sparkles, User, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { parseAnyLink } from "@unishare/shared";
import { useApp } from "../app/store";
import { mediaUrl } from "../lib/api";
import { platform } from "../platform/platform";
import { useStories } from "./FeedScreen";

const STORY_MS = 7000;

export function StoryGlyph({ symbol, size = 22 }: { symbol: string; size?: number }) {
  const value = symbol.toLowerCase();
  if (value.includes("shield")) return <ShieldCheck size={size} strokeWidth={2.4} />;
  if (value.includes("heart")) return <Heart size={size} strokeWidth={2.4} fill="currentColor" />;
  if (value.includes("person") || value.includes("user")) return <User size={size} strokeWidth={2.4} fill="currentColor" />;
  if (value.includes("link")) return <Link2 size={size} strokeWidth={2.4} />;
  if (value.includes("game")) return <Gamepad2 size={size} strokeWidth={2.4} />;
  return <Sparkles size={size} strokeWidth={2.4} fill="currentColor" />;
}

export function StoryViewer({ index: initial }: { index: number }) {
  const stories = useStories((state) => state.stories);
  const markViewed = useStories((state) => state.markViewed);
  const pop = useApp((state) => state.pop);
  const [index, setIndex] = useState(initial);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  // The timer reads these, not the `elapsed` of an older render: every story starts at 0.
  const elapsedRef = useRef(0);
  const startRef = useRef(0);
  const story = stories[index];

  useEffect(() => {
    if (story) markViewed(story);
    // Runs before the timer effect below, which then starts the new story from 0.
    elapsedRef.current = 0;
    setElapsed(0);
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (paused) return;
    // Resumes where the pause stopped.
    startRef.current = performance.now() - elapsedRef.current;
    let frame = 0;
    const tick = (now: number) => {
      const value = now - startRef.current;
      if (value >= STORY_MS) {
        if (index < stories.length - 1) setIndex(index + 1);
        else pop();
        return;
      }
      elapsedRef.current = value;
      setElapsed(value);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [paused, index]); // eslint-disable-line react-hooks/exhaustive-deps

  // Desktop: the arrow keys move between stories like the arrow buttons beside the stage. The
  // viewer owns them until it unmounts, exit animation included, so they never reach the feed's
  // like / pass keys underneath; a held key does not race through the rail.
  const isPresent = useIsPresent();
  const presentRef = useRef(isPresent);
  useLayoutEffect(() => {
    presentRef.current = isPresent;
  });
  const goRef = useRef<(delta: number) => void>(() => undefined);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.key !== "ArrowRight" && event.key !== "ArrowLeft") || event.altKey || event.metaKey || event.ctrlKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat || !presentRef.current) return;
      goRef.current(event.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  if (!story) return null;
  const accent = `#${story.accentHex}`;
  const image = mediaUrl(story.imageUrl);

  const go = (delta: number) => {
    platform.haptic("selection");
    const next = index + delta;
    if (next < 0) {
      // Back on the first story restarts it.
      startRef.current = performance.now();
      elapsedRef.current = 0;
      setElapsed(0);
    } else if (next >= stories.length) pop();
    else setIndex(next);
  };

  // The keyboard stops at the last story, as ← does at the first; Escape and the close button close.
  goRef.current = (delta) => {
    if (delta > 0 && index >= stories.length - 1) return;
    go(delta);
  };

  const cta = () => {
    if (!story.ctaUrl) return;
    const link = parseAnyLink(story.ctaUrl);
    pop();
    if (link) setTimeout(() => useApp.getState().openDeepLink(link), 60);
    else if (/^https?:\/\//.test(story.ctaUrl)) platform.openLink(story.ctaUrl);
  };

  return (
    <motion.div
      className="story-viewer"
      style={{ ["--story-accent" as string]: accent }}
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 380, damping: 40 }}
    >
      <button className="story-backdrop" onClick={pop} aria-label="close" tabIndex={-1} />
      <button className="story-nav prev" onClick={() => go(-1)} disabled={index === 0} aria-label="previous">
        <ChevronLeft size={26} strokeWidth={2.6} />
      </button>
      <div
        className="story-stage"
        // A plain accent stays where color-mix() is unsupported and drops the whole gradient value;
        // otherwise the night layer covers it, as under the original gradient.
        style={{
          backgroundColor: accent,
          backgroundImage: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 58%, transparent) 50%, #0d0b19), linear-gradient(#0d0b19, #0d0b19)`,
        }}
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerCancel={() => setPaused(false)}
        onPointerLeave={() => setPaused(false)}
      >
        {image ? (
          <>
            <img src={image} alt="" className="story-image" />
            <div className="story-image-shade" />
          </>
        ) : (
          <span className="story-art" aria-hidden>
            <StoryGlyph symbol={story.symbol} size={210} />
          </span>
        )}
        <div className="story-inner">
          <div className="story-progress">
            {stories.map((item, i) => (
              <div key={item.id}>
                <span style={{ width: i < index ? "100%" : i === index ? `${(elapsed / STORY_MS) * 100}%` : "0%" }} />
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 12, position: "relative", zIndex: 2 }}>
            <span className="row" style={{ gap: 6, fontSize: 14, fontWeight: 700 }}>
              <StoryGlyph symbol={story.symbol} size={15} /> UniShare
            </span>
            <span className="grow" />
            <button className="story-close" onClick={pop} aria-label="close">
              <X size={15} strokeWidth={3} />
            </button>
          </div>

          <div style={{ position: "relative", flex: 1 }}>
            <button style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "35%" }} onClick={() => go(-1)} aria-label="previous" />
            <button style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "65%" }} onClick={() => go(1)} aria-label="next" />
          </div>

          <motion.div key={story.id} initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 28 }}>
            <div className="story-symbol">
              <StoryGlyph symbol={story.symbol} size={30} />
            </div>
            <h1 style={{ fontSize: 34, fontWeight: 800, margin: 0, lineHeight: 1.1 }}>{story.title}</h1>
            <div style={{ fontSize: 17, fontWeight: 600, color: "rgba(255,255,255,0.82)", marginTop: 10 }}>{story.subtitle}</div>
            <p style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.78)", lineHeight: 1.6, margin: "18px 0 0" }}>{story.body}</p>
            {story.ctaTitle && story.ctaUrl && (
              <button className="story-cta" style={{ color: accent }} onClick={cta}>
                {story.ctaTitle}
              </button>
            )}
          </motion.div>
        </div>
      </div>
      <button className="story-nav next" onClick={() => go(1)} aria-label="next">
        <ChevronRight size={26} strokeWidth={2.6} />
      </button>
    </motion.div>
  );
}
