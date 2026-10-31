// Avatar picker: art from the player's games, original UniShare avatars, or an uploaded photo.
// Like choosing an avatar on PSN, but with the official store art the app already shows as
// game covers and avatars drawn for UniShare; no console makers' avatar files are used.
import { motion } from "framer-motion";
import { ChevronRight, ImagePlus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { AVATAR_PRESETS, AVATAR_PRESET_PREFIX, isAvatarArtUrl, normalizeGameName, steamPortraitUrl, type GameSearchResult } from "@unishare/shared";
import { useApp } from "../app/store";
import { api, compressImage } from "../lib/api";
import { errorMessage, useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { Avatar, PresetAvatar, SelectedDot, Sheet, Spinner, useEscape } from "../components/ui";
import { gameKey } from "../components/GamePicker";
import { tagFor } from "./ProfileScreen";

export type AvatarChoice = { kind: "url"; url: string } | { kind: "file"; blob: Blob };

interface ArtItem {
  key: string;
  name: string;
  /** Pickable art, best first: Steam's portrait library art, then the cover. */
  candidates: string[];
}

function artItem(key: string, name: string, steamAppId: number | null | undefined, coverUrl: string | null | undefined): ArtItem {
  const candidates = [steamAppId ? steamPortraitUrl(steamAppId) : null, coverUrl].filter((url): url is string => Boolean(url) && isAvatarArtUrl(url));
  return { key, name, candidates: [...new Set(candidates)] };
}

/**
 * Opened as an overlay ({type: "avatar"}) it saves the choice itself. Onboarding renders it
 * inline with `onChoose`, keeping the choice until the profile is created.
 */
export function AvatarPickerSheet({ onChoose, onClose, current }: { onChoose?(choice: AvatarChoice): void; onClose?(): void; current?: string | null } = {}) {
  const t = useT();
  const profile = useApp((state) => state.profile)!;
  const setProfile = useApp((state) => state.setProfile);
  const pop = useApp((state) => state.pop);
  const toast = useApp((state) => state.toast);
  const close = onClose ?? pop;
  // As an overlay, Escape is handled by the app shell; inline it is this sheet's own.
  useEscape(close, Boolean(onClose));

  const [choice, setChoice] = useState<AvatarChoice | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GameSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const requestId = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const currentUrl = current !== undefined ? current : profile.avatarUrl;
  const shownUrl = choice?.kind === "url" ? choice.url : choice?.kind === "file" ? filePreview : currentUrl;
  /** The tile to mark as picked: the new choice, else the avatar in use. */
  const pickedUrl = choice?.kind === "url" ? choice.url : choice ? null : currentUrl;

  const ownArt = useMemo(() => {
    const seen = new Set<string>();
    const items: ArtItem[] = [];
    for (const name of [...profile.games, ...Object.values(profile.platformGames).flat(), ...profile.wantedGames]) {
      const key = normalizeGameName(name ?? "");
      if (!name || seen.has(key)) continue;
      seen.add(key);
      const tag = tagFor(profile, name);
      const item = artItem(key, name, tag.steamAppId, tag.coverUrl);
      if (item.candidates.length) items.push(item);
    }
    return items;
  }, [profile]);

  useEffect(() => {
    if (choice?.kind !== "file") return setFilePreview(null);
    const url = URL.createObjectURL(choice.blob);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [choice]);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      requestId.current++;
      setResults(null);
      setSearching(false);
      return;
    }
    const id = ++requestId.current;
    setSearching(true);
    const timer = setTimeout(() => {
      api
        .searchGames(value)
        .then((items) => id === requestId.current && setResults(items))
        .catch(() => id === requestId.current && setResults([]))
        .finally(() => id === requestId.current && setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const searchArt = useMemo(
    () =>
      (results ?? [])
        .map((game) => artItem(gameKey(game), game.name, game.steamAppId ?? (game.source === "steam" ? game.id : null), game.backgroundImage))
        .filter((item) => item.candidates.length),
    [results],
  );

  const pick = (url: string) => {
    platform.haptic("selection");
    setChoice({ kind: "url", url });
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setChoice({ kind: "file", blob: await compressImage(file, 800) });
      platform.haptic("selection");
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  };

  const save = async () => {
    if (!choice) return;
    if (onChoose) {
      onChoose(choice);
      close();
      return;
    }
    setSaving(true);
    try {
      const { avatarUrl } = choice.kind === "file" ? await api.uploadAvatar(choice.blob) : await api.pickAvatar(choice.url);
      const latest = useApp.getState().profile;
      if (latest) setProfile({ ...latest, avatarUrl });
      platform.haptic("success");
      close();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setSaving(false);
    }
  };

  const searchActive = query.trim().length >= 2;
  const art = searchActive ? searchArt : ownArt;

  return (
    <Sheet
      title={t("avatar.title")}
      onClose={close}
      lead={
        <button className="btn-plain secondary" onClick={close}>
          {t("cancel")}
        </button>
      }
      trail={
        <button className="btn-plain" style={{ fontWeight: 700 }} disabled={!choice || saving} onClick={() => void save()}>
          {saving ? <Spinner size={18} /> : t("done")}
        </button>
      }
    >
      <div className="container avatar-picker">
        <div className="avatar-preview">
          <span className="glow" aria-hidden />
          <motion.span key={shownUrl ?? "none"} className="ring" initial={{ scale: 0.92, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 420, damping: 28 }}>
            <Avatar url={shownUrl} size={124} />
          </motion.span>
          <span className="caption">{t(choice ? "avatar.preview.new" : "avatar.preview.current")}</span>
        </div>

        <section className="avatar-section">
          <div className="avatar-head">
            <h3>{t("avatar.games")}</h3>
            <p>{t("avatar.games.hint")}</p>
          </div>
          <label className="search-field compact glass">
            <Search size={18} strokeWidth={2.4} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("avatar.search")}
              aria-label={t("avatar.search")}
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {searching && <Spinner size={16} />}
            {query && (
              <button className="icon-circle" style={{ width: 24, height: 24 }} onClick={() => setQuery("")} aria-label={t("common.close")}>
                <X size={13} strokeWidth={3} />
              </button>
            )}
          </label>
          {searchActive && results === null ? (
            <div className="avatar-grid" aria-hidden>
              {Array.from({ length: 8 }, (_, index) => (
                <span key={index} className="avatar-tile">
                  <span className="disc shimmer" />
                </span>
              ))}
            </div>
          ) : art.length ? (
            <div className="avatar-grid" style={{ opacity: searching ? 0.55 : 1 }}>
              {art.map((item) => (
                <ArtTile key={item.key} item={item} pickedUrl={pickedUrl} onPick={pick} />
              ))}
            </div>
          ) : (
            <p className="avatar-note">{t(searchActive ? "avatar.search.empty" : "avatar.games.empty")}</p>
          )}
        </section>

        <section className="avatar-section">
          <div className="avatar-head">
            <h3>{t("avatar.presets")}</h3>
            <p>{t("avatar.presets.hint")}</p>
          </div>
          <div className="avatar-grid presets">
            {AVATAR_PRESETS.map((preset) => {
              const value = `${AVATAR_PRESET_PREFIX}${preset.id}`;
              const selected = pickedUrl === value;
              return (
                <button key={preset.id} className={`avatar-tile ${selected ? "selected" : ""}`} aria-pressed={selected} aria-label={t(`avatar.preset.${preset.id}`)} title={t(`avatar.preset.${preset.id}`)} onClick={() => pick(value)}>
                  <span className="disc">
                    <PresetAvatar preset={preset} size={68} />
                  </span>
                  {selected && (
                    <span className="tick">
                      <SelectedDot size={22} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section className="avatar-section">
          <button className={`avatar-upload ${choice?.kind === "file" ? "selected" : ""}`} onClick={() => fileInput.current?.click()}>
            <span className="ico">
              <ImagePlus size={20} strokeWidth={2.2} />
            </span>
            <span className="col grow" style={{ gap: 2, minWidth: 0 }}>
              <span className="t">{t("avatar.upload")}</span>
              <span className="s">{t("avatar.upload.hint")}</span>
            </span>
            {choice?.kind === "file" ? <SelectedDot size={22} /> : <ChevronRight size={18} strokeWidth={2.4} className="secondary" />}
          </button>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => void onFile(event)} />
        </section>
      </div>
    </Sheet>
  );
}

/** Round preview of a game's art; falls back from the portrait art to the cover when Steam has none. */
function ArtTile({ item, pickedUrl, onPick }: { item: ArtItem; pickedUrl: string | null | undefined; onPick(url: string): void }) {
  const [index, setIndex] = useState(0);
  const src = item.candidates[index];
  // Neither image loads: nothing to pick.
  if (!src) return null;
  const selected = pickedUrl === src;
  return (
    <button className={`avatar-tile art ${selected ? "selected" : ""}`} aria-pressed={selected} aria-label={item.name} title={item.name} onClick={() => onPick(src)}>
      <span className="disc">
        <img src={src} alt="" loading="lazy" draggable={false} onError={() => setIndex((value) => value + 1)} />
      </span>
      {selected && (
        <span className="tick">
          <SelectedDot size={22} />
        </span>
      )}
      <span className="label">{item.name}</span>
    </button>
  );
}
