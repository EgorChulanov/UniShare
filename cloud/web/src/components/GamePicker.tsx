// Game search used by onboarding (GameSearchPickerView / gamesPerPlatformStep)
// and profile editing (EditProfileSheet.gamesEditor). Results come from the
// API (RAWG when configured, Steam and the offline catalog otherwise).
import { AlertTriangle, Gamepad2, PlusCircle, Search, X, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { normalizeGameName, sanitizeGameName, type GameSearchResult, type GameTag } from "@unishare/shared";
import { api } from "../lib/api";
import { useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { SelectedDot, Spinner } from "./ui";

function toTag(game: GameSearchResult): GameTag {
  return {
    name: game.name,
    coverUrl: game.backgroundImage,
    rawgId: game.source === "rawg" || (!game.source && game.id > 0) ? game.id : null,
    steamAppId: game.steamAppId ?? (game.source === "steam" ? game.id : null),
  };
}

/** GameTagView.swift: small cover + title in a glass capsule. */
export function GameTagView({ tag }: { tag: GameTag }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="game-tag glass">
      <span className="cover">{tag.coverUrl && !failed ? <img src={tag.coverUrl} alt="" loading="lazy" onError={() => setFailed(true)} /> : <Gamepad2 size={13} />}</span>
      <span className="ellipsis">{tag.name}</span>
    </span>
  );
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
  /** Platform color for the selected chips (edit sheet); primary tint otherwise. */
  chipColor?: string;
  placeholder?: string;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GameSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const requestId = useRef(0);
  const selectedKeys = new Set(selected.map((game) => normalizeGameName(game.name)));

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      setResults([]);
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

  const toggle = (tag: GameTag) => {
    const isSelected = selectedKeys.has(normalizeGameName(tag.name));
    if (!isSelected && selected.length >= limit) {
      platform.haptic("warning");
      return;
    }
    platform.haptic("light");
    onToggle(tag);
  };

  const custom = sanitizeGameName(query);
  const showCustom = Boolean(custom) && !loading && !results.some((game) => normalizeGameName(game.name) === normalizeGameName(custom!));

  return (
    <div className="col" style={{ gap: 12 }}>
      <label className="field glass" style={{ padding: "14px 16px", borderRadius: 16 }}>
        <Search size={19} strokeWidth={2.4} className="secondary" />
        <input style={{ fontSize: 17 }} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder ?? t("onboarding.games.search")} enterKeyHint="search" autoComplete="off" />
        {loading && <Spinner size={16} />}
        {query && (
          <button onClick={() => setQuery("")} aria-label={t("common.close")} className="secondary" style={{ display: "flex" }}>
            <XCircle size={18} fill="currentColor" color="var(--bg)" />
          </button>
        )}
      </label>

      {selected.length > 0 && (
        <div className="col" style={{ gap: 6 }}>
          {!chipColor && (
            <span className="secondary" style={{ fontSize: 12, fontWeight: 500 }}>
              {t("onboarding.games.selected", selected.length)}
            </span>
          )}
          <div className="h-scroll" style={{ margin: 0, padding: "0 2px", gap: 8 }}>
            {selected.map((game) =>
              chipColor ? (
                <button key={game.name} className="game-chip colored" style={{ background: `color-mix(in srgb, ${chipColor} 85%, transparent)` }} onClick={() => toggle(game)}>
                  <span className="ellipsis">{game.name}</span>
                  <X size={11} strokeWidth={3.2} />
                </button>
              ) : (
                <span key={game.name} className="game-chip">
                  <span className="ellipsis">{game.name}</span>
                  <button onClick={() => toggle(game)} aria-label={t("delete")} style={{ display: "flex", color: "var(--primary)" }}>
                    <XCircle size={15} fill="currentColor" color="var(--bg)" />
                  </button>
                </span>
              ),
            )}
          </div>
        </div>
      )}

      {query.trim().length >= 2 && (
        <div className="col" style={{ gap: 6 }}>
          {results.slice(0, 8).map((game) => {
            const tag = toTag(game);
            const isSelected = selectedKeys.has(normalizeGameName(game.name));
            return (
              <button key={`${game.source ?? "r"}-${game.id}-${game.name}`} className={`game-result glass ${isSelected ? "selected" : ""}`} onClick={() => toggle(tag)}>
                <ResultCover url={tag.coverUrl} />
                <span className="grow ellipsis" style={{ fontSize: 16, fontWeight: 600 }}>
                  {game.name}
                </span>
                {isSelected ? <SelectedDot size={22} /> : <PlusCircle size={22} className="secondary" />}
              </button>
            );
          })}
          {showCustom && (
            <button className="game-result glass" onClick={() => toggle({ name: custom! })}>
              <span className="result-cover">
                <PlusCircle size={16} color="var(--primary)" />
              </span>
              <span className="grow ellipsis" style={{ fontSize: 16, fontWeight: 600 }}>
                {t("game.search.add", custom!)}
              </span>
            </button>
          )}
          {!loading && results.length === 0 && (
            <span className="secondary" style={{ fontSize: 14, paddingTop: 4 }}>
              {t("game.search.empty")}
            </span>
          )}
        </div>
      )}

      <div className="col" style={{ gap: 5, fontSize: 12 }}>
        {failed && (
          <span className="row" style={{ gap: 5, color: "var(--orange)" }}>
            <AlertTriangle size={12} /> {t("game.search.catalog.unavailable")}
          </span>
        )}
        <span className="secondary">{t("game.search.custom.hint")}</span>
      </div>
    </div>
  );
}

function ResultCover({ url }: { url?: string | null }) {
  const [failed, setFailed] = useState(false);
  return <span className="result-cover">{url && !failed ? <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} /> : <Gamepad2 size={13} color="var(--primary)" />}</span>;
}
