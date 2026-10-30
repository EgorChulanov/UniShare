import type {
  AuthResponse,
  ChatDetails,
  ChatMessage,
  ChatSummary,
  AirShareResult,
  DiscoveryKind,
  GameDetails,
  GameSearchResult,
  LikeRequestItem,
  LinkTokenResponse,
  MyProfile,
  ProfileCard,
  ProfileUpdate,
  PublicConfig,
  Review,
  SearchResults,
  Story,
  SwipeResult,
} from "@unishare/shared";

const TOKEN_KEY = "unishare.token";
/** Optional separate API origin (native shells); empty = same origin. */
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

let token: string | null = null;
try {
  token = localStorage.getItem(TOKEN_KEY);
} catch {
  token = null;
}

export function getToken(): string | null {
  return token;
}

export function setToken(value: string | null): void {
  token = value;
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage can be unavailable in some webviews */
  }
}

export function apiUrl(path: string): string {
  return path.startsWith("http") ? path : `${API_BASE}${path}`;
}

/** Media URLs from the API are relative; resolve them for <img>. */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return path.startsWith("/") ? apiUrl(path) : path;
}

let unauthorizedHandler: (() => void) | null = null;
export function onUnauthorized(handler: () => void): void {
  unauthorizedHandler = handler;
}

async function request<T>(method: string, path: string, body?: unknown, raw?: Blob): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (raw) {
    headers["Content-Type"] = raw.type || "image/jpeg";
    payload = raw;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(apiUrl(path), { method, headers, body: payload });
  } catch {
    throw new ApiError(0, "network", "network");
  }
  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    if (response.status === 401 && token && !path.startsWith("/api/auth/")) unauthorizedHandler?.();
    throw new ApiError(response.status, data?.error ?? response.statusText, data?.code);
  }
  return data as T;
}

export const api = {
  config: () => request<PublicConfig>("GET", "/api/config"),

  authTelegram: (initData: string, linkToken?: string | null) =>
    request<AuthResponse>("POST", "/api/auth/telegram", { initData, linkToken }),
  authTelegramWidget: (payload: Record<string, unknown>, linkToken?: string | null) =>
    request<AuthResponse>("POST", "/api/auth/telegram-widget", { payload, linkToken }),
  authVk: (launchParams: string, user?: unknown, linkToken?: string | null) =>
    request<AuthResponse>("POST", "/api/auth/vk", { launchParams, user, linkToken }),
  authDev: (name: string, linkToken?: string | null) => request<AuthResponse>("POST", "/api/auth/dev", { name, linkToken }),
  logout: () => request<{ ok: true }>("POST", "/api/auth/logout"),

  me: () => request<MyProfile>("GET", "/api/me"),
  updateMe: (update: ProfileUpdate) => request<MyProfile>("PATCH", "/api/me", update),
  usernameAvailable: (username: string) =>
    request<{ available: boolean }>("GET", `/api/me/username-available?username=${encodeURIComponent(username)}`),
  uploadAvatar: (image: Blob) => request<{ avatarUrl: string }>("POST", "/api/me/avatar", undefined, image),
  deleteAccount: () => request<{ ok: true }>("DELETE", "/api/me"),
  linkToken: () => request<LinkTokenResponse>("POST", "/api/me/link-token"),
  unlink: (provider: "telegram" | "vk") => request<MyProfile>("DELETE", `/api/me/identities/${provider}`),
  setNotifications: (provider: "telegram" | "vk", allowed: boolean) =>
    request<MyProfile>("POST", "/api/me/notifications", { provider, allowed }),
  prepareTelegramShare: () => request<{ preparedMessageId: string | null }>("POST", "/api/me/share/telegram"),

  feed: (kind: DiscoveryKind, limit = 12, exclude: string[] = []) =>
    request<ProfileCard[]>("GET", `/api/feed?kind=${kind}&limit=${limit}&exclude=${exclude.join(",")}`),
  swipe: (targetId: string, kind: DiscoveryKind, decision: "like" | "dislike") =>
    request<SwipeResult>("POST", "/api/feed/swipe", { targetId, kind, decision }),
  undo: (targetId: string, kind: DiscoveryKind) => request<{ restored: boolean }>("POST", "/api/feed/undo", { targetId, kind }),
  user: (uid: string) => request<{ profile: ProfileCard; likedKinds: DiscoveryKind[] }>("GET", `/api/users/${uid}`),
  reviews: (uid: string) => request<Review[]>("GET", `/api/users/${uid}/reviews`),

  requests: () => request<LikeRequestItem[]>("GET", "/api/requests"),
  acceptRequest: (id: string) => request<{ chatId: string }>("POST", `/api/requests/${id}/accept`),
  declineRequest: (id: string) => request<{ ok: true }>("DELETE", `/api/requests/${id}`),

  chats: () => request<ChatSummary[]>("GET", "/api/chats"),
  chat: (id: string) => request<ChatDetails>("GET", `/api/chats/${id}`),
  messages: (id: string, before?: string) =>
    request<ChatMessage[]>("GET", `/api/chats/${id}/messages${before ? `?before=${encodeURIComponent(before)}` : ""}`),
  sendMessage: (chatId: string, message: { id: string; text?: string; imageUrl?: string }) =>
    request<ChatMessage>("POST", `/api/chats/${chatId}/messages`, message),
  uploadChatImage: (chatId: string, image: Blob) => request<{ imageUrl: string }>("POST", `/api/chats/${chatId}/images`, undefined, image),
  markRead: (chatId: string) => request<{ ok: true }>("POST", `/api/chats/${chatId}/read`),
  hideChat: (chatId: string) => request<{ ok: true }>("DELETE", `/api/chats/${chatId}`),

  report: (subjectId: string, reason: string, details: string) =>
    request<{ ok: true }>("POST", "/api/reports", { subjectId, reason, details }),
  block: (userId: string) => request<{ ok: true }>("POST", "/api/blocks", { userId }),
  review: (toUid: string, chatId: string, rating: number, text: string) =>
    request<{ ok: true }>("POST", "/api/reviews", { toUid, chatId, rating, text }),

  stories: () => request<Story[]>("GET", "/api/stories"),
  viewStory: (id: string) => request<{ ok: true }>("POST", `/api/stories/${id}/view`),
  searchGames: (query: string) => request<GameSearchResult[]>("GET", `/api/games/search?q=${encodeURIComponent(query)}`),
  popularGames: () => request<GameSearchResult[]>("GET", "/api/games/popular"),
  gameDetails: (game: { name: string; steamAppId?: number | null; rawgId?: number | null }) => {
    const params = new URLSearchParams({ name: game.name });
    if (game.steamAppId) params.set("steamAppId", String(game.steamAppId));
    if (game.rawgId) params.set("rawgId", String(game.rawgId));
    return request<GameDetails>("GET", `/api/games/details?${params}`);
  },
  search: (query: string, platform?: string | null) => {
    const params = new URLSearchParams({ q: query });
    if (platform) params.set("platform", platform);
    return request<SearchResults>("GET", `/api/search?${params}`);
  },
  airsharePing: (location: { lat: number; lng: number; accuracy?: number } | null) =>
    request<AirShareResult>("POST", "/api/airshare/ping", location ?? {}),
  airshareLeave: () => request<{ ok: true }>("DELETE", "/api/airshare"),
};

/** Downscales an image to JPEG before upload (fast on mobile networks). */
export async function compressImage(file: Blob, maxSide = 1280, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", quality));
}
