// Steam library import: sign in through Steam (OpenID 2.0), then pick games from the owned library.
// A linked Steam account is never a way to sign in to UniShare; it only lets the server read
// the owned games (IPlayerService/GetOwnedGames). Without signing in, a public profile link
// works too (/api/steam/resolve): it needs only api.steampowered.com, which stays reachable
// from Russia when steamcommunity.com (the sign-in page) is blocked.
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  LIMITS,
  STEAM_LIBRARY_MAX,
  isSteamId64,
  parseSteamProfileInput,
  sanitizeGameName,
  telegramAppLink,
  vkAppLink,
  webLink,
  type ClientPlatform,
  type MyProfile,
  type SteamConnectResponse,
  type SteamLibrary,
  type SteamLibraryGame,
} from "@unishare/shared";
import { config } from "../config";
import { query, queryOne, transaction } from "../db";
import { hashToken, randomToken, requireSession } from "../auth/session";
import { HttpError, badRequest } from "../lib/errors";
import { SlidingWindowLimit } from "../lib/ratelimit";
import { steamImageFromCapsule } from "../games";
import { publish } from "../realtime";
import { loadMyProfile } from "./me";

const OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const OPENID_NS = "http://specs.openid.net/auth/2.0";
const IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select";
const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;
/** Fields Steam must sign (OpenID 2.0, 10.1), so no unsigned value can be swapped in. */
const REQUIRED_SIGNED = ["op_endpoint", "return_to", "response_nonce", "assoc_handle", "claimed_id", "identity"];
const STEAM_API = "https://api.steampowered.com";
const TIMEOUT_MS = 8_000;
const USER_AGENT = "UniShare/1.0 (https://github.com/EgorChulanov/UniShare; official@egorchulanov.ru)";
const STATE_MINUTES = 15;
const LIBRARY_TTL_MS = 10 * 60_000;
/** A pasted profile link is looked up once, so its library is kept for less time. */
const RESOLVED_TTL_MS = 3 * 60_000;
const LIBRARY_CACHE_MAX = 200;
/** Games across all cached libraries (~110 bytes each): a few collectors' libraries can't fill the memory. */
const CACHE_GAMES_MAX = 50_000;

const steamUnavailable = () => new HttpError(502, "Steam is not responding, try again later", "steam_unavailable");

function assertConfigured(): string {
  if (!config.steam.apiKey) throw new HttpError(503, "Steam import is not configured", "steam_not_configured");
  return config.steam.apiKey;
}

function returnTo(state: string): string {
  return `${config.publicUrl}/api/steam/callback?state=${state}`;
}

export function steamLoginUrl(state: string): string {
  const url = new URL(OPENID_ENDPOINT);
  url.searchParams.set("openid.ns", OPENID_NS);
  url.searchParams.set("openid.mode", "checkid_setup");
  url.searchParams.set("openid.return_to", returnTo(state));
  url.searchParams.set("openid.realm", config.publicUrl);
  url.searchParams.set("openid.identity", IDENTIFIER_SELECT);
  url.searchParams.set("openid.claimed_id", IDENTIFIER_SELECT);
  return url.toString();
}

// ── Steam Web API (api.steampowered.com) ────────────────────────────────────

