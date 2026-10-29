import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import type { PublicConfig } from "@unishare/shared";
import { config } from "./config";
import { query } from "./db";
import { HttpError } from "./lib/errors";
import { verifyMediaSignature } from "./lib/media";
import { storage } from "./lib/storage";
import { authRoutes } from "./routes/auth";
import { meRoutes } from "./routes/me";
import { feedRoutes } from "./routes/feed";
import { chatRoutes } from "./routes/chats";
import { socialRoutes } from "./routes/social";
import { telegramWebhookHandler } from "./bot/telegram";

function webDistDir(): string | null {
  const candidates = [
    config.webDistDir,
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", "web", "dist"),
    resolve("web", "dist"),
    resolve("..", "web", "dist"),
  ].filter((value): value is string => Boolean(value));
  return candidates.find((dir) => existsSync(join(dir, "index.html"))) ?? null;
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    // Request lines are noise in production; errors are still logged.
    logger: { level: "warn" },
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  // Images are uploaded as raw bodies (the client compresses them first).
  app.addContentTypeParser(/^image\/(jpeg|png|webp)$/, { parseAs: "buffer" }, (_request, body, done) => done(null, body));

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.status).send({ error: error.message, code: error.code });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send({ error: (error as Error).message, code: (error as { code?: string }).code });
    }
    const pgCode = (error as { code?: string }).code;
    if (pgCode === "23514" || pgCode === "22001" || pgCode === "22P02") {
      return reply.status(400).send({ error: "Invalid value", code: "invalid_value" });
    }
    request.log.error(error);
    return reply.status(500).send({ error: "Internal server error" });
  });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    if (config.corsOrigins.length) {
      const origin = request.headers.origin;
      if (origin && config.corsOrigins.includes(origin)) {
        reply.header("Access-Control-Allow-Origin", origin);
        reply.header("Vary", "Origin");
      }
    }
    return payload;
  });

  if (config.corsOrigins.length) {
    app.options("/api/*", async (request, reply) => {
      reply
        .header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")
        .header("Access-Control-Allow-Headers", "Authorization,Content-Type")
        .header("Access-Control-Max-Age", "86400")
        .status(204)
        .send();
    });
  }

  app.get("/health", async () => {
    await query("select 1");
    return { ok: true };
  });

  app.get("/api/config", async (): Promise<PublicConfig> => ({
    telegramBotUsername: config.telegram.botUsername,
    telegramAppShortName: config.telegram.appShortName,
    vkAppId: config.vk.appId,
    vkGroupId: config.vk.groupId,
    publicUrl: config.publicUrl,
    supportEmail: config.supportEmail,
    privacyUrl: config.privacyUrl,
    termsUrl: config.termsUrl,
    devAuth: config.devAuth,
  }));

  await app.register(authRoutes);
  await app.register(meRoutes);
  await app.register(feedRoutes);
  await app.register(chatRoutes);
  await app.register(socialRoutes);

  // ── Media ─────────────────────────────────────────────────────────────────

  app.get<{ Params: { file: string } }>("/media/avatars/:file", async (request, reply) => {
    const object = await storage.get(`avatars/${request.params.file}`);
    if (!object) return reply.status(404).send({ error: "Not found" });
    return reply.header("Cache-Control", "public, max-age=31536000, immutable").type(object.contentType).send(object.body);
  });

  app.get<{ Params: { chatId: string; file: string }; Querystring: { exp?: string; sig?: string } }>(
    "/api/media/chats/:chatId/:file",
    async (request, reply) => {
      const path = `/api/media/chats/${request.params.chatId}/${request.params.file}`;
      if (!verifyMediaSignature(path, request.query.exp, request.query.sig)) return reply.status(403).send({ error: "Link expired" });
      const object = await storage.get(`chats/${request.params.chatId}/${request.params.file}`);
      if (!object) return reply.status(404).send({ error: "Not found" });
      return reply.header("Cache-Control", "private, max-age=86400").type(object.contentType).send(object.body);
    },
  );

  // ── Bots ──────────────────────────────────────────────────────────────────

  const telegramHandler = telegramWebhookHandler();
  if (telegramHandler && config.telegram.mode === "webhook") {
    app.post("/telegram/webhook", telegramHandler);
  }

  // VK Callback API: confirmation and message permission changes.
  app.post<{ Body: { type?: string; group_id?: number; secret?: string; object?: { user_id?: number } } }>("/vk/callback", async (request, reply) => {
    const body = request.body ?? {};
    if (config.vk.callbackSecret && body.secret !== config.vk.callbackSecret) return reply.status(403).send("forbidden");
    if (config.vk.groupId && body.group_id !== config.vk.groupId) return reply.status(403).send("forbidden");
    if (body.type === "confirmation") return reply.type("text/plain").send(config.vk.callbackConfirmation ?? "");
    const userId = body.object?.user_id;
    if ((body.type === "message_allow" || body.type === "message_deny") && userId) {
      await query(
        `update user_identities set can_message = $2 where provider = 'vk' and provider_user_id = $1`,
        [String(userId), body.type === "message_allow"],
      );
    }
    return reply.type("text/plain").send("ok");
  });

  // ── Web client (Telegram/VK Mini App and website) ─────────────────────────

  const dist = webDistDir();
  if (dist) {
    await app.register(fastifyStatic, {
      root: dist,
      wildcard: false,
      index: false,
      setHeaders(response, filePath) {
        if (filePath.includes(`${join("assets", "")}`) || /\.(woff2?|ttf|svg|png|jpg|webp)$/.test(filePath)) {
          response.header("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    });
    app.get("/*", async (request, reply) => {
      const path = request.url.split("?")[0];
      if (path.startsWith("/api/") || path.startsWith("/media/")) return reply.status(404).send({ error: "Not found" });
      const file = path.replace(/^\/+/, "");
      if (file && !file.endsWith("/") && existsSync(join(dist, file))) {
        return reply.sendFile(file);
      }
      return reply.header("Cache-Control", "no-cache").sendFile("index.html");
    });
  } else {
    app.get("/", async () => ({
      name: "UniShare API",
      hint: "Build the web client (npm run build --workspace web) to serve the Mini App from this server.",
    }));
  }

  return app;
}
