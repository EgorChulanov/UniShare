import { AnimatePresence, motion } from "framer-motion";
import { Layers, MessageCircle } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { resolvedTheme, useApp, useUnreadCount, type Overlay, type Tab } from "./store";
import { platform } from "../platform/platform";
import { useT } from "../i18n/i18n";
import { Avatar, Spinner, Toasts } from "../components/ui";
import { Landing, AuthErrorScreen } from "../screens/Landing";
import { Onboarding } from "../screens/Onboarding";
import { Greeting } from "../screens/Greeting";
import { FeedScreen } from "../screens/FeedScreen";
import { ChatsScreen } from "../screens/ChatsScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { ProfileDetailSheet } from "../screens/ProfileDetail";
import { ChatSheet } from "../screens/ChatView";
import { StoryViewer } from "../screens/StoryViewer";
import { SettingsSheet } from "../screens/SettingsSheet";
import { EditProfileSheet } from "../screens/EditProfileSheet";
import { SkillsSheet } from "../screens/SkillsSheet";
import { NearbySheet } from "../screens/NearbySheet";
import { LinkAccountsSheet } from "../screens/LinkSheet";
import { ReportSheet } from "../screens/ReportSheet";
import { RatingSheet } from "../screens/RatingSheet";
import { TransparencySheet } from "../screens/TransparencySheet";
import { MatchOverlay } from "../screens/MatchOverlay";

let booted = false;
const COLORS = { light: "#F8F7F4", dark: "#0E1117" };

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
        <Spinner size={36} />
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
      <div className="aurora">
        <span />
      </div>
      <div className="app">{content}</div>
      <Toasts />
    </>
  );
}

function MainShell() {
  const tab = useApp((state) => state.tab);
  const overlays = useApp((state) => state.overlays);
  const match = useApp((state) => state.match);

  return (
    <>
      <Sidebar />
      <main className="main">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {tab === "feed" && <FeedScreen />}
            {tab === "chats" && <ChatsScreen />}
            {tab === "profile" && <ProfileScreen />}
          </motion.div>
        </AnimatePresence>
      </main>
      <TabBar />
      <AnimatePresence>
        {overlays.map((overlay, index) => (
          <OverlayView key={`${overlay.type}-${index}`} overlay={overlay} />
        ))}
      </AnimatePresence>
      <AnimatePresence>{match && <MatchOverlay key="match" />}</AnimatePresence>
    </>
  );
}

function OverlayView({ overlay }: { overlay: Overlay }) {
  switch (overlay.type) {
    case "profile":
      return <ProfileDetailSheet uid={overlay.uid} card={overlay.card} />;
    case "chat":
      return <ChatSheet chatId={overlay.chatId} />;
    case "story":
      return <StoryViewer index={overlay.index} />;
    case "settings":
      return <SettingsSheet />;
    case "edit":
      return <EditProfileSheet />;
    case "skills":
      return <SkillsSheet />;
    case "nearby":
      return <NearbySheet />;
    case "link":
      return <LinkAccountsSheet />;
    case "report":
      return <ReportSheet uid={overlay.uid} username={overlay.username} />;
    case "rating":
      return <RatingSheet chatId={overlay.chatId} uid={overlay.uid} username={overlay.username} />;
    case "transparency":
      return <TransparencySheet />;
  }
}

function FeedIcon({ active }: { active: boolean }) {
  return active ? <Layers size={23} strokeWidth={2.4} fill="currentColor" fillOpacity={0.25} /> : <Layers size={23} strokeWidth={2.2} />;
}

function TabBar() {
  const t = useT();
  const tab = useApp((state) => state.tab);
  const setTab = useApp((state) => state.setTab);
  const profile = useApp((state) => state.profile);
  const unread = useUnreadCount();
  const items: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: "feed", label: t("tab.feed"), icon: <FeedIcon active={tab === "feed"} /> },
    { id: "chats", label: t("tab.chats"), icon: <MessageCircle size={23} strokeWidth={2.3} fill={tab === "chats" ? "currentColor" : "none"} fillOpacity={0.25} /> },
    { id: "profile", label: t("tab.profile"), icon: <span className="tab-avatar"><Avatar url={profile?.avatarUrl} name={profile?.username} size={25} /></span> },
  ];
  return (
    <nav className="tabbar glass glass-strong" aria-label="Navigation">
      {items.map((item) => (
        <button key={item.id} className={`tab ${tab === item.id ? "active" : ""}`} onClick={() => setTab(item.id)} aria-current={tab === item.id}>
          {item.icon}
          <span>{item.label}</span>
          {item.id === "chats" && unread > 0 && <span className="badge">{unread > 99 ? "99+" : unread}</span>}
        </button>
      ))}
    </nav>
  );
}

function Sidebar() {
  const t = useT();
  const tab = useApp((state) => state.tab);
  const setTab = useApp((state) => state.setTab);
  const profile = useApp((state) => state.profile);
  const unread = useUnreadCount();
  return (
    <aside className="sidebar glass">
      <div className="brand">
        <img src="/icons/icon-192.png" alt="" />
        UniShare
      </div>
      <button className={`side-item ${tab === "feed" ? "active" : ""}`} onClick={() => setTab("feed")}>
        <FeedIcon active={tab === "feed"} /> {t("tab.feed")}
      </button>
      <button className={`side-item ${tab === "chats" ? "active" : ""}`} onClick={() => setTab("chats")}>
        <MessageCircle size={22} /> <span className="grow">{t("tab.chats")}</span>
        {unread > 0 && <span className="badge">{unread}</span>}
      </button>
      <button className={`side-item ${tab === "profile" ? "active" : ""}`} onClick={() => setTab("profile")}>
        <Avatar url={profile?.avatarUrl} name={profile?.username} size={24} /> {t("tab.profile")}
      </button>
      <div className="grow" />
      <div className="faint" style={{ fontSize: 12, padding: "0 12px" }}>
        UniShare · {platform.kind === "telegram" ? "Telegram" : platform.kind === "vk" ? "VK" : "Web"}
      </div>
    </aside>
  );
}
