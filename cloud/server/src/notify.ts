// Out-of-app notifications: a Telegram bot message or a VK community message
// with a button that opens UniShare right on the relevant chat.
import { encodeDeepLink, webLink, type DeepLink } from "@unishare/shared";
import { config } from "./config";
import { query } from "./db";
import { isConnected } from "./realtime";
import { sendTelegramNotification } from "./bot/telegram";
import { sendVkNotification } from "./bot/vk";

type Language = "ru" | "en" | "uk" | "be";

const TEXT: Record<Language, Record<"match" | "message" | "request" | "open" | "photo", string>> = {
  ru: {
    match: "🎮 Новый мэтч с {name}! Напишите первым.",
    message: "💬 {name}: {text}",
    request: "❤️ {name} хочет сыграть вместе. Ответьте на заявку в UniShare.",
    open: "Открыть UniShare",
    photo: "📷 Фото",
  },
  en: {
    match: "🎮 New match with {name}! Say hi first.",
    message: "💬 {name}: {text}",
    request: "❤️ {name} wants to play together. Reply in UniShare.",
    open: "Open UniShare",
    photo: "📷 Photo",
  },
  uk: {
    match: "🎮 Новий метч з {name}! Напишіть першим.",
    message: "💬 {name}: {text}",
    request: "❤️ {name} хоче зіграти разом. Відповідайте в UniShare.",
    open: "Відкрити UniShare",
    photo: "📷 Фото",
  },
  be: {
    match: "🎮 Новы мэтч з {name}! Напішыце першым.",
    message: "💬 {name}: {text}",
    request: "❤️ {name} хоча згуляць разам. Адкажыце ў UniShare.",
    open: "Адкрыць UniShare",
    photo: "📷 Фота",
  },
};

interface Recipient {
  language: Language;
  telegram_id: string | null;
  telegram_can_message: boolean;
  vk_id: string | null;
  vk_can_message: boolean;
}

async function recipient(userId: string): Promise<Recipient | null> {
  const rows = await query<Recipient>(
    `select u.language,
            tg.provider_user_id as telegram_id, coalesce(tg.can_message, false) as telegram_can_message,
            vk.provider_user_id as vk_id, coalesce(vk.can_message, false) as vk_can_message
     from users u
     left join user_identities tg on tg.user_id = u.uid and tg.provider = 'telegram'
     left join user_identities vk on vk.user_id = u.uid and vk.provider = 'vk'
     where u.uid = $1 and u.account_state = 'active'`,
    [userId],
  );
  return rows[0] ?? null;
}

const lastMessageNotice = new Map<string, number>();
const MESSAGE_NOTICE_INTERVAL = 5 * 60_000;

async function deliver(userId: string, render: (t: (typeof TEXT)["ru"]) => string, link: DeepLink): Promise<void> {
  const target = await recipient(userId);
  if (!target) return;
  const t = TEXT[target.language] ?? TEXT.ru;
  const text = render(t);
  const url = webLink(config.publicUrl, link);
  const tasks: Promise<unknown>[] = [];
  if (target.telegram_id && target.telegram_can_message) {
    tasks.push(sendTelegramNotification(target.telegram_id, text, t.open, url));
  }
  if (target.vk_id && target.vk_can_message) {
    tasks.push(sendVkNotification(target.vk_id, text, t.open, encodeDeepLink(link)));
  }
  await Promise.allSettled(tasks);
}

function clip(text: string, max = 120): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function notifyMatch(userId: string, partnerName: string, chatId: string): void {
  void deliver(userId, (t) => t.match.replace("{name}", partnerName), { kind: "chat", chatId }).catch(() => undefined);
}

export function notifyRequest(userId: string, fromName: string): void {
  if (isConnected(userId)) return;
  void deliver(userId, (t) => t.request.replace("{name}", fromName), { kind: "screen", screen: "chats" }).catch(() => undefined);
}

export function notifyMessage(userId: string, senderName: string, chatId: string, text: string | null): void {
  if (isConnected(userId)) return;
  const key = `${userId}:${chatId}`;
  const now = Date.now();
  if (now - (lastMessageNotice.get(key) ?? 0) < MESSAGE_NOTICE_INTERVAL) return;
  lastMessageNotice.set(key, now);
  if (lastMessageNotice.size > 50_000) lastMessageNotice.clear();
  void deliver(
    userId,
    (t) => t.message.replace("{name}", senderName).replace("{text}", text ? clip(text) : t.photo),
    { kind: "chat", chatId },
  ).catch(() => undefined);
}
