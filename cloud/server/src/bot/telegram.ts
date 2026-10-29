// Telegram bot: entry point to the Mini App, deep links, commands and
// notifications about matches and messages.
import { Bot, InlineKeyboard, webhookCallback, type Context } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { decodeDeepLink, encodeDeepLink, webLink, type DeepLink, type ProfileCard } from "@unishare/shared";
import { config } from "../config";
import { selectTelegramRoute, telegramAgent, telegramRoute } from "./telegram-route";
import { query, queryOne } from "../db";

type Lang = "ru" | "en" | "uk" | "be";

const COPY: Record<Lang, {
  welcome: string;
  open: string;
  feed: string;
  chats: string;
  profile: string;
  nearby: string;
  help: string;
  fallback: string;
  privacy: string;
  support: string;
  openProfile: string;
  shareTitle: string;
}> = {
  ru: {
    welcome:
      "Привет! 👋 Это <b>UniShare</b> — поиск тиммейтов и обмен игровыми библиотеками для PlayStation, Xbox, Nintendo, Steam и Epic Games.\n\n" +
      "• Листай анкеты и ставь лайки\n• Взаимный лайк = личный чат\n• Уведомления о мэтчах и сообщениях приходят сюда\n\n" +
      "🔒 Никогда не отправляй пароли, коды и платёжные данные.",
    open: "🎮 Открыть UniShare",
    feed: "🃏 Анкеты",
    chats: "💬 Чаты",
    profile: "👤 Профиль",
    nearby: "📡 Рядом (QR)",
    help:
      "<b>Как пользоваться UniShare</b>\n\n" +
      "1. Открой приложение кнопкой ниже и заполни анкету: платформы, игры, навыки.\n" +
      "2. Свайпай вправо тех, с кем хочешь играть или меняться играми.\n" +
      "3. При взаимном лайке появится чат, а я пришлю уведомление.\n" +
      "4. В «Рядом» покажи QR-код другу — он отсканирует его и сразу увидит твою анкету.\n\n" +
      "Команды: /feed /chats /profile /nearby /privacy /support",
    fallback: "Я не читаю сообщения — вся переписка в приложении. Открой UniShare 👇",
    privacy: "Политика конфиденциальности и правила:",
    support: "Поддержка UniShare:",
    openProfile: "Открыть анкету",
    shareTitle: "Анкета игрока в UniShare",
  },
  en: {
    welcome:
      "Hi! 👋 This is <b>UniShare</b> — find teammates and swap game libraries on PlayStation, Xbox, Nintendo, Steam and Epic Games.\n\n" +
      "• Browse profiles and like them\n• A mutual like opens a private chat\n• Match and message notifications arrive here\n\n" +
      "🔒 Never send passwords, codes or payment details.",
    open: "🎮 Open UniShare",
    feed: "🃏 Profiles",
    chats: "💬 Chats",
    profile: "👤 Profile",
    nearby: "📡 Nearby (QR)",
    help:
      "<b>How UniShare works</b>\n\n" +
      "1. Open the app and fill in your platforms, games and skills.\n" +
      "2. Swipe right on players you want to team up or trade games with.\n" +
      "3. A mutual like opens a chat and I will notify you.\n" +
      "4. In “Nearby”, show your QR code so a friend can open your profile instantly.\n\n" +
      "Commands: /feed /chats /profile /nearby /privacy /support",
    fallback: "I don't read messages — all conversations happen in the app. Open UniShare 👇",
    privacy: "Privacy policy and community rules:",
    support: "UniShare support:",
    openProfile: "Open profile",
    shareTitle: "Player profile on UniShare",
  },
  uk: {
    welcome:
      "Привіт! 👋 Це <b>UniShare</b> — пошук тіммейтів і обмін ігровими бібліотеками для PlayStation, Xbox, Nintendo, Steam та Epic Games.\n\n" +
      "• Гортай анкети й став лайки\n• Взаємний лайк = особистий чат\n• Сповіщення про метчі й повідомлення приходять сюди\n\n" +
      "🔒 Ніколи не надсилай паролі, коди та платіжні дані.",
    open: "🎮 Відкрити UniShare",
    feed: "🃏 Анкети",
    chats: "💬 Чати",
    profile: "👤 Профіль",
    nearby: "📡 Поруч (QR)",
    help:
      "<b>Як користуватися UniShare</b>\n\n1. Відкрий застосунок і заповни анкету.\n2. Свайпай вправо тих, з ким хочеш грати.\n3. Взаємний лайк відкриває чат, а я надішлю сповіщення.\n4. У «Поруч» покажи QR-код другу.\n\nКоманди: /feed /chats /profile /nearby /privacy /support",
    fallback: "Я не читаю повідомлення — листування в застосунку. Відкрий UniShare 👇",
    privacy: "Політика конфіденційності та правила:",
    support: "Підтримка UniShare:",
    openProfile: "Відкрити анкету",
    shareTitle: "Анкета гравця в UniShare",
  },
  be: {
    welcome:
      "Прывітанне! 👋 Гэта <b>UniShare</b> — пошук тымейтаў і абмен гульнявымі бібліятэкамі для PlayStation, Xbox, Nintendo, Steam і Epic Games.\n\n" +
      "• Гартай анкеты і стаў лайкі\n• Узаемны лайк = асабісты чат\n• Апавяшчэнні пра мэтчы і паведамленні прыходзяць сюды\n\n" +
      "🔒 Ніколі не адпраўляй паролі, коды і плацежныя даныя.",
    open: "🎮 Адкрыць UniShare",
    feed: "🃏 Анкеты",
    chats: "💬 Чаты",
    profile: "👤 Профіль",
    nearby: "📡 Побач (QR)",
    help:
      "<b>Як карыстацца UniShare</b>\n\n1. Адкрый праграму і запоўні анкету.\n2. Свайпай управа тых, з кім хочаш гуляць.\n3. Узаемны лайк адкрывае чат, а я дашлю апавяшчэнне.\n4. У «Побач» пакажы QR-код сябру.\n\nКаманды: /feed /chats /profile /nearby /privacy /support",
    fallback: "Я не чытаю паведамленні — перапіска ў праграме. Адкрый UniShare 👇",
    privacy: "Палітыка канфідэнцыйнасці і правілы:",
    support: "Падтрымка UniShare:",
    openProfile: "Адкрыць анкету",
    shareTitle: "Анкета гульца ў UniShare",
  },
};

