// Web ports of the iOS building blocks in UniShare/Components/*.swift.
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "framer-motion";
import {
  Check,
  Crosshair,
  Crown,
  Dice5,
  Flame,
  Gamepad2,
  Gem,
  Ghost,
  Headset,
  Joystick,
  Moon,
  Orbit,
  Rocket,
  Shield,
  Skull,
  Star,
  Sword,
  Swords,
  Trophy,
  User,
  WandSparkles,
  X,
  Zap,
  type LucideProps,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { AVATAR_PRESET_PREFIX, PLATFORM_INFO, avatarPreset, isAvatarArtUrl, type AvatarPreset, type GameTag, type Platform } from "@unishare/shared";
import { mediaUrl } from "../lib/api";
import { useApp } from "../app/store";
import { platform } from "../platform/platform";
import { useT } from "../i18n/i18n";

export function BrandBackground() {
  return <div className="brand-bg" aria-hidden />;
}

// ── Icons ──────────────────────────────────────────────────────────────────

export function BrandIcon({ file, size = 18, color, style }: { file: string; size?: number; color?: string; style?: CSSProperties }) {
  return <span className="brand-icon" aria-hidden style={{ width: size, height: size, ["--icon" as string]: `url(/brands/${file})`, color, ...style }} />;
}

export function PlatformGlyph({ platform: id, size = 16 }: { platform: Platform; size?: number }) {
  const info = PLATFORM_INFO[id];
  if (info.brand) return <BrandIcon file={info.brand} size={size} />;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      {id === "PC" ? (
        <>
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M8 20h8M12 16v4" />
        </>
      ) : (
        <>
          <rect x="7" y="2" width="10" height="20" rx="2.5" />
          <path d="M11 18h2" />
        </>
      )}
    </svg>
  );
}

/** Platform.color; the darkest brand colors are mixed with the text color so they stay readable in dark mode. */
export function platformColor(id: Platform): string {
  const color = PLATFORM_INFO[id].color;
  if (color === "#1B2838" || color === "#313131") return `color-mix(in srgb, ${color} 55%, var(--text) 45%)`;
  if (color === "#003791" || color === "#4A148C") return `color-mix(in srgb, ${color} 72%, var(--text) 28%)`;
  return color;
}

/** Platform as a neutral circle with the brand glyph (m2); brand colour lives only in solid marks. */
/** Two letters for a game without artwork: the first letters of its first two words ("Dota 2" → "D2"). */
export function gameInitials(name: string): string {
  const [first = name, second] = name.match(/[\p{L}\p{N}]+/gu) ?? [];
  // By code point, so letters outside the BMP ("𝔇𝔞𝔯𝔨 𝔖𝔬𝔲𝔩𝔰") are never cut in half.
  const letters = [...first];
  return (second ? letters[0] + [...second][0] : letters.slice(0, 2).join("")).toUpperCase();
}

export function PlatformBadge({ platform: id, size = 32 }: { platform: Platform; size?: number }) {
  return (
    <span className="platform-badge" title={id} style={{ width: size, height: size }}>
      <PlatformGlyph platform={id} size={size * 0.52} />
    </span>
  );
}

/** Solid brand square with a white glyph, as in the Search platform grid. */
export function PlatformMark({ platform: id, size = 28 }: { platform: Platform; size?: number }) {
  return (
    <span className="platform-mark" title={id} style={{ width: size, height: size, borderRadius: Math.round(size * 0.32), ["--brand" as string]: PLATFORM_INFO[id].color }}>
      <PlatformGlyph platform={id} size={Math.round(size * 0.58)} />
    </span>
  );
}

/** Selected state: a solid violet disc with a white tick (m2). */
export function SelectedDot({ size = 22 }: { size?: number }) {
  return (
    <span className="selected-dot" style={{ width: size, height: size }} aria-hidden>
      <Check size={Math.round(size * 0.62)} strokeWidth={3} />
    </span>
  );
}

export function PlatformBadgeRow({ platforms, size = 28 }: { platforms: Platform[]; size?: number }) {
  return (
    <div className="row" style={{ gap: 8 }}>
      {platforms.map((id) => (
        <PlatformBadge key={id} platform={id} size={size} />
      ))}
    </div>
  );
}

export function ProviderIcon({ provider, size = 18 }: { provider: "telegram" | "vk"; size?: number }) {
  return <BrandIcon file={provider === "telegram" ? "telegram.svg" : "vk.svg"} size={size} />;
}

