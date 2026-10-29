// WebSocket hub: pushes chat messages, matches and presence to every open
// client of a user (Telegram, VK and web sessions at the same time).
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import type { RealtimeCommand, RealtimeEvent } from "@unishare/shared";
import { resolveSession } from "./auth/session";
import { query } from "./db";

const sockets = new Map<string, Set<WebSocket>>();
const typingListeners = new Set<(userId: string, chatId: string) => void>();

export function isConnected(userId: string): boolean {
  return (sockets.get(userId)?.size ?? 0) > 0;
}

export function publish(userId: string, event: RealtimeEvent): void {
  const targets = sockets.get(userId);
  if (!targets) return;
  const payload = JSON.stringify(event);
  for (const socket of targets) {
    if (socket.readyState === socket.OPEN) socket.send(payload);
  }
}

export function onTyping(listener: (userId: string, chatId: string) => void): void {
  typingListeners.add(listener);
}

async function setPresence(userId: string, isOnline: boolean): Promise<void> {
  await query(`update users set is_online = $2, last_seen = now() where uid = $1`, [userId, isOnline]).catch(() => undefined);
}

export function attachRealtime(server: Server): () => void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

  server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/api/ws") {
      socket.destroy();
      return;
    }
    const token = url.searchParams.get("token");
    resolveSession(token)
      .then((session) => {
        if (!session) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
        wss.handleUpgrade(request, socket, head, (ws) => {
          const userId = session.userId;
          const set = sockets.get(userId) ?? new Set();
          const firstConnection = set.size === 0;
          set.add(ws);
          sockets.set(userId, set);
          if (firstConnection) void setPresence(userId, true);

          let alive = true;
          ws.on("pong", () => (alive = true));
          const heartbeat = setInterval(() => {
            if (!alive) return ws.terminate();
            alive = false;
            ws.ping();
          }, 30_000);

          ws.on("message", (raw) => {
            let command: RealtimeCommand;
            try {
              command = JSON.parse(raw.toString()) as RealtimeCommand;
            } catch {
              return;
            }
            if (command.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
            if (command.type === "typing" && typeof command.chatId === "string") {
              for (const listener of typingListeners) listener(userId, command.chatId);
            }
          });

          ws.on("close", () => {
            clearInterval(heartbeat);
            const current = sockets.get(userId);
            current?.delete(ws);
            if (current && current.size === 0) {
              sockets.delete(userId);
              void setPresence(userId, false);
            }
          });
        });
      })
      .catch(() => socket.destroy());
  });

  return () => {
    for (const set of sockets.values()) for (const ws of set) ws.close(1001, "Server shutting down");
    wss.close();
  };
}
