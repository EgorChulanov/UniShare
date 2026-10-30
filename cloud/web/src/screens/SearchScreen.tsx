// In-app search, laid out like the App Store screenshots
// (docs/assets/store-mockups/iphone-4.jpg and iphone-5.jpg).
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Clock3, Search, Sparkles, Star, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PLATFORMS, PLATFORM_INFO, type GameDetails, type GameSearchResult, type GameTag, type Platform, type ProfileCard, type SearchResults } from "@unishare/shared";
import { api } from "../lib/api";
import { collapseOnScroll, useApp } from "../app/store";
import { useT } from "../i18n/i18n";
import { Avatar, PlatformBadgeRow, gameInitials, PlatformGlyph, Sheet, Spinner, platformColor } from "../components/ui";

const popularCache: { games: GameSearchResult[] | null } = { games: null };

export function SearchScreen() {
  const t = useT();
  const push = useApp((state) => state.push);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  // null while loading.
  const [popular, setPopular] = useState<GameSearchResult[] | null>(popularCache.games);
  const onScroll = useMemo(() => collapseOnScroll(), []);
  const requestId = useRef(0);

  useEffect(() => {
    if (popularCache.games) return;
    api
      .popularGames()
      .then((games) => {
        // An empty answer (Steam unreachable) is not cached, so the next visit asks again.
        if (games.length) popularCache.games = games;
        setPopular(games);
      })
      .catch(() => setPopular([]));
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      // Drops the answer of a request still running for the old query.
      requestId.current++;
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      api
        .search(trimmed)
        .then((value) => id === requestId.current && setResults(value))
        .catch(() => id === requestId.current && setResults({ users: [], games: [], platforms: [] }))
        .finally(() => id === requestId.current && setSearching(false));
    }, 280);
    return () => clearTimeout(timer);
  }, [query]);

  const rows = useMemo(() => {
    const games = (popular ?? []).filter((game) => game.backgroundImage);
    // Up to three rows of at least three games each; a short list gets a single row.
    const count = Math.min(3, Math.max(1, Math.floor(games.length / 3)));
    const size = Math.ceil(games.length / count);
    return Array.from({ length: count }, (_, index) => games.slice(index * size, (index + 1) * size)).filter((row) => row.length);
  }, [popular]);

  const openGame = (game: GameSearchResult) =>
    push({ type: "game", game: { name: game.name, coverUrl: game.backgroundImage, steamAppId: game.steamAppId ?? null, rawgId: game.source === "rawg" ? game.id : null } });

  const showResults = query.trim().length >= 2;

  return (
    <div className="screen" onScroll={onScroll}>
      <div className="container px">
        <h1 className="hero-title">
          {t("search.title.lead")} <em>{t("search.title.accent")}</em>
        </h1>
        <p className="secondary" style={{ margin: "0 0 18px", fontSize: 17, fontWeight: 600, lineHeight: 1.3 }}>
          {t("search.subtitle")}
        </p>
        <label className="search-field glass">
          <Search size={20} strokeWidth={2.4} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("search.placeholder")}
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {query && (
            <button className="icon-circle" style={{ width: 22, height: 22 }} onClick={() => setQuery("")} aria-label={t("common.close")}>
              <X size={13} strokeWidth={3} />
            </button>
          )}
        </label>

        <AnimatePresence mode="wait" initial={false}>
          {showResults ? (
            <motion.div key="results" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
              <SearchResultsView results={results} searching={searching} onGame={openGame} />
            </motion.div>
          ) : (
            <motion.div key="discover" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
              {/* Hidden when the list came back empty or failed. */}
              {(popular === null || rows.length > 0) && (
                <>
                  <div className="section-head">
                    <h2>{t("search.popular")}</h2>
                    <Sparkles size={24} color="var(--accent-text)" fill="var(--accent-text)" />
                  </div>
                  {rows.length ? (
                    <div className="col" style={{ gap: 12 }}>
                      {rows.map((row, index) => (
                        <GameMarquee key={index} games={row} reverse={index % 2 === 1} duration={42 + index * 9} onOpen={openGame} />
                      ))}
                    </div>
                  ) : (
                    <div className="center" style={{ height: 120 }}>
                      <Spinner />
                    </div>
                  )}
                </>
              )}

              <div className="section-head" style={{ marginTop: 30 }}>
                <div>
                  <h2>{t("search.platforms")}</h2>
                  <p className="secondary" style={{ margin: "4px 0 0", fontSize: 15, fontWeight: 600, maxWidth: 320 }}>
                    {t("search.platforms.subtitle")}
                  </p>
                </div>
              </div>
              <div className="platform-grid">
                {PLATFORMS.map((id) => (
                  <PlatformTile key={id} platform={id} onClick={() => push({ type: "platform", platform: id })} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function GameMarquee({ games, reverse, duration, onOpen }: { games: GameSearchResult[]; reverse: boolean; duration: number; onOpen(game: GameSearchResult): void }) {
  // The track holds the row twice so the -50% loop is seamless.
  const loop = [...games, ...games];
  return (
    <div className="marquee">
      <div className={`marquee-track ${reverse ? "reverse" : ""}`} style={{ ["--dur" as string]: `${duration}s` }}>
        {loop.map((game, index) => (
          <GameCard key={`${game.id}-${index}`} game={game} onClick={() => onOpen(game)} hidden={index >= games.length} />
        ))}
      </div>
    </div>
  );
}

function GameCard({ game, onClick, hidden }: { game: GameSearchResult; onClick(): void; hidden?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <button className="game-card" onClick={onClick} aria-hidden={hidden || undefined} tabIndex={hidden ? -1 : undefined}>
      {game.backgroundImage && !failed ? (
        <img src={game.backgroundImage} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} />
      ) : (
        <span className="game-card-blank" aria-hidden>
          {gameInitials(game.name)}
        </span>
      )}
      <span className="shade" />
      <span className="name">{game.name}</span>
    </button>
  );
}

/** A platform as a brand tile: solid brand mark, name and what it covers, with a soft brand glow. */
function PlatformTile({ platform: id, onClick }: { platform: Platform; onClick(): void }) {
  const t = useT();
  const brand = PLATFORM_INFO[id].color;
  return (
    <button className="platform-tile" style={{ ["--brand" as string]: brand }} onClick={onClick}>
      <span className="mark">
        <PlatformGlyph platform={id} size={24} />
      </span>
      <span className="text">
        <span className="name">{id}</span>
        <span className="kind">{t(`platform.kind.${id}`)}</span>
      </span>
      <ChevronRight size={16} strokeWidth={2.6} className="chev" />
    </button>
  );
}

function SearchResultsView({ results, searching, onGame }: { results: SearchResults | null; searching: boolean; onGame(game: GameSearchResult): void }) {
  const t = useT();
  const push = useApp((state) => state.push);
  if (!results) {
    return (
      <div className="center" style={{ height: 160 }}>
        <Spinner />
      </div>
    );
  }
  const empty = !results.users.length && !results.games.length && !results.platforms.length;
  if (empty) {
    return searching ? (
      <div className="center" style={{ height: 160 }}>
        <Spinner />
      </div>
    ) : (
      <div className="empty" style={{ paddingTop: 70 }}>
        <Search size={44} className="secondary" />
        <h3>{t("search.empty")}</h3>
        <p>{t("search.empty.subtitle")}</p>
      </div>
    );
  }
  return (
    <div style={{ opacity: searching ? 0.6 : 1, transition: "opacity 0.2s" }}>
      {results.platforms.length > 0 && (
        <>
          <div className="section-head">
            <h2>{t("search.platforms")}</h2>
          </div>
          <div className="h-scroll">
            {results.platforms.map((id) => (
              <PlatformTile key={id} platform={id} onClick={() => push({ type: "platform", platform: id })} />
            ))}
          </div>
        </>
      )}
      {results.users.length > 0 && (
        <>
          <div className="section-head">
            <h2>{t("search.people")}</h2>
          </div>
          <UserList users={results.users} />
        </>
      )}
      {results.games.length > 0 && (
        <>
          <div className="section-head">
            <h2>{t("search.games")}</h2>
          </div>
          <div className="game-grid">
            {results.games.map((game) => (
              <GameCard key={`${game.source}-${game.id}`} game={game} onClick={() => onGame(game)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Player rows: avatar, @username, status and platform badges. */
export function UserList({ users }: { users: ProfileCard[] }) {
  const push = useApp((state) => state.push);
  return (
    <div className="glass" style={{ borderRadius: 20, overflow: "hidden" }}>
      {users.map((user, index) => (
        <div key={user.uid}>
          {index > 0 && <div className="divider" style={{ marginLeft: 76 }} />}
          <button className="list-row" onClick={() => push({ type: "profile", uid: user.uid, card: user })}>
            <Avatar url={user.avatarUrl} size={48} online={user.isOnline} />
            <div className="grow">
              <div className="ellipsis" style={{ fontWeight: 700, fontSize: 16 }}>
                @{user.username}
              </div>
              <div className="secondary ellipsis" style={{ fontSize: 13, marginTop: 2 }}>
                {user.status || user.games.slice(0, 3).map((game) => game.name).join(" · ") || " "}
              </div>
            </div>
            <PlatformBadgeRow platforms={user.platforms.slice(0, 3)} size={24} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Game sheet (iphone-5.jpg) ───────────────────────────────────────────────

const detailsCache = new Map<string, GameDetails>();

export function GameSheet({ game }: { game: GameTag }) {
  const t = useT();
  const key = game.name.toLowerCase();
  const [details, setDetails] = useState<GameDetails | null>(detailsCache.get(key) ?? null);
  const [failed, setFailed] = useState(false);
  const [players, setPlayers] = useState<ProfileCard[] | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    if (!detailsCache.has(key)) {
      api
        .gameDetails(game)
        .then((value) => {
          detailsCache.set(key, value);
          setDetails(value);
        })
        .catch(() => setFailed(true));
    }
    api
      .gamePlayers(game.name)
      .then(setPlayers)
      .catch(() => setPlayers([]));
  }, [game, key]);

  const image = details?.image ?? game.coverUrl ?? null;
  const facts: { label: string; value: string | null }[] = details
    ? [
        { label: t("game.platforms"), value: details.platforms.length ? details.platforms.join(" · ") : null },
        { label: t("game.genres"), value: details.genres.length ? details.genres.join(" · ") : null },
        { label: t("game.released"), value: details.released },
      ]
    : [];

  return (
    <Sheet title={t("game.title")}>
      <div className="container" style={{ padding: "6px 20px 0" }}>
        <div className="game-hero">
          {image && !imageFailed ? <img src={image} alt="" onError={() => setImageFailed(true)} /> : <span>{game.name.slice(0, 2).toUpperCase()}</span>}
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.12, margin: "22px 0 16px", letterSpacing: "-0.01em" }}>{details?.name ?? game.name}</h1>
        {details && (details.rating || details.playtimeHours) ? (
          <div className="row" style={{ gap: 10, marginBottom: 20 }}>
            {details.rating ? (
              <span className="stat-pill glass">
                <Star size={16} fill="currentColor" /> {details.rating.toFixed(1)}
              </span>
            ) : null}
            {details.playtimeHours ? (
              <span className="stat-pill glass">
                <Clock3 size={16} strokeWidth={2.6} /> {t("game.hours", details.playtimeHours)}
              </span>
            ) : null}
          </div>
        ) : null}
        {!details && !failed && (
          <div className="center" style={{ height: 80 }}>
            <Spinner />
          </div>
        )}
        {facts
          .filter((fact) => fact.value)
          .map((fact) => (
            <div key={fact.label} className="fact">
              <div className="fact-label">{fact.label}</div>
              <div className="fact-value">{fact.value}</div>
            </div>
          ))}
        {(details || failed) && (
          <div className="fact">
            <div className="fact-label">{t("game.about")}</div>
            <div className="fact-value" style={{ whiteSpace: "pre-line", fontSize: 16, lineHeight: 1.45 }}>
              {details?.about || t("game.unavailable")}
            </div>
          </div>
        )}
        <div className="fact">
          <div className="fact-label" style={{ marginBottom: 10 }}>
            {t("game.players")}
          </div>
          {players === null ? (
            <Spinner />
          ) : players.length ? (
            <UserList users={players} />
          ) : (
            <div className="secondary" style={{ fontSize: 15 }}>
              {t("search.players.empty")}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

// ── Platform sheet: everyone on a platform ─────────────────────────────────

export function PlatformSheet({ platformId }: { platformId: Platform }) {
  const t = useT();
  const [users, setUsers] = useState<ProfileCard[] | null>(null);
  useEffect(() => {
    api
      .search("", platformId)
      .then((value) => setUsers(value.users))
      .catch(() => setUsers([]));
  }, [platformId]);
  const color = platformColor(platformId);
  return (
    <Sheet title={platformId}>
      <div className="container" style={{ padding: "4px 16px 0" }}>
        <div className="col" style={{ alignItems: "center", gap: 12, margin: "8px 0 24px" }}>
          <span className="tile-icon" style={{ width: 88, height: 88, borderRadius: 24, display: "flex", alignItems: "center", justifyContent: "center", background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
            <PlatformGlyph platform={platformId} size={44} />
          </span>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{platformId}</div>
        </div>
        {users === null ? (
          <div className="center" style={{ height: 120 }}>
            <Spinner />
          </div>
        ) : users.length ? (
          <UserList users={users} />
        ) : (
          <div className="empty" style={{ paddingTop: 30 }}>
            <p>{t("search.players.empty")}</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}