export const PROVIDER_COLORS = { telegram: "#2AABEE", vk: "#0077FF" } as const;

/** Two overlapping cards, CardStackTabIcon in TabBarView.swift. */
/** Feed tab glyph from the store screenshots: a filled card in front of two stacked edges. */
export function CardStackIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden>
      <rect x="7.5" y="3" width="15" height="2.6" rx="1.3" fill="currentColor" opacity="0.55" />
      <rect x="5.5" y="6.8" width="19" height="2.8" rx="1.4" fill="currentColor" opacity="0.8" />
      <rect x="3.5" y="11" width="23" height="16" rx="4" fill="currentColor" />
    </svg>
  );
}

// ── Avatar (AvatarView.swift) ──────────────────────────────────────────────

/** An uploaded photo, game art (cropped towards the characters), or an original "preset:<id>" avatar. */
export function Avatar({ url, size = 44, ring, online }: { url?: string | null; name?: string | null; size?: number; ring?: boolean; online?: boolean }) {
  const [failed, setFailed] = useState(false);
  const preset = avatarPreset(url);
  // An unknown preset id (e.g. from a newer client) falls back to the placeholder.
  const src = url?.startsWith(AVATAR_PRESET_PREFIX) ? null : mediaUrl(url);
  useEffect(() => setFailed(false), [src]);
  // The dot sits outside the clipped circle, on its rim (45°) for large avatars.
  const dotInset = Math.max(0, Math.round(size * 0.146 - 6));
  return (
    <span className="avatar-wrap" style={{ width: size, height: size }}>
      <span className={`avatar ${ring ? "ring" : ""}`} style={{ width: size, height: size }}>
        {preset ? (
          <PresetAvatar preset={preset} size={size} />
        ) : src && !failed ? (
          <img src={src} alt="" loading="lazy" draggable={false} className={isAvatarArtUrl(url) ? "art" : undefined} onError={() => setFailed(true)} />
        ) : (
          <User size={size * 0.6} fill="currentColor" strokeWidth={0} />
        )}
      </span>
      {online && <span className="online-dot" style={{ right: dotInset, bottom: dotInset }} />}
    </span>
  );
}

// ── Original UniShare avatars (shared/src/avatars.ts) ───────────────────────

type Glyph = ComponentType<LucideProps>;

