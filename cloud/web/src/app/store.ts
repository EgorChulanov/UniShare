import { create } from "zustand";
import {
  decodeDeepLink,
  parseAnyLink,
  type ChatMessage,
  type GameTag,
  type Platform,
  type ChatSummary,
  type DeepLink,
  type LikeRequestItem,
  type MyProfile,
  type ProfileCard,
  type PublicConfig,
  type RealtimeEvent,
  type AdminBug,
  type AdminReport,
} from "@unishare/shared";
import { ApiError, api, onUnauthorized, setToken } from "../lib/api";
import { realtime } from "../lib/realtime";
import { platform } from "../platform/platform";
import { detectLanguage, errorMessage, hasLanguagePreference, t, useI18n, type Language } from "../i18n/i18n";

export type Tab = "feed" | "chats" | "profile" | "search";

export type AdminView = { kind: "report"; report: AdminReport } | { kind: "bug"; bug: AdminBug } | { kind: "user"; uid: string };

export type Overlay =
  | { type: "profile"; uid: string; card?: ProfileCard; source?: "feed" }
  | { type: "chat"; chatId: string }
  | { type: "story"; index: number }
  | { type: "settings" }
  | { type: "edit" }
  | { type: "skills" }
  | { type: "airshare" }
  | { type: "game"; game: GameTag }
  | { type: "platform"; platform: Platform }
  | { type: "subscription"; name: string }
  | { type: "link" }
  | { type: "report"; uid: string; username: string }
  | { type: "rating"; chatId: string; uid: string; username: string }
  | { type: "transparency" }
  /** The admin panel; with `view`, one report, bug or user opened over it (so Back closes just that). */
  | { type: "admin"; view?: AdminView }
  | { type: "bug" }
  | { type: "steamImport" }
  | { type: "avatar" };

export type ThemeMode = "system" | "light" | "dark";

interface Toast {
  id: number;
  text: string;
  kind: "info" | "error" | "success";
}

type Phase = "booting" | "signed_out" | "signing_in" | "auth_error" | "ready";

interface AppState {
  phase: Phase;
  authError: string | null;
  config: PublicConfig | null;
  profile: MyProfile | null;
  isNewUser: boolean;
  showGreeting: boolean;
  tab: Tab;
  /** Last non-search tab, shown as the collapsed tab bar while searching. */
  lastTab: Exclude<Tab, "search">;
  tabBarCollapsed: boolean;
  overlays: Overlay[];
  toasts: Toast[];
  themeMode: ThemeMode;
  systemScheme: "light" | "dark";
  online: boolean;
  chats: ChatSummary[];
  chatsLoaded: boolean;
  requests: LikeRequestItem[];
  messages: Record<string, ChatMessage[]>;
  typing: Record<string, number>;
  match: { chatId: string; partner: ProfileCard } | null;
  pendingLink: DeepLink | null;

  boot(): Promise<void>;
  signInDev(name: string): Promise<void>;
  signInTelegramWidget(payload: Record<string, unknown>): Promise<void>;
  completeSignIn(response: Awaited<ReturnType<typeof api.authTelegram>>): void;
  signOut(): Promise<void>;
  setProfile(profile: MyProfile): void;
  finishGreeting(): void;
  setTab(tab: Tab): void;
  push(overlay: Overlay): void;
  /** Swaps the top overlay (e.g. a profile for its chat) without adding a history entry. */
  replace(overlay: Overlay): void;
  pop(): void;
  /** Closes the top `count` overlays in one history step (e.g. a profile and the chat under it). */
  popOverlays(count: number): void;
  closeOverlay(): void;
  toast(text: string, kind?: Toast["kind"]): void;
  toastError(error: unknown): void;
  setThemeMode(mode: ThemeMode): void;
  setSystemScheme(scheme: "light" | "dark"): void;
  loadChats(): Promise<void>;
  loadRequests(): Promise<void>;
  setMessages(chatId: string, messages: ChatMessage[]): void;
  upsertMessage(message: ChatMessage): void;
  showMatch(chatId: string, partner: ProfileCard): void;
  dismissMatch(): void;
  openDeepLink(link: DeepLink): void;
}

