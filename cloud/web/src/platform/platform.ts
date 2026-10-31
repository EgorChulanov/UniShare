// One API over Telegram Mini Apps, VK Mini Apps and the plain web (PWA).
// Screens never talk to Telegram/VK directly, so the same UI runs everywhere
// and a future native shell (Capacitor) only needs another adapter here.
import type { ClientPlatform } from "@unishare/shared";

export type Haptic = "light" | "medium" | "heavy" | "selection" | "success" | "error" | "warning";
export type ColorScheme = "light" | "dark";

export interface SignInPayload {
  provider: "telegram" | "vk" | "web";
  /** Telegram initData or VK launch query string. */
  data?: string;
  vkUser?: { firstName?: string; lastName?: string; photoUrl?: string };
}

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracy?: number;
}

/** navigator.geolocation; null when denied or unavailable. The API's own `timeout` starts only
 *  after permission is granted, so a slow answer to the browser prompt still counts; the long
 *  timer is only a safety net for engines that never call back. */
function browserLocation(timeout = 8000): Promise<GeoPoint | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    const timer = setTimeout(() => resolve(null), 60_000);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timer);
        resolve({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout, maximumAge: 30_000 },
    );
  });
}

export interface PlatformAdapter {
  kind: ClientPlatform;
  /** Raw OS hint (ios, android, tdesktop, mobile_web, ...). */
  os: string;
  init(): Promise<void>;
  signInPayload(): Promise<SignInPayload>;
  startParam(): string | null;
  languageCode(): string | null;
  colorScheme(): ColorScheme | null;
  onColorSchemeChange(listener: (scheme: ColorScheme) => void): void;
  applyColors(background: string, header: string): void;
  haptic(type: Haptic): void;
  setBackButton(visible: boolean, onClick: () => void): void;
  openLink(url: string): void;
  scanQr?(prompt: string): Promise<string | null>;
  share(params: { url: string; text: string; preparedMessageId?: string | null }): Promise<boolean>;
  requestNotifications?(vkGroupId?: number | null): Promise<boolean>;
  addToHomeScreen?(): Promise<boolean>;
  canAddToHomeScreen(): boolean;
  setClosingConfirmation(enabled: boolean): void;
  /** Device location for AirShare (null when unavailable or denied). */
  getLocation(): Promise<GeoPoint | null>;
}

// ── Telegram ────────────────────────────────────────────────────────────────

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { start_param?: string; user?: { language_code?: string } };
  platform: string;
  version: string;
  colorScheme: ColorScheme;
  isVersionAtLeast(version: string): boolean;
  ready(): void;
  expand(): void;
  requestFullscreen?(): void;
  disableVerticalSwipes?(): void;
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  setBottomBarColor?(color: string): void;
  onEvent(event: string, handler: (...args: unknown[]) => void): void;
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;
  showScanQrPopup(params: { text?: string }, callback?: (text: string) => boolean | void): void;
  closeScanQrPopup(): void;
  requestWriteAccess?(callback?: (allowed: boolean) => void): void;
  shareMessage?(id: string, callback?: (sent: boolean) => void): void;
  addToHomeScreen?(): void;
  safeAreaInset?: { top: number; bottom: number; left: number; right: number };
  contentSafeAreaInset?: { top: number; bottom: number; left: number; right: number };
  isFullscreen?: boolean;
  LocationManager?: {
    isInited: boolean;
    isLocationAvailable: boolean;
    isAccessGranted?: boolean;
    init(callback?: () => void): void;
    getLocation(callback: (data: { latitude: number; longitude: number; horizontal_accuracy?: number | null } | null) => void): void;
  };
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback: {
    impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
    selectionChanged(): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
    TelegramWebviewProxy?: unknown;
  }
}

