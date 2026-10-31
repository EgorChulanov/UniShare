// Runtime configuration from environment variables (see cloud/.env.example).

function optional(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function flag(name: string, fallback = false): boolean {
  const value = optional(name);
  if (value === null) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function integer(name: string, fallback: number): number {
  const value = optional(name);
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be an integer`);
  return parsed;
}

const publicUrl = (optional("PUBLIC_URL") ?? "http://localhost:8080").replace(/\/$/, "");
const isProduction = process.env.NODE_ENV === "production";

export const config = {
  isProduction,
  port: integer("PORT", 8080),
  host: optional("HOST") ?? "0.0.0.0",
  publicUrl,
  databaseUrl: optional("DATABASE_URL") ?? "postgres://unishare:unishare@localhost:5432/unishare",
  databaseSsl: flag("DATABASE_SSL"),
  /** Secret used to derive session and link token hashes. */
  sessionSecret: optional("SESSION_SECRET") ?? (isProduction ? "" : "dev-session-secret-change-me"),
  sessionDays: integer("SESSION_DAYS", 60),
  /** Development-only login without Telegram/VK (never enable in production). */
  devAuth: flag("DEV_AUTH", !isProduction),
  webDistDir: optional("WEB_DIST_DIR"),

  telegram: {
    botToken: optional("TELEGRAM_BOT_TOKEN"),
    botUsername: optional("TELEGRAM_BOT_USERNAME"),
    /** Optional Mini App short name created with /newapp (t.me/<bot>/<name>). */
    appShortName: optional("TELEGRAM_APP_SHORT_NAME"),
    /** Show the Telegram Login Widget on the website; it only works once BotFather /setdomain points at PUBLIC_URL. */
    loginWidget: flag("TELEGRAM_LOGIN_WIDGET"),
    webhookSecret: optional("TELEGRAM_WEBHOOK_SECRET"),
    /** Alternative Bot API endpoint (e.g. a relay) if api.telegram.org is unreachable from the server. */
    apiRoot: optional("TELEGRAM_API_ROOT"),
    /** "webhook" in production behind HTTPS, "polling" for local development. */
    // Local runs default to "off" so a dev machine never steals the production webhook.
    mode: (optional("TELEGRAM_BOT_MODE") ?? (isProduction ? "webhook" : "off")) as "webhook" | "polling" | "off",
    initDataMaxAgeSeconds: integer("TELEGRAM_INIT_DATA_MAX_AGE", 24 * 60 * 60),
  },

  vk: {
    appId: optional("VK_APP_ID") ? integer("VK_APP_ID", 0) : null,
    /** "Защищённый ключ" of the VK Mini App, used to verify launch params. */
    appSecret: optional("VK_APP_SECRET"),
    /** Optional community that sends notifications (messages.send). */
    groupId: optional("VK_GROUP_ID") ? integer("VK_GROUP_ID", 0) : null,
    groupToken: optional("VK_GROUP_TOKEN"),
    callbackSecret: optional("VK_CALLBACK_SECRET"),
    callbackConfirmation: optional("VK_CALLBACK_CONFIRMATION"),
  },

  storage: {
    driver: (optional("STORAGE_DRIVER") ?? "local") as "local" | "s3",
    localDir: optional("STORAGE_LOCAL_DIR") ?? "./data/uploads",
    s3Endpoint: optional("S3_ENDPOINT") ?? "https://storage.yandexcloud.net",
    s3Region: optional("S3_REGION") ?? "ru-central1",
    s3Bucket: optional("S3_BUCKET"),
    s3AccessKey: optional("S3_ACCESS_KEY_ID"),
    s3SecretKey: optional("S3_SECRET_ACCESS_KEY"),
    /** Public base URL of the bucket for avatars (e.g. https://storage.yandexcloud.net/<bucket>). */
    s3PublicUrl: optional("S3_PUBLIC_URL"),
  },

  rawgApiKey: optional("RAWG_API_KEY"),
  supportEmail: optional("SUPPORT_EMAIL") ?? "official@egorchulanov.ru",

  admin: {
    /** One-time code that turns the account sending it (bot command /admin <code>) into an admin. */
    claimCode: optional("ADMIN_CLAIM_CODE"),
    /** Folder with the nightly pg_dump files (the compose "backups" volume, mounted read-only). */
    backupsDir: optional("BACKUPS_DIR"),
  },

  steam: {
    /** Steam Web API key (https://steamcommunity.com/dev/apikey); enables importing a Steam library. */
    apiKey: optional("STEAM_API_KEY"),
  },
  privacyUrl: optional("PRIVACY_URL") ?? `${publicUrl}/legal/privacy.html`,
  termsUrl: optional("TERMS_URL") ?? `${publicUrl}/legal/terms.html`,
  /** Comma-separated origins allowed for CORS (empty = same origin only). */
  corsOrigins: (optional("CORS_ORIGINS") ?? "").split(",").map((v) => v.trim()).filter(Boolean),
} as const;

export function assertProductionConfig(): void {
  if (!config.isProduction) return;
  const problems: string[] = [];
  if (config.sessionSecret.length < 32) problems.push("SESSION_SECRET must contain at least 32 characters");
  if (config.devAuth) problems.push("DEV_AUTH must be disabled in production");
  if (!config.publicUrl.startsWith("https://")) problems.push("PUBLIC_URL must use https:// (Telegram and VK require HTTPS)");
  if (!config.telegram.botToken && !config.vk.appSecret) problems.push("Configure TELEGRAM_BOT_TOKEN and/or VK_APP_SECRET");
  if (config.storage.driver === "s3" && (!config.storage.s3Bucket || !config.storage.s3AccessKey || !config.storage.s3SecretKey)) {
    problems.push("S3 storage requires S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY");
  }
  if (problems.length) throw new Error(`Invalid production configuration:\n- ${problems.join("\n- ")}`);
}