function pickLang(code: string | null | undefined): Lang {
  const value = (code ?? "").slice(0, 2).toLowerCase();
  return value === "en" || value === "uk" || value === "be" ? value : value === "ru" ? "ru" : value ? "en" : "ru";
}

function appUrl(link?: DeepLink): string {
  return webLink(config.publicUrl, link);
}

let bot: Bot | null = null;

export function telegramBot(): Bot | null {
  return bot;
}

async function userLanguage(ctx: Context): Promise<Lang> {
  if (!ctx.from) return "ru";
  const row = await queryOne<{ language: string }>(
    `select u.language from user_identities i join users u on u.uid = i.user_id
     where i.provider = 'telegram' and i.provider_user_id = $1`,
    [String(ctx.from.id)],
  ).catch(() => null);
  return row ? pickLang(row.language) : pickLang(ctx.from.language_code);
}

async function setCanMessage(telegramId: number, value: boolean): Promise<void> {
  await query(
    `update user_identities set can_message = $2 where provider = 'telegram' and provider_user_id = $1`,
    [String(telegramId), value],
  ).catch(() => undefined);
}

function mainKeyboard(t: (typeof COPY)["ru"], link?: DeepLink): InlineKeyboard {
  return new InlineKeyboard()
    .webApp(t.open, appUrl(link))
    .row()
    .webApp(t.feed, appUrl({ kind: "screen", screen: "feed" }))
    .webApp(t.chats, appUrl({ kind: "screen", screen: "chats" }))
    .row()
    .webApp(t.profile, appUrl({ kind: "screen", screen: "profile" }))
    .webApp(t.nearby, appUrl({ kind: "screen", screen: "nearby" }));
}