/** A dragon head in profile: swept-back horn, spiked mane, open jaws. */
const DragonGlyph: Glyph = ({ size = 24, strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M5 21c1.5-2.4 3.3-4.4 5.6-5.6l9-1.2-5.4-1.6 7.4-1.8c-1.6-1.2-3.6-2-5.6-2.3l-2.4-1.4C11 4.6 7.6 3.2 3.6 2.8c2.4 1.6 4.2 3.4 5.2 5.4-1.2 1-1.8 2-2 3.2l-2.8 1 2.2 1.6-2.4 1.6 2 1.6-2 3.8z" />
    <path d="M12.6 9.9l1.6-.5" fill="none" />
  </svg>
);

/** Three slash marks. */
const ClawGlyph: Glyph = ({ size = 24, strokeWidth = 2, fill: _fill, fillOpacity: _opacity, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" {...props}>
    <path d="M4 16.5C6.6 12 9.4 8.3 13.2 4.6" />
    <path d="M7.4 20.2c2.9-4.9 6-8.8 10.2-12.6" />
    <path d="M12.4 21c2.4-3.6 4.8-6.4 7.8-9" />
  </svg>
);

/** A space helmet with a wide visor on its collar. */
const VisorGlyph: Glyph = ({ size = 24, strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M8.2 18.6a8 8 0 1 1 7.6 0" />
    <path d="M7 19h10v2.5H7z" />
    <path d="M6.6 10.2C6.6 8.3 8.1 7 10 7h4c1.9 0 3.4 1.3 3.4 3.2v1c0 2.2-1.8 3.8-4 3.8h-2.8c-2.2 0-4-1.6-4-3.8z" fill="currentColor" fillOpacity={0.45} />
  </svg>
);

const PRESET_GLYPHS: Record<string, Glyph> = {
  controller: Gamepad2,
  joystick: Joystick,
  sword: Sword,
  swords: Swords,
  shield: Shield,
  crown: Crown,
  ghost: Ghost,
  rocket: Rocket,
  flame: Flame,
  bolt: Zap,
  skull: Skull,
  dragon: DragonGlyph,
  crosshair: Crosshair,
  orbit: Orbit,
  gem: Gem,
  trophy: Trophy,
  headset: Headset,
  moon: Moon,
  wand: WandSparkles,
  claw: ClawGlyph,
  dice: Dice5,
  visor: VisorGlyph,
};

/** Gradient disc with a glossy highlight, a large faded echo of the emblem and the emblem itself. */
export function PresetAvatar({ preset, size }: { preset: AvatarPreset; size: number }) {
  const Glyph = PRESET_GLYPHS[preset.id] ?? Gamepad2;
  const style = { ["--a" as string]: preset.colors[0], ["--b" as string]: preset.colors[1], ["--ink" as string]: preset.ink ?? "#fff", ["--s" as string]: `${size}px` };
  return (
    <span className="preset-avatar" style={style} aria-hidden>
      <Glyph className="echo" size={Math.round(size * 0.92)} strokeWidth={1.6} />
      <Glyph className="emblem" size={Math.round(size * 0.5)} strokeWidth={size < 40 ? 2.4 : 2.1} fill="currentColor" fillOpacity={0.2} />
    </span>
  );
}

// ── Game art ───────────────────────────────────────────────────────────────

/** Stable hue per title, so the initials placeholders of different games differ. */
function titleHue(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) | 0;
  return Math.abs(hash) % 360;
}

/** Cover art, or the game's initials on a tinted gradient when there is none or it fails to load. */
export function GameArt({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (src && !failed) return <img className={className} src={src} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} />;
  return (
    <span className={`game-art-blank ${className ?? ""}`} style={{ ["--hue" as string]: titleHue(name) }} aria-hidden>
      {gameInitials(name)}
    </span>
  );
}

// ── Games (GameCirclesRow.swift) ───────────────────────────────────────────

export function GameCircle({ game, color = "var(--primary)", size = 44 }: { game: GameTag; color?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [game.coverUrl]);
  return (
    <span
      className="game-circle"
      title={game.name}
      style={{
        width: size,
        height: size,
        background: `color-mix(in srgb, ${color} 18%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 45%, transparent)`,
        color,
      }}
    >
      {game.name.slice(0, 2).toUpperCase()}
      {game.coverUrl && !failed && <img src={game.coverUrl} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} />}
    </span>
  );
}

const GAMES_GAP = 10;
/** Marquee speed in px/s: calm enough to read the covers. */
const GAMES_SPEED = 24;

/**
 * A finger or pen held on a moving row pauses it until that press ends. Pointer events, not
 * :active: touches do not reliably get :active (on the swipe card, whose row has touch-action: none,
 * a held finger never did). Every press ends in pointerup or pointercancel, so the pause cannot stick.
 */
export function holdMarquee(event: ReactPointerEvent<HTMLElement>) {
  if (event.pointerType === "mouse") return; // a mouse pauses it by hovering
  const element = event.currentTarget;
  const pointerId = event.pointerId;
  element.dataset.held = "";
  const release = (end: PointerEvent) => {
    if (end.pointerId !== pointerId) return;
    delete element.dataset.held;
    window.removeEventListener("pointerup", release, true);
    window.removeEventListener("pointercancel", release, true);
  };
  window.addEventListener("pointerup", release, true);
  window.addEventListener("pointercancel", release, true);
}

/**
 * Game covers in a row that glides continuously, like the "Popular now" rail in search,
 * once there are three or more games or they do not fit. Pauses only while a finger is
 * down or a mouse hovers it; with reduced motion it is a still row that scrolls by hand.
 */
export function GameCirclesRow({
  games,
  color = "var(--primary)",
  size = 52,
  titles = false,
  autoScroll = true,
  padding = 16,
}: {
  games: GameTag[];
  color?: string;
  size?: number;
  titles?: boolean;
  autoScroll?: boolean;
  padding?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [width, setWidth] = useState(0);

  // Measured before paint, so a moving row never flashes as a still one first.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const itemWidth = titles ? Math.max(size, 54) : size;
  const setWidthPx = games.length * (itemWidth + GAMES_GAP);
  const fits = setWidthPx - GAMES_GAP <= width - padding * 2;
  const moving = autoScroll && !reducedMotion && width > 0 && games.length > 0 && (games.length >= 3 || !fits);

  const item = (game: GameTag, key: string | number, hidden: boolean) => (
    <div className="game-item" key={key} style={{ width: itemWidth }} aria-hidden={hidden || undefined}>
      <GameCircle game={game} color={color} size={size} />
      {titles && <span style={{ width: itemWidth }}>{game.name}</span>}
    </div>
  );

  if (!games.length) {
    return (
      <div ref={ref} className="secondary" style={{ fontSize: 12, padding: `0 ${padding}px` }}>
        —
      </div>
    );
  }
  if (!moving) {
    return (
      <div ref={ref} className="games-row" style={{ paddingInline: padding }}>
        {games.map((game) => item(game, game.name, false))}
      </div>
    );
  }

  // One period holds the games repeated until it is at least as wide as the row, and the
  // track holds three periods. It slides from the second period (aligned with the padding)
  // to the third, which looks exactly the same, so the jump back is invisible.
  const repeats = Math.max(1, Math.ceil(width / setWidthPx));
  const period = repeats * setWidthPx;
  const loop = Array.from({ length: repeats * 3 }, () => games).flat();
  const firstShown = repeats * games.length;
  return (
    <div ref={ref} className="games-marquee" onPointerDown={holdMarquee}>
      <div
        className="games-track"
        style={{
          ["--from" as string]: `${padding - period}px`,
          ["--to" as string]: `${padding - period * 2}px`,
          ["--dur" as string]: `${(period / GAMES_SPEED).toFixed(2)}s`,
          ["--gap" as string]: `${GAMES_GAP}px`,
        }}
      >
        {/* Only the first copy of each game in the starting period is read out. */}
        {loop.map((game, index) => item(game, index, index < firstShown || index >= firstShown + games.length))}
      </div>
    </div>
  );
}

// ── Controls ───────────────────────────────────────────────────────────────

/** LiquidSegmentedPicker.swift */
export function Segmented<T extends string>({ options, value, onChange, id }: { options: { value: T; label: string }[]; value: T; onChange(value: T): void; id: string }) {
  return (
    <div className="segmented liquid" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={value === option.value}
          className={value === option.value ? "active" : ""}
          onClick={() => {
            if (value !== option.value) platform.haptic("light");
            onChange(option.value);
          }}
        >
          {value === option.value && <motion.span layoutId={`seg-${id}`} className="thumb" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange(value: boolean): void; label?: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`ios-toggle ${on ? "on" : ""}`}
      onClick={() => {
        platform.haptic("selection");
        onChange(!on);
      }}
    />
  );
}

export function Spinner({ size = 22 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} role="status" />;
}

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="row" style={{ gap: 2 }}>
      {[1, 2, 3, 4, 5].map((index) => (
        <Star key={index} size={size} fill={index <= Math.round(value) ? "var(--yellow)" : "none"} color="var(--yellow)" />
      ))}
    </span>
  );
}

