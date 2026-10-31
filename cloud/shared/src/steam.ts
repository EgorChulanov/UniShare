// Types of the Steam library import (/api/steam/*).

/** A game from the owned Steam library (IPlayerService/GetOwnedGames). */
export interface SteamLibraryGame {
  appId: number;
  name: string;
  /** Total playtime ("playtime_forever"). */
  playtimeMinutes: number;
  /** ISO date of the last session, null when never played or unknown. */
  lastPlayedAt: string | null;
  /** Store header image (460×215). */
  coverUrl: string;
  /** Library portrait (600×900); some apps have none. */
  portraitUrl: string;
}

export interface SteamLibrary {
  steamId: string;
  personaName: string | null;
  avatarUrl: string | null;
  profileUrl: string;
  /** "Game details" is not public in the Steam privacy settings: Steam returns no games. */
  private: boolean;
  /** Sorted by playtime, most played first; capped at STEAM_LIBRARY_MAX. */
  games: SteamLibraryGame[];
  /** Games Steam reported (can exceed games.length for huge libraries). */
  gameCount: number;
}

/** POST /api/steam/connect: the Steam sign-in page to open. */
export interface SteamConnectResponse {
  url: string;
  expiresAt: string;
}

/** Most games returned by /api/steam/library and /api/steam/resolve. */
export const STEAM_LIBRARY_MAX = 2000;

/** Where Steam lets the owner make "Game details" public. */
export const STEAM_PRIVACY_URL = "https://steamcommunity.com/my/edit/settings";

/** A Steam profile typed by the user: a 64-bit id, or a custom URL name to resolve. */
export type SteamProfileInput = { kind: "steamid"; steamId: string } | { kind: "vanity"; vanity: string };

// Individual accounts are 76561197960265728 + a 32-bit account number (0 is no account).
// New accounts already reach 765611999…, and later ones pass 765612…, so no fixed prefix.
const STEAM_ID_MIN = "76561197960265729";
const STEAM_ID_MAX = "76561202255233023";
const VANITY = /^[A-Za-z0-9_-]{2,32}$/;

/** A SteamID64 of an individual account. */
export function isSteamId64(value: string): boolean {
  // Equal lengths, so comparing the strings compares the numbers.
  return /^\d{17}$/.test(value) && value >= STEAM_ID_MIN && value <= STEAM_ID_MAX;
}

/**
 * Accepts steamcommunity.com/profiles/<id>, steamcommunity.com/id/<name> (with or
 * without scheme, www./m., trailing slash, query), a bare SteamID64 or a custom URL name.
 */
export function parseSteamProfileInput(input: string): SteamProfileInput | null {
  const value = input.trim();
  if (!value || value.length > 300) return null;
  const url = /^(?:https?:\/\/)?(?:www\.|m\.)?steamcommunity\.com\/(profiles|id)\/([^/?#\s]+)\/?(?:[?#].*|\/.*)?$/i.exec(value);
  if (url) {
    const part = decodeURIComponentSafe(url[2]);
    if (url[1].toLowerCase() === "profiles") return isSteamId64(part) ? { kind: "steamid", steamId: part } : null;
    return VANITY.test(part) ? { kind: "vanity", vanity: part } : null;
  }
  if (/^\d+$/.test(value)) return isSteamId64(value) ? { kind: "steamid", steamId: value } : null;
  return VANITY.test(value) ? { kind: "vanity", vanity: value } : null;
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
