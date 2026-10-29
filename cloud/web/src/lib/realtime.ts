// WebSocket connection with automatic reconnect. Falls back to periodic
// refreshes (handled by the stores) while the socket is down.
import type { RealtimeCommand, RealtimeEvent } from "@unishare/shared";
import { apiUrl, getToken } from "./api";

type Listener = (event: RealtimeEvent) => void;

const listeners = new Set<Listener>();
const statusListeners = new Set<(connected: boolean) => void>();
let socket: WebSocket | null = null;
let attempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let stopped = true;

function socketUrl(token: string): string {
  const base = apiUrl("/api/ws");
  const absolute = base.startsWith("http") ? base : `${location.origin}${base}`;
  return `${absolute.replace(/^http/, "ws")}?token=${encodeURIComponent(token)}`;
}

function setStatus(connected: boolean) {
  statusListeners.forEach((listener) => listener(connected));
}

function connect() {
  const token = getToken();
  if (!token || stopped) return;
  socket = new WebSocket(socketUrl(token));
  socket.onopen = () => {
    attempts = 0;
    setStatus(true);
    socket?.send(JSON.stringify({ type: "visibility", visible: appVisible } satisfies RealtimeCommand));
  };
  socket.onmessage = (message) => {
    try {
      const event = JSON.parse(message.data as string) as RealtimeEvent;
      listeners.forEach((listener) => listener(event));
    } catch {
      /* ignore malformed frames */
    }
  };
  socket.onclose = () => {
    socket = null;
    setStatus(false);
    if (stopped) return;
    attempts += 1;
    const delay = Math.min(30_000, 800 * 2 ** Math.min(attempts, 6)) + Math.random() * 500;
    reconnectTimer = setTimeout(connect, delay);
  };
  socket.onerror = () => socket?.close();
}

export const realtime = {
  start() {
    stopped = false;
    if (!socket) connect();
  },
  stop() {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    socket?.close();
    socket = null;
  },
  send(command: RealtimeCommand) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(command));
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  onStatus(listener: (connected: boolean) => void) {
    statusListeners.add(listener);
    return () => statusListeners.delete(listener);
  },
  get connected() {
    return socket?.readyState === WebSocket.OPEN;
  },
};

let appVisible = document.visibilityState === "visible";

/**
 * Tells the server whether UniShare is on screen. Telegram minimizes Mini Apps
 * instead of closing them, so an open socket alone does not mean the user can
 * see in-app notifications; while hidden, the bot sends them instead.
 */
export function setAppVisible(visible: boolean): void {
  if (appVisible === visible) return;
  appVisible = visible;
  realtime.send({ type: "visibility", visible });
}

// Reconnect immediately when the app returns to the foreground.
document.addEventListener("visibilitychange", () => {
  setAppVisible(document.visibilityState === "visible");
  if (document.visibilityState === "visible" && !stopped && !socket) {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    attempts = 0;
    connect();
  }
});

// Platform adapters (e.g. Telegram activated/deactivated) report visibility too.
window.addEventListener("unishare:visibility", (event) => setAppVisible(Boolean((event as CustomEvent<boolean>).detail)));
