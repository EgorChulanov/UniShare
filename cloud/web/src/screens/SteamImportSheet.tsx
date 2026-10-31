// Steam library import: sign in through Steam (or paste a public profile link), then choose
// games from the owned library; they are added to the profile's Steam list.
import { AnimatePresence, motion } from "framer-motion";
import { Check, Clock3, ExternalLink, EyeOff, Gamepad2, KeyRound, Link2, RefreshCw, Search, Unlink, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  LIMITS,
  PLATFORMS,
  STEAM_PRIVACY_URL,
  normalizeGameName,
  parseSteamProfileInput,
  type GameTag,
  type SteamLibrary,
  type SteamLibraryGame,
} from "@unishare/shared";
import { useApp } from "../app/store";
import { api } from "../lib/api";
import { errorMessage, useI18n, useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { ActionSheet, Avatar, BrandIcon, Segmented, SelectedDot, Sheet, Spinner, gameInitials } from "../components/ui";

type Sort = "playtime" | "recent" | "name";
type Load = { status: "loading" } | { status: "ready"; library: SteamLibrary } | { status: "error"; error: unknown };

/** The Steam page is asked for in advance; the server keeps a state for 15 minutes. */
const CONNECT_URL_MAX_AGE = 10 * 60_000;
/** How long the sheet waits for the sign-in to finish in the other window. */
const WAIT_MAX = 15 * 60_000;
/** Cards rendered at once; more appear while scrolling (libraries can hold thousands of games). */
const PAGE = 60;

/** One game across spellings ("Counter-Strike 2" / "Counter Strike 2"), like the server's gameKey. */
function looseKey(name: string): string {
  return normalizeGameName(name).replace(/['’`]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** The most played games that are not in the profile yet, as many as still fit. */
function preselect(library: SteamLibrary, owned: Set<string>, room: number): Set<number> {
  const picks = library.games.filter((game) => game.playtimeMinutes > 0 && !owned.has(looseKey(game.name))).slice(0, Math.max(0, room));
  return new Set(picks.map((game) => game.appId));
}

function usePlaytime() {
  const t = useT();
  const language = useI18n((state) => state.language);
  return (minutes: number) => {
    if (minutes <= 0) return t("steam.never");
    if (minutes < 60) return t("steam.minutes", minutes);
    const hours = minutes / 60;
    return t("steam.hours", new Intl.NumberFormat(language, { maximumFractionDigits: hours < 10 ? 1 : 0 }).format(hours));
  };
}

export function SteamImportSheet() {
  const t = useT();
  const configured = useApp((state) => state.config?.steamImport ?? false);
  const profile = useApp((state) => state.profile)!;
  const setProfile = useApp((state) => state.setProfile);
  const toast = useApp((state) => state.toast);
  const toastError = useApp((state) => state.toastError);
  const pop = useApp((state) => state.pop);
  const steam = profile.steam;

  // A linked account's library, or one opened from a profile link without signing in.
  const [load, setLoad] = useState<Load | null>(null);
  const [manual, setManual] = useState<{ input: string; library: SteamLibrary } | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const request = useRef(0);

  const library = steam ? (load?.status === "ready" ? load.library : null) : (manual?.library ?? null);
  const steamGames = profile.platformGames.Steam ?? [];
  const owned = useMemo(() => new Set(steamGames.map(looseKey)), [steamGames]);
  const room = Math.max(0, LIMITS.gamesPerPlatform - steamGames.length);

  const loadLinked = async (soft = false) => {
    const id = ++request.current;
    if (soft) setRetrying(true);
    else setLoad({ status: "loading" });
    try {
      const value = await api.steamLibrary();
      if (id === request.current) setLoad({ status: "ready", library: value });
    } catch (error) {
      if (id !== request.current) return;
      if (soft) toastError(error);
      else setLoad({ status: "error", error });
    } finally {
      if (id === request.current) setRetrying(false);
    }
  };

  useEffect(() => {
    if (!configured || !steam) {
      request.current++;
      setLoad(null);
      return;
    }
    void loadLinked();
    // A new Steam account (signed in from another window) reloads the library.
  }, [configured, steam?.steamId]);

  // Signed in on the Steam page: the profile_updated event (or a reload on return) brings `steam`.
  const previousSteamId = useRef(steam?.steamId ?? null);
  useEffect(() => {
    if (steam && !previousSteamId.current) {
      platform.haptic("success");
      toast(t("steam.connected"), "success");
    }
    previousSteamId.current = steam?.steamId ?? null;
  }, [steam?.steamId]);

  // Each library arrives with the most played games ticked; later profile changes keep the user's picks.
  useEffect(() => {
    setSelected(library && !library.private ? preselect(library, owned, room) : new Set());
  }, [library]);

  const retry = async () => {
    if (steam) return loadLinked(true);
    if (!manual) return;
    setRetrying(true);
    try {
      setManual({ input: manual.input, library: await api.steamResolve(manual.input) });
    } catch (error) {
      toastError(error);
    } finally {
      setRetrying(false);
    }
  };

  const toggle = (game: SteamLibraryGame) => {
    const next = new Set(selected);
    if (next.has(game.appId)) {
      next.delete(game.appId);
    } else {
      if (next.size >= room) {
        platform.haptic("warning");
        toast(room === 0 ? t("steam.full", LIMITS.gamesPerPlatform) : t("steam.limit", LIMITS.gamesPerPlatform), "error");
        return;
      }
      next.add(game.appId);
    }
    platform.haptic("selection");
    setSelected(next);
  };

  /** Merges the picks into the profile's Steam list, the same PATCH the edit sheet sends. */
  const save = async () => {
    if (!library || !selected.size) return;
    setSaving(true);
    try {
      const names = [...steamGames];
      const keys = new Set(names.map(looseKey));
      // A game the profile already has (another platform, wanted) keeps its spelling: "Elden Ring", not Steam's "ELDEN RING".
      const spelling = new Map<string, string>();
      for (const name of [...Object.values(profile.platformGames).flat(), ...profile.wantedGames]) if (name) spelling.set(looseKey(name), name);
      const gameMetadata: Record<string, GameTag> = { ...profile.gameMetadata };
      for (const game of library.games) {
        const loose = looseKey(game.name);
        if (!selected.has(game.appId) || keys.has(loose) || names.length >= LIMITS.gamesPerPlatform) continue;
        const name = spelling.get(loose) ?? game.name;
        keys.add(loose);
        names.push(name);
        const key = normalizeGameName(name);
        const known = gameMetadata[key];
        gameMetadata[key] = { name, coverUrl: known?.coverUrl ?? game.coverUrl, rawgId: known?.rawgId ?? null, steamAppId: game.appId };
      }
      const updated = await api.updateMe({
        platforms: PLATFORMS.filter((id) => id === "Steam" || profile.platforms.includes(id)),
        platformGames: { ...profile.platformGames, Steam: names },
        gameMetadata,
      });
      setProfile(updated);
      platform.haptic("success");
      toast(t("steam.added", names.length - steamGames.length), "success");
      pop();
    } catch (error) {
      toastError(error);
    } finally {
      setSaving(false);
    }
  };

  const unlink = async () => {
    setConfirmUnlink(false);
    try {
      setProfile(await api.steamUnlink());
      toast(t("steam.unlinked"), "success");
    } catch (error) {
      toastError(error);
    }
  };

  let content: ReactNode;
  let footer: ReactNode = null;
  if (!configured) {
    content = <StateCard icon={<Gamepad2 size={26} />} title={t("steam.notconfigured.title")} text={t("steam.notconfigured.text")} />;
  } else if (!steam && !manual) {
    content = <ConnectView onResolved={(input, value) => setManual({ input, library: value })} />;
  } else {
    const head = library ?? (steam ? { personaName: steam.personaName, avatarUrl: steam.avatarUrl } : null);
    const action = steam ? (
      <button className="capsule-btn steam-head-action" onClick={() => setConfirmUnlink(true)}>
        <Unlink size={14} strokeWidth={2.4} /> {t("steam.unlink")}
      </button>
    ) : (
      <button className="capsule-btn steam-head-action" onClick={() => setManual(null)}>
        {t("steam.other")}
      </button>
    );
    content = (
      <>
        <LibraryHeader
          name={head?.personaName ?? "Steam"}
          avatarUrl={head?.avatarUrl ?? null}
          subtitle={
            !library ? (
              <span className="steam-skel line" style={{ width: 110 }} />
            ) : library.private ? (
              t("steam.private.title")
            ) : (
              t("steam.library.count", library.gameCount)
            )
          }
          action={action}
        />
        {!library ? (
          load?.status === "error" ? (
            <StateCard icon={<RefreshCw size={24} />} title={t("steam.error.title")} text={errorMessage(load.error)}>
              <button className="btn-primary" onClick={() => void loadLinked()}>
                {t("steam.retry")}
              </button>
            </StateCard>
          ) : (
            <LibrarySkeleton />
          )
        ) : library.private ? (
          <StateCard icon={<EyeOff size={24} />} title={t("steam.private.title")} text={t("steam.private.text")}>
            <button className="btn-primary" disabled={retrying} onClick={() => void retry()}>
              {retrying ? <Spinner size={18} /> : t("steam.private.retry")}
            </button>
            <button className="btn-secondary" onClick={() => platform.openLink(STEAM_PRIVACY_URL)}>
              <ExternalLink size={17} /> {t("steam.privacy.open")}
            </button>
          </StateCard>
        ) : library.games.length === 0 ? (
          <StateCard icon={<Gamepad2 size={26} />} title={t("steam.empty.title")} text={t("steam.empty.text")} />
        ) : (
          <LibraryGrid
            library={library}
            selected={selected}
            owned={owned}
            room={room}
            onToggle={toggle}
            onClear={() => setSelected(new Set())}
            onPickTop={() => setSelected(preselect(library, owned, room))}
          />
        )}
      </>
    );
    if (library && !library.private && library.games.length) {
      footer = (
        <div className="sheet-footer steam-footer">
          <button className="btn-primary" disabled={!selected.size || saving} onClick={() => void save()}>
            {saving ? <Spinner size={18} /> : selected.size ? <>{t("steam.add", selected.size)}</> : t("steam.add.none")}
          </button>
        </div>
      );
    }
  }

  return (
    <Sheet title={t("steam.title")} footer={footer} detent={configured ? "large" : "medium"}>
      <div className="container steam-body">{content}</div>
      <AnimatePresence>
        {confirmUnlink && (
          <ActionSheet
            title={t("steam.unlink.title")}
            message={t("steam.unlink.message")}
            actions={[{ label: t("steam.unlink.confirm"), destructive: true, onSelect: () => void unlink() }]}
            cancelLabel={t("cancel")}
            onCancel={() => setConfirmUnlink(false)}
          />
        )}
      </AnimatePresence>
    </Sheet>
  );
}

// ── Not linked: sign in through Steam, or a profile link ────────────────────

function ConnectView({ onResolved }: { onResolved(input: string, library: SteamLibrary): void }) {
  const t = useT();
  const setProfile = useApp((state) => state.setProfile);
  const toastError = useApp((state) => state.toastError);
  const [connect, setConnect] = useState<{ url: string; at: number } | null>(null);
  const [opening, setOpening] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [input, setInput] = useState("");
  const [resolving, setResolving] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // The Steam page is fetched before the tap, so it opens right inside the tap:
  // browsers block windows opened after an await. Each page is opened once (its
  // sign-in may be used up by then), so another one is fetched for the next tap.
  const mounted = useRef(true);
  const prefetch = () =>
    void api.steamConnect().then(
      (value) => mounted.current && setConnect({ url: value.url, at: Date.now() }),
      () => undefined,
    );
  useEffect(() => {
    mounted.current = true;
    prefetch();
    return () => {
      mounted.current = false;
    };
  }, []);

  // While the sign-in runs in another window, reload the profile when the app is back
  // in front (the realtime event may be missed while Telegram keeps it in the background).
  useEffect(() => {
    if (!waiting) return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void api
        .me()
        .then((me) => me.steam && setProfile(me))
        .catch(() => undefined);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const poll = setInterval(refresh, 5000);
    const stop = setTimeout(() => setWaiting(false), WAIT_MAX);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      clearInterval(poll);
      clearTimeout(stop);
    };
  }, [waiting, setProfile]);

  const signIn = async () => {
    platform.haptic("light");
    let url = connect && Date.now() - connect.at < CONNECT_URL_MAX_AGE ? connect.url : null;
    setConnect(null);
    if (!url) {
      setOpening(true);
      try {
        url = (await api.steamConnect()).url;
      } catch (error) {
        toastError(error);
        return;
      } finally {
        setOpening(false);
      }
    }
    platform.openLink(url);
    setWaiting(true);
    prefetch();
  };

  const resolve = async (event: FormEvent) => {
    event.preventDefault();
    const value = input.trim();
    if (!parseSteamProfileInput(value)) {
      platform.haptic("error");
      setLinkError(t("error.steam_profile_invalid"));
      return;
    }
    setResolving(true);
    setLinkError(null);
    try {
      const library = await api.steamResolve(value);
      platform.haptic("success");
      onResolved(value, library);
    } catch (error) {
      platform.haptic("error");
      setLinkError(errorMessage(error));
    } finally {
      setResolving(false);
    }
  };

  return (
    <>
      <div className="steam-hero">
        <span className={`steam-tile ${waiting ? "gradient-border waiting" : ""}`}>
          <BrandIcon file="steam.svg" size={46} color="#fff" />
        </span>
        <h2>{t("steam.hero.title")}</h2>
        <p>{t("steam.hero.subtitle")}</p>
      </div>

      <div className="steam-points">
        <div>
          <span className="ico">
            <Gamepad2 size={20} />
          </span>
          {t("steam.point.games")}
        </div>
        <div>
          <span className="ico">
            <KeyRound size={19} />
          </span>
          {t("steam.point.password")}
        </div>
        <div>
          <span className="ico">
            <Unlink size={19} />
          </span>
          {t("steam.point.unlink")}
        </div>
      </div>

      <div className="steam-note">
        <span className="ico">
          <EyeOff size={17} strokeWidth={2.4} />
        </span>
        <div className="grow">
          <b>{t("steam.privacy.title")}</b>
          <p>{t("steam.privacy.text")}</p>
          <button onClick={() => platform.openLink(STEAM_PRIVACY_URL)}>
            {t("steam.privacy.open")} <ExternalLink size={14} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {waiting ? (
          <motion.div key="wait" className="steam-wait glass" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <Spinner size={26} />
            <b>{t("steam.waiting.title")}</b>
            <p>{t("steam.waiting.text")}</p>
            <div className="actions">
              <button className="btn-secondary" onClick={() => setWaiting(false)}>
                {t("steam.waiting.cancel")}
              </button>
              <button className="btn-secondary accent" disabled={opening} onClick={() => void signIn()}>
                {t("steam.waiting.reopen")}
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.button key="signin" className="btn-primary steam-signin" disabled={opening} onClick={() => void signIn()} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            {opening ? <Spinner size={18} /> : <BrandIcon file="steam.svg" size={20} />} {t("steam.signin")}
          </motion.button>
        )}
      </AnimatePresence>

      <div className="steam-or">{t("steam.or")}</div>

      {linkOpen ? (
        <form className="steam-link" onSubmit={(event) => void resolve(event)}>
          <label className="field glass">
            <Link2 size={18} className="secondary" />
            <input
              autoFocus
              value={input}
              inputMode="url"
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="go"
              placeholder={t("steam.link.placeholder")}
              aria-label={t("steam.link.toggle")}
              onChange={(event) => {
                setInput(event.target.value);
                setLinkError(null);
              }}
            />
            {input && (
              <button type="button" className="steam-clear" aria-label={t("common.close")} onClick={() => setInput("")}>
                <X size={13} strokeWidth={3} />
              </button>
            )}
          </label>
          {linkError ? <span className="steam-error-text">{linkError}</span> : <span className="steam-hint start">{t("steam.link.hint")}</span>}
          <button className="btn-primary" type="submit" disabled={resolving || !input.trim()}>
            {resolving ? <Spinner size={18} /> : t("steam.link.submit")}
          </button>
        </form>
      ) : (
        <button className="btn-secondary steam-link-toggle" onClick={() => setLinkOpen(true)}>
          <Link2 size={18} /> {t("steam.link.toggle")}
        </button>
      )}
      <p className="steam-hint">{t("steam.blocked.hint")}</p>
    </>
  );
}

// ── Library ─────────────────────────────────────────────────────────────────

function LibraryHeader({ name, avatarUrl, subtitle, action }: { name: string; avatarUrl: string | null; subtitle: ReactNode; action: ReactNode }) {
  return (
    <div className="steam-head glass">
      <span className="steam-avatar">
        <Avatar url={avatarUrl} size={52} />
        <span className="mini">
          <BrandIcon file="steam.svg" size={12} />
        </span>
      </span>
      <span className="who">
        <span className="name ellipsis">{name}</span>
        <span className="sub ellipsis">{subtitle}</span>
      </span>
      {action}
    </div>
  );
}

function LibraryGrid({
  library,
  selected,
  owned,
  room,
  onToggle,
  onClear,
  onPickTop,
}: {
  library: SteamLibrary;
  selected: Set<number>;
  owned: Set<string>;
  room: number;
  onToggle(game: SteamLibraryGame): void;
  onClear(): void;
  onPickTop(): void;
}) {
  const t = useT();
  const language = useI18n((state) => state.language);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("playtime");
  const [shown, setShown] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);

  const games = useMemo(() => {
    const needle = looseKey(query);
    const list = needle ? library.games.filter((game) => looseKey(game.name).includes(needle)) : library.games.slice();
    // The server already sorts by playtime.
    if (sort === "recent") list.sort((a, b) => (b.lastPlayedAt ?? "").localeCompare(a.lastPlayedAt ?? "") || b.playtimeMinutes - a.playtimeMinutes);
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name, language));
    return list;
  }, [library, query, sort, language]);

  useEffect(() => setShown(PAGE), [query, sort]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || shown >= games.length) return;
    const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && setShown((value) => value + PAGE), {
      root: node.closest(".sheet-body"),
      rootMargin: "600px 0px",
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [shown, games.length]);

  return (
    <div className="steam-library">
      <div className="steam-toolbar">
        <label className="search-field compact glass">
          <Search size={18} />
          <input value={query} placeholder={t("steam.search")} onChange={(event) => setQuery(event.target.value)} enterKeyHint="search" />
          {query && (
            <button className="steam-clear" aria-label={t("common.close")} onClick={() => setQuery("")}>
              <X size={13} strokeWidth={3} />
            </button>
          )}
        </label>
        <Segmented<Sort>
          id="steam-sort"
          value={sort}
          onChange={setSort}
          options={[
            { value: "playtime", label: t("steam.sort.playtime") },
            { value: "recent", label: t("steam.sort.recent") },
            { value: "name", label: t("steam.sort.name") },
          ]}
        />
        <div className="steam-count">
          {room === 0 ? (
            <span className="full">{t("steam.full", LIMITS.gamesPerPlatform)}</span>
          ) : (
            <>
              <span>{t("steam.selected", selected.size, room)}</span>
              {selected.size ? <button onClick={onClear}>{t("steam.clear")}</button> : <button onClick={onPickTop}>{t("steam.pick.top")}</button>}
            </>
          )}
        </div>
      </div>

      {games.length === 0 ? (
        <div className="steam-nothing secondary">
          <Search size={22} />
          {t("steam.search.empty")}
        </div>
      ) : (
        <div className="steam-grid">
          {games.slice(0, shown).map((game) => {
            const inProfile = owned.has(looseKey(game.name));
            const isSelected = selected.has(game.appId);
            return (
              <SteamGameCard
                key={game.appId}
                game={game}
                selected={isSelected}
                owned={inProfile}
                locked={!inProfile && !isSelected && selected.size >= room}
                onToggle={() => onToggle(game)}
              />
            );
          })}
        </div>
      )}
      {shown < games.length && <div ref={sentinel} className="steam-sentinel" />}
    </div>
  );
}

