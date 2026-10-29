import { motion } from "framer-motion";
import { Ban, Check, CheckCheck, ChevronLeft, Clock, EllipsisVertical, Flag, ImagePlus, SendHorizontal, ShieldCheck, Star, Trash2 } from "lucide-react";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type UIEvent } from "react";
import type { ChatDetails, ChatMessage } from "@unishare/shared";
import { useApp } from "../app/store";
import { ApiError, api, compressImage, mediaUrl } from "../lib/api";
import { realtime } from "../lib/realtime";
import { platform } from "../platform/platform";
import { errorMessage, useI18n, useT, type Language } from "../i18n/i18n";
import { Avatar, PROVIDER_COLORS, ProviderIcon, Spinner } from "../components/ui";

const PAGE_SIZE = 50;
const TYPING_INTERVAL = 2500;
const EMPTY: ChatMessage[] = [];

export function ChatSheet({ chatId }: { chatId: string }) {
  const pop = useApp((state) => state.pop);
  return (
    <motion.div
      className="chat-screen"
      style={{ position: "fixed", inset: 0, zIndex: 70, background: "var(--bg)" }}
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 420, damping: 40 }}
    >
      <ChatView chatId={chatId} onClose={pop} />
    </motion.div>
  );
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayLabel(iso: string, language: Language, t: (key: string) => string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(date, today)) return t("chat.today");
  if (sameDay(date, yesterday)) return t("chat.yesterday");
  return date.toLocaleDateString(language, {
    day: "numeric",
    month: "long",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function removeLocalMessage(chatId: string, messageId: string) {
  const list = useApp.getState().messages[chatId];
  if (list) useApp.getState().setMessages(chatId, list.filter((message) => message.id !== messageId));
}

export function ChatView({ chatId, embedded, onClose }: { chatId: string; embedded?: boolean; onClose?(): void }) {
  const t = useT();
  const language = useI18n((state) => state.language);
  const me = useApp((state) => state.profile?.uid);
  const messages = useApp((state) => state.messages[chatId] ?? EMPTY);
  const summary = useApp((state) => state.chats.find((chat) => chat.id === chatId));
  const isTyping = useApp((state) => Boolean(state.typing[chatId]));

  const [details, setDetails] = useState<ChatDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastTypingRef = useRef(0);
  const prependRef = useRef<number | null>(null);
  const lastIdRef = useRef<string | null>(null);

  const partner = details?.partner ?? summary?.partner ?? null;
  const close = useCallback(() => onClose?.(), [onClose]);

  const markRead = useCallback(() => {
    void api.markRead(chatId).catch(() => undefined);
    useApp.setState((state) => ({ chats: state.chats.map((chat) => (chat.id === chatId ? { ...chat, unread: 0 } : chat)) }));
  }, [chatId]);

  // Chat details (contacts, review permission) — a 404 means blocked/removed.
  useEffect(() => {
    let cancelled = false;
    api
      .chat(chatId)
      .then((value) => !cancelled && setDetails(value))
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 404) {
          useApp.getState().toast(t("chat.blocked"), "error");
          useApp.setState((state) => ({ chats: state.chats.filter((chat) => chat.id !== chatId) }));
          close();
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // Latest messages.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .messages(chatId)
      .then((list) => {
        if (cancelled) return;
        useApp.getState().setMessages(chatId, list);
        setHasMore(list.length >= PAGE_SIZE);
        markRead();
      })
      .catch((error) => !cancelled && !(error instanceof ApiError && error.status === 404) && useApp.getState().toastError(error))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [chatId, markRead]);

  // Scroll handling: keep position when older messages are prepended,
  // stick to the bottom for new ones.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (prependRef.current !== null) {
      list.scrollTop += list.scrollHeight - prependRef.current;
      prependRef.current = null;
      return;
    }
    const last = messages[messages.length - 1];
    if (!last || last.id === lastIdRef.current) return;
    const firstRender = lastIdRef.current === null;
    lastIdRef.current = last.id;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 160;
    if (firstRender || nearBottom || last.senderId === me) {
      list.scrollTo({ top: list.scrollHeight, behavior: firstRender ? "auto" : "smooth" });
    }
    if (!firstRender && last.senderId !== me && document.visibilityState === "visible") markRead();
  }, [messages, me, markRead]);

  // Mark as read when the app returns to the foreground on this chat.
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && markRead();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [markRead]);

  const loadOlder = async () => {
    const current = useApp.getState().messages[chatId] ?? [];
    if (!current.length || loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    try {
      const older = await api.messages(chatId, current[0].createdAt);
      setHasMore(older.length >= PAGE_SIZE);
      if (older.length) {
        prependRef.current = listRef.current?.scrollHeight ?? null;
        const latest = useApp.getState().messages[chatId] ?? [];
        const known = new Set(latest.map((message) => message.id));
        useApp.getState().setMessages(chatId, [...older.filter((message) => !known.has(message.id)), ...latest]);
      }
    } catch (error) {
      useApp.getState().toastError(error);
    } finally {
      setLoadingOlder(false);
    }
  };

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    if (event.currentTarget.scrollTop < 80) void loadOlder();
  };

  const autosize = () => {
    const area = textareaRef.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight, 140)}px`;
  };

  const onChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setText(event.target.value);
    autosize();
    const now = Date.now();
    if (event.target.value && now - lastTypingRef.current > TYPING_INTERVAL) {
      lastTypingRef.current = now;
      realtime.send({ type: "typing", chatId });
    }
  };

  const reportSendError = (error: unknown) => {
    if (error instanceof ApiError && error.code === "content_blocked") useApp.getState().toast(t("chat.error.content.blocked"), "error");
    else useApp.getState().toast(errorMessage(error), "error");
  };

  const addPending = (id: string) => setPending((set) => new Set(set).add(id));
  const clearPending = (id: string) =>
    setPending((set) => {
      const next = new Set(set);
      next.delete(id);
      return next;
    });

  const optimistic = (id: string, values: Pick<ChatMessage, "text" | "imageUrl">): ChatMessage => ({
    id,
    chatId,
    senderId: me ?? "",
    createdAt: new Date().toISOString(),
    readAt: null,
    ...values,
  });

  const sendText = async () => {
    const value = text.trim();
    if (!value || sending || !me) return;
    const id = crypto.randomUUID();
    setText("");
    requestAnimationFrame(autosize);
    addPending(id);
    useApp.getState().upsertMessage(optimistic(id, { text: value, imageUrl: null }));
    platform.haptic("light");
    try {
      const saved = await api.sendMessage(chatId, { id, text: value });
      useApp.getState().upsertMessage(saved);
    } catch (error) {
      removeLocalMessage(chatId, id);
      setText((current) => current || value);
      reportSendError(error);
    } finally {
      clearPending(id);
    }
  };

  const sendImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !me) return;
    const id = crypto.randomUUID();
    setSending(true);
    let preview: string | null = null;
    try {
      const image = await compressImage(file);
      preview = URL.createObjectURL(image);
      addPending(id);
      useApp.getState().upsertMessage(optimistic(id, { text: null, imageUrl: preview }));
      const { imageUrl } = await api.uploadChatImage(chatId, image);
      const saved = await api.sendMessage(chatId, { id, imageUrl });
      useApp.getState().upsertMessage(saved);
    } catch (error) {
      removeLocalMessage(chatId, id);
      reportSendError(error);
    } finally {
      clearPending(id);
      setSending(false);
      if (preview) setTimeout(() => URL.revokeObjectURL(preview!), 30_000);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const desktop = window.matchMedia("(pointer: fine)").matches;
    if (event.key === "Enter" && !event.shiftKey && desktop && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void sendText();
    }
  };

  const openProfile = () => {
    if (partner) useApp.getState().push({ type: "profile", uid: partner.uid, card: partner });
  };

  const removeChatLocally = () => useApp.setState((state) => ({ chats: state.chats.filter((chat) => chat.id !== chatId) }));

  const block = async () => {
    setMenuOpen(false);
    if (!partner || !window.confirm(t("chat.block.confirmation"))) return;
    try {
      await api.block(partner.uid);
      removeChatLocally();
      useApp.getState().toast(t("chat.blocked"), "success");
      close();
    } catch (error) {
      useApp.getState().toastError(error);
    }
  };

  const remove = async () => {
    setMenuOpen(false);
    if (!window.confirm(t("chat.delete.confirm"))) return;
    try {
      await api.hideChat(chatId);
      removeChatLocally();
      useApp.getState().toast(t("chat.deleted"), "success");
      close();
    } catch (error) {
      useApp.getState().toastError(error);
    }
  };

  const status = isTyping ? t("chat.typing") : partner?.isOnline ? t("chat.online") : t("chat.offline");

  return (
    <div className="chat-screen">
      <header className="chat-header glass glass-strong" style={{ borderRadius: 0, borderWidth: "0 0 1px 0" }}>
        {!embedded && (
          <button className="icon-btn small" onClick={close} aria-label={t("chat.back")}>
            <ChevronLeft size={22} />
          </button>
        )}
        <button className="who" onClick={openProfile} disabled={!partner}>
          <Avatar url={partner?.avatarUrl} name={partner?.username} size={40} online={partner?.isOnline} />
          <div className="grow">
            <div className="ellipsis" style={{ fontWeight: 800 }}>{partner?.username ?? "…"}</div>
            <div className={isTyping ? "typing" : "faint"} style={{ fontSize: 12, fontWeight: 700 }}>
              {status}
            </div>
          </div>
        </button>
        <div style={{ position: "relative" }}>
          <button className="icon-btn small" onClick={() => setMenuOpen((open) => !open)} aria-label={t("chat.more")} aria-expanded={menuOpen}>
            <EllipsisVertical size={20} />
          </button>
          {menuOpen && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 3 }} onClick={() => setMenuOpen(false)} />
              <motion.div
                className="glass glass-strong chat-menu"
                initial={{ opacity: 0, scale: 0.92, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 34 }}
              >
                {details?.contacts.map((contact) => (
                  <button
                    key={contact.provider}
                    className="settings-row"
                    onClick={() => {
                      setMenuOpen(false);
                      platform.openLink(contact.url);
                    }}
                  >
                    <span className="ico" style={{ background: PROVIDER_COLORS[contact.provider] }}>
                      <ProviderIcon provider={contact.provider} />
                    </span>
                    <span className="grow">
                      {t(contact.provider === "telegram" ? "chat.contact.telegram" : "chat.contact.vk")}
                      <div className="faint" style={{ fontSize: 12 }}>{contact.label}</div>
                    </span>
                  </button>
                ))}
                {details?.canReview && partner && (
                  <button
                    className="settings-row"
                    onClick={() => {
                      setMenuOpen(false);
                      useApp.getState().push({ type: "rating", chatId, uid: partner.uid, username: partner.username });
                    }}
                  >
                    <span className="ico" style={{ background: "#FFB020" }}><Star size={18} /></span>
                    {t("chat.review.title")}
                  </button>
                )}
                {partner && (
                  <button
                    className="settings-row"
                    onClick={() => {
                      setMenuOpen(false);
                      useApp.getState().push({ type: "report", uid: partner.uid, username: partner.username });
                    }}
                  >
                    <span className="ico" style={{ background: "#FF9F0A" }}><Flag size={18} /></span>
                    {t("chat.report")}
                  </button>
                )}
                <button className="settings-row" onClick={block} style={{ color: "var(--danger)" }}>
                  <span className="ico" style={{ background: "var(--danger)" }}><Ban size={18} /></span>
                  {t("chat.block")}
                </button>
                <button className="settings-row" onClick={remove} style={{ color: "var(--danger)" }}>
                  <span className="ico" style={{ background: "#8E8E93" }}><Trash2 size={18} /></span>
                  {t("chat.delete")}
                </button>
              </motion.div>
            </>
          )}
        </div>
      </header>

      <div className="messages" ref={listRef} onScroll={onScroll}>
        <div className="safety-note glass">
          <ShieldCheck size={18} color="var(--primary)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{t("chat.safety.notice")}</span>
        </div>
        {(loadingOlder || (loading && messages.length === 0)) && (
          <div className="center" style={{ padding: 12 }}>
            <Spinner size={22} />
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="empty" style={{ padding: "32px 16px" }}>
            <h3>{t("chat.empty")}</h3>
            <div>{t("chat.empty.subtitle")}</div>
          </div>
        )}
        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const newDay = !previous || !sameDay(new Date(previous.createdAt), new Date(message.createdAt));
          const mine = message.senderId === me;
          const time = new Date(message.createdAt).toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" });
          const ticks = pending.has(message.id) ? <Clock size={12} /> : message.readAt ? <CheckCheck size={13} /> : <Check size={13} />;
          const image = mediaUrl(message.imageUrl);
          return (
            <Fragment key={message.id}>
              {newDay && <div className="day-sep">{dayLabel(message.createdAt, language, t)}</div>}
              {image && (
                <div className={`bubble photo ${mine ? "mine" : "theirs"}`}>
                  <img src={image} alt={t("chat.photo")} loading="lazy" onClick={() => setLightbox(image)} />
                  {!message.text && (
                    <div className="meta" style={{ color: "var(--text-2)", opacity: 1 }}>
                      {time} {mine && ticks}
                    </div>
                  )}
                </div>
              )}
              {message.text && (
                <div className={`bubble ${mine ? "mine" : "theirs"}`}>
                  {message.text}
                  <div className="meta">
                    {time} {mine && ticks}
                  </div>
                </div>
              )}
            </Fragment>
          );
        })}
      </div>

      <div className="composer glass glass-strong" style={{ borderRadius: 0, borderWidth: "1px 0 0 0" }}>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={sendImage} />
        <button className="icon-btn" onClick={() => fileRef.current?.click()} disabled={sending} aria-label={t("chat.attach")}>
          {sending ? <Spinner size={20} /> : <ImagePlus size={20} color="var(--primary)" />}
        </button>
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          maxLength={1000}
          placeholder={t("chat.placeholder")}
          onChange={onChange}
          onKeyDown={onKeyDown}
          enterKeyHint="send"
        />
        <button
          className="icon-btn"
          onClick={() => void sendText()}
          disabled={!text.trim()}
          aria-label={t("chat.send")}
          style={text.trim() ? { background: "var(--primary)", color: "#fff", border: 0 } : undefined}
        >
          <SendHorizontal size={20} />
        </button>
      </div>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)} role="dialog" aria-modal>
          <img src={lightbox} alt={t("chat.photo")} />
        </div>
      )}
    </div>
  );
}
