// Port of UniShare/Features/Chat/ChatView.swift.
import { AnimatePresence, motion, useIsPresent } from "framer-motion";
import { ArrowUp, BadgeCheck, CheckCircle2, ChevronLeft, ChevronRight, Clock, Ellipsis, Flag, Images, ShieldCheck, Trash2, UserX } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type UIEvent } from "react";
import type { ChatDetails, ChatMessage } from "@unishare/shared";
import { useApp } from "../app/store";
import { ApiError, api, compressImage, mediaUrl } from "../lib/api";
import { realtime } from "../lib/realtime";
import { platform } from "../platform/platform";
import { errorMessage, useI18n, useT } from "../i18n/i18n";
import { ActionSheet, Avatar, PROVIDER_COLORS, ProviderIcon, SelectedDot, Spinner, useEscape } from "../components/ui";

const PAGE_SIZE = 50;
const TYPING_INTERVAL = 2500;
const EMPTY: ChatMessage[] = [];

export function ChatSheet({ chatId }: { chatId: string }) {
  // Closes this chat only: a request may finish after it was closed or covered by a sheet.
  // Once a pop is on its way, later calls (the list update right after it) do nothing.
  const closing = useRef(false);
  // A sheet on its way out (already closed through history) never pops again; the
  // ref is read at call time, since block/delete/404 handlers hold an older `close`.
  // A sheet that was closing can be reused when a chat opens at the same layer during its exit.
  const isPresent = useIsPresent();
  const presentRef = useRef(isPresent);
  useLayoutEffect(() => {
    presentRef.current = isPresent;
    if (isPresent) closing.current = false;
  }, [isPresent]);
  const close = useCallback(() => {
    const top = useApp.getState().overlays.at(-1);
    if (!presentRef.current || closing.current || top?.type !== "chat" || top.chatId !== chatId) return;
    closing.current = true;
    useApp.getState().pop();
  }, [chatId]);
  return (
    <motion.div className="pushed" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 420, damping: 42 }}>
      <ChatView chatId={chatId} onClose={close} />
    </motion.div>
  );
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
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  // Escape closes the photo or the menu, not the whole chat (the action sheets handle it themselves).
  useEscape(() => setLightbox(null), lightbox !== null);
  useEscape(() => setMenuOpen(false), menuOpen);

  // The chat left the list while open (blocked from the partner's profile, deleted elsewhere): close it.
  // Retried whenever the overlay stack changes, since a covered chat closes once it is on top again.
  const overlayCount = useApp((state) => state.overlays.length);
  const listedRef = useRef(false);
  useEffect(() => {
    if (summary) listedRef.current = true;
    else if (listedRef.current) close();
  }, [summary, close, overlayCount]);

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

  // RatingSheet reports a submitted review so the banner disappears.
  useEffect(() => {
    const onReviewed = (event: Event) => {
      if ((event as CustomEvent<string>).detail === chatId) setDetails((current) => (current ? { ...current, canReview: false } : current));
    };
    window.addEventListener("unishare:reviewed", onReviewed);
    return () => window.removeEventListener("unishare:reviewed", onReviewed);
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

  const block = async () => {
    setConfirmBlock(false);
    if (!partner) return;
    try {
      await api.block(partner.uid);
      useApp.setState((state) => ({ chats: state.chats.filter((chat) => chat.id !== chatId) }));
      useApp.getState().toast(t("chat.blocked"), "success");
      close();
    } catch (error) {
      useApp.getState().toastError(error);
    }
  };

  const remove = async () => {
    setConfirmDelete(false);
    try {
      await api.hideChat(chatId);
      useApp.setState((state) => ({ chats: state.chats.filter((chat) => chat.id !== chatId) }));
      useApp.getState().toast(t("chat.deleted"), "success");
      close();
    } catch (error) {
      useApp.getState().toastError(error);
    }
  };

  const status = isTyping ? t("chat.typing") : partner?.isOnline ? t("chat.online") : t("chat.offline");

  return (
    <div className="col" style={{ flex: 1, minHeight: 0, height: "100%", width: "100%" }}>
      <header className={`nav-header chat-nav${embedded ? " embedded" : ""}`}>
        <div className="lead">
          {!embedded && (
            <button className="close-btn" onClick={close} aria-label={t("chat.back")}>
              <ChevronLeft size={24} strokeWidth={2.6} />
            </button>
          )}
        </div>
        <button className="principal" onClick={openProfile} disabled={!partner}>
          <Avatar url={partner?.avatarUrl} size={36} />
          <span className="col" style={{ minWidth: 0, alignItems: "flex-start", gap: 1 }}>
            <span className="ellipsis" style={{ fontSize: 17, fontWeight: 700, maxWidth: "100%" }}>
              {partner?.username ?? ""}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: isTyping ? "var(--accent-text)" : partner?.isOnline ? "var(--green)" : "var(--text-2)" }}>{status}</span>
          </span>
        </button>
        <div className="trail" style={{ position: "relative" }}>
          <button className="close-btn" onClick={() => setMenuOpen((open) => !open)} aria-label={t("chat.more")} aria-expanded={menuOpen}>
            <Ellipsis size={20} strokeWidth={2.6} color="var(--accent-text)" />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 4 }} onClick={() => setMenuOpen(false)} />
                <motion.div
                  className="menu-pop material"
                  style={{ transformOrigin: "top right" }}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: "spring", stiffness: 520, damping: 34 }}
                >
                  {details?.contacts.map((contact) => (
                    <button
                      key={contact.provider}
                      onClick={() => {
                        setMenuOpen(false);
                        platform.openLink(contact.url);
                      }}
                    >
                      {t(contact.provider === "telegram" ? "chat.contact.telegram" : "chat.contact.vk")}
                      <span className="platform-badge" style={{ width: 22, height: 22, background: PROVIDER_COLORS[contact.provider], color: "#fff" }}>
                        <ProviderIcon provider={contact.provider} size={12} />
                      </span>
                    </button>
                  ))}
                  {partner && (
                    <button
                      className="destructive"
                      onClick={() => {
                        setMenuOpen(false);
                        useApp.getState().push({ type: "report", uid: partner.uid, username: partner.username });
                      }}
                    >
                      {t("chat.report")} <Flag size={18} />
                    </button>
                  )}
                  <button
                    className="destructive"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmBlock(true);
                    }}
                  >
                    {t("chat.block")} <UserX size={18} />
                  </button>
                  <button
                    className="destructive"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmDelete(true);
                    }}
                  >
                    {t("chat.delete")} <Trash2 size={18} />
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </header>

      <div className="messages" ref={listRef} onScroll={onScroll}>
        <div className="safety" style={{ marginBottom: 4 }}>
          <ShieldCheck size={20} color="var(--accent-text)" style={{ flexShrink: 0 }} />
          <span>{t("chat.safety.notice")}</span>
        </div>
        {(loadingOlder || (loading && messages.length === 0)) && (
          <div className="center" style={{ padding: 12 }}>
            <Spinner size={22} />
          </div>
        )}
        {messages.map((message) => {
          const mine = message.senderId === me;
          const time = new Date(message.createdAt).toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" });
          const image = mediaUrl(message.imageUrl);
          return (
            <div key={message.id} className={`msg ${mine ? "mine" : "theirs"}`}>
              {image && <img className="photo" src={image} alt={t("chat.photo")} loading="lazy" onClick={() => setLightbox(image)} />}
              {message.text && <div className="bubble">{message.text}</div>}
              <div className="meta">
                {time}
                {mine &&
                  (pending.has(message.id) ? (
                    <Clock size={11} />
                  ) : message.readAt ? (
                    <SelectedDot size={13} />
                  ) : (
                    <CheckCircle2 size={12} />
                  ))}
              </div>
            </div>
          );
        })}
      </div>

      {details?.canReview && messages.length > 0 && partner && (
        <button className="confirm-banner" onClick={() => useApp.getState().push({ type: "rating", chatId, uid: partner.uid, username: partner.username })}>
          <BadgeCheck size={20} fill="var(--primary)" color="var(--bg)" />
          <span className="col grow" style={{ gap: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{t("chat.review.title")}</span>
            <span className="secondary" style={{ fontSize: 11 }}>
              {t("chat.review.subtitle")}
            </span>
          </span>
          <ChevronRight size={13} className="secondary" />
        </button>
      )}

      <div className="input-bar">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={sendImage} />
        <button className="close-btn" style={{ color: "var(--accent-text)" }} onClick={() => fileRef.current?.click()} disabled={sending} aria-label={t("chat.attach")}>
          {sending ? <Spinner size={18} /> : <Images size={21} />}
        </button>
        <textarea ref={textareaRef} rows={1} value={text} maxLength={1000} placeholder={t("chat.placeholder")} onChange={onChange} onKeyDown={onKeyDown} enterKeyHint="send" />
        <button className={`send-btn ${text.trim() ? "ready" : ""}`} onClick={() => void sendText()} disabled={!text.trim()} aria-label={t("chat.send")}>
          <ArrowUp size={17} strokeWidth={3} />
        </button>
      </div>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)} role="dialog" aria-modal>
          <img src={lightbox} alt={t("chat.photo")} />
        </div>
      )}

      <AnimatePresence>
        {confirmBlock && (
          <ActionSheet
            title={t("chat.block.confirmation")}
            actions={[{ label: t("chat.block"), destructive: true, onSelect: () => void block() }]}
            cancelLabel={t("cancel")}
            onCancel={() => setConfirmBlock(false)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {confirmDelete && (
          <ActionSheet
            title={t("chat.delete.confirm")}
            actions={[{ label: t("chat.delete"), destructive: true, onSelect: () => void remove() }]}
            cancelLabel={t("cancel")}
            onCancel={() => setConfirmDelete(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