/** GET a Steam Web API method; any failure (timeout, HTTP error, bad JSON) is "steam_unavailable". */
async function steamApi<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${STEAM_API}${path}`);
  url.searchParams.set("key", assertConfigured());
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  let response: Response;
  try {
    response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw steamUnavailable();
  }
  if (response.status === 401 || response.status === 403) console.warn(`steam web api rejected the key (HTTP ${response.status}); check STEAM_API_KEY`);
  if (!response.ok) throw steamUnavailable();
  try {
    return (await response.json()) as T;
  } catch {
    throw steamUnavailable();
  }
}

interface PlayerSummary {
  steamid: string;
  personaname?: string;
  profileurl?: string;
  avatarfull?: string;
  avatarmedium?: string;
}

interface OwnedGame {
  appid: number;
  name?: string;
  playtime_forever?: number;
  rtime_last_played?: number;
}

function httpsUrl(value: string | undefined, prefix = "https://"): string | null {
  return value && value.length <= 2048 && value.startsWith(prefix) ? value : null;
}

/** Persona, avatar and profile URL; null when Steam has no such account. */
async function playerSummary(steamId: string): Promise<PlayerSummary | null> {
  const data = await steamApi<{ response?: { players?: PlayerSummary[] } }>("/ISteamUser/GetPlayerSummaries/v2/", { steamids: steamId });
  return data.response?.players?.find((player) => player.steamid === steamId) ?? null;
}

async function resolveVanity(vanity: string): Promise<string | null> {
  const data = await steamApi<{ response?: { success?: number; steamid?: string } }>("/ISteamUser/ResolveVanityURL/v1/", { vanityurl: vanity });
  const steamId = data.response?.success === 1 ? data.response.steamid : undefined;
  return steamId && isSteamId64(steamId) ? steamId : null;
}

/** Owned games, or null when "Game details" is private (Steam then answers an empty response). */
async function ownedGames(steamId: string): Promise<{ games: OwnedGame[]; count: number } | null> {
  const data = await steamApi<{ response?: { game_count?: number; games?: OwnedGame[] } }>("/IPlayerService/GetOwnedGames/v1/", {
    steamid: steamId,
    include_appinfo: "1",
    include_played_free_games: "1",
    format: "json",
  });
  const response = data.response ?? {};
  // A public library without games still has game_count: 0.
  if (!Array.isArray(response.games) && typeof response.game_count !== "number") return null;
  const games = Array.isArray(response.games) ? response.games : [];
  return { games, count: typeof response.game_count === "number" ? response.game_count : games.length };
}

/** Steam names carry ™/®; without them they match the names already in profiles. */
export function cleanSteamName(name: string | undefined): string | null {
  if (!name) return null;
  const cleaned = name.replace(/[™®©]/g, "").replace(/\s+/g, " ").trim();
  return sanitizeGameName(cleaned.slice(0, LIMITS.gameNameMax).trim());
}

/** A game as cached: the image URLs are rebuilt from the app id when the library is sent. */
type BareGame = Omit<SteamLibraryGame, "coverUrl" | "portraitUrl">;
type BareLibrary = Omit<SteamLibrary, "games"> & { games: BareGame[] };

export function mapOwnedGames(games: OwnedGame[]): BareGame[] {
  const result: BareGame[] = [];
  for (const game of games) {
    const name = cleanSteamName(game.name);
    if (!name || !Number.isSafeInteger(game.appid) || game.appid <= 0) continue;
    const lastPlayed = Number(game.rtime_last_played ?? 0);
    result.push({
      appId: game.appid,
      name,
      playtimeMinutes: Math.max(0, Math.round(Number(game.playtime_forever ?? 0)) || 0),
      lastPlayedAt: lastPlayed > 0 ? new Date(lastPlayed * 1000).toISOString() : null,
    });
  }
  return result.sort(
    (a, b) =>
      b.playtimeMinutes - a.playtimeMinutes ||
      (b.lastPlayedAt ?? "").localeCompare(a.lastPlayedAt ?? "") ||
      a.name.localeCompare(b.name),
  );
}

export function withImages(library: BareLibrary): SteamLibrary {
  return {
    ...library,
    games: library.games.map((game) => ({
      ...game,
      coverUrl: steamImageFromCapsule(game.appId, null),
      portraitUrl: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${game.appId}/library_600x900.jpg`,
    })),
  };
}

const profileUrlOf = (steamId: string, summary: PlayerSummary | null) =>
  httpsUrl(summary?.profileurl, "https://steamcommunity.com/") ?? `https://steamcommunity.com/profiles/${steamId}`;

/** The custom URL name (steamcommunity.com/id/<name>), used as the identity's username. */
function vanityOf(summary: PlayerSummary | null): string | null {
  return /^https:\/\/steamcommunity\.com\/id\/([A-Za-z0-9_-]{2,32})\/?$/.exec(summary?.profileurl ?? "")?.[1] ?? null;
}