export function CloseButton({ onClick }: { onClick(): void }) {
  const t = useT();
  return (
    <button className="close-btn" onClick={onClick} aria-label={t("common.close")}>
      <span className="x-disc">
        <X size={14} strokeWidth={3.2} />
      </span>
    </button>
  );
}

// ── Sheet (SwiftUI .sheet + NavigationView inline title) ───────────────────

export function Sheet({
  title,
  children,
  lead,
  trail,
  detent = "large",
  onClose,
  footer,
}: {
  title?: ReactNode;
  children: ReactNode;
  lead?: ReactNode;
  trail?: ReactNode;
  detent?: "large" | "medium" | "full";
  onClose?: () => void;
  footer?: ReactNode;
}) {
  const pop = useApp((state) => state.pop);
  const close = onClose ?? pop;
  const isDialog = window.matchMedia("(min-width: 760px)").matches && detent !== "full";
  return (
    <>
      <motion.div className="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
      <motion.div
        className={`sheet ${detent === "medium" ? "medium" : detent === "full" ? "fullscreen" : ""}`}
        role="dialog"
        aria-modal
        initial={isDialog ? { opacity: 0, scale: 0.95, x: "-50%", y: "-48%" } : { y: "100%" }}
        animate={isDialog ? { opacity: 1, scale: 1, x: "-50%", y: "-50%" } : { y: 0 }}
        exit={isDialog ? { opacity: 0, scale: 0.97, x: "-50%", y: "-48%" } : { y: "100%" }}
        transition={{ type: "spring", stiffness: 400, damping: 40 }}
      >
        {detent !== "full" && <div className="grabber" />}
        <div className="nav-bar">
          <div className="lead">{lead}</div>
          <div className="title">{title}</div>
          <div className="trail">{trail === undefined ? <CloseButton onClick={close} /> : trail}</div>
        </div>
        <div className="sheet-body">{children}</div>
        {footer}
      </motion.div>
    </>
  );
}

