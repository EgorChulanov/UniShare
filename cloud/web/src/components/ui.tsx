// Web ports of the iOS building blocks in UniShare/Components/*.swift.
import { AnimatePresence, motion, useIsPresent } from "framer-motion";
import { Star, User, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { PLATFORM_INFO, type GameTag, type Platform } from "@unishare/shared";
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

/** PlatformBadge.swift: circle tinted with the platform color, brand glyph inside. */
export function PlatformBadge({ platform: id, size = 32 }: { platform: Platform; size?: number }) {
  const color = platformColor(id);
  return (
    <span className="platform-badge" title={id} style={{ width: size, height: size, background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
      <PlatformGlyph platform={id} size={size * 0.52} />
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
export function CardStackIcon({ active }: { active: boolean }) {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <g transform="rotate(-11 11 14)">
        <rect x="2.5" y="3.5" width="17" height="21" rx="3.5" fill="currentColor" fillOpacity={active ? 0.18 : 0.1} stroke="currentColor" strokeWidth="1.5" />
      </g>
      <g transform="rotate(8 18 14)">
        <rect x="9.5" y="3.5" width="17" height="21" rx="3.5" fill={active ? "var(--primary)" : "currentColor"} fillOpacity={active ? 1 : 0.32} stroke="currentColor" strokeWidth="1.7" />
      </g>
    </svg>
  );
}

// ── Avatar (AvatarView.swift) ──────────────────────────────────────────────

export function Avatar({ url, size = 44, ring, online }: { url?: string | null; name?: string | null; size?: number; ring?: boolean; online?: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = mediaUrl(url);
  useEffect(() => setFailed(false), [src]);
  // The dot sits outside the clipped circle, on its rim (45°) for large avatars.
  const dotInset = Math.max(0, Math.round(size * 0.146 - 6));
  return (
    <span className="avatar-wrap" style={{ width: size, height: size }}>
      <span className={`avatar ${ring ? "ring" : ""}`} style={{ width: size, height: size }}>
        {src && !failed ? (
          <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
        ) : (
          <User size={size * 0.6} fill="currentColor" strokeWidth={0} />
        )}
      </span>
      {online && <span className="online-dot" style={{ right: dotInset, bottom: dotInset }} />}
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
      {game.coverUrl && !failed && <img src={game.coverUrl} alt="" loading="lazy" onError={() => setFailed(true)} />}
    </span>
  );
}

/** Horizontal row that auto-advances every 2.5 s when there are more than three games. */
export function GameCirclesRow({
  games,
  color = "var(--primary)",
  size = 52,
  titles = false,
  trailing = false,
  autoScroll = true,
  padding = 16,
}: {
  games: GameTag[];
  color?: string;
  size?: number;
  titles?: boolean;
  trailing?: boolean;
  autoScroll?: boolean;
  padding?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const index = useRef(0);

  useEffect(() => {
    if (!autoScroll || games.length <= 3) return;
    const timer = setInterval(() => {
      const row = ref.current;
      if (!row || row.matches(":hover")) return;
      index.current = (index.current + 1) % games.length;
      const item = row.children[index.current] as HTMLElement | undefined;
      if (!item) return;
      const maxScroll = row.scrollWidth - row.clientWidth;
      if (maxScroll <= 0) return;
      const target = trailing ? item.offsetLeft + item.offsetWidth - row.clientWidth + padding : item.offsetLeft - padding;
      row.scrollTo({ left: Math.max(0, Math.min(target, maxScroll)), behavior: "smooth" });
      if (target >= maxScroll && !trailing) index.current = games.length - 1;
    }, 2500);
    return () => clearInterval(timer);
  }, [autoScroll, games.length, trailing, padding]);

  if (!games.length) {
    return <div className="secondary" style={{ fontSize: 12, padding: `0 ${padding}px` }}>—</div>;
  }
  return (
    <div ref={ref} className="games-row" style={{ justifyContent: trailing ? "flex-end" : undefined, padding: `0 ${padding}px` }}>
      {games.map((game) => (
        <div className="game-item" key={game.name} style={{ width: titles ? Math.max(size, 54) : size }}>
          <GameCircle game={game} color={color} size={size} />
          {titles && <span style={{ width: Math.max(size, 54) }}>{game.name}</span>}
        </div>
      ))}
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
    <button className="icon-circle" onClick={onClick} aria-label={t("common.close")}>
      <X size={16} strokeWidth={2.6} />
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