function SteamGameCard({ game, selected, owned, locked, onToggle }: { game: SteamLibraryGame; selected: boolean; owned: boolean; locked: boolean; onToggle(): void }) {
  const t = useT();
  const playtime = usePlaytime();
  const [failed, setFailed] = useState(false);
  return (
    <button
      className={`steam-card ${selected ? "selected" : ""} ${owned ? "owned" : ""} ${locked ? "locked" : ""}`}
      onClick={owned ? undefined : onToggle}
      aria-pressed={owned ? undefined : selected}
      aria-disabled={owned || undefined}
    >
      <span className="cover">
        {failed ? (
          <span className="blank" aria-hidden>
            {gameInitials(game.name)}
          </span>
        ) : (
          <img src={game.coverUrl} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} />
        )}
        {owned ? (
          <span className="owned-pill">
            <Check size={11} strokeWidth={3.4} /> {t("steam.in.profile")}
          </span>
        ) : (
          <span className="pick" aria-hidden>
            {selected ? (
              <motion.span key="on" initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 520, damping: 26 }} style={{ display: "flex" }}>
                <SelectedDot size={24} />
              </motion.span>
            ) : (
              <span className="ring" />
            )}
          </span>
        )}
      </span>
      <span className="meta">
        <span className="title">{game.name}</span>
        <span className="hours">
          <Clock3 size={12} strokeWidth={2.4} /> {playtime(game.playtimeMinutes)}
        </span>
      </span>
    </button>
  );
}

function LibrarySkeleton() {
  return (
    <div className="steam-grid" aria-hidden>
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="steam-card skeleton">
          <span className="cover steam-skel" />
          <span className="meta">
            <span className="steam-skel line" />
            <span className="steam-skel line short" />
          </span>
        </div>
      ))}
    </div>
  );
}

function StateCard({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="steam-state glass">
      <span className="badge">{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}