const THEME_KEY = "unishare.theme";
function storedTheme(): ThemeMode {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

let toastId = 0;
let historyDepth = 0;
/** Overlays the next popstate closes: more than one after popOverlays(n). */
let pendingPops = 0;
/** Tags this page load's history entries; entries left from before a reload count as depth 0. */
const historyLoad = Math.random().toString(36).slice(2);

export const useApp = create<AppState>((set, get) => ({
  phase: "booting",
  authError: null,
  config: null,
  profile: null,
  isNewUser: false,
  showGreeting: false,
  tab: "feed",
  lastTab: "feed",
  tabBarCollapsed: false,
  overlays: [],
  toasts: [],
  themeMode: storedTheme(),
  systemScheme: "dark",
  online: true,
  chats: [],
  chatsLoaded: false,
  requests: [],
  messages: {},
  typing: {},
  match: null,
  pendingLink: null,

  async boot() {
    await platform.init().catch(() => undefined);
    const scheme = platform.colorScheme();
    if (scheme) set({ systemScheme: scheme });
    platform.onColorSchemeChange((value) => set({ systemScheme: value }));
    if (!hasLanguagePreference()) useI18n.getState().setLanguage(detectLanguage(platform.languageCode()));

    const startLink = decodeDeepLink(platform.startParam());
    set({ pendingLink: startLink && startLink.kind !== "link" ? startLink : null });
    const linkToken = startLink?.kind === "link" ? startLink.token : null;

    onUnauthorized(() => {
      setToken(null);
      realtime.stop();
      set({ phase: "signed_out", profile: null, tab: "feed", lastTab: "feed", tabBarCollapsed: false });
    });

    const config = await api.config().catch(() => null);
    set({ config });

    try {
      set({ phase: "signing_in" });
      const payload = await platform.signInPayload();
      if (payload.provider === "telegram" && payload.data) {
        get().completeSignIn(await api.authTelegram(payload.data, linkToken));
        return;
      }
      if (payload.provider === "vk" && payload.data) {
        get().completeSignIn(await api.authVk(payload.data, payload.vkUser, linkToken));
        return;
      }
      // Web: reuse the stored session.
      const profile = await api.me();
      set({ profile, phase: "ready" });
      afterSignIn(profile);
      if (linkToken) get().toast(t("profile.link.open"));
    } catch (error) {
      if (platform.kind === "web" && (error as ApiError).status === 401) {
        set({ phase: "signed_out" });
        return;
      }
      if (platform.kind === "web" && !(error instanceof ApiError && error.code === "network")) {
        set({ phase: "signed_out" });
        return;
      }
      set({ phase: "auth_error", authError: errorMessage(error) });
    }
  },

  async signInDev(name) {
    set({ phase: "signing_in" });
    try {
      get().completeSignIn(await api.authDev(name));
    } catch (error) {
      set({ phase: "signed_out" });
      get().toastError(error);
    }
  },

  async signInTelegramWidget(payload) {
    set({ phase: "signing_in" });
    try {
      get().completeSignIn(await api.authTelegramWidget(payload));
    } catch (error) {
      set({ phase: "signed_out" });
      get().toastError(error);
    }
  },

  completeSignIn(response) {
    setToken(response.token);
    if (response.profile.language && hasLanguagePreference() === false) {
      useI18n.getState().setLanguage(response.profile.language as Language);
    }
    set({
      profile: response.profile,
      isNewUser: response.isNewUser,
      phase: "ready",
      showGreeting: response.profile.onboardingComplete && !sessionStorageFlag("greeted"),
    });
    if (response.linked) get().toast(t("profile.link.done", response.linked === "vk" ? "ВКонтакте" : "Telegram"), "success");
    afterSignIn(response.profile);
  },

  async signOut() {
    await api.logout().catch(() => undefined);
    setToken(null);
    realtime.stop();
    set({
      profile: null,
      phase: platform.kind === "web" ? "signed_out" : "auth_error",
      authError: null,
      chats: [],
      requests: [],
      messages: {},
      overlays: [],
      tab: "feed",
      lastTab: "feed",
      tabBarCollapsed: false,
    });
    syncBackButton();
    if (platform.kind !== "web") void get().boot();
  },

  setProfile(profile) {
    const finishedOnboarding = profile.onboardingComplete && get().profile?.onboardingComplete === false;
    set({ profile });
    // Deep links opened before onboarding (e.g. a scanned QR) continue afterwards.
    const link = get().pendingLink;
    if (finishedOnboarding && link) {
      set({ pendingLink: null });
      setTimeout(() => get().openDeepLink(link), 1900);
    }
  },

  finishGreeting() {
    setSessionFlag("greeted");
    set({ showGreeting: false });
  },

  setTab(tab) {
    if (get().tab !== tab) platform.haptic("light");
    set({ tab, tabBarCollapsed: false, ...(tab === "search" ? {} : { lastTab: tab }) });
  },

  push(overlay) {
    set((state) => ({ overlays: [...state.overlays, overlay] }));
    historyDepth += 1;
    history.pushState({ unishareOverlay: historyDepth, unishareLoad: historyLoad }, "");
    syncBackButton();
  },

  replace(overlay) {
    if (!get().overlays.length) return get().push(overlay);
    // The history entry of the replaced overlay now belongs to the new one.
    set((state) => ({ overlays: [...state.overlays.slice(0, -1), overlay] }));
    syncBackButton();
  },

  pop() {
    // Close through history so the system back gesture stays in sync.
    if (historyDepth > 0) history.back();
    else get().closeOverlay();
  },

  popOverlays(count) {
    const steps = Math.min(count, get().overlays.length);
    if (steps <= 0) return;
    if (historyDepth >= steps) {
      pendingPops = steps;
      history.go(-steps);
    } else for (let index = 0; index < steps; index += 1) get().closeOverlay();
  },

  closeOverlay() {
    set((state) => ({ overlays: state.overlays.slice(0, -1) }));
    syncBackButton();
  },

  toast(text, kind = "info") {
    const id = ++toastId;
    set((state) => ({ toasts: [...state.toasts.slice(-2), { id, text, kind }] }));
    if (kind === "error") platform.haptic("error");
    if (kind === "success") platform.haptic("success");
    setTimeout(() => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })), 3200);
  },

  toastError(error) {
    get().toast(errorMessage(error), "error");
  },

  setThemeMode(mode) {
    try {
      if (mode === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, mode);
    } catch {
      /* ignored */
    }
    set({ themeMode: mode });
  },

  setSystemScheme(scheme) {
    set({ systemScheme: scheme });
  },

  async loadChats() {
    try {
      const chats = await api.chats();
      set({ chats, chatsLoaded: true });
    } catch (error) {
      set({ chatsLoaded: true });
      if ((error as ApiError).status !== 401) console.warn(error);
    }
  },

  async loadRequests() {
    const requests = await api.requests().catch(() => get().requests);
    set({ requests });
  },

  setMessages(chatId, messages) {
    set((state) => ({ messages: { ...state.messages, [chatId]: messages } }));
  },

  upsertMessage(message) {
    set((state) => {
      const list = state.messages[message.chatId];
      if (!list) return {};
      const index = list.findIndex((item) => item.id === message.id);
      const next = index >= 0 ? list.map((item, i) => (i === index ? message : item)) : [...list, message];
      return { messages: { ...state.messages, [message.chatId]: next } };
    });
  },

  showMatch(chatId, partner) {
    // FeedView.swift shows a toast-style confirmation and moves on.
    platform.haptic("success");
    set({ match: { chatId, partner } });
    get().toast(`${t("feed.swipe.match")} · ${partner.username}`, "success");
    void get().loadChats();
  },

  dismissMatch() {
    set({ match: null });
  },

  openDeepLink(link) {
    const state = get();
    if (link.kind === "profile") {
      if (link.uid === state.profile?.uid) state.setTab("profile");
      else state.push({ type: "profile", uid: link.uid });
    } else if (link.kind === "chat") {
      state.setTab("chats");
      state.push({ type: "chat", chatId: link.chatId });
    } else if (link.kind === "screen") {
      if (link.screen === "nearby") state.push({ type: "airshare" });
      else if (link.screen === "admin") {
        // From the bot's admin notifications; ignored for everyone else.
        if (state.profile?.isAdmin) state.push({ type: "admin" });
      } else state.setTab(link.screen);
    }
  },
}));

