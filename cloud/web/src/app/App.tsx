import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, Search } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { resolvedTheme, useApp, useUnreadCount, type Overlay, type Tab } from "./store";
import { platform } from "../platform/platform";
import { useT } from "../i18n/i18n";
import { Avatar, BrandBackground, CardStackIcon, Spinner, Toasts } from "../components/ui";
import { Landing, AuthErrorScreen } from "../screens/Landing";
import { Onboarding } from "../screens/Onboarding";
import { Greeting } from "../screens/Greeting";
import { FeedScreen } from "../screens/FeedScreen";
import { ChatsScreen } from "../screens/ChatsScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { SearchScreen, GameSheet, PlatformSheet } from "../screens/SearchScreen";
import { ProfileDetailSheet } from "../screens/ProfileDetail";
import { ChatSheet } from "../screens/ChatView";
import { AdminSheet } from "../screens/AdminSheet";
import { BugReportSheet } from "../screens/BugReportSheet";
import { SteamImportSheet } from "../screens/SteamImportSheet";
import { AvatarPickerSheet } from "../screens/AvatarPickerSheet";
import { StoryViewer } from "../screens/StoryViewer";
import { SettingsSheet } from "../screens/SettingsSheet";
import { EditProfileSheet, SubscriptionEditorSheet } from "../screens/EditProfileSheet";
import { SkillsSheet } from "../screens/SkillsSheet";
import { AirShareSheet } from "../screens/AirShareSheet";
import { LinkAccountsSheet } from "../screens/LinkSheet";
import { ReportSheet } from "../screens/ReportSheet";
import { RatingSheet } from "../screens/RatingSheet";
import { TransparencySheet } from "../screens/TransparencySheet";

let booted = false;
const COLORS = { light: "#F6F5FA", dark: "#0D0B19" };

function useThemeSync() {
  const theme = useApp(resolvedTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    platform.applyColors(COLORS[theme], COLORS[theme]);
  }, [theme]);
}

export function App() {
  const phase = useApp((state) => state.phase);
  const profile = useApp((state) => state.profile);
  const showGreeting = useApp((state) => state.showGreeting);
  useThemeSync();

  useEffect(() => {
    // StrictMode runs effects twice in development; boot exactly once.
    if (booted) return;
    booted = true;
    void useApp.getState().boot();
  }, []);

  let content: ReactNode;
  if (phase === "booting" || phase === "signing_in") {
    content = (
      <div className="center" style={{ height: "100%" }}>
        <Spinner size={30} />
      </div>
    );
  } else if (phase === "signed_out") {
    content = <Landing />;
  } else if (phase === "auth_error") {
    content = <AuthErrorScreen />;
  } else if (profile && !profile.onboardingComplete) {
    content = <Onboarding />;
  } else if (showGreeting) {
    content = <Greeting />;
  } else {
    content = <MainShell />;
  }

  return (
    <>
      <BrandBackground />
      <div className="app">{content}</div>
      <Toasts />
    </>
  );
}

