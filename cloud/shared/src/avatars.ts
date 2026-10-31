// Original UniShare avatar presets ("preset:<id>") and the hosts whose game art can be picked as an avatar.
// The presets are drawn in code by the clients (web: Avatar in components/ui.tsx); only the id is stored.

export interface AvatarPreset {
  id: string;
  /** Gradient stops, light to dark (top-left to bottom-right). */
  colors: readonly [string, string];
  /** Glyph colour when white would be too faint on the gradient. */
  ink?: string;
}

export const AVATAR_PRESETS: readonly AvatarPreset[] = [
  { id: "controller", colors: ["#8a7bff", "#3a2c9e"] },
  { id: "joystick", colors: ["#5d8bff", "#25288a"] },
  { id: "sword", colors: ["#ff6a6f", "#7d1736"] },
  { id: "swords", colors: ["#ffa04a", "#b52a1c"] },
  { id: "shield", colors: ["#34d9a8", "#0c5f58"] },
  { id: "crown", colors: ["#ffe08a", "#d7832a"], ink: "#4a2a06" },
  { id: "ghost", colors: ["#c3b6ff", "#5546c8"] },
  { id: "rocket", colors: ["#ff5ad9", "#4325c9"] },
  { id: "flame", colors: ["#ffbf47", "#dc2d2a"] },
  { id: "bolt", colors: ["#9f7bff", "#241a6b"], ink: "#ffe45e" },
  { id: "skull", colors: ["#5d5a78", "#121019"] },
  { id: "dragon", colors: ["#2bd38a", "#0a3a36"] },
  { id: "crosshair", colors: ["#ff7a7a", "#a3173f"] },
  { id: "orbit", colors: ["#45e3f2", "#2343c2"] },
  { id: "gem", colors: ["#7ff5e6", "#6238ea"] },
  { id: "trophy", colors: ["#f9cb55", "#a8521a"], ink: "#3d1f05" },
  { id: "headset", colors: ["#f472b0", "#5b34c9"] },
  { id: "moon", colors: ["#7894ff", "#171a52"] },
  { id: "wand", colors: ["#cf8bff", "#35166e"] },
  { id: "claw", colors: ["#ff4d5e", "#22080d"] },
  { id: "dice", colors: ["#86f5b8", "#1a7f6e"] },
  { id: "visor", colors: ["#9ad8ff", "#1f3f73"] },
];

export const AVATAR_PRESET_PREFIX = "preset:";

/** Official store / catalog art the app already shows as game covers. */
export const AVATAR_ART_HOSTS: readonly string[] = [
  "shared.akamai.steamstatic.com",
  "cdn.akamai.steamstatic.com",
  "cdn.cloudflare.steamstatic.com",
  "steamcdn-a.akamaihd.net",
  "media.rawg.io",
  "upload.wikimedia.org",
];

export const AVATAR_URL_MAX = 2048;

const IMAGE_PATH = /\.(jpe?g|png|webp|gif)$/i;

/** The preset an avatar value names ("preset:crown"), or null. */
export function avatarPreset(value: string | null | undefined): AvatarPreset | null {
  if (!value?.startsWith(AVATAR_PRESET_PREFIX)) return null;
  const id = value.slice(AVATAR_PRESET_PREFIX.length);
  return AVATAR_PRESETS.find((preset) => preset.id === id) ?? null;
}

/** Game art from an allowed host: https, no credentials or port, an image path. */
export function isAvatarArtUrl(value: string | null | undefined): boolean {
  if (!value || value.length > AVATAR_URL_MAX) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:" && !url.username && !url.password && !url.port && AVATAR_ART_HOSTS.includes(url.hostname) && IMAGE_PATH.test(url.pathname);
}

/** A value POST /api/me/avatar/pick accepts, normalized; null when it is not one. */
export function sanitizePickedAvatar(value: unknown): string | null {
  if (typeof value !== "string" || value.length > AVATAR_URL_MAX) return null;
  if (value.startsWith(AVATAR_PRESET_PREFIX)) return avatarPreset(value) ? value : null;
  if (!isAvatarArtUrl(value)) return null;
  const href = new URL(value).href;
  return href.length <= AVATAR_URL_MAX ? href : null;
}

/** Steam's portrait library art (600×900): characters fill it, so it crops well into a circle. */
export function steamPortraitUrl(appId: number): string {
  return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900.jpg`;
}