function sessionStorageFlag(key: string): boolean {
  try {
    return sessionStorage.getItem(`unishare.${key}`) === "1";
  } catch {
    return false;
  }
}

function setSessionFlag(key: string) {
  try {
    sessionStorage.setItem(`unishare.${key}`, "1");
  } catch {
    /* ignored */
  }
}

function syncBackButton() {
  const visible = useApp.getState().overlays.length > 0;
  platform.setBackButton(visible, () => useApp.getState().pop());
}

window.addEventListener("popstate", (event) => {
  // history.go(-n) arrives as one event, from popOverlays or from a jump in the
  // browser's back menu: close every overlay above the entry we landed on.
  let steps = pendingPops;
  pendingPops = 0;
  if (!steps) {
    const state = event.state as { unishareOverlay?: unknown; unishareLoad?: unknown } | null;
    const target = state?.unishareLoad === historyLoad && typeof state.unishareOverlay === "number" ? state.unishareOverlay : 0;
    steps = historyDepth > target ? historyDepth - target : 1;
  }
  for (let index = 0; index < steps; index += 1) {
    if (historyDepth > 0) historyDepth -= 1;
    if (useApp.getState().overlays.length) useApp.getState().closeOverlay();
  }
});

function afterSignIn(profile: MyProfile) {
  realtime.start();
  const state = useApp.getState();
  void state.loadChats();
  void state.loadRequests();
  if (profile.onboardingComplete && state.pendingLink) {
    const link = state.pendingLink;
    useApp.setState({ pendingLink: null });
    setTimeout(() => useApp.getState().openDeepLink(link), 50);
  }
}

