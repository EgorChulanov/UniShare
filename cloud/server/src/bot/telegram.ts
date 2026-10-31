// Telegram bot: entry point to the Mini App, deep links, commands and
// notifications about matches and messages.
import { Bot, InlineKeyboard, webhookCallback, type Context } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { decodeDeepLink, encodeDeepLink, webLink, type DeepLink, type ProfileCard } from "@unishare/shared";
import { config } from "../config";
import { retryViaFallbackRoutes, selectTelegramRoute, telegramAgent, telegramRoute } from "./telegram-route";
import { query, queryOne } from "../db";
import { claimAdmin, moderateReport } from "../admin";
import { HttpError } from "../lib/errors";

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
    nearby: "📡 AirShare",
    help:
      "<b>Как пользоваться UniShare</b>\n\n" +
      "1. Открой приложение кнопкой ниже и заполни анкету: платформы, игры, навыки.\n" +
      "2. Свайпай вправо тех, с кем хочешь играть или меняться играми.\n" +
      "3. При взаимном лайке появится чат, а я пришлю уведомление.\n" +
      "4. Встретились с другом? Откройте AirShare на обоих телефонах — анкеты появятся сами.\n\n" +
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
    nearby: "📡 AirShare",
    help:
      "<b>How UniShare works</b>\n\n" +
      "1. Open the app and fill in your platforms, games and skills.\n" +
      "2. Swipe right on players you want to team up or trade games with.\n" +
      "3. A mutual like opens a chat and I will notify you.\n" +
      "4. Met a friend? Open AirShare on both phones and your profiles appear instantly.\n\n" +
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
    nearby: "📡 AirShare",
    help:
      "<b>Як користуватися UniShare</b>\n\n1. Відкрий застосунок і заповни анкету.\n2. Свайпай вправо тих, з ким хочеш грати.\n3. Взаємний лайк відкриває чат, а я надішлю сповіщення.\n4. Зустрілися з другом? Відкрийте AirShare на обох телефонах.\n\nКоманди: /feed /chats /profile /nearby /privacy /support",
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
    nearby: "📡 AirShare",
    help:
      "<b>Як карыстацца UniShare</b>\n\n1. Адкрый праграму і запоўні анкету.\n2. Свайпай управа тых, з кім хочаш гуляць.\n3. Узаемны лайк адкрывае чат, а я дашлю апавяшчэнне.\n4. Сустрэліся з сябрам? Адкрыйце AirShare на абодвух тэлефонах.\n\nКаманды: /feed /chats /profile /nearby /privacy /support",
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
      canUseWebhookReply: (method) => config.telegram.mode === "webhook" && (method === "sendMessage" || method === "answerCallbackQuery"),
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

  // Not in the command menu: /admin <code> makes the linked UniShare account an admin.
  bot.command("admin", async (ctx) => {
    if (ctx.chat.type !== "private" || !ctx.from) return;
    const a = ADMIN_COPY[await userLanguage(ctx)];
    const result = await claimAdmin(String(ctx.from.id), String(ctx.match ?? "")).catch((error: Error) => {
      console.error("admin claim failed:", error.message);
      return { status: "invalid" as const };
    });
    if (result.status === "claimed" || result.status === "already_admin") {
      await ctx.reply(result.status === "claimed" ? a.claimed : a.alreadyAdmin, { reply_markup: adminPanelKeyboard(a) });
    } else {
      const text = { invalid: a.invalidCode, no_account: a.noAccount, rate_limited: a.rateLimited }[result.status];
      await ctx.reply(text);
    }
    // The code should not stay in the chat history (bots may delete incoming private messages).
    await ctx.deleteMessage().catch(() => undefined);
  });

  // "Забанить" / "Отклонить" under a report notification.
  bot.callbackQuery(/^adm:(ban|rej):([0-9a-f-]{36})$/, async (ctx) => {
    const lang = await userLanguage(ctx);
    const reportId = ctx.match[2];
    const outcome = await adminReportButton(String(ctx.from.id), ctx.match[1] as "ban" | "rej", reportId, lang);
    await ctx.answerCallbackQuery({ text: outcome.toast, show_alert: !outcome.ok }).catch(() => undefined);
    if (outcome.html) {
      const keyboard = notificationKeyboard(ADMIN_COPY[lang], outcome.open ? reportId : undefined);
      await ctx.editMessageText(outcome.html, { parse_mode: "HTML", reply_markup: keyboard, link_preview_options: { is_disabled: true } }).catch(() => undefined);
    }
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
  if (config.telegram.mode === "webhook" && !adminButtonsEnabled()) {
    console.warn("TELEGRAM_WEBHOOK_SECRET is not set: /telegram/webhook accepts any request, so the admin buttons in Telegram are off");
  }
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
  let me;
  try {
    me = await api.getMe();
  } catch (error) {
    // The current address can pass the TLS probe and still drop API requests; retry through the fallback addresses.
    me = await retryViaFallbackRoutes(() => api.getMe(), error, log);
  }
  log(`bot: @${me.username}`);

  const commands = {
    ru: [
      ["start", "Открыть UniShare"], ["feed", "Анкеты игроков"], ["chats", "Мои чаты и мэтчи"],
      ["profile", "Мой профиль"], ["nearby", "AirShare: анкеты рядом"], ["help", "Как это работает"],
      ["privacy", "Конфиденциальность"], ["support", "Поддержка"],
    ],
    en: [
      ["start", "Open UniShare"], ["feed", "Player profiles"], ["chats", "My chats and matches"],
      ["profile", "My profile"], ["nearby", "AirShare: profiles nearby"], ["help", "How it works"],
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
      "🃏 Анкеты игроков с играми и платформами\n❤️ Взаимный лайк открывает личный чат\n📡 AirShare: обмен анкетами рядом\n🔍 Поиск игр и игроков\n" +
      "🔔 Уведомления о мэтчах и сообщениях\n\nНажми «Запустить», чтобы начать.",
    { language_code: "ru" },
  );
  await api.setMyDescription(
    "UniShare is a gaming social app right inside Telegram.\n\n" +
      "🃏 Player cards with games and platforms\n❤️ A mutual like opens a private chat\n📡 AirShare: swap profiles nearby\n🔍 Search games and players\n" +
      "🔔 Match and message notifications\n\nPress Start to begin.",
  );

  if (config.publicUrl.startsWith("https://")) {
    await api.setChatMenuButton({ menu_button: { type: "web_app", text: "UniShare", web_app: { url: appUrl() } } });
    log(`menu button → ${appUrl()}`);
    if (config.telegram.mode === "webhook") {
      const url = `${config.publicUrl}/telegram/webhook`;
      await api.setWebhook(url, {
        secret_token: config.telegram.webhookSecret ?? undefined,
        allowed_updates: ["message", "my_chat_member", "callback_query"],
        drop_pending_updates: false,
      });
      log(`webhook → ${url}`);
    }
  } else {
    log("PUBLIC_URL is not HTTPS: skipped menu button and webhook (Telegram requires HTTPS)");
  }
}

// ── Admin notifications ─────────────────────────────────────────────────────
// New bug reports and user reports are sent to every admin with a linked
// Telegram account, in the admin's app language.

type AdminCopy = {
  claimed: string;
  alreadyAdmin: string;
  invalidCode: string;
  noAccount: string;
  rateLimited: string;
  openPanel: string;
  open: string;
  ban: string;
  reject: string;
  newBug: string;
  newReport: string;
  from: string;
  reason: string;
  reportsTotal: string;
  screenshot: string;
  banned: string;
  suspended: string;
  resolved: string;
  rejected: string;
  noAccess: string;
  done: string;
  failed: string;
  cannotBanAdmin: string;
  notFound: string;
  alreadyHandled: string;
  alreadyRestricted: string;
  insecure: string;
  reasons: Record<string, string>;
};

const ADMIN_COPY: Record<Lang, AdminCopy> = {
  ru: {
    claimed: "✅ Готово! Теперь вы администратор UniShare. Админ-панель открывается кнопкой ниже и в настройках приложения.",
    alreadyAdmin: "Вы уже администратор UniShare.",
    invalidCode: "Код не подошёл.",
    noAccount: "Сначала откройте UniShare в Telegram: к этому аккаунту ещё не привязан профиль.",
    rateLimited: "Слишком много попыток. Попробуйте позже.",
    openPanel: "🛠 Админ-панель",
    open: "Открыть",
    ban: "🚫 Забанить",
    reject: "Отклонить",
    newBug: "🐞 <b>Сообщение о проблеме</b>",
    newReport: "🚩 <b>Новая жалоба</b>",
    from: "от",
    reason: "Причина",
    reportsTotal: "Всего жалоб на пользователя: {0}",
    screenshot: "📎 Есть скриншот",
    banned: "🚫 <b>Забанен</b> · {0}",
    suspended: "❄️ <b>Заморожен</b> · {0}",
    resolved: "✅ <b>Жалоба закрыта</b> · {0}",
    rejected: "✖️ <b>Жалоба отклонена</b> · {0}",
    noAccess: "Нет доступа: вы не администратор.",
    done: "Готово",
    failed: "Не получилось. Откройте админ-панель.",
    cannotBanAdmin: "Это администратор, его нельзя забанить.",
    notFound: "Жалоба не найдена.",
    alreadyHandled: "Эту жалобу уже обработали.",
    alreadyRestricted: "Пользователь уже заблокирован.",
    insecure: "Кнопки отключены: на сервере не задан TELEGRAM_WEBHOOK_SECRET. Откройте админ-панель.",
    reasons: {
      "report.reason.spam": "Спам",
      "report.reason.content": "Недопустимый контент",
      "report.reason.harassment": "Оскорбления или травля",
      "report.reason.fake": "Поддельный профиль",
      "report.reason.underage": "Несовершеннолетний пользователь",
      "report.reason.other": "Другая причина",
    },
  },
  en: {
    claimed: "✅ Done! You are now a UniShare admin. Open the admin panel with the button below or from the app settings.",
    alreadyAdmin: "You are already a UniShare admin.",
    invalidCode: "The code did not work.",
    noAccount: "Open UniShare in Telegram first: this account has no profile yet.",
    rateLimited: "Too many attempts. Try again later.",
    openPanel: "🛠 Admin panel",
    open: "Open",
    ban: "🚫 Ban",
    reject: "Dismiss",
    newBug: "🐞 <b>Problem report</b>",
    newReport: "🚩 <b>New user report</b>",
    from: "from",
    reason: "Reason",
    reportsTotal: "Reports against this user: {0}",
    screenshot: "📎 Screenshot attached",
    banned: "🚫 <b>Banned</b> · {0}",
    suspended: "❄️ <b>Suspended</b> · {0}",
    resolved: "✅ <b>Report resolved</b> · {0}",
    rejected: "✖️ <b>Report dismissed</b> · {0}",
    noAccess: "No access: you are not an admin.",
    done: "Done",
    failed: "That did not work. Open the admin panel.",
    cannotBanAdmin: "This is an admin and cannot be banned.",
    notFound: "Report not found.",
    alreadyHandled: "This report has already been handled.",
    alreadyRestricted: "This user is already restricted.",
    insecure: "Buttons are off: TELEGRAM_WEBHOOK_SECRET is not set on the server. Open the admin panel.",
    reasons: {
      "report.reason.spam": "Spam",
      "report.reason.content": "Inappropriate content",
      "report.reason.harassment": "Harassment or bullying",
      "report.reason.fake": "Fake profile",
      "report.reason.underage": "Underage user",
      "report.reason.other": "Other reason",
    },
  },
  uk: {
    claimed: "✅ Готово! Тепер ви адміністратор UniShare. Адмін-панель відкривається кнопкою нижче та в налаштуваннях застосунку.",
    alreadyAdmin: "Ви вже адміністратор UniShare.",
    invalidCode: "Код не підійшов.",
    noAccount: "Спершу відкрийте UniShare у Telegram: до цього акаунта ще не прив'язано профіль.",
    rateLimited: "Забагато спроб. Спробуйте пізніше.",
    openPanel: "🛠 Адмін-панель",
    open: "Відкрити",
    ban: "🚫 Забанити",
    reject: "Відхилити",
    newBug: "🐞 <b>Повідомлення про проблему</b>",
    newReport: "🚩 <b>Нова скарга</b>",
    from: "від",
    reason: "Причина",
    reportsTotal: "Усього скарг на користувача: {0}",
    screenshot: "📎 Є знімок екрана",
    banned: "🚫 <b>Забанено</b> · {0}",
    suspended: "❄️ <b>Заморожено</b> · {0}",
    resolved: "✅ <b>Скаргу закрито</b> · {0}",
    rejected: "✖️ <b>Скаргу відхилено</b> · {0}",
    noAccess: "Немає доступу: ви не адміністратор.",
    done: "Готово",
    failed: "Не вдалося. Відкрийте адмін-панель.",
    cannotBanAdmin: "Це адміністратор, його не можна забанити.",
    notFound: "Скаргу не знайдено.",
    alreadyHandled: "Цю скаргу вже опрацювали.",
    alreadyRestricted: "Користувача вже заблоковано.",
    insecure: "Кнопки вимкнено: на сервері не задано TELEGRAM_WEBHOOK_SECRET. Відкрийте адмін-панель.",
    reasons: {
      "report.reason.spam": "Спам",
      "report.reason.content": "Неприйнятний контент",
      "report.reason.harassment": "Образи або цькування",
      "report.reason.fake": "Підроблений профіль",
      "report.reason.underage": "Неповнолітній користувач",
      "report.reason.other": "Інша причина",
    },
  },
  be: {
    claimed: "✅ Гатова! Цяпер вы адміністратар UniShare. Адмін-панэль адкрываецца кнопкай ніжэй і ў наладах праграмы.",
    alreadyAdmin: "Вы ўжо адміністратар UniShare.",
    invalidCode: "Код не падышоў.",
    noAccount: "Спачатку адкрыйце UniShare у Telegram: да гэтага акаўнта яшчэ не прывязаны профіль.",
    rateLimited: "Занадта шмат спроб. Паспрабуйце пазней.",
    openPanel: "🛠 Адмін-панэль",
    open: "Адкрыць",
    ban: "🚫 Забаніць",
    reject: "Адхіліць",
    newBug: "🐞 <b>Паведамленне пра праблему</b>",
    newReport: "🚩 <b>Новая скарга</b>",
    from: "ад",
    reason: "Прычына",
    reportsTotal: "Усяго скаргаў на карыстальніка: {0}",
    screenshot: "📎 Ёсць здымак экрана",
    banned: "🚫 <b>Забанены</b> · {0}",
    suspended: "❄️ <b>Замарожаны</b> · {0}",
    resolved: "✅ <b>Скарга закрыта</b> · {0}",
    rejected: "✖️ <b>Скарга адхілена</b> · {0}",
    noAccess: "Няма доступу: вы не адміністратар.",
    done: "Гатова",
    failed: "Не атрымалася. Адкрыйце адмін-панэль.",
    cannotBanAdmin: "Гэта адміністратар, яго нельга забаніць.",
    notFound: "Скаргу не знойдзена.",
    alreadyHandled: "Гэтую скаргу ўжо апрацавалі.",
    alreadyRestricted: "Карыстальнік ужо заблакаваны.",
    insecure: "Кнопкі адключаныя: на серверы не зададзены TELEGRAM_WEBHOOK_SECRET. Адкрыйце адмін-панэль.",
    reasons: {
      "report.reason.spam": "Спам",
      "report.reason.content": "Недапушчальны кантэнт",
      "report.reason.harassment": "Абраза або цкаванне",
      "report.reason.fake": "Падроблены профіль",
      "report.reason.underage": "Непаўналетні карыстальнік",
      "report.reason.other": "Іншая прычына",
    },
  },
};

/**
 * Ban and dismiss buttons act on `from.id` of the update. Without a webhook secret
 * anyone can post a forged update to /telegram/webhook, so the buttons are only
 * offered (and obeyed) in polling mode or with TELEGRAM_WEBHOOK_SECRET set.
 */
export function adminButtonsEnabled(): boolean {
  return config.telegram.mode !== "webhook" || Boolean(config.telegram.webhookSecret);
}

const ADMIN_PANEL_LINK: DeepLink = { kind: "screen", screen: "admin" };

/** Reply to /admin: opens the app on the admin panel. */
function adminPanelKeyboard(a: AdminCopy): InlineKeyboard {
  return new InlineKeyboard().webApp(a.openPanel, appUrl(ADMIN_PANEL_LINK));
}

/** Under notifications: "Открыть" opens the admin panel; open reports also get ban and dismiss. */
function notificationKeyboard(a: AdminCopy, openReportId?: string): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (openReportId && adminButtonsEnabled()) {
    keyboard.text(a.ban, `adm:ban:${openReportId}`).text(a.reject, `adm:rej:${openReportId}`).row();
  }
  return keyboard.webApp(a.open, appUrl(ADMIN_PANEL_LINK));
}

function clipText(text: string, max: number): string {
  const chars = [...text.trim()];
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : chars.join("");
}

function nameOf(username: string | null, uid: string | null): string {
  if (username) return escapeHtml(username);
  return uid ? `id ${uid.slice(0, 8)}` : "—";
}

/** The report as admins see it in Telegram, plus who closed it and how once it is closed. */
async function reportMessage(reportId: string, lang: Lang): Promise<{ html: string; open: boolean } | null> {
  const a = ADMIN_COPY[lang];
  const row = await queryOne<{
    reason: string; details: string; state: string; reporter: string | null; reporter_uid: string | null;
    subject: string | null; subject_uid: string | null; subject_state: string | null; handler: string | null; handler_uid: string | null; total: number;
  }>(
    `select r.reason, r.details, r.state, rp.username as reporter, rp.uid as reporter_uid,
            sb.username as subject, sb.uid as subject_uid, sb.account_state as subject_state,
            h.username as handler, h.uid as handler_uid,
            (select count(*)::int from reports x where x.subject_id = r.subject_id) as total
     from reports r
     left join users rp on rp.uid = r.reporter_id
     left join users sb on sb.uid = r.subject_id
     left join users h on h.uid = r.handled_by
     where r.id = $1`,
    [reportId],
  );
  if (!row) return null;
  const open = row.state === "open" || row.state === "reviewing";
  const outcome = open
    ? null
    : (row.state === "rejected" ? a.rejected : row.subject_state === "banned" ? a.banned : row.subject_state === "suspended" ? a.suspended : a.resolved)
        .replace("{0}", nameOf(row.handler, row.handler_uid));
  const lines = [
    a.newReport,
    `${nameOf(row.reporter, row.reporter_uid)} → <b>${nameOf(row.subject, row.subject_uid)}</b>`,
    `${a.reason}: ${escapeHtml(a.reasons[row.reason] ?? row.reason)}`,
    row.details ? `«${escapeHtml(clipText(row.details, 400))}»` : null,
    a.reportsTotal.replace("{0}", String(row.total)),
    outcome ? `\n${outcome}` : null,
  ];
  return { html: lines.filter(Boolean).join("\n"), open };
}

async function bugSummary(bugId: string, lang: Lang): Promise<string | null> {
  const a = ADMIN_COPY[lang];
  const row = await queryOne<{ text: string; context: Record<string, string>; screenshot_key: string | null; username: string | null; uid: string | null }>(
    `select b.text, b.context, b.screenshot_key, u.username, u.uid
     from bug_reports b left join users u on u.uid = b.user_id where b.id = $1`,
    [bugId],
  );
  if (!row) return null;
  const context = row.context ?? {};
  const device = [context.client, context.platform, context.appVersion ? `v${context.appVersion}` : null].filter(Boolean).join(" · ");
  return [
    a.newBug,
    `${a.from} <b>${nameOf(row.username, row.uid)}</b>${device ? ` · ${escapeHtml(device)}` : ""}`,
    `«${escapeHtml(clipText(row.text, 600))}»`,
    row.screenshot_key ? a.screenshot : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Active admins with a linked Telegram account. */
async function adminRecipients(): Promise<{ telegram_id: string; language: string }[]> {
  return query<{ telegram_id: string; language: string }>(
    `select i.provider_user_id as telegram_id, u.language
     from users u join user_identities i on i.user_id = u.uid and i.provider = 'telegram'
     where u.is_admin and u.account_state = 'active'`,
  );
}

async function sendToAdmins(render: (lang: Lang) => Promise<{ text: string; keyboard: InlineKeyboard } | null>): Promise<void> {
  if (!bot) return;
  const api = bot.api;
  try {
    const rendered = new Map<Lang, { text: string; keyboard: InlineKeyboard } | null>();
    for (const admin of await adminRecipients()) {
      const lang = pickLang(admin.language);
      if (!rendered.has(lang)) rendered.set(lang, await render(lang));
      const message = rendered.get(lang);
      if (!message) continue;
      await api
        .sendMessage(admin.telegram_id, message.text, { parse_mode: "HTML", reply_markup: message.keyboard, link_preview_options: { is_disabled: true } })
        .catch((error: Error) => console.warn("admin notification failed:", error.message));
    }
  } catch (error) {
    console.warn("admin notification failed:", (error as Error).message);
  }
}

/** Never throws; does nothing when the bot is not configured. */
export async function notifyAdminsAboutBug(bugId: string): Promise<void> {
  await sendToAdmins(async (lang) => {
    const text = await bugSummary(bugId, lang);
    return text ? { text, keyboard: notificationKeyboard(ADMIN_COPY[lang]) } : null;
  });
}

/** Never throws; does nothing when the bot is not configured. */
export async function notifyAdminsAboutReport(reportId: string): Promise<void> {
  await sendToAdmins(async (lang) => {
    const message = await reportMessage(reportId, lang);
    return message ? { text: message.html, keyboard: notificationKeyboard(ADMIN_COPY[lang], message.open ? reportId : undefined) } : null;
  });
}

export interface ReportButtonOutcome {
  ok: boolean;
  /** Text for answerCallbackQuery. */
  toast: string;
  /** New message text (the report and its current state), or null to leave the message as it is. */
  html: string | null;
  /** The report is still open: keep the ban and dismiss buttons. */
  open: boolean;
}

/**
 * Runs a report button pressed in Telegram through the same moderation code as
 * the admin API (so it is checked and logged the same way). A report that was
 * already handled (in the panel, or from another admin's copy of the message)
 * is left alone, and the message is updated to show what happened to it.
 */
export async function adminReportButton(telegramId: string, kind: "ban" | "rej", reportId: string, lang: Lang = "ru"): Promise<ReportButtonOutcome> {
  const a = ADMIN_COPY[lang];
  const refusal = (toast: string): ReportButtonOutcome => ({ ok: false, toast, html: null, open: true });
  if (!adminButtonsEnabled()) return refusal(a.insecure);
  const admin = await queryOne<{ uid: string }>(
    `select u.uid from user_identities i join users u on u.uid = i.user_id
     where i.provider = 'telegram' and i.provider_user_id = $1 and u.is_admin and u.account_state = 'active'`,
    [telegramId],
  );
  if (!admin) return refusal(a.noAccess);
  let toast = a.done;
  let ok = true;
  try {
    if (kind === "ban") {
      const report = await queryOne<{ reason: string }>(`select reason from reports where id = $1`, [reportId]);
      const reason = report ? a.reasons[report.reason] ?? report.reason : a.reasons["report.reason.other"];
      await moderateReport(admin.uid, reportId, { action: "resolve", ban: { state: "banned", reason } });
    } else {
      await moderateReport(admin.uid, reportId, { action: "reject" });
    }
  } catch (error) {
    const code = error instanceof HttpError ? error.code : undefined;
    if (code !== "report_handled" && code !== "already_restricted") {
      if (!(error instanceof HttpError)) console.error("admin button failed:", (error as Error).message);
      return refusal(code === "cannot_ban_admin" || code === "cannot_ban_self" ? a.cannotBanAdmin : code === "not_found" ? a.notFound : a.failed);
    }
    // Nothing changed; show the report as it is now.
    ok = false;
    toast = code === "report_handled" ? a.alreadyHandled : a.alreadyRestricted;
  }
  const message = await reportMessage(reportId, lang);
  return { ok, toast, html: message?.html ?? null, open: message?.open ?? false };
}