// Libraries by SteamID64, kept for a while so reopening the sheet does not call Steam again.
// Private answers are never cached: the user is about to change the setting and retry.
const libraryCache = new Map<string, { expires: number; library: BareLibrary }>();
let cachedGames = 0;

function dropCached(steamId: string): void {
  const entry = libraryCache.get(steamId);
  if (!entry) return;
  cachedGames -= entry.library.games.length;
  libraryCache.delete(steamId);
}

export function clearSteamCache(steamId?: string): void {
  if (steamId) return dropCached(steamId);
  libraryCache.clear();
  cachedGames = 0;
}

export function steamCacheStats(): { libraries: number; games: number } {
  return { libraries: libraryCache.size, games: cachedGames };
}

function cachedLibrary(steamId: string): BareLibrary | null {
  const entry = libraryCache.get(steamId);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    dropCached(steamId);
    return null;
  }
  return entry.library;
}

function cacheLibrary(library: BareLibrary, ttl: number): void {
  dropCached(library.steamId);
  libraryCache.set(library.steamId, { expires: Date.now() + ttl, library });
  cachedGames += library.games.length;
  // Maps keep insertion order: the first key is the oldest entry.
  while (libraryCache.size > LIBRARY_CACHE_MAX || cachedGames > CACHE_GAMES_MAX) dropCached(libraryCache.keys().next().value!);
}

interface Fallback {
  personaName: string | null;
  avatarUrl: string | null;
}

/**
 * The owned library of `steamId`. With `mustExist` an unknown account is a 404
 * (for typed profile links); a linked account falls back to its stored persona.
 */
async function loadLibrary(steamId: string, options: { fallback?: Fallback; mustExist?: boolean; onSummary?: (summary: PlayerSummary) => void }): Promise<SteamLibrary> {
  const cached = cachedLibrary(steamId);
  if (cached) return withImages(cached);
  // Summaries are cosmetic for a linked account, so their failure alone is not an error.
  const [owned, summary] = await Promise.all([
    ownedGames(steamId),
    playerSummary(steamId).catch((error: unknown) => {
      if (options.mustExist) throw error;
      return undefined;
    }),
  ]);
  if (summary === null && options.mustExist) throw new HttpError(404, "No Steam profile with this link", "steam_profile_not_found");
  if (summary) options.onSummary?.(summary);
  const games = owned ? mapOwnedGames(owned.games) : [];
  const library: BareLibrary = {
    steamId,
    personaName: summary?.personaname?.slice(0, 120) ?? options.fallback?.personaName ?? null,
    avatarUrl: httpsUrl(summary?.avatarfull ?? summary?.avatarmedium) ?? options.fallback?.avatarUrl ?? null,
    profileUrl: profileUrlOf(steamId, summary ?? null),
    private: owned === null,
    games: games.slice(0, STEAM_LIBRARY_MAX),
    gameCount: owned ? Math.max(owned.count, games.length) : 0,
  };
  if (!library.private) cacheLibrary(library, options.mustExist ? RESOLVED_TTL_MS : LIBRARY_TTL_MS);
  return withImages(library);
}

// ── OpenID 2.0 (steamcommunity.com) ─────────────────────────────────────────

/** POSTs Steam's answer back with mode=check_authentication; Steam says whether it signed it. */
async function verifyWithSteam(openid: Record<string, string>): Promise<boolean> {
  const body = new URLSearchParams({ ...openid, "openid.mode": "check_authentication" });
  let response: Response;
  try {
    response = await fetch(OPENID_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
      body: body.toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw steamUnavailable();
  }
  if (!response.ok) throw steamUnavailable();
  // Key-Value Form Encoding: "key:value" lines.
  const text = await response.text().catch(() => "");
  const fields = new Map(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes(":"))
      .map((line) => [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 1)] as const),
  );
  return fields.get("ns") === OPENID_NS && fields.get("is_valid") === "true";
}

type Failure = "expired" | "invalid" | "unverified" | "unavailable" | "taken" | "cancelled" | "not_configured";

