# Telegram Bot API relay

Some hosting networks in Russia block outgoing connections to `api.telegram.org`. The UniShare server keeps working without it:
- the Mini App opens;
- the bot answers commands inside the webhook response.

What stops working is the bot writing first: match and message notifications, and the automatic setup of commands and the menu button. This relay restores them.

1. Create a free account at [Cloudflare](https://dash.cloudflare.com), then go to **Workers & Pages → Create → Worker**.
2. Paste `worker.js` and deploy.
3. In **Settings → Variables**, add:
   - `RELAY_SECRET`: a long random string (`openssl rand -hex 16`);
   - `ALLOWED_BOT_ID`: the number before `:` in the bot token, for example `9072124122`.
4. On the server, add to `/opt/unishare/cloud/.env`:
   ```
   TELEGRAM_API_ROOT=https://<your-worker>.workers.dev/<RELAY_SECRET>
   ```
   Then restart: `cd /opt/unishare/cloud/deploy && sudo docker compose --env-file ../.env up -d`.
5. Check `https://<domain>/health`: `telegram.configured` should become `true`.