export function createTelegramBot(): Bot | null {
  if (!config.telegram.botToken || config.telegram.mode === "off") return null;
  const botId = Number(config.telegram.botToken.split(":")[0]);
  bot = new Bot(config.telegram.botToken, {
    // Known bot identity: webhooks are served without a getMe round-trip, which
    // would hang when api.telegram.org is unreachable from the server.
    botInfo:
      config.telegram.botUsername && Number.isSafeInteger(botId)
        ? {
            id: botId,
            is_bot: true,
            first_name: "UniShare",
            username: config.telegram.botUsername,
            can_join_groups: true,
            can_read_all_group_messages: false,
            supports_inline_queries: false,
            can_connect_to_business: false,
            has_main_web_app: false,
          } as UserFromGetMe
        : undefined,
    client: {
      apiRoot: config.telegram.apiRoot ?? undefined,
      timeoutSeconds: 30,
      // Answer webhook updates in the HTTP response itself, so replies to
      // /start and commands work even when the server cannot open outbound
      // connections to api.telegram.org (common for hosting inside Russia).
      canUseWebhookReply: (method) => config.telegram.mode === "webhook" && method === "sendMessage",
      // node-fetch agent that can pin a reachable Telegram address (see telegram-route.ts).
      baseFetchConfig: { agent: telegramAgent } as Record<string, unknown>,
    },
  });

  bot.command("start", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    await setCanMessage(ctx.from!.id, true);
    const t = COPY[await userLanguage(ctx)];
    const link = decodeDeepLink(ctx.match) ?? undefined;
    await ctx.reply(t.welcome, { parse_mode: "HTML", reply_markup: mainKeyboard(t, link) });
  });

  const screenCommand = (screen: "feed" | "chats" | "profile" | "nearby") => async (ctx: Context) => {
    const t = COPY[await userLanguage(ctx)];
    const label = { feed: t.feed, chats: t.chats, profile: t.profile, nearby: t.nearby }[screen];
    await ctx.reply(label, {
      reply_markup: new InlineKeyboard().webApp(t.open, appUrl({ kind: "screen", screen })),
    });
  };
  bot.command("feed", screenCommand("feed"));
  bot.command("chats", screenCommand("chats"));
  bot.command("profile", screenCommand("profile"));
  bot.command("nearby", screenCommand("nearby"));

  bot.command("help", async (ctx) => {
    const t = COPY[await userLanguage(ctx)];
    await ctx.reply(t.help, { parse_mode: "HTML", reply_markup: mainKeyboard(t) });
  });

  bot.command("privacy", async (ctx) => {
    const t = COPY[await userLanguage(ctx)];
    await ctx.reply(`${t.privacy}\n${config.privacyUrl}\n${config.termsUrl}`, { link_preview_options: { is_disabled: true } });
  });

  bot.command("support", async (ctx) => {
    const t = COPY[await userLanguage(ctx)];
    await ctx.reply(`${t.support} ${config.supportEmail}`);
  });

  // Track whether the bot is allowed to message the user.
  bot.on("my_chat_member", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    const status = ctx.myChatMember.new_chat_member.status;
    await setCanMessage(ctx.from.id, status === "member");
  });

  bot.on("message", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    const t = COPY[await userLanguage(ctx)];
    await ctx.reply(t.fallback, { reply_markup: new InlineKeyboard().webApp(t.open, appUrl()) });
  });

  bot.catch((error) => console.error("telegram bot error:", error.message));
  return bot;
}

export function telegramWebhookHandler() {
  if (!bot) return null;
  return webhookCallback(bot, "fastify", { secretToken: config.telegram.webhookSecret ?? undefined });
}

export async function sendTelegramNotification(chatId: string, text: string, buttonText: string, url: string): Promise<void> {
  if (!bot) return;
  try {
    await bot.api.sendMessage(chatId, text, {
      reply_markup: new InlineKeyboard().webApp(buttonText, url),
      link_preview_options: { is_disabled: true },
    });
  } catch (error) {
    const description = (error as { description?: string }).description ?? "";
    if (/blocked|deactivated|chat not found|can't initiate/i.test(description)) {
      await setCanMessage(Number(chatId), false);
    }
  }
}

/**
 * Prepares an inline message that the Mini App can share with
 * Telegram.WebApp.shareMessage (Bot API 8.0+). Returns null when unavailable.
 */
export async function prepareProfileShare(telegramUserId: number, card: ProfileCard, language: string): Promise<string | null> {
  if (!bot) return null;
  const t = COPY[pickLang(language)];
  const link = config.telegram.botUsername
    ? `https://t.me/${config.telegram.botUsername}${config.telegram.appShortName ? `/${config.telegram.appShortName}` : ""}?startapp=${encodeDeepLink({ kind: "profile", uid: card.uid })}`
    : appUrl({ kind: "profile", uid: card.uid });
  const games = [...new Set(Object.values(card.platformGames).flat().map((game) => game!.name))].slice(0, 6);
  const lines = [
    `🎮 <b>${escapeHtml(card.username)}</b>${card.rating > 0 ? ` · ⭐ ${card.rating.toFixed(1)}` : ""}`,
    card.status ? escapeHtml(card.status) : null,
    card.platforms.length ? `🕹 ${card.platforms.join(" · ")}` : null,
    games.length ? `🎯 ${escapeHtml(games.join(", "))}` : null,
  ].filter(Boolean);
  try {
    const prepared = await bot.api.savePreparedInlineMessage(
      telegramUserId,
      {
        type: "article",
        id: `profile-${card.uid.slice(0, 8)}-${Date.now()}`,
        title: `${t.shareTitle}: ${card.username}`,
        description: card.platforms.join(" · ") || card.status || "UniShare",
        thumbnail_url: absoluteUrl(card.avatarUrl),
        input_message_content: { message_text: lines.join("\n"), parse_mode: "HTML" },
        reply_markup: new InlineKeyboard().url(t.openProfile, link),
      },
      { allow_user_chats: true, allow_group_chats: true, allow_channel_chats: true, allow_bot_chats: false },
    );
    return prepared.id;
  } catch (error) {
    console.warn("savePreparedInlineMessage failed:", (error as Error).message);
    return null;
  }
}

