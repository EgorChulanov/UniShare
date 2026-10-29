import { Check, Plus, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { normalizeGameName, sanitizeGameName, type GameSearchResult, type GameTag } from "@unishare/shared";
import { api } from "../lib/api";
import { useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { GameCircle, Spinner } from "./ui";

/**
 * Searchable game selector (RAWG through the API, offline fallback, custom
 * titles). Used by onboarding and profile editing.
 */
export function GamePicker({
  selected,
  onToggle,
  limit = 30,
  autoFocus,
}: {
  selected: GameTag[];
  onToggle(tag: GameTag): void;
  limit?: number;
  autoFocus?: boolean;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GameSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
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
        .then((items) => id === requestId.current && setResults(items))
        .catch(() => id === requestId.current && setResults([]))
        .finally(() => id === requestId.current && setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const toggle = (tag: GameTag) => {
    const isSelected = selectedKeys.has(normalizeGameName(tag.name));
    if (!isSelected && selected.length >= limit) return;
    platform.haptic("selection");
    onToggle(tag);
  };

  const custom = sanitizeGameName(query);
  const showCustom = custom && !results.some((game) => normalizeGameName(game.name) === normalizeGameName(custom));

  return (
    <div className="col" style={{ gap: 12 }}>
      {selected.length > 0 && (
        <div className="chips">
          {selected.map((game) => (
            <button key={game.name} className="chip selected" onClick={() => toggle(game)}>
              {game.name} <X size={14} />
            </button>
          ))}
        </div>
      )}
      <label className="search">
        <Search size={18} className="faint" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("game.search.placeholder")}
          autoFocus={autoFocus}
          enterKeyHint="search"
        />
        {loading ? <Spinner size={18} /> : query && (
          <button onClick={() => setQuery("")} aria-label="clear">
            <X size={16} className="faint" />
          </button>
        )}
      </label>
      <div className="list">
        {results.map((game) => {
          const tag: GameTag = { name: game.name, coverUrl: game.backgroundImage, rawgId: game.id > 0 ? game.id : null };
          const isSelected = selectedKeys.has(normalizeGameName(game.name));
          return (
            <button key={`${game.id}-${game.name}`} className={`list-item ${isSelected ? "active" : ""}`} onClick={() => toggle(tag)}>
              <GameCircle game={tag} size={46} />
              <div className="grow">
                <div className="title ellipsis">{game.name}</div>
                {game.released && <div className="subtitle">{game.released.slice(0, 4)}</div>}
              </div>
              {isSelected ? <Check size={20} color="var(--primary)" /> : <Plus size={20} className="faint" />}
            </button>
          );
        })}
        {showCustom && !loading && (
          <button className="list-item" onClick={() => toggle({ name: custom! })}>
            <span className="game-circle" style={{ width: 46, height: 46 }}>
              <Plus size={20} />
            </span>
            <div className="grow title">{t("game.search.add", custom!)}</div>
          </button>
        )}
      </div>
      {query.trim().length >= 2 && !loading && results.length === 0 && <div className="hint">{t("game.search.custom.hint")}</div>}
      <div className="hint">{t("game.search.powered.rawg")}</div>
    </div>
  );
}
