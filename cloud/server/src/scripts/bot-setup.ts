// One-off: registers bot commands, descriptions, menu button and webhook.
// Usage: npm run bot:setup (reads cloud/.env)
import { configureTelegramBot, createTelegramBot } from "../bot/telegram";

const bot = createTelegramBot();
if (!bot) {
  console.error("Set TELEGRAM_BOT_TOKEN (and TELEGRAM_BOT_MODE is not 'off') first.");
  process.exit(1);
}

configureTelegramBot()
  .then(() => {
    console.log("Telegram bot configured.");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