function isTelegramLaunch(): boolean {
  return /tgWebApp(Data|Platform|Version)/.test(window.location.hash) || Boolean(window.TelegramWebviewProxy);
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

/** Raw Mini App protocol (core.telegram.org/api/web-events) for when the SDK script is unavailable. */
function postTelegramEvent(eventType: string, eventData: unknown = ""): void {
  const data = JSON.stringify(eventData);
  const proxy = window.TelegramWebviewProxy as { postEvent?: (type: string, data: string) => void } | undefined;
  if (proxy?.postEvent) proxy.postEvent(eventType, data);
  else window.parent?.postMessage(JSON.stringify({ eventType, eventData }), "*");
}

/** Minimal WebApp object built from the launch hash: enough to sign in and run. */
function telegramShim(): TelegramWebApp {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const initData = hash.get("tgWebAppData") ?? "";
  const initParams = new URLSearchParams(initData);
  let user: { language_code?: string } | undefined;
  try {
    user = JSON.parse(initParams.get("user") ?? "null") ?? undefined;
  } catch {
    user = undefined;
  }
  let theme: { bg_color?: string } = {};
  try {
    theme = JSON.parse(hash.get("tgWebAppThemeParams") ?? "{}");
  } catch {
    theme = {};
  }
  const bg = theme.bg_color?.replace("#", "") ?? "000000";
  const dark = (parseInt(bg.slice(0, 2), 16) * 299 + parseInt(bg.slice(2, 4), 16) * 587 + parseInt(bg.slice(4, 6), 16) * 114) / 1000 < 128;
  const noop = () => undefined;
  return {
    initData,
    initDataUnsafe: { start_param: initParams.get("start_param") ?? undefined, user },
    platform: hash.get("tgWebAppPlatform") ?? "unknown",
    version: "6.0",
    colorScheme: dark ? "dark" : "light",
    isVersionAtLeast: () => false,
    ready: () => postTelegramEvent("web_app_ready"),
    expand: () => postTelegramEvent("web_app_expand"),
    enableClosingConfirmation: noop,
    disableClosingConfirmation: noop,
    setHeaderColor: noop,
    setBackgroundColor: noop,
    onEvent: noop,
    openLink: (url) => window.open(url, "_blank"),
    openTelegramLink: (url) => postTelegramEvent("web_app_open_tg_link", { path_full: url.replace(/^https:\/\/t\.me/, "") }),
    showScanQrPopup: noop,
    closeScanQrPopup: noop,
    BackButton: { show: noop, hide: noop, onClick: noop, offClick: noop },
    HapticFeedback: { impactOccurred: noop, notificationOccurred: noop, selectionChanged: noop },
  };
}

function telegramAdapter(): PlatformAdapter {
  let tg: TelegramWebApp;
  let backHandler: (() => void) | null = null;
  const startFromHash = new URLSearchParams(window.location.hash.slice(1)).get("tgWebAppStartParam");

  const updateInsets = () => {
    const root = document.documentElement.style;
    root.setProperty("--tg-safe-top", `${tg.safeAreaInset?.top ?? 0}px`);
    root.setProperty("--tg-safe-bottom", `${tg.safeAreaInset?.bottom ?? 0}px`);
    root.setProperty("--tg-content-top", `${tg.contentSafeAreaInset?.top ?? 0}px`);
  };

  return {
    kind: "telegram",
    os: "",
    async init() {
      if (!window.Telegram?.WebApp) {
        await Promise.race([
          loadScript("https://telegram.org/js/telegram-web-app.js?59"),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 6000)),
        ]).catch(() => undefined);
      }
      tg = window.Telegram?.WebApp ?? telegramShim();
      this.os = tg.platform;
      tg.ready();
      tg.expand();
      if (tg.isVersionAtLeast("7.7")) tg.disableVerticalSwipes?.();
      // Full-screen, app-like experience on phones (Bot API 8.0+).
      if (tg.isVersionAtLeast("8.0") && (tg.platform === "ios" || tg.platform === "android")) {
        try {
          tg.requestFullscreen?.();
        } catch {
          /* older clients */
        }
      }
      updateInsets();
      tg.onEvent("safeAreaChanged", updateInsets);
      tg.onEvent("contentSafeAreaChanged", updateInsets);
      tg.onEvent("fullscreenChanged", updateInsets);
      tg.onEvent("viewportChanged", updateInsets);
      // Bot API 8.0: the Mini App was minimized or brought back.
      tg.onEvent("deactivated", () => window.dispatchEvent(new CustomEvent("unishare:visibility", { detail: false })));
      tg.onEvent("activated", () => window.dispatchEvent(new CustomEvent("unishare:visibility", { detail: true })));
    },
    async signInPayload() {
      return { provider: "telegram", data: tg.initData };
    },
    startParam() {
      return tg?.initDataUnsafe.start_param ?? startFromHash;
    },
    languageCode() {
      return tg?.initDataUnsafe.user?.language_code ?? null;
    },
    colorScheme() {
      return tg?.colorScheme ?? null;
    },
    onColorSchemeChange(listener) {
      tg.onEvent("themeChanged", () => listener(tg.colorScheme));
    },
    applyColors(background, header) {
      try {
        tg.setBackgroundColor(background);
        tg.setHeaderColor(header);
        if (tg.isVersionAtLeast("7.10")) tg.setBottomBarColor?.(background);
      } catch {
        /* unsupported colors on old clients */
      }
    },
    haptic(type) {
      const h = tg?.HapticFeedback;
      if (!h || !tg.isVersionAtLeast("6.1")) return;
      if (type === "selection") h.selectionChanged();
      else if (type === "success" || type === "error" || type === "warning") h.notificationOccurred(type);
      else h.impactOccurred(type);
    },
    setBackButton(visible, onClick) {
      if (!tg.isVersionAtLeast("6.1")) return;
      if (backHandler) tg.BackButton.offClick(backHandler);
      backHandler = null;
      if (visible) {
        backHandler = onClick;
        tg.BackButton.onClick(onClick);
        tg.BackButton.show();
      } else {
        tg.BackButton.hide();
      }
    },
    openLink(url) {
      if (/^https:\/\/t\.me\//.test(url)) tg.openTelegramLink(url);
      else tg.openLink(url);
    },
    scanQr(prompt) {
      if (!tg.isVersionAtLeast("6.4")) return Promise.resolve(null);
      return new Promise((resolve) => {
        let done = false;
        tg.showScanQrPopup({ text: prompt }, (text) => {
          if (done) return true;
          done = true;
          resolve(text);
          return true;
        });
        tg.onEvent("scanQrPopupClosed", () => {
          if (!done) {
            done = true;
            resolve(null);
          }
        });
      });
    },
    async share({ url, text, preparedMessageId }) {
      if (preparedMessageId && tg.shareMessage && tg.isVersionAtLeast("8.0")) {
        return new Promise((resolve) => tg.shareMessage!(preparedMessageId, (sent) => resolve(sent)));
      }
      tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
      return true;
    },
    requestNotifications() {
      return new Promise((resolve) => {
        if (!tg.requestWriteAccess || !tg.isVersionAtLeast("6.9")) return resolve(false);
        tg.requestWriteAccess((allowed) => resolve(allowed));
      });
    },
    async addToHomeScreen() {
      if (!tg.addToHomeScreen || !tg.isVersionAtLeast("8.0")) return false;
      tg.addToHomeScreen();
      return true;
    },
    canAddToHomeScreen() {
      return Boolean(tg?.addToHomeScreen && tg.isVersionAtLeast("8.0") && (tg.platform === "ios" || tg.platform === "android"));
    },
    setClosingConfirmation(enabled) {
      if (!tg?.isVersionAtLeast("6.2")) return;
      if (enabled) tg.enableClosingConfirmation();
      else tg.disableClosingConfirmation();
    },
    async getLocation() {
      const manager = tg?.LocationManager;
      if (!manager || !tg.isVersionAtLeast("8.0")) return browserLocation();
      // Telegram's answer is final: after "Deny" (or with location unavailable) the browser
      // must not ask a second time.
      return new Promise<GeoPoint | null>((resolve) => {
        let settled = false;
        const finish = (point: GeoPoint | null) => {
          settled = true;
          clearTimeout(timer);
          resolve(point);
        };
        let timer = setTimeout(() => finish(null), 10_000);
        const read = () => {
          if (settled) return;
          clearTimeout(timer);
          if (!manager.isLocationAvailable) return finish(null);
          // Telegram may show its permission popup now; the time spent on it must not count.
          timer = setTimeout(() => finish(null), manager.isAccessGranted ? 10_000 : 60_000);
          manager.getLocation((data) => finish(data ? { lat: data.latitude, lng: data.longitude, accuracy: data.horizontal_accuracy ?? undefined } : null));
        };
        if (manager.isInited) read();
        else manager.init(read);
      });
    },
  };
}