// ── Toasts ─────────────────────────────────────────────────────────────────

export function Toasts() {
  const t = useT();
  const toasts = useApp((state) => state.toasts);
  const online = useApp((state) => state.online);
  const phase = useApp((state) => state.phase);
  const [showOffline, setShowOffline] = useState(false);
  useEffect(() => {
    if (online || phase !== "ready") {
      setShowOffline(false);
      return;
    }
    const timer = setTimeout(() => setShowOffline(true), 5000);
    return () => clearTimeout(timer);
  }, [online, phase]);

  return (
    <div className="toast-wrap" aria-live="polite">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div key={toast.id} className={`toast material ${toast.kind}`} initial={{ opacity: 0, y: -16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12 }}>
            {toast.text}
          </motion.div>
        ))}
        {showOffline && (
          <motion.div key="offline" className="toast material" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Spinner size={16} /> {t("common.offline")}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function relativeTime(iso: string, language: string): string {
  const date = new Date(iso);
  const diff = (Date.now() - date.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(language, { numeric: "always", style: "short" });
  if (diff < 60) return rtf.format(-Math.max(1, Math.floor(diff)), "second");
  if (diff < 3600) return rtf.format(-Math.floor(diff / 60), "minute");
  if (diff < 86_400) return rtf.format(-Math.floor(diff / 3600), "hour");
  if (diff < 30 * 86_400) return rtf.format(-Math.floor(diff / 86_400), "day");
  return date.toLocaleDateString(language, { day: "numeric", month: "short" });
}

// ── Escape for nested layers ───────────────────────────────────────────────

/** Open nested layers, last opened last; Escape closes only the top one. */
const escapeHandlers: (() => void)[] = [];

function onEscapeKey(event: KeyboardEvent) {
  const handler = escapeHandlers[escapeHandlers.length - 1];
  if (event.key !== "Escape" || event.isComposing || !handler) return;
  // Capture phase on window runs before App's handler, which then leaves the overlay open.
  event.preventDefault();
  event.stopPropagation();
  handler();
}

/** Escape closes this layer (lightbox, confirmation, menu) instead of the whole sheet under it. */
export function useEscape(handler: () => void, active = true): void {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    if (!active) return;
    const entry = () => latest.current();
    if (!escapeHandlers.length) window.addEventListener("keydown", onEscapeKey, true);
    escapeHandlers.push(entry);
    return () => {
      escapeHandlers.splice(escapeHandlers.indexOf(entry), 1);
      if (!escapeHandlers.length) window.removeEventListener("keydown", onEscapeKey, true);
    };
  }, [active]);
}

// ── Clipboard ──────────────────────────────────────────────────────────────

/** Clipboard API, or a hidden textarea + execCommand where it is missing or blocked (old webviews, http). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  const focused = document.activeElement as HTMLElement | null;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  // 16px keeps iOS from zooming in on the temporary field.
  area.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;pointer-events:none";
  document.body.appendChild(area);
  area.select();
  area.setSelectionRange(0, text.length);
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  area.remove();
  focused?.focus?.({ preventScroll: true });
  return copied;
}

// ── Confirmation dialog (SwiftUI .confirmationDialog → iOS action sheet) ──

export interface ActionSheetAction {
  label: string;
  destructive?: boolean;
  onSelect(): void;
}

export function ActionSheet({ title, message, actions, cancelLabel, onCancel }: { title?: string; message?: string; actions: ActionSheetAction[]; cancelLabel: string; onCancel(): void }) {
  // Not while it slides out, so the next Escape reaches the layer underneath.
  useEscape(onCancel, useIsPresent());
  return (
    <>
      <motion.div className="backdrop" style={{ zIndex: 80 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel} />
      <motion.div className="action-sheet" role="alertdialog" initial={{ y: "110%" }} animate={{ y: 0 }} exit={{ y: "110%" }} transition={{ type: "spring", stiffness: 420, damping: 40 }}>
        <div className="group-box material">
          {(title || message) && (
            <div className="head">
              {title && <div className="title">{title}</div>}
              {message && <div className="message">{message}</div>}
            </div>
          )}
          {actions.map((action) => (
            <button
              key={action.label}
              className={action.destructive ? "destructive" : ""}
              onClick={() => {
                platform.haptic(action.destructive ? "warning" : "light");
                action.onSelect();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
        <div className="group-box material">
          <button className="cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </motion.div>
    </>
  );
}
