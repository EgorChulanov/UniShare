import { assertProductionConfig, config } from "./config";
import { pool, query } from "./db";
import { migrate } from "./migrate";
import { buildApp } from "./app";
import { attachRealtime } from "./realtime";
import { configureTelegramBot, createTelegramBot } from "./bot/telegram";
import { purgeExpiredGameCache } from "./games";
import { backfillCovers } from "./enrich";

/** Starts the server. Imported lazily by index.ts after the remote env is loaded. */
export async function start(): Promise<void> {
  assertProductionConfig();
  await migrate((message) => console.log(message));
  // Nobody is connected right after a restart.
  await query(`update users set is_online = false where is_online`);

  const bot = createTelegramBot();
  const app = await buildApp();
  const detachRealtime = attachRealtime(app.server);
  await app.listen({ port: config.port, host: config.host });
  console.log(`UniShare listening on ${config.host}:${config.port} (public URL ${config.publicUrl})`);

  if (bot) {
    // Retry until Telegram accepts the setup (network hiccups, slow routes from RU hosting).
    const setupBot = async (): Promise<boolean> => {
      try {
        await configureTelegramBot((message) => console.log(message));
        return true;
      } catch (error) {
        console.error("Telegram bot setup failed:", (error as Error).message);
        return false;
      }
    };
    if (!(await setupBot())) {
      const retry = setInterval(() => {
        void setupBot().then((done) => done && clearInterval(retry));
      }, 5 * 60 * 1000);
    }
    if (config.telegram.mode === "polling") {
      await bot.api.deleteWebhook().catch(() => undefined);
      void bot.start({ allowed_updates: ["message", "my_chat_member"], onStart: () => console.log("Telegram bot polling") });
    }
  }

  // Add artwork to profiles saved before covers were available.
  const backfill = setTimeout(() => void backfillCovers((message) => console.log(message)), 15_000);

  const housekeeping = setInterval(() => {
    void query(`delete from sessions where expires_at < now()`).catch(() => undefined);
    void query(`delete from link_tokens where expires_at < now()`).catch(() => undefined);
    void purgeExpiredGameCache();
  }, 6 * 60 * 60 * 1000);

  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down`);
    clearInterval(housekeeping);
    clearTimeout(backfill);
    detachRealtime();
    if (bot && config.telegram.mode === "polling") await bot.stop().catch(() => undefined);
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}