function absoluteUrl(value: string | null): string | undefined {
  if (!value) return undefined;
  const url = value.startsWith("/") ? `${config.publicUrl}${value}` : value;
  return url.startsWith("https://") ? url : undefined;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Registers commands, descriptions, menu button and webhook for the bot. */
/** Last outcome of configureTelegramBot, exposed through /health for operators. */
export const telegramStatus: { configured: boolean; error: string | null; checkedAt: string | null; route: string } = {
  configured: false,
  error: null,
  checkedAt: null,
  route: "dns",
};

export async function configureTelegramBot(log: (message: string) => void = console.log): Promise<void> {
  try {
    await applyTelegramSetup(log);
    telegramStatus.configured = true;
    telegramStatus.error = null;
  } catch (error) {
    telegramStatus.configured = false;
    telegramStatus.error = (error as Error).message.slice(0, 300);
    throw error;
  } finally {
    telegramStatus.checkedAt = new Date().toISOString();
    telegramStatus.route = telegramRoute();
  }
}

async function applyTelegramSetup(log: (message: string) => void): Promise<void> {
  if (!bot) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  await selectTelegramRoute(log);
  const api = bot.api;
  const me = await api.getMe();
  log(`bot: @${me.username}`);

  const commands = {
    ru: [
      ["start", "Открыть UniShare"], ["feed", "Анкеты игроков"], ["chats", "Мои чаты и мэтчи"],
      ["profile", "Мой профиль"], ["nearby", "QR-код для друзей рядом"], ["help", "Как это работает"],
      ["privacy", "Конфиденциальность"], ["support", "Поддержка"],
    ],
    en: [
      ["start", "Open UniShare"], ["feed", "Player profiles"], ["chats", "My chats and matches"],
      ["profile", "My profile"], ["nearby", "QR code for friends nearby"], ["help", "How it works"],
      ["privacy", "Privacy"], ["support", "Support"],
    ],
  } as const;
  await api.setMyCommands(commands.en.map(([command, description]) => ({ command, description })));
  await api.setMyCommands(commands.ru.map(([command, description]) => ({ command, description })), { language_code: "ru" });
  await api.setMyCommands(commands.ru.map(([command, description]) => ({ command, description })), { language_code: "uk" });
  await api.setMyCommands(commands.ru.map(([command, description]) => ({ command, description })), { language_code: "be" });

  await api.setMyShortDescription(
    "Тиммейты и обмен играми: PlayStation, Xbox, Nintendo, Steam. Свайпай анкеты, находи мэтчи, общайся.",
    { language_code: "ru" },
  );
  await api.setMyShortDescription("Find teammates and swap game libraries across PlayStation, Xbox, Nintendo and Steam.");
  await api.setMyDescription(
    "UniShare — приложение для геймеров прямо в Telegram.\n\n" +
      "🃏 Анкеты игроков с играми и платформами\n❤️ Взаимный лайк открывает личный чат\n📡 QR-код для друзей рядом\n" +
      "🔔 Уведомления о мэтчах и сообщениях\n\nНажми «Запустить», чтобы начать.",
    { language_code: "ru" },
  );
  await api.setMyDescription(
    "UniShare is a gaming social app right inside Telegram.\n\n" +
      "🃏 Player cards with games and platforms\n❤️ A mutual like opens a private chat\n📡 QR code for friends nearby\n" +
      "🔔 Match and message notifications\n\nPress Start to begin.",
  );

  if (config.publicUrl.startsWith("https://")) {
    await api.setChatMenuButton({ menu_button: { type: "web_app", text: "UniShare", web_app: { url: appUrl() } } });
    log(`menu button → ${appUrl()}`);
    if (config.telegram.mode === "webhook") {
      const url = `${config.publicUrl}/telegram/webhook`;
      await api.setWebhook(url, {
        secret_token: config.telegram.webhookSecret ?? undefined,
        allowed_updates: ["message", "my_chat_member"],
        drop_pending_updates: false,
      });
      log(`webhook → ${url}`);
    }
  } else {
    log("PUBLIC_URL is not HTTPS: skipped menu button and webhook (Telegram requires HTTPS)");
  }
}