/** Checks Steam's positive assertion; returns the SteamID64 or why it is not acceptable. */
export function checkAssertion(openid: Record<string, string>, state: string): { steamId: string } | { failure: Failure } {
  if (openid["openid.ns"] !== OPENID_NS || openid["openid.mode"] !== "id_res") return { failure: "invalid" };
  if (openid["openid.op_endpoint"] !== OPENID_ENDPOINT) return { failure: "invalid" };
  if (openid["openid.return_to"] !== returnTo(state)) return { failure: "invalid" };
  const claimed = CLAIMED_ID.exec(openid["openid.claimed_id"] ?? "");
  if (!claimed || openid["openid.identity"] !== openid["openid.claimed_id"]) return { failure: "invalid" };
  if (!openid["openid.sig"] || !openid["openid.assoc_handle"] || !openid["openid.response_nonce"]) return { failure: "invalid" };
  const signed = new Set((openid["openid.signed"] ?? "").split(","));
  if (!REQUIRED_SIGNED.every((field) => signed.has(field))) return { failure: "invalid" };
  return { steamId: claimed[1] };
}

// ── Result page ─────────────────────────────────────────────────────────────

type PageLanguage = "ru" | "en" | "uk" | "be";

const PAGE_STRINGS: Record<PageLanguage, Record<string, string>> = {
  ru: {
    "ok.title": "Steam подключён",
    "ok.text": "Возвращайтесь в UniShare: библиотека уже ждёт, осталось выбрать игры для профиля.",
    "ok.account": "Привязан к профилю UniShare",
    "error.title": "Не удалось подключить Steam",
    "back": "Вернуться в UniShare",
    "hint": "Или просто закройте эту страницу.",
    expired: "Ссылка для входа устарела или уже использована. Нажмите «Войти через Steam» в UniShare ещё раз.",
    invalid: "Steam вернул некорректный ответ. Попробуйте ещё раз.",
    unverified: "Steam не подтвердил вход. Попробуйте ещё раз.",
    unavailable: "Сервер UniShare сейчас не может связаться со Steam. Попробуйте позже или вставьте в UniShare ссылку на профиль Steam — для неё вход не нужен.",
    taken: "Этот аккаунт Steam уже привязан к другому профилю UniShare. Сначала отвяжите его там.",
    cancelled: "Вход через Steam отменён.",
    not_configured: "Импорт из Steam пока не настроен на этом сервере.",
  },
  en: {
    "ok.title": "Steam connected",
    "ok.text": "Head back to UniShare: your library is ready, just pick the games for your profile.",
    "ok.account": "Linked to the UniShare profile",
    "error.title": "Couldn’t connect Steam",
    "back": "Back to UniShare",
    "hint": "Or simply close this page.",
    expired: "This sign-in link has expired or was already used. Tap “Sign in with Steam” in UniShare again.",
    invalid: "Steam returned an invalid answer. Please try again.",
    unverified: "Steam did not confirm the sign-in. Please try again.",
    unavailable: "The UniShare server can’t reach Steam right now. Try again later, or paste your Steam profile link in UniShare instead: it works without signing in.",
    taken: "This Steam account is already linked to another UniShare profile. Unlink it there first.",
    cancelled: "Steam sign-in was cancelled.",
    not_configured: "Steam import isn’t set up on this server yet.",
  },
  uk: {
    "ok.title": "Steam підключено",
    "ok.text": "Повертайтеся в UniShare: бібліотека вже чекає, залишилося вибрати ігри для профілю.",
    "ok.account": "Прив’язано до профілю UniShare",
    "error.title": "Не вдалося підключити Steam",
    "back": "Повернутися в UniShare",
    "hint": "Або просто закрийте цю сторінку.",
    expired: "Посилання для входу застаріло або вже використане. Натисніть «Увійти через Steam» в UniShare ще раз.",
    invalid: "Steam повернув некоректну відповідь. Спробуйте ще раз.",
    unverified: "Steam не підтвердив вхід. Спробуйте ще раз.",
    unavailable: "Сервер UniShare зараз не може зв’язатися зі Steam. Спробуйте пізніше або вставте в UniShare посилання на профіль Steam — для нього вхід не потрібен.",
    taken: "Цей акаунт Steam уже прив’язаний до іншого профілю UniShare. Спочатку відв’яжіть його там.",
    cancelled: "Вхід через Steam скасовано.",
    not_configured: "Імпорт зі Steam ще не налаштовано на цьому сервері.",
  },
  be: {
    "ok.title": "Steam падключаны",
    "ok.text": "Вяртайцеся ў UniShare: бібліятэка ўжо чакае, засталося выбраць гульні для профілю.",
    "ok.account": "Прывязаны да профілю UniShare",
    "error.title": "Не атрымалася падключыць Steam",
    "back": "Вярнуцца ў UniShare",
    "hint": "Або проста зачыніце гэтую старонку.",
    expired: "Спасылка для ўваходу састарэла або ўжо выкарыстаная. Націсніце «Увайсці праз Steam» у UniShare яшчэ раз.",
    invalid: "Steam вярнуў некарэктны адказ. Паспрабуйце яшчэ раз.",
    unverified: "Steam не пацвердзіў уваход. Паспрабуйце яшчэ раз.",
    unavailable: "Сервер UniShare зараз не можа звязацца са Steam. Паспрабуйце пазней або ўстаўце ў UniShare спасылку на профіль Steam — для яе ўваход не патрэбны.",
    taken: "Гэты акаўнт Steam ужо прывязаны да іншага профілю UniShare. Спачатку адвяжыце яго там.",
    cancelled: "Уваход праз Steam адменены.",
    not_configured: "Імпарт са Steam яшчэ не наладжаны на гэтым серверы.",
  },
};