function MainShell() {
  const tab = useApp((state) => state.tab);
  const overlays = useApp((state) => state.overlays);

  // Desktop: Escape closes the top sheet, like the close button. Nested layers
  // (lightbox, confirmations, menus) claim the key first through useEscape.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
      if (useApp.getState().overlays.length) useApp.getState().pop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          style={{ position: "absolute", inset: 0 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          {tab === "feed" && <FeedScreen />}
          {tab === "chats" && <ChatsScreen />}
          {tab === "profile" && <ProfileScreen />}
          {tab === "search" && <SearchScreen />}
        </motion.div>
      </AnimatePresence>
      <TabBar />
      <AnimatePresence>
        {overlays.map((overlay, index) => (
          // One stacking layer per overlay, above the tab bar: the last opened is drawn on top
          // whatever its type (a chat over a sheet, a sheet opened from a chat).
          <div key={`${overlay.type}-${index}`} style={{ position: "relative", zIndex: 50 + index }}>
            <OverlayView overlay={overlay} />
          </div>
        ))}
      </AnimatePresence>
    </>
  );
}

function OverlayView({ overlay }: { overlay: Overlay }) {
  switch (overlay.type) {
    case "profile":
      return <ProfileDetailSheet uid={overlay.uid} card={overlay.card} source={overlay.source} />;
    case "chat":
      return <ChatSheet chatId={overlay.chatId} />;
    case "story":
      return <StoryViewer index={overlay.index} />;
    case "settings":
      return <SettingsSheet />;
    case "edit":
      return <EditProfileSheet />;
    case "subscription":
      return <SubscriptionEditorSheet name={overlay.name} />;
    case "skills":
      return <SkillsSheet />;
    case "airshare":
      return <AirShareSheet />;
    case "game":
      return <GameSheet game={overlay.game} />;
    case "platform":
      return <PlatformSheet platformId={overlay.platform} />;
    case "link":
      return <LinkAccountsSheet />;
    case "report":
      return <ReportSheet uid={overlay.uid} username={overlay.username} />;
    case "rating":
      return <RatingSheet chatId={overlay.chatId} uid={overlay.uid} username={overlay.username} />;
    case "transparency":
      return <TransparencySheet />;
    case "admin":
      return <AdminSheet view={overlay.view} />;
    case "bug":
      return <BugReportSheet />;
    case "steamImport":
      return <SteamImportSheet />;
    case "avatar":
      return <AvatarPickerSheet />;
  }
}

/** TabBarView.swift: Liquid Glass capsule with feed / chats / profile, plus the search button. */
function TabBar() {
  const t = useT();
  const tab = useApp((state) => state.tab);
  const collapsed = useApp((state) => state.tabBarCollapsed);
  const lastTab = useApp((state) => state.lastTab);
  // Sheets and pushed screens cover the tab bar, as on iOS; on desktop it would poke out under a dialog.
  const hidden = useApp((state) => state.overlays.length > 0);
  const setTab = useApp((state) => state.setTab);
  const profile = useApp((state) => state.profile);
  const unread = useUnreadCount();
  const items: { id: Exclude<Tab, "search">; label: string; icon: ReactNode }[] = [
    { id: "feed", label: t("tab.feed"), icon: <CardStackIcon /> },
    { id: "chats", label: t("tab.chats"), icon: <MessageCircle size={27} strokeWidth={1.6} fill="currentColor" /> },
    {
      id: "profile",
      label: t("tab.profile"),
      icon: (
        <span className="tab-avatar">
          <Avatar url={profile?.avatarUrl} size={32} />
        </span>
      ),
    },
  ];
  // iOS 26: while searching, the tabs shrink into one button for the last tab.
  const searching = tab === "search";
  const isCollapsed = collapsed || searching;
  const shown = searching ? lastTab : tab;

  return (
    <AnimatePresence>
      {!hidden && (
        <motion.nav
          className={`tabbar-wrap ${tab === "search" ? "searching" : ""} ${tab === "chats" ? "chats" : ""}`}
          aria-label="Navigation"
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
        >
          <div
            className={`tabbar liquid ${isCollapsed ? "collapsed" : ""} ${searching ? "searching" : ""}`}
            onClick={() => {
              if (searching) setTab(lastTab);
              else if (isCollapsed) useApp.setState({ tabBarCollapsed: false });
            }}
          >
            {items.map((item) => (
              <button
                key={item.id}
                className={`tab ${shown === item.id ? "active" : ""}`}
                aria-label={item.label}
                aria-current={tab === item.id}
                onClick={(event) => {
                  if (isCollapsed) return;
                  event.stopPropagation();
                  setTab(item.id);
                }}
              >
                {shown === item.id && !searching && <motion.span layoutId="tab-pill" className="tab-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                {item.icon}
                {item.id === "chats" && unread > 0 && <span className="badge red">{unread > 99 ? "99+" : unread}</span>}
              </button>
            ))}
          </div>
          <button className={`search-fab liquid ${tab === "search" ? "active" : ""}`} aria-label={t("search")} onClick={() => setTab("search")}>
            <Search size={26} strokeWidth={2.6} />
          </button>
        </motion.nav>
      )}
    </AnimatePresence>
  );
}
