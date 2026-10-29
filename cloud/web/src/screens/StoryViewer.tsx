import { motion } from "framer-motion";
import { Gamepad2, Heart, Link2, ShieldCheck, Sparkles, User, X } from "lucide-react";
import { useEffect, useState } from "react";
import { parseAnyLink } from "@unishare/shared";
import { useApp } from "../app/store";
import { mediaUrl } from "../lib/api";
import { platform } from "../platform/platform";
import { useStories } from "./FeedScreen";

const STORY_MS = 7000;

export function storyBackground(accentHex: string): string {
  const accent = `#${accentHex}`;
  return `radial-gradient(120% 90% at 0% 0%, ${accent}, transparent 60%), linear-gradient(160deg, ${accent}cc, #1b1f2b 85%)`;
}

export function StoryGlyph({ symbol, size = 22 }: { symbol: string; size?: number }) {
  const value = symbol.toLowerCase();
  if (value.includes("shield")) return <ShieldCheck size={size} />;
  if (value.includes("heart")) return <Heart size={size} />;
  if (value.includes("person") || value.includes("user")) return <User size={size} />;
  if (value.includes("link")) return <Link2 size={size} />;
  if (value.includes("game")) return <Gamepad2 size={size} />;
  return <Sparkles size={size} />;
}

export function StoryViewer({ index: initial }: { index: number }) {
  const stories = useStories((state) => state.stories);
  const markViewed = useStories((state) => state.markViewed);
  const pop = useApp((state) => state.pop);
  const [index, setIndex] = useState(initial);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const story = stories[index];

  useEffect(() => {
    if (story) markViewed(story);
    setElapsed(0);
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (paused) return;
    const started = performance.now() - elapsed;
    let frame = 0;
    const tick = (now: number) => {
      const value = now - started;
      if (value >= STORY_MS) {
        if (index < stories.length - 1) setIndex(index + 1);
        else pop();
        return;
      }
      setElapsed(value);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [paused, index]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!story) return null;

  const go = (delta: number) => {
    platform.haptic("selection");
    const next = index + delta;
    if (next < 0) setElapsed(0);
    else if (next >= stories.length) pop();
    else setIndex(next);
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
      style={{ background: storyBackground(story.accentHex) }}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      onPointerDown={() => setPaused(true)}
      onPointerUp={() => setPaused(false)}
      onPointerCancel={() => setPaused(false)}
    >
      <div className="story-progress">
        {stories.map((item, i) => (
          <div key={item.id}>
            <span style={{ width: i < index ? "100%" : i === index ? `${(elapsed / STORY_MS) * 100}%` : "0%" }} />
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <span className="row" style={{ gap: 8, fontWeight: 800 }}>
          <img src="/icons/icon-192.png" alt="" style={{ width: 28, height: 28, borderRadius: 8 }} /> UniShare
        </span>
        <span className="grow" />
        <button className="icon-btn small" style={{ color: "#fff", background: "rgba(255,255,255,0.15)" }} onClick={pop} aria-label="close">
          <X size={18} />
        </button>
      </div>

      <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 14, maxWidth: 560, width: "100%", margin: "0 auto" }}>
        <button style={{ position: "absolute", left: 0, top: 0, bottom: 120, width: "35%" }} onClick={() => go(-1)} aria-label="previous" />
        <button style={{ position: "absolute", right: 0, top: 0, bottom: 120, width: "65%" }} onClick={() => go(1)} aria-label="next" />
        {story.imageUrl ? (
          <img src={mediaUrl(story.imageUrl)!} alt="" style={{ borderRadius: 24, maxHeight: "40vh", objectFit: "cover" }} />
        ) : (
          <motion.div key={story.id} initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="center glass" style={{ width: 96, height: 96, borderRadius: 30, color: "#fff" }}>
            <StoryGlyph symbol={story.symbol} size={46} />
          </motion.div>
        )}
        <motion.div key={`${story.id}-text`} initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <h1 style={{ fontSize: 34, margin: "0 0 6px", letterSpacing: "-0.02em" }}>{story.title}</h1>
          <div style={{ fontSize: 17, fontWeight: 700, opacity: 0.85, marginBottom: 12 }}>{story.subtitle}</div>
          <p style={{ fontSize: 16, lineHeight: 1.5, opacity: 0.9, margin: 0 }}>{story.body}</p>
        </motion.div>
        {story.ctaTitle && story.ctaUrl && (
          <button className="btn btn-block" style={{ background: "#fff", color: "#0e1117", position: "relative", zIndex: 2 }} onClick={cta}>
            {story.ctaTitle}
          </button>
        )}
      </div>
    </motion.div>
  );
}
