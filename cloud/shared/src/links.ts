// Deep links understood by every client. Telegram `startapp`, VK hash and web
// paths all carry the same compact payload so a QR code or shared link works
// wherever it is opened.

export type DeepLink =
  | { kind: "profile"; uid: string }
  | { kind: "chat"; chatId: string }
  | { kind: "link"; token: string }
  | { kind: "screen"; screen: "feed" | "chats" | "profile" | "nearby" };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const compactUuid = (uuid: string) => uuid.replace(/-/g, "");
const expandUuid = (hex: string) =>
  `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;

/** Telegram limits start parameters to 64 chars of [A-Za-z0-9_-]. */
export function encodeDeepLink(link: DeepLink): string {
  switch (link.kind) {
    case "profile":
      return `u_${compactUuid(link.uid)}`;
    case "chat":
      return `c_${compactUuid(link.chatId)}`;
    case "link":
      return `l_${link.token}`;
    case "screen":
      return `s_${link.screen}`;
  }
}

export function decodeDeepLink(payload: string | null | undefined): DeepLink | null {
  if (!payload) return null;
  const value = payload.trim();
  let match = /^u_([0-9a-f]{32})$/i.exec(value);
  if (match) return { kind: "profile", uid: expandUuid(match[1].toLowerCase()) };
  match = /^c_([0-9a-f]{32})$/i.exec(value);
  if (match) return { kind: "chat", chatId: expandUuid(match[1].toLowerCase()) };
  match = /^l_([A-Za-z0-9_-]{16,60})$/.exec(value);
  if (match) return { kind: "link", token: match[1] };
  match = /^s_(feed|chats|profile|nearby)$/.exec(value);
  if (match) return { kind: "screen", screen: match[1] as "feed" };
  return null;
}

/** Extracts a deep link from any UniShare URL (t.me, vk.com, web) or raw payload. */
export function parseAnyLink(input: string): DeepLink | null {
  const direct = decodeDeepLink(input);
  if (direct) return direct;
  const startApp = /[?&#](?:startapp|start|tgWebAppStartParam)=([A-Za-z0-9_-]+)/.exec(input);
  if (startApp) return decodeDeepLink(startApp[1]);
  const hash = /#([A-Za-z0-9_-]+)$/.exec(input);
  if (hash) {
    const decoded = decodeDeepLink(hash[1]);
    if (decoded) return decoded;
  }
  const profilePath = new RegExp(`/u/(${UUID})`, "i").exec(input);
  if (profilePath) return { kind: "profile", uid: profilePath[1].toLowerCase() };
  return null;
}

export function telegramAppLink(botUsername: string, appShortName: string | null, link?: DeepLink): string {
  const base = appShortName ? `https://t.me/${botUsername}/${appShortName}` : `https://t.me/${botUsername}`;
  return link ? `${base}?startapp=${encodeDeepLink(link)}` : appShortName ? base : `${base}?startapp`;
}

export function vkAppLink(appId: number, link?: DeepLink): string {
  return link ? `https://vk.com/app${appId}#${encodeDeepLink(link)}` : `https://vk.com/app${appId}`;
}

export function webLink(publicUrl: string, link?: DeepLink): string {
  const base = publicUrl.replace(/\/$/, "");
  if (!link) return base;
  if (link.kind === "profile") return `${base}/u/${link.uid}`;
  return `${base}/?startapp=${encodeDeepLink(link)}`;
}
