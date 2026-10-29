// Cloudflare Worker that relays Telegram Bot API calls for servers which
// cannot reach api.telegram.org (some hosting networks inside Russia).
// Deploy it, then set on the UniShare server:
//   TELEGRAM_API_ROOT=https://<worker>.workers.dev/<RELAY_SECRET>
// Only /bot<token>/<method> requests for the configured bot are forwarded.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const prefix = `/${env.RELAY_SECRET}/bot`;
    if (!env.RELAY_SECRET || !url.pathname.startsWith(prefix)) {
      return new Response("Not found", { status: 404 });
    }
    const rest = url.pathname.slice(prefix.length);
    const botId = rest.split(":")[0];
    if (env.ALLOWED_BOT_ID && botId !== env.ALLOWED_BOT_ID) {
      return new Response("Forbidden", { status: 403 });
    }
    const target = `https://api.telegram.org/bot${rest}${url.search}`;
    return fetch(target, {
      method: request.method,
      headers: { "content-type": request.headers.get("content-type") ?? "application/json" },
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    });
  },
};