// ── VK ──────────────────────────────────────────────────────────────────────

function isVkLaunch(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.has("vk_app_id") && params.has("sign");
}

/** VK Bridge promises never settle outside VK clients; cap the wait. */
function withTimeout<T>(promise: Promise<T>, ms = 2500): Promise<T | null> {
  return Promise.race([promise.catch(() => null), new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

function vkAdapter(): PlatformAdapter {
  const launch = window.location.search.slice(1);
  const params = new URLSearchParams(launch);
  let scheme: ColorScheme | null = null;
  const listeners: ((scheme: ColorScheme) => void)[] = [];
  let bridge: typeof import("@vkontakte/vk-bridge").default;

  return {
    kind: "vk",
    os: params.get("vk_platform") ?? "",
    async init() {
      bridge = (await import("@vkontakte/vk-bridge")).default;
      bridge.subscribe((event) => {
        if (event.detail.type === "VKWebAppUpdateConfig") {
          const appearance = (event.detail.data as { appearance?: string }).appearance;
          if (appearance === "dark" || appearance === "light") {
            scheme = appearance;
            listeners.forEach((listener) => listener(appearance));
          }
        }
      });
      await withTimeout(bridge.send("VKWebAppInit"));
    },
    async signInPayload() {
      const info = await withTimeout(bridge.send("VKWebAppGetUserInfo"));
      return {
        provider: "vk",
        data: launch,
        vkUser: info ? { firstName: info.first_name, lastName: info.last_name, photoUrl: info.photo_200 } : undefined,
      };
    },
    startParam() {
      return window.location.hash.slice(1) || null;
    },
    languageCode() {
      return params.get("vk_language");
    },
    colorScheme() {
      return scheme;
    },
    onColorSchemeChange(listener) {
      listeners.push(listener);
    },
    applyColors(background) {
      const dark = scheme === "dark";
      bridge?.send("VKWebAppSetViewSettings", { status_bar_style: dark ? "light" : "dark", action_bar_color: background }).catch(() => undefined);
    },
    haptic(type) {
      if (!bridge) return;
      if (type === "selection") void bridge.send("VKWebAppTapticSelectionChanged").catch(() => undefined);
      else if (type === "success" || type === "error" || type === "warning") void bridge.send("VKWebAppTapticNotificationOccurred", { type }).catch(() => undefined);
      else void bridge.send("VKWebAppTapticImpactOccurred", { style: type }).catch(() => undefined);
    },
    setBackButton() {
      /* VK uses the system back gesture → history (handled by the router). */
    },
    openLink(url) {
      window.open(url, "_blank", "noopener");
    },
    async scanQr() {
      const result = await bridge.send("VKWebAppOpenCodeReader").catch(() => null);
      return result?.code_data ?? null;
    },
    async share({ url }) {
      const result = await bridge.send("VKWebAppShare", { link: url }).catch(() => null);
      return Boolean(result);
    },
    async requestNotifications(groupId) {
      if (!groupId) return false;
      const result = await bridge.send("VKWebAppAllowMessagesFromGroup", { group_id: groupId }).catch(() => null);
      return Boolean(result?.result);
    },
    async addToHomeScreen() {
      const result = await bridge.send("VKWebAppAddToHomeScreen").catch(() => null);
      return Boolean(result?.result);
    },
    canAddToHomeScreen() {
      return /android/.test(params.get("vk_platform") ?? "");
    },
    setClosingConfirmation() {
      /* not available */
    },
    async getLocation() {
      // available: 0 or a "User denied" error (client error 4) means the user said no: don't ask
      // again through the browser. Only an unsupported or unanswered bridge call falls back.
      // The long wait leaves time for VK's own permission popup.
      const result = await withTimeout(
        bridge.send("VKWebAppGetGeodata").then(
          (data): GeoPoint | "denied" =>
            data.available ? { lat: Number(data.lat), lng: Number(data.long), accuracy: Number((data as { accuracy?: number }).accuracy) || undefined } : "denied",
          (error: { error_type?: string; error_data?: { error_code?: number } }) =>
            error?.error_type === "client_error" && error.error_data?.error_code === 4 ? ("denied" as const) : null,
        ),
        30_000,
      );
      if (result === "denied") return null;
      return result ?? browserLocation();
    },
  };
}

// ── Web / PWA ──────────────────────────────────────────────────────────────

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function webAdapter(): PlatformAdapter {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  let installPrompt: InstallPromptEvent | null = null;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
  });

  return {
    kind: "web",
    os: /iphone|ipad/i.test(navigator.userAgent) ? "ios" : /android/i.test(navigator.userAgent) ? "android" : "desktop",
    async init() {
      if ("serviceWorker" in navigator && import.meta.env.PROD) {
        navigator.serviceWorker.register("/sw.js").catch(() => undefined);
      }
    },
    async signInPayload() {
      return { provider: "web" };
    },
    startParam() {
      const params = new URLSearchParams(window.location.search);
      const fromQuery = params.get("startapp") ?? params.get("tgWebAppStartParam");
      if (fromQuery) return fromQuery;
      const profile = /^\/u\/([0-9a-f-]{36})/i.exec(window.location.pathname);
      return profile ? `u_${profile[1].replace(/-/g, "")}` : null;
    },
    languageCode() {
      return navigator.language ?? null;
    },
    colorScheme() {
      return media.matches ? "dark" : "light";
    },
    onColorSchemeChange(listener) {
      media.addEventListener("change", () => listener(media.matches ? "dark" : "light"));
    },
    applyColors(background) {
      document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute("content", background));
    },
    haptic(type) {
      if (!("vibrate" in navigator)) return;
      const pattern = { light: 8, selection: 5, medium: 14, heavy: 22, success: [10, 40, 18], warning: [18, 30, 18], error: [30, 40, 30] }[type];
      try {
        navigator.vibrate(pattern as number | number[]);
      } catch {
        /* ignored */
      }
    },
    setBackButton() {
      /* browser back → history */
    },
    openLink(url) {
      window.open(url, "_blank", "noopener");
    },
    async share({ url, text }) {
      if (navigator.share) {
        try {
          await navigator.share({ url, text, title: "UniShare" });
          return true;
        } catch {
          return false;
        }
      }
      await navigator.clipboard?.writeText(url).catch(() => undefined);
      return true;
    },
    async addToHomeScreen() {
      if (!installPrompt) return false;
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      installPrompt = null;
      return choice.outcome === "accepted";
    },
    canAddToHomeScreen() {
      return Boolean(installPrompt);
    },
    setClosingConfirmation() {
      /* not needed */
    },
    getLocation() {
      return browserLocation();
    },
  };
}

export const platform: PlatformAdapter = isTelegramLaunch() ? telegramAdapter() : isVkLaunch() ? vkAdapter() : webAdapter();
