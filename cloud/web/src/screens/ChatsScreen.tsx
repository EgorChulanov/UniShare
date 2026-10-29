import { Check, Inbox, MessageCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ChatSummary, LikeRequestItem } from "@unishare/shared";
import { useApp } from "../app/store";
import { api } from "../lib/api";
import { useI18n, useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { Avatar, Empty, relativeTime } from "../components/ui";
import { ChatView } from "./ChatView";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

export function ChatsScreen() {
  const wide = useMediaQuery("(min-width: 1100px)");
  const [selected, setSelected] = useState<string | null>(null);
  const chats = useApp((state) => state.chats);

  useEffect(() => {
    void useApp.getState().loadChats();
    void useApp.getState().loadRequests();
  }, []);

  // Drop the selection when the chat disappears (blocked or deleted).
  useEffect(() => {
    if (selected && useApp.getState().chatsLoaded && !chats.some((chat) => chat.id === selected)) setSelected(null);
  }, [chats, selected]);

  const open = (chatId: string) => {
    if (wide) setSelected(chatId);
    else useApp.getState().push({ type: "chat", chatId });
  };

  if (!wide) {
    return (
      <div className="screen">
        <div className="screen-narrow">
          <ChatList onOpen={open} selected={null} />
        </div>
      </div>
    );
  }

  return (
    <div className="chat-layout">
      <div className="chat-list-pane screen" style={{ flex: "0 0 380px" }}>
        <ChatList onOpen={open} selected={selected} />
      </div>
      <div className="chat-pane">
        {selected ? (
          <ChatView key={selected} chatId={selected} embedded onClose={() => setSelected(null)} />
        ) : (
          <SelectChatPlaceholder />
        )}
      </div>
    </div>
  );
}

function SelectChatPlaceholder() {
  const t = useT();
  return (
    <div className="center" style={{ flex: 1 }}>
      <Empty icon={<MessageCircle size={32} />} title={t("chat.select")} subtitle={t("chat.select.subtitle")} />
    </div>
  );
}

function ChatList({ onOpen, selected }: { onOpen(chatId: string): void; selected: string | null }) {
  const t = useT();
  const chats = useApp((state) => state.chats);
  const chatsLoaded = useApp((state) => state.chatsLoaded);
  const requests = useApp((state) => state.requests);

  return (
    <>
      <h1 className="screen-title">{t("tab.chats")}</h1>

      {requests.length > 0 && (
        <>
          <div className="section-title">
            {t("chats.requests")} <span className="badge">{requests.length}</span>
          </div>
          <div className="glass settings-group list" style={{ marginBottom: 8 }}>
            {requests.map((request) => (
              <RequestRow key={request.id} request={request} onOpen={onOpen} />
            ))}
          </div>
        </>
      )}

      {requests.length > 0 && chats.length > 0 && <div className="section-title">{t("chats.matches")}</div>}

      {!chatsLoaded && chats.length === 0 ? (
        <div className="col" style={{ gap: 10 }}>
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="skeleton" style={{ height: 68 }} />
          ))}
        </div>
      ) : chats.length === 0 && requests.length === 0 ? (
        <Empty icon={<Inbox size={32} />} title={t("chats.empty")} subtitle={t("chats.empty.subtitle")}>
          <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => useApp.getState().setTab("feed")}>
            {t("tab.feed")}
          </button>
        </Empty>
      ) : (
        <div className="list">
          {chats.map((chat) => (
            <ChatRow key={chat.id} chat={chat} active={chat.id === selected} onOpen={onOpen} />
          ))}
        </div>
      )}
    </>
  );
}

function RequestRow({ request, onOpen }: { request: LikeRequestItem; onOpen(chatId: string): void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);

  const remove = () => useApp.setState((state) => ({ requests: state.requests.filter((item) => item.id !== request.id) }));

  const accept = async () => {
    setBusy(true);
    try {
      const { chatId } = await api.acceptRequest(request.id);
      platform.haptic("success");
      remove();
      await useApp.getState().loadChats();
      onOpen(chatId);
    } catch (error) {
      useApp.getState().toastError(error);
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    setBusy(true);
    try {
      await api.declineRequest(request.id);
      platform.haptic("light");
      remove();
    } catch (error) {
      useApp.getState().toastError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="list-item">
      <button
        className="row grow"
        style={{ textAlign: "left", gap: 12 }}
        onClick={() => useApp.getState().push({ type: "profile", uid: request.from.uid, card: request.from })}
      >
        <Avatar url={request.from.avatarUrl} name={request.from.username} size={48} online={request.from.isOnline} />
        <div className="grow">
          <div className="title ellipsis">{request.from.username}</div>
          <div className="subtitle ellipsis">{t(request.kind === "skills" ? "chats.request.skills" : "chats.request.teammates")}</div>
        </div>
      </button>
      <button className="icon-btn small" onClick={decline} disabled={busy} aria-label={t("chats.decline")} title={t("chats.decline")}>
        <X size={18} color="var(--danger)" />
      </button>
      <button
        className="icon-btn small"
        onClick={accept}
        disabled={busy}
        aria-label={t("chats.accept")}
        title={t("chats.accept")}
        style={{ background: "var(--success)", color: "#fff", border: 0 }}
      >
        <Check size={18} />
      </button>
    </div>
  );
}

function ChatRow({ chat, active, onOpen }: { chat: ChatSummary; active: boolean; onOpen(chatId: string): void }) {
  const t = useT();
  const language = useI18n((state) => state.language);
  const me = useApp((state) => state.profile?.uid);
  const typing = useApp((state) => Boolean(state.typing[chat.id]));

  const preview = chat.lastMessage
    ? `${chat.lastSenderId === me ? t("chat.you") : ""}${chat.lastMessage === "📷" ? `📷 ${t("chat.photo")}` : chat.lastMessage}`
    : t("chat.empty");

  return (
    <button className={`list-item ${active ? "active" : ""}`} onClick={() => onOpen(chat.id)}>
      <Avatar url={chat.partner.avatarUrl} name={chat.partner.username} size={52} online={chat.partner.isOnline} />
      <div className="grow">
        <div className="row" style={{ gap: 8 }}>
          <span className="title ellipsis">{chat.partner.username}</span>
          <span className="pill">{t(chat.kind === "skills" ? "feed.segment.skills" : "feed.segment.teammates")}</span>
          <span className="grow" />
          <span className="faint" style={{ fontSize: 12, flexShrink: 0 }}>
            {relativeTime(chat.lastMessageAt, language)}
          </span>
        </div>
        <div className="row" style={{ gap: 8, marginTop: 2 }}>
          {typing ? (
            <span className="typing grow ellipsis">{t("chat.typing")}</span>
          ) : (
            <span className="subtitle grow ellipsis" style={chat.unread > 0 ? { color: "var(--text)", fontWeight: 700 } : undefined}>
              {preview}
            </span>
          )}
          {chat.unread > 0 && <span className="badge" style={{ background: "var(--primary)" }}>{chat.unread > 99 ? "99+" : chat.unread}</span>}
        </div>
      </div>
    </button>
  );
}
