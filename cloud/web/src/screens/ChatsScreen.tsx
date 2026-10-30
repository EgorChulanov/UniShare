// Port of UniShare/Features/Chat/ChatsView.swift; on wide screens the list and
// the open conversation sit side by side like the iPad split view.
import { Check, MessageCircle, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ChatSummary, DiscoveryKind, LikeRequestItem } from "@unishare/shared";
import { collapseOnScroll, useApp } from "../app/store";
import { api } from "../lib/api";
import { useI18n, useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { Avatar, relativeTime } from "../components/ui";
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
  const t = useT();
  const wide = useMediaQuery("(min-width: 1000px)");
  const [selected, setSelected] = useState<string | null>(null);
  const chats = useApp((state) => state.chats);
  const onScroll = useMemo(() => collapseOnScroll(), []);

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
      <div className="screen" onScroll={onScroll}>
        <div className="container">
          <ChatList onOpen={open} selected={null} />
        </div>
      </div>
    );
  }

  return (
    <div className="split" style={{ paddingTop: "var(--safe-top)" }}>
      <div className="split-list" style={{ paddingBottom: "var(--tabbar-space)" }}>
        <ChatList onOpen={open} selected={selected} />
      </div>
      <div className="split-detail">
        {selected ? (
          <ChatView key={selected} chatId={selected} embedded onClose={() => setSelected(null)} />
        ) : (
          <div className="empty" style={{ margin: "auto", padding: 40 }}>
            <MessageCircle size={46} strokeWidth={1.2} className="secondary" />
            <h3>{t("chat.select")}</h3>
            <p>{t("chat.select.subtitle")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function TypeBadge({ kind }: { kind: DiscoveryKind }) {
  const t = useT();
  return <span className="type-badge">{t(kind === "skills" ? "feed.segment.skills" : "feed.segment.teammates")}</span>;
}

function ChatList({ onOpen, selected }: { onOpen(chatId: string): void; selected: string | null }) {
  const t = useT();
  const chats = useApp((state) => state.chats);
  const chatsLoaded = useApp((state) => state.chatsLoaded);
  const requests = useApp((state) => state.requests);

  return (
    <div style={{ paddingTop: 8 }}>
      {requests.length > 0 && (
        <div className="col" style={{ gap: 2, padding: "4px 0 10px" }}>
          <h2 className="section-title" style={{ padding: "8px 18px 6px" }}>
            {t("chats.requests")}
          </h2>
          {requests.map((request) => (
            <RequestRow key={request.id} request={request} onOpen={onOpen} />
          ))}
        </div>
      )}

      {chatsLoaded && chats.length === 0 && requests.length === 0 ? (
        <div className="empty">
          <MessageCircle size={46} strokeWidth={1.2} className="secondary" />
          <h3>{t("chats.empty")}</h3>
          <p>{t("chats.empty.subtitle")}</p>
        </div>
      ) : (
        <>
          {requests.length > 0 && chats.length > 0 && (
            <h2 className="section-title" style={{ padding: "8px 18px 6px" }}>
              {t("chats.matches")}
            </h2>
          )}
          {chats.map((chat, index) => {
            const active = chat.id === selected;
            // No hairline next to the highlighted row: the pill already separates it.
            const divider = !active && chats[index + 1]?.id !== selected && index < chats.length - 1;
            return (
              <div key={chat.id}>
                <ChatRow chat={chat} active={active} onOpen={onOpen} />
                {divider && <div className="divider" style={{ marginLeft: 85 }} />}
              </div>
            );
          })}
        </>
      )}
    </div>
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
    <div className="row" style={{ gap: 13, padding: "11px 18px" }}>
      <button onClick={() => useApp.getState().push({ type: "profile", uid: request.from.uid, card: request.from })} aria-label={request.from.username}>
        <Avatar url={request.from.avatarUrl} size={54} ring />
      </button>
      <div className="col grow" style={{ gap: 5, alignItems: "flex-start", minWidth: 0 }}>
        <span className="ellipsis" style={{ fontSize: 15, fontWeight: 600, maxWidth: "100%" }}>
          {request.from.username}
        </span>
        <TypeBadge kind={request.kind} />
      </div>
      <button className="round-action red" onClick={decline} disabled={busy} aria-label={t("chats.decline")}>
        <X size={15} strokeWidth={3} />
      </button>
      <button className="round-action green" onClick={accept} disabled={busy} aria-label={t("chats.accept")}>
        <Check size={15} strokeWidth={3} />
      </button>
    </div>
  );
}

function ChatRow({ chat, active, onOpen }: { chat: ChatSummary; active: boolean; onOpen(chatId: string): void }) {
  const t = useT();
  const language = useI18n((state) => state.language);
  const typing = useApp((state) => Boolean(state.typing[chat.id]));
  const unread = chat.unread;
  const preview = chat.lastMessage ? (chat.lastMessage === "📷" ? `📷 ${t("chat.photo")}` : chat.lastMessage) : t("chat.empty");

  return (
    <button className={`list-row${active ? " active" : ""}`} onClick={() => onOpen(chat.id)}>
      <Avatar url={chat.partner.avatarUrl} size={54} online={chat.partner.isOnline} />
      <div className="col grow" style={{ gap: 5, minWidth: 0 }}>
        <div className="row" style={{ gap: 7, minWidth: 0 }}>
          <span className="ellipsis" style={{ fontSize: 16, fontWeight: unread > 0 ? 700 : 600 }}>
            {chat.partner.username}
          </span>
          <TypeBadge kind={chat.kind} />
        </div>
        <span className="ellipsis" style={{ fontSize: 14, color: typing ? "var(--accent-text)" : unread > 0 ? "var(--text)" : "var(--text-2)" }}>
          {typing ? t("chat.typing") : preview}
        </span>
      </div>
      <div className="col" style={{ alignItems: "flex-end", alignSelf: "stretch", gap: 7, paddingTop: 2, flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: unread > 0 ? "var(--accent-text)" : "var(--text-2)", fontWeight: unread > 0 ? 600 : 400 }}>
          {relativeTime(chat.lastMessageAt, language)}
        </span>
        {unread > 0 && <span className="badge">{unread > 99 ? "99+" : unread}</span>}
      </div>
    </button>
  );
}