/** Opens any scanned/pasted UniShare link; returns false if it is not one. */
export function openAnyLink(input: string): boolean {
  const link = parseAnyLink(input);
  if (!link) return false;
  useApp.getState().openDeepLink(link);
  return true;
}

// ── Realtime → store ────────────────────────────────────────────────────────

function handleEvent(event: RealtimeEvent) {
  const state = useApp.getState();
  const me = state.profile?.uid;
  switch (event.type) {
    case "message": {
      state.upsertMessage(event.message);
      if (event.message.senderId !== me) {
        useApp.setState((s) => {
          const typing = { ...s.typing };
          delete typing[event.message.chatId];
          return { typing };
        });
      }
      break;
    }
    case "chat": {
      useApp.setState((s) => ({
        chats: [event.chat, ...s.chats.filter((chat) => chat.id !== event.chat.id)].sort(
          (a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt),
        ),
      }));
      break;
    }
    case "chat_removed":
      useApp.setState((s) => ({ chats: s.chats.filter((chat) => chat.id !== event.chatId) }));
      break;
    case "read":
      useApp.setState((s) => {
        const list = s.messages[event.chatId];
        if (!list) return {};
        return {
          messages: {
            ...s.messages,
            [event.chatId]: list.map((message) => (message.senderId === me && !message.readAt ? { ...message, readAt: event.readAt } : message)),
          },
        };
      });
      break;
    case "request":
      useApp.setState((s) => ({ requests: [event.request, ...s.requests.filter((r) => r.id !== event.request.id)] }));
      platform.haptic("light");
      break;
    case "match":
      useApp.setState((s) => ({ requests: s.requests.filter((r) => r.from.uid !== event.partner.uid) }));
      state.showMatch(event.chatId, event.partner);
      break;
    case "typing":
      useApp.setState((s) => ({ typing: { ...s.typing, [event.chatId]: Date.now() } }));
      setTimeout(() => {
        useApp.setState((s) => {
          if (Date.now() - (s.typing[event.chatId] ?? 0) < 3500) return {};
          const typing = { ...s.typing };
          delete typing[event.chatId];
          return { typing };
        });
      }, 4000);
      break;
    case "profile_updated":
      void api.me().then((profile) => useApp.getState().setProfile(profile)).catch(() => undefined);
      break;
    case "presence":
      break;
  }
}

realtime.subscribe(handleEvent);
// A ban closes the socket: signing in again shows the "account suspended" screen.
realtime.onDisabled(() => void useApp.getState().boot());
realtime.onStatus((connected) => {
  useApp.setState({ online: connected });
  // Catch up on anything missed while disconnected.
  if (connected && useApp.getState().phase === "ready") {
    void useApp.getState().loadChats();
    void useApp.getState().loadRequests();
  }
});

// Polling fallback when the WebSocket cannot connect (strict proxies).
setInterval(() => {
  const state = useApp.getState();
  if (state.phase === "ready" && !realtime.connected && document.visibilityState === "visible") {
    void state.loadChats();
    void state.loadRequests();
  }
}, 20_000);

export function useUnreadCount(): number {
  return useApp((state) => state.chats.reduce((sum, chat) => sum + chat.unread, 0) + state.requests.length);
}

export function resolvedTheme(state: Pick<AppState, "themeMode" | "systemScheme">): "light" | "dark" {
  return state.themeMode === "system" ? state.systemScheme : state.themeMode;
}


/** iOS 26-style tab bar minimisation: collapse while scrolling down, expand on scroll up. */
export function collapseOnScroll() {
  let last = 0;
  return (event: { currentTarget: HTMLElement }) => {
    const top = event.currentTarget.scrollTop;
    const delta = top - last;
    last = top;
    const collapsed = useApp.getState().tabBarCollapsed;
    if (top < 40 && collapsed) useApp.setState({ tabBarCollapsed: false });
    else if (delta > 6 && top > 80 && !collapsed) useApp.setState({ tabBarCollapsed: true });
    else if (delta < -6 && collapsed) useApp.setState({ tabBarCollapsed: false });
  };
}