const STEAM_PATH =
  "M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z";

const PAGE_CSS = `
@font-face{font-family:Manrope;src:url(/fonts/Manrope-Medium.ttf) format("truetype");font-weight:500;font-display:swap}
@font-face{font-family:Manrope;src:url(/fonts/Manrope-Bold.ttf) format("truetype");font-weight:700;font-display:swap}
@font-face{font-family:Manrope;src:url(/fonts/Manrope-ExtraBold.ttf) format("truetype");font-weight:800;font-display:swap}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;color:#fff;font:500 15px/1.45 Manrope,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased;
background:radial-gradient(ellipse 80% 55% at 50% -5%,rgba(92,72,223,.42),transparent 70%),radial-gradient(ellipse 60% 40% at 50% 110%,rgba(164,150,247,.14),transparent 70%),#0d0b19}
main{width:100%;max-width:400px;padding:34px 24px 24px;border-radius:28px;text-align:center;background:rgba(27,25,39,.88);border:1px solid rgba(255,255,255,.10);box-shadow:0 30px 80px rgba(0,0,0,.55)}
.mark{position:relative;display:inline-flex;width:80px;height:80px;border-radius:26px;align-items:center;justify-content:center;background:linear-gradient(140deg,#2a475e,#171a21);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14),0 14px 34px rgba(0,0,0,.45)}
.mark>svg{width:44px;height:44px;fill:#fff}
.badge{position:absolute;right:-9px;bottom:-9px;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid #1b1927;background:#30d158}
.badge.error{background:#ff453a}
.badge svg{width:15px;height:15px;stroke:#fff;stroke-width:3.4;fill:none;stroke-linecap:round;stroke-linejoin:round}
h1{font-size:24px;font-weight:800;letter-spacing:-.01em;line-height:1.2;margin:24px 0 8px}
p{margin:0;color:#a3a1ad}
.persona{display:inline-flex;align-items:center;gap:10px;max-width:100%;margin-top:18px;padding:6px 16px 6px 6px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.09);font-weight:700}
.persona img{width:34px;height:34px;border-radius:50%;object-fit:cover;flex-shrink:0}
.persona span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.account{margin-top:14px;font-size:14px;overflow-wrap:anywhere}
.account b{color:#fff;font-weight:700}
.btn{display:flex;align-items:center;justify-content:center;height:54px;margin-top:26px;border-radius:18px;background:linear-gradient(90deg,#5c48df,#7262ea);color:#fff;font-weight:700;font-size:16px;text-decoration:none;box-shadow:0 10px 26px rgba(92,72,223,.38)}
.btn:active{transform:scale(.98)}
.hint{margin-top:14px;font-size:13px;color:rgba(235,233,245,.42)}
`;

const PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

function pageLanguage(value: string | null | undefined): PageLanguage {
  const code = (value ?? "").slice(0, 2).toLowerCase();
  return code === "en" || code === "uk" || code === "be" ? code : code === "ru" || !code ? "ru" : "en";
}

/** Where the "Back to UniShare" button leads: the client that started the sign-in, on its profile screen. */
function backUrl(client: ClientPlatform | null): string {
  const link = { kind: "screen" as const, screen: "profile" as const };
  if (client === "telegram" && config.telegram.botUsername) return telegramAppLink(config.telegram.botUsername, config.telegram.appShortName, link);
  if (client === "vk" && config.vk.appId) return vkAppLink(config.vk.appId, link);
  return webLink(config.publicUrl, link);
}

/** `account` is the UniShare username that got the Steam account, so whoever signed in to Steam sees where it went. */
type PageResult = { ok: true; personaName: string | null; avatarUrl: string | null; account: string | null } | { ok: false; failure: Failure };

export function renderSteamPage(result: PageResult, language: PageLanguage, back: string): string {
  const strings = PAGE_STRINGS[language];
  const title = result.ok ? strings["ok.title"] : strings["error.title"];
  const text = result.ok ? strings["ok.text"] : strings[result.failure];
  const badge = result.ok
    ? `<span class="badge"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>`
    : `<span class="badge error"><svg viewBox="0 0 24 24"><path d="M12 6v7.5M12 18.2v.1"/></svg></span>`;
  const persona =
    result.ok && result.personaName
      ? `<div class="persona">${result.avatarUrl ? `<img src="${escapeHtml(result.avatarUrl)}" alt="">` : ""}<span>${escapeHtml(result.personaName)}</span></div>`
      : "";
  const account = result.ok && result.account ? `<p class="account">${escapeHtml(strings["ok.account"])} <b>@${escapeHtml(result.account)}</b></p>` : "";
  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0d0b19">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · UniShare</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<main>
<span class="mark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STEAM_PATH}"/></svg>${badge}</span>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(text)}</p>
${persona}
${account}
<a class="btn" href="${escapeHtml(back)}">${escapeHtml(strings.back)}</a>
<p class="hint">${escapeHtml(strings.hint)}</p>
</main>
</body>
</html>`;
}

// ── Linking ─────────────────────────────────────────────────────────────────

/** Thrown inside the linking transaction so it rolls back: the state and the user's current link stay. */
class SteamTaken extends Error {}

/** Consumes the state and links the Steam account; "expired" when the state was used meanwhile. */
async function linkSteam(
  stateHash: string,
  steamId: string,
  summary: PlayerSummary | null,
): Promise<{ userId: string; username: string | null } | { failure: Failure }> {
  try {
    return await transaction(async (db) => {
      const state = (await db.query<{ user_id: string; username: string | null }>(
        `delete from steam_login_states s using users u
         where s.token_hash = $1 and s.expires_at > now() and u.uid = s.user_id and u.account_state = 'active'
         returning s.user_id, u.username`,
        [stateHash],
      )).rows[0];
      if (!state) return { failure: "expired" as const };
      // Refused before anything changes: a Steam account linked to someone else stays there.
      const holder = (await db.query<{ user_id: string }>(
        `select user_id from user_identities where provider = 'steam' and provider_user_id = $1 for update`,
        [steamId],
      )).rows[0];
      if (holder && holder.user_id !== state.user_id) throw new SteamTaken();
      // Another Steam account of this user is replaced.
      await db.query(`delete from user_identities where user_id = $1 and provider = 'steam' and provider_user_id <> $2`, [state.user_id, steamId]);
      // The update only runs for this user's own row; no row back means another user linked it meanwhile.
      const linked = (await db.query<{ user_id: string }>(
        `insert into user_identities (provider, provider_user_id, user_id, username, display_name, photo_url)
         values ('steam', $1, $2, $3, $4, $5)
         on conflict (provider, provider_user_id) do update set
           username = coalesce(excluded.username, user_identities.username),
           display_name = coalesce(excluded.display_name, user_identities.display_name),
           photo_url = coalesce(excluded.photo_url, user_identities.photo_url)
         where user_identities.user_id = excluded.user_id
         returning user_id`,
        [steamId, state.user_id, vanityOf(summary), summary?.personaname?.slice(0, 120) ?? null, httpsUrl(summary?.avatarfull ?? summary?.avatarmedium)],
      )).rows[0];
      if (!linked) throw new SteamTaken();
      return { userId: state.user_id, username: state.username };
    });
  } catch (error) {
    if (error instanceof SteamTaken) return { failure: "taken" };
    throw error;
  }
}

function sendPage(reply: FastifyReply, status: number, result: PageResult, language: PageLanguage, client: ClientPlatform | null) {
  return reply
    .status(status)
    .header("Cache-Control", "no-store")
    .header("Content-Security-Policy", PAGE_CSP)
    .type("text/html; charset=utf-8")
    .send(renderSteamPage(result, language, backUrl(client)));
}

async function steamIdentity(userId: string) {
  return queryOne<{ provider_user_id: string; display_name: string | null; photo_url: string | null }>(
    `select provider_user_id, display_name, photo_url from user_identities where user_id = $1 and provider = 'steam'`,
    [userId],
  );
}

export async function steamRoutes(app: FastifyInstance): Promise<void> {
  const connectLimit = new SlidingWindowLimit(30, 10 * 60_000);
  const libraryLimit = new SlidingWindowLimit(30, 10 * 60_000);
  const resolveLimit = new SlidingWindowLimit(20, 10 * 60_000);

  /** Starts "Sign in through Steam": a one-time state and the Steam page that returns to the callback. */
  app.post("/api/steam/connect", async (request): Promise<SteamConnectResponse> => {
    assertConfigured();
    const session = await requireSession(request);
    connectLimit.assert(session.userId);
    const state = randomToken(24);
    const expiresAt = await transaction(async (db) => {
      await db.query(`delete from steam_login_states where expires_at < now()`);
      const row = (await db.query<{ expires_at: string }>(
        `insert into steam_login_states (token_hash, user_id, client, expires_at)
         values ($1, $2, $3, now() + make_interval(mins => $4)) returning expires_at`,
        [hashToken(state), session.userId, session.client, STATE_MINUTES],
      )).rows[0];
      // Earlier states stay valid (a Steam page may still be open), but only the newest few.
      await db.query(
        `delete from steam_login_states where user_id = $1 and token_hash not in (
           select token_hash from steam_login_states where user_id = $1 order by created_at desc limit 5)`,
        [session.userId],
      );
      return row.expires_at;
    });
    return { url: steamLoginUrl(state), expiresAt };
  });

  /** Steam redirects the browser here; the answer is verified with Steam itself before linking. */
  app.get<{ Querystring: Record<string, string | string[] | undefined> }>("/api/steam/callback", async (request, reply) => {
    const params = request.query ?? {};
    let language = pageLanguage(request.headers["accept-language"]);
    if (!config.steam.apiKey) return sendPage(reply, 503, { ok: false, failure: "not_configured" }, language, null);

    const openid: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
      if (!key.startsWith("openid.")) continue;
      // A repeated parameter is never part of a genuine answer.
      if (typeof value !== "string") return sendPage(reply, 400, { ok: false, failure: "invalid" }, language, null);
      openid[key] = value;
    }
    if (openid["openid.mode"] === "cancel") return sendPage(reply, 200, { ok: false, failure: "cancelled" }, language, null);

    const state = typeof params.state === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(params.state) ? params.state : null;
    if (!state) return sendPage(reply, 400, { ok: false, failure: "expired" }, language, null);
    const stateHash = hashToken(state);
    const pending = await queryOne<{ client: ClientPlatform; language: string }>(
      `select s.client, u.language from steam_login_states s join users u on u.uid = s.user_id
       where s.token_hash = $1 and s.expires_at > now()`,
      [stateHash],
    );
    if (!pending) return sendPage(reply, 400, { ok: false, failure: "expired" }, language, null);
    language = pageLanguage(pending.language);
    const fail = (status: number, failure: Failure) => sendPage(reply, status, { ok: false, failure }, language, pending.client);

    const checked = checkAssertion(openid, state);
    if ("failure" in checked) return fail(400, checked.failure);
    let valid: boolean;
    try {
      valid = await verifyWithSteam(openid);
    } catch {
      return fail(502, "unavailable");
    }
    if (!valid) return fail(403, "unverified");

    const summary = await playerSummary(checked.steamId).catch(() => null);
    let linked: Awaited<ReturnType<typeof linkSteam>>;
    try {
      linked = await linkSteam(stateHash, checked.steamId, summary);
    } catch (error) {
      // Two answers for the same user at once (unique user/provider): the first one wins.
      if ((error as { code?: string }).code === "23505") return fail(409, "expired");
      throw error;
    }
    if ("failure" in linked) return fail(linked.failure === "taken" ? 409 : 400, linked.failure);

    clearSteamCache(checked.steamId);
    publish(linked.userId, { type: "profile_updated" });
    return sendPage(
      reply,
      200,
      { ok: true, personaName: summary?.personaname ?? null, avatarUrl: httpsUrl(summary?.avatarfull ?? summary?.avatarmedium), account: linked.username },
      language,
      pending.client,
    );
  });

  /** The linked account's owned games. */
  app.get("/api/steam/library", async (request): Promise<SteamLibrary> => {
    assertConfigured();
    const session = await requireSession(request);
    const identity = await steamIdentity(session.userId);
    if (!identity) throw new HttpError(409, "Link a Steam account first", "steam_not_linked");
    if (!cachedLibrary(identity.provider_user_id)) libraryLimit.assert(session.userId);
    return loadLibrary(identity.provider_user_id, {
      fallback: { personaName: identity.display_name, avatarUrl: identity.photo_url },
      // Keeps the stored persona fresh for MyProfile.steam.
      onSummary: (summary) => {
        const name = summary.personaname?.slice(0, 120) ?? null;
        const photo = httpsUrl(summary.avatarfull ?? summary.avatarmedium);
        if (name === identity.display_name && photo === identity.photo_url) return;
        void query(
          `update user_identities set display_name = coalesce($3, display_name), photo_url = coalesce($4, photo_url)
           where user_id = $1 and provider = 'steam' and provider_user_id = $2`,
          [session.userId, identity.provider_user_id, name, photo],
        ).catch(() => undefined);
      },
    });
  });

  /** A public profile's games without signing in: profile URL, SteamID64 or custom URL name. Links nothing. */
  app.post<{ Body: { profile?: unknown } }>("/api/steam/resolve", async (request): Promise<SteamLibrary> => {
    assertConfigured();
    const session = await requireSession(request);
    const input = typeof request.body?.profile === "string" ? parseSteamProfileInput(request.body.profile) : null;
    if (!input) throw badRequest("Paste a link to a Steam profile", "steam_profile_invalid");
    resolveLimit.assert(session.userId);
    const steamId = input.kind === "steamid" ? input.steamId : await resolveVanity(input.vanity);
    if (!steamId) throw new HttpError(404, "No Steam profile with this link", "steam_profile_not_found");
    return loadLibrary(steamId, { mustExist: true });
  });

  app.delete("/api/steam", async (request): Promise<MyProfile> => {
    assertConfigured();
    const session = await requireSession(request);
    const removed = await query<{ provider_user_id: string }>(
      `delete from user_identities where user_id = $1 and provider = 'steam' returning provider_user_id`,
      [session.userId],
    );
    for (const row of removed) clearSteamCache(row.provider_user_id);
    await query(`delete from steam_login_states where user_id = $1`, [session.userId]);
    if (removed.length) publish(session.userId, { type: "profile_updated" });
    return loadMyProfile(session.userId);
  });
}
