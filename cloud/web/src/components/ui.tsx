import { AnimatePresence, motion } from "framer-motion";
import { Star, X } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { PLATFORM_INFO, type GameTag, type Platform } from "@unishare/shared";
import { mediaUrl } from "../lib/api";
import { useApp } from "../app/store";
import { platform } from "../platform/platform";
import { useT } from "../i18n/i18n";

// ── Icons ──────────────────────────────────────────────────────────────────

export function BrandIcon({ file, size = 18, color, style }: { file: string; size?: number; color?: string; style?: CSSProperties }) {
  return (
    <span
      className="brand-icon"
      aria-hidden
      style={{ width: size, height: size, ["--icon" as string]: `url(/brands/${file})`, color, ...style }}
    />
  );
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

export function PlatformBadge({ platform: id, size = 32 }: { platform: Platform; size?: number }) {
  const info = PLATFORM_INFO[id];
  return (
    <span
      className="platform-badge"
      title={id}
      style={{ width: size, height: size, background: `color-mix(in srgb, ${info.color} 30%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${info.color} 45%, transparent)` }}
    >
      <PlatformGlyph platform={id} size={size * 0.52} />
    </span>
  );
}

export function ProviderIcon({ provider, size = 18 }: { provider: "telegram" | "vk"; size?: number }) {
  return <BrandIcon file={provider === "telegram" ? "telegram.svg" : "vk.svg"} size={size} />;
}

export const PROVIDER_COLORS = { telegram: "#2AABEE", vk: "#0077FF" } as const;

// ── Avatar ─────────────────────────────────────────────────────────────────

export function Avatar({ url, name, size = 44, online, ring }: { url?: string | null; name?: string | null; size?: number; online?: boolean; ring?: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = mediaUrl(url);
  useEffect(() => setFailed(false), [src]);
  const initials = (name ?? "?").replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "?";
  return (
    <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      <span
        className="avatar"
        style={{ width: size, height: size, fontSize: size * 0.36, boxShadow: ring ? "0 0 0 3px var(--bg), 0 0 0 5px var(--primary)" : undefined }}
      >
        {src && !failed ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} /> : initials}
      </span>
      {online && <span className="online-dot" />}
    </span>
  );
}

// ── Games ──────────────────────────────────────────────────────────────────

export function GameCircle({ game, size = 58 }: { game: GameTag; size?: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="game-circle" style={{ width: size, height: size, fontSize: size * 0.26 }} title={game.name}>
      {game.name.replace(/[^\p{L}\p{N} ]/gu, "").split(" ").filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase()}
      {game.coverUrl && !failed && <img src={game.coverUrl} alt="" loading="lazy" onError={() => setFailed(true)} />}
    </span>
  );
}

export function GamesRow({ games, size = 58, titles = false }: { games: GameTag[]; size?: number; titles?: boolean }) {
  return (
    <div className="games-row">
      {games.map((game) =>
        titles ? (
          <div className="game-item" key={game.name}>
            <GameCircle game={game} size={size} />
            <span>{game.name}</span>
          </div>
        ) : (
          <GameCircle key={game.name} game={game} size={size} />
        ),
      )}
    </div>
  );
}

// ── Controls ───────────────────────────────────────────────────────────────

export function Segmented<T extends string>({ options, value, onChange, id }: { options: { value: T; label: string }[]; value: T; onChange(value: T): void; id: string }) {
  return (
    <div className="segmented glass" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={value === option.value}
          className={value === option.value ? "active" : ""}
          onClick={() => {
            if (value !== option.value) platform.haptic("selection");
            onChange(option.value);
          }}
        >
          {value === option.value && (
            <motion.span layoutId={`seg-${id}`} className="thumb" style={{ left: 0, right: 0, zIndex: -1 }} transition={{ type: "spring", stiffness: 500, damping: 38 }} />
          )}
          {option.label}
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
      className={`toggle ${on ? "on" : ""}`}
      onClick={() => {
        platform.haptic("selection");
        onChange(!on);
      }}
    />
  );
}

export function Spinner({ size = 28 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} role="status" />;
}

export function Empty({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="ico glass">{icon}</div>
      <h3>{title}</h3>
      {subtitle && <div>{subtitle}</div>}
      {children}
    </div>
  );
}

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="row" style={{ gap: 2 }}>
      {[1, 2, 3, 4, 5].map((index) => (
        <Star key={index} size={size} fill={index <= Math.round(value) ? "#FFB020" : "none"} color="#FFB020" />
      ))}
    </span>
  );
}

// ── Sheet (bottom sheet on phones, centered dialog on tablets/desktop) ─────

export function Sheet({
  title,
  children,
  footer,
  full,
  wide,
  onClose,
  headerLeft,
  headerRight,
}: {
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  full?: boolean;
  wide?: boolean;
  onClose?: () => void;
  headerLeft?: ReactNode;
  headerRight?: ReactNode;
}) {
  const pop = useApp((state) => state.pop);
  const close = onClose ?? pop;
  const isDesktop = window.matchMedia("(min-width: 720px)").matches;
  return (
    <>
      <motion.div className="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
      <motion.div
        className={`sheet ${full ? "full" : ""} ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal
        initial={isDesktop ? { opacity: 0, scale: 0.94, x: "-50%", y: "-48%" } : { y: "100%" }}
        animate={isDesktop ? { opacity: 1, scale: 1, x: "-50%", y: "-50%" } : { y: 0 }}
        exit={isDesktop ? { opacity: 0, scale: 0.96, x: "-50%", y: "-48%" } : { y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        drag={!isDesktop && !full ? "y" : false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        dragListener={false}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120 || info.velocity.y > 600) close();
        }}
      >
        {!full && <div className="sheet-handle" />}
        <div className="sheet-header">
          <div style={{ width: 44 }}>{headerLeft}</div>
          <h2>{title}</h2>
          <div style={{ width: 44, display: "flex", justifyContent: "flex-end" }}>
            {headerRight ?? (
              <button className="icon-btn small" onClick={close} aria-label="close">
                <X size={18} />
              </button>
            )}
          </div>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </motion.div>
    </>
  );
}

// ── Toasts ─────────────────────────────────────────────────────────────────

export function Toasts() {
  const toasts = useApp((state) => state.toasts);
  const online = useApp((state) => state.online);
  const phase = useApp((state) => state.phase);
  const [showOffline, setShowOffline] = useState(false);
  useEffect(() => {
    if (online || phase !== "ready") {
      setShowOffline(false);
      return;
    }
    const timer = setTimeout(() => setShowOffline(true), 4000);
    return () => clearTimeout(timer);
  }, [online, phase]);

  return (
    <div className="toast-wrap" aria-live="polite">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            className={`toast glass glass-strong ${toast.kind}`}
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12 }}
          >
            {toast.text}
          </motion.div>
        ))}
        {showOffline && (
          <motion.div key="offline" className="toast glass glass-strong" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            <OfflineText />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function OfflineText() {
  const t = useT();
  return <span>{t("common.offline")}</span>;
}

export function relativeTime(iso: string, language: string): string {
  const date = new Date(iso);
  const diff = (Date.now() - date.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(language, { numeric: "auto", style: "short" });
  if (diff < 60) return rtf.format(0, "second");
  if (diff < 3600) return rtf.format(-Math.floor(diff / 60), "minute");
  if (diff < 86_400) return date.toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" });
  if (diff < 7 * 86_400) return date.toLocaleDateString(language, { weekday: "short" });
  return date.toLocaleDateString(language, { day: "numeric", month: "short" });
}
