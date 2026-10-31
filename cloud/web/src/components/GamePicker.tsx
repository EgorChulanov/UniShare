// Game picker used by onboarding (GameSearchPickerView / gamesPerPlatformStep) and
// profile editing (EditProfileSheet.gamesEditor): the picked games as cover tiles,
// popular games to tap while the search is empty, and search results as a cover grid.
// Results come from the API (RAWG when configured, Steam and the offline catalog otherwise).
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Heart, Plus, Search, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { PLATFORM_INFO, normalizeGameName, sanitizeGameName, type GameSearchResult, type GameTag, type Platform } from "@unishare/shared";
import { api } from "../lib/api";
import { useApp } from "../app/store";
import { useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { GameArt, PlatformGlyph, SelectedDot, Spinner } from "./ui";

/** Shared with nothing else: the search tab keeps its own copy for the marquee. */
const popularCache: { games: GameSearchResult[] | null } = { games: null };
const POPULAR_SHOWN = 12;
const RESULTS_SHOWN = 12;

function toTag(game: GameSearchResult): GameTag {
  return {
    name: game.name,
    coverUrl: game.backgroundImage,
    rawgId: game.source === "rawg" || (!game.source && game.id > 0) ? game.id : null,
    steamAppId: game.steamAppId ?? (game.source === "steam" ? game.id : null),
  };
}

export function GamePicker({
  selected,
  onToggle,
  limit = 30,
  chipColor,
  placeholder,
}: {
  selected: GameTag[];
  onToggle(tag: GameTag): void;
  limit?: number;
  /** Platform colour for the picked games (edit sheet); the primary violet otherwise. */
  chipColor?: string;
  placeholder?: string;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  // null: no answer yet for the current query.
  const [results, setResults] = useState<GameSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // null while loading.
  const [popular, setPopular] = useState<GameSearchResult[] | null>(popularCache.games);
  const requestId = useRef(0);
  const strip = useRef<HTMLDivElement>(null);
  const count = useRef(selected.length);
  const selectedKeys = new Set(selected.map((game) => normalizeGameName(game.name)));

  useEffect(() => {
    if (popularCache.games) return;
    let cancelled = false;
    api
      .popularGames()
      .then((games) => {
        // An empty answer (Steam unreachable) is not cached, so the next picker asks again.
        if (games.length) popularCache.games = games;
        if (!cancelled) setPopular(games);
      })
      .catch(() => !cancelled && setPopular([]));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      // Drops the answer of a request still running for the old query.
      requestId.current++;
      setResults(null);
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .searchGames(value)
        .then((items) => {
          if (id !== requestId.current) return;
          setResults(items);
          setFailed(false);
        })
        .catch(() => {
          if (id !== requestId.current) return;
          setResults([]);
          setFailed(true);
        })
        .finally(() => id === requestId.current && setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // A newly picked game slides in at the end of the strip: bring it into view.
  useEffect(() => {
    const grew = selected.length > count.current;
    count.current = selected.length;
    if (grew) strip.current?.scrollTo({ left: strip.current.scrollWidth, behavior: "smooth" });
  }, [selected.length]);

  const toggle = (tag: GameTag) => {
    const isSelected = selectedKeys.has(normalizeGameName(tag.name));
    if (!isSelected && selected.length >= limit) {
      platform.haptic("warning");
      useApp.getState().toast(t("game.picker.limit", limit), "error");
      return;
    }
    platform.haptic(isSelected ? "light" : "selection");
    onToggle(tag);
  };

  const searching = query.trim().length >= 2;
  const custom = sanitizeGameName(query);
  const shownResults = (results ?? []).slice(0, RESULTS_SHOWN);
  const exact = Boolean(custom) && (results ?? []).some((game) => normalizeGameName(game.name) === normalizeGameName(custom!));
  const showCustom = searching && Boolean(custom) && results !== null && !exact;
  const popularShown = (popular ?? []).filter((game) => !selectedKeys.has(normalizeGameName(game.name))).slice(0, POPULAR_SHOWN);
  const full = selected.length >= limit;

  return (
    <div className="game-picker" style={{ ["--pick" as string]: chipColor ?? "var(--primary)" } as CSSProperties}>
      <label className="search-field compact glass picker-search">
        <Search size={19} strokeWidth={2.4} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder ?? t("onboarding.games.search")}
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label={placeholder ?? t("onboarding.games.search")}
        />
        {loading && <Spinner size={16} />}
        {query && (
          <button className="icon-circle" style={{ width: 24, height: 24 }} onClick={() => setQuery("")} aria-label={t("common.close")}>
            <X size={13} strokeWidth={3} />
          </button>
        )}
      </label>

      <section className="picker-section">
        <div className="picker-head">
          <span className="title">{t("game.picker.selected")}</span>
          <span className={`picker-counter ${full ? "full" : ""}`} aria-live="polite">
            {selected.length} / {limit}
          </span>
        </div>
        {selected.length ? (
          <div className="picked-strip" ref={strip} role="list">
            <AnimatePresence initial={false} mode="popLayout">
              {selected.map((game) => (
                <motion.div
                  layout
                  key={normalizeGameName(game.name)}
                  className="picked-tile"
                  role="listitem"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: "spring", stiffness: 460, damping: 34 }}
                >
                  <GameArt name={game.name} src={game.coverUrl} className="art" />
                  <span className="shade" />
                  <span className="name">{game.name}</span>
                  <button className="remove" onClick={() => toggle(game)} aria-label={t("game.picker.remove", game.name)}>
                    <X size={12} strokeWidth={3.2} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="picked-empty">{t("game.picker.selected.empty")}</div>
        )}
      </section>

      {searching ? (
        <section className="picker-section">
          <div className="picker-head">
            <span className="title">{t("game.picker.results")}</span>
          </div>
          <div className="cover-grid" style={{ opacity: loading && results ? 0.55 : 1 }}>
            {results === null ? (
              <CoverSkeletons count={4} />
            ) : (
              shownResults.map((game) => (
                <CoverCard key={gameKey(game)} game={game} selected={selectedKeys.has(normalizeGameName(game.name))} onClick={() => toggle(toTag(game))} />
              ))
            )}
            {showCustom && (
              <button className={`cover-card custom ${selectedKeys.has(normalizeGameName(custom!)) ? "selected" : ""}`} aria-pressed={selectedKeys.has(normalizeGameName(custom!))} onClick={() => toggle({ name: custom! })}>
                <span className="cover">
                  <span className="custom-art">
                    <Plus size={26} strokeWidth={2.4} />
                  </span>
                  {selectedKeys.has(normalizeGameName(custom!)) && (
                    <span className="mark">
                      <SelectedDot size={24} />
                    </span>
                  )}
                </span>
                <span className="title">{t("game.search.add", custom!)}</span>
                <span className="meta">{t("game.picker.custom.meta")}</span>
              </button>
            )}
          </div>
          {results !== null && !loading && !shownResults.length && !failed && <p className="picker-note">{t("game.search.empty")}</p>}
        </section>
      ) : (
        (popular === null || popularShown.length > 0) && (
          <section className="picker-section">
            <div className="picker-head">
              <span className="title">
                <Sparkles size={15} color="var(--accent-text)" fill="var(--accent-text)" /> {t("game.picker.popular")}
              </span>
            </div>
            <div className="cover-grid">
              {popular === null ? (
                <CoverSkeletons count={6} />
              ) : (
                popularShown.map((game) => <CoverCard key={gameKey(game)} game={game} selected={false} onClick={() => toggle(toTag(game))} />)
              )}
            </div>
          </section>
        )
      )}

      {(failed || searching) && (
        <div className="col" style={{ gap: 6 }}>
          {failed && (
            <p className="picker-note warn">
              <AlertTriangle size={13} /> {t("game.search.catalog.unavailable")}
            </p>
          )}
          {searching && <p className="picker-note">{t("game.search.custom.hint")}</p>}
        </div>
      )}
    </div>
  );
}

/** List key of a search or popular result: catalog entries all have id 0, so the name is part of it. */
export function gameKey(game: GameSearchResult): string {
  return `${game.source ?? "r"}-${game.id}-${normalizeGameName(game.name)}`;
}

/** A game as a cover card: artwork (or initials), title, year and source, and the picked state. */
function CoverCard({ game, selected, onClick }: { game: GameSearchResult; selected: boolean; onClick(): void }) {
  const t = useT();
  const meta = [game.released?.slice(0, 4), game.source ? t(`game.picker.source.${game.source}`) : null].filter(Boolean).join(" · ");
  return (
    <motion.button
      className={`cover-card ${selected ? "selected" : ""}`}
      aria-pressed={selected}
      onClick={onClick}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <span className="cover">
        <GameArt name={game.name} src={game.backgroundImage} />
        <span className="mark">
          {selected ? (
            <SelectedDot size={24} />
          ) : (
            <span className="add">
              <Plus size={14} strokeWidth={3} />
            </span>
          )}
        </span>
      </span>
      <span className="title">{game.name}</span>
      {meta && <span className="meta">{meta}</span>}
    </motion.button>
  );
}

function CoverSkeletons({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="cover-card skeleton" aria-hidden>
          <span className="cover shimmer" />
          <span className="line shimmer" />
          <span className="line short shimmer" />
        </span>
      ))}
    </>
  );
}

export interface GameTab {
  id: Platform | "wanted";
  label: string;
  count: number;
}

/** Platform tabs above the picker: brand glyph, name and how many games are picked there. */
export function GamePlatformTabs({ tabs, active, onChange, label }: { tabs: GameTab[]; active: GameTab["id"]; onChange(id: GameTab["id"]): void; label: string }) {
  return (
    <div className="game-tabs h-scroll" role="tablist" aria-label={label}>
      {tabs.map((tab) => {
        const on = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={on}
            className={`game-tab ${on ? "active" : ""} ${tab.id === "wanted" ? "wanted" : ""}`}
            style={tab.id === "wanted" ? undefined : ({ ["--brand" as string]: PLATFORM_INFO[tab.id].color } as CSSProperties)}
            onClick={() => {
              if (!on) platform.haptic("light");
              onChange(tab.id);
            }}
          >
            {on && <motion.span layoutId="game-tab-pill" className="pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
            <span className="glyph">{tab.id === "wanted" ? <Heart size={14} strokeWidth={2.6} /> : <PlatformGlyph platform={tab.id} size={15} />}</span>
            <span>{tab.label}</span>
            {tab.count > 0 && <span className="count">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
