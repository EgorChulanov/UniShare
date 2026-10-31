// Port of UniShare/Features/AirShare/AirShareView.swift. Instead of Bluetooth,
// phones that open AirShare at the same time find each other by location
// (Telegram LocationManager, VK geodata or the browser) or the same network.
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { ChevronRight, Heart, Vibrate, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ProfileCard } from "@unishare/shared";
import { ApiError, api } from "../lib/api";
import { useApp } from "../app/store";
import { platform, type GeoPoint } from "../platform/platform";
import { useT } from "../i18n/i18n";
import { Avatar, PlatformBadge, Sheet, useEscape } from "../components/ui";

type Status = "searching" | "received" | "sent";

const PING_INTERVAL_MS = 2500;
/** After a 429 (too many AirShare sessions at new places) wait before trying again. */
const LIMITED_RETRY_MS = 30_000;
/** Bumped whenever searching starts, here or in a newly opened sheet: a late leave must not end it. */
let searches = 0;

export function AirShareSheet() {
  const t = useT();
  const me = useApp((state) => state.profile);
  const [profiles, setProfiles] = useState<ProfileCard[]>([]);
  const [status, setStatus] = useState<Status>("searching");
  const [noLocation, setNoLocation] = useState(false);
  const [limited, setLimited] = useState(false);
  const [selected, setSelected] = useState<ProfileCard | null>(null);
  /** Searching (and the location request) starts only after "Start nearby search", as in the store screenshots. */
  const [started, setStarted] = useState(false);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    if (!started) return;
    let alive = true;
    let location: GeoPoint | null = null;
    // Until getLocation settles the server matches nobody, so a pending permission
    // prompt never falls back to "same network" (which may be a carrier NAT).
    let locating = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Searching only while the page / Mini App is on screen, like onAppear / onDisappear on iOS.
    // `run` changes on every stop, so a ping still in flight does not schedule the next one.
    let active = false;
    let run = 0;
    let inflight: Promise<unknown> | null = null;
    let appHidden = false;

    const ping = async (current: number) => {
      const request = api.airsharePing(location, locating);
      inflight = request;
      let delay = PING_INTERVAL_MS;
      try {
        const result = await request;
        if (current !== run) return;
        setLimited(false);
        const fresh = result.profiles.filter((profile) => !seen.current.has(profile.uid));
        fresh.forEach((profile) => seen.current.add(profile.uid));
        if (fresh.length) platform.haptic("success");
        // The list shows who is nearby right now; people who left drop out.
        setProfiles(result.profiles);
        // The list mirrors who is nearby now, so the status follows it both ways.
        setStatus((value) => (value === "sent" ? value : result.profiles.length ? "received" : "searching"));
      } catch (error) {
        if (error instanceof ApiError && error.status === 429) {
          setLimited(true);
          delay = LIMITED_RETRY_MS;
        }
        /* otherwise keep trying while the sheet is open */
      } finally {
        if (inflight === request) inflight = null;
      }
      if (current === run) timer = setTimeout(() => void ping(current), delay);
    };

    const start = () => {
      if (active) return;
      active = true;
      searches += 1;
      void ping(run);
    };

    const stop = () => {
      if (!active) return;
      active = false;
      run += 1;
      clearTimeout(timer);
      const search = searches;
      void api.airshareLeave().catch(() => undefined);
      // A ping still in flight may reach the server after this DELETE and add the user back:
      // leave again once it settles, unless searching has started again by then.
      void inflight
        ?.catch(() => undefined)
        .then(() => (search === searches ? api.airshareLeave() : undefined))
        .catch(() => undefined);
    };

    const sync = () => (alive && !appHidden && document.visibilityState === "visible" ? start() : stop());
    const onAppVisibility = (event: Event) => {
      appHidden = !(event as CustomEvent<boolean>).detail;
      sync();
    };
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pagehide", stop);
    window.addEventListener("pageshow", sync);
    window.addEventListener("unishare:visibility", onAppVisibility);
    sync();

    // Presence starts right away; the coordinates join the next ping once they arrive
    // (the permission prompt can take a while).
    void platform
      .getLocation()
      .catch(() => null)
      .then((point) => {
        if (!alive) return;
        location = point;
        locating = false;
        setNoLocation(!point);
      });

    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pagehide", stop);
      window.removeEventListener("pageshow", sync);
      window.removeEventListener("unishare:visibility", onAppVisibility);
      stop();
    };
  }, [started]);

  const connected = status !== "searching";
  const first = profiles[0];
  const statusText = status === "searching" ? t("airshare.searching") : status === "sent" ? t("airshare.success") : t("airshare.found");

  return (
    <Sheet>
      <div className="airshare">
        <div className="airshare-glow" aria-hidden />
        <div className="airshare-head">
          <h1>{t("airshare.title")}</h1>
          <p>{t("airshare.subtitle")}</p>
        </div>

        <div className="airshare-phones">
          <motion.div className="phone-illus" style={{ rotate: -10 }} animate={{ x: connected ? 8 : -30, y: connected ? 0 : 8 }} transition={{ type: "spring", stiffness: 160, damping: 13 }}>
            <span className="notch" />
            <span className="phone-avatar" title={me?.username ?? t("airshare.me")}>
              <Avatar url={me?.avatarUrl} size={40} />
            </span>
          </motion.div>
          <motion.div className="phone-illus" style={{ rotate: 10 }} animate={{ x: connected ? -8 : 30, y: connected ? 0 : -8 }} transition={{ type: "spring", stiffness: 160, damping: 13 }}>
            <span className="notch" />
            <span className="phone-avatar" title={first?.username}>
              <Avatar url={first?.avatarUrl} size={40} />
            </span>
          </motion.div>
        </div>

        {started ? (
          <>
            <div className={`airshare-pill ${status !== "searching" ? "found" : ""}`}>
              <span className="dot" />
              {statusText}
            </div>
            {status === "searching" && (
              <p className="airshare-hint">
                <Vibrate size={18} strokeWidth={2.2} /> {t("airshare.hold")}
              </p>
            )}
          </>
        ) : (
          <button className="airshare-start" onClick={() => setStarted(true)}>
            {t("airshare.start")}
          </button>
        )}
        {(limited || (noLocation && status === "searching")) && (
          <p className="secondary" style={{ margin: "-14px 32px 0", fontSize: 12, textAlign: "center", position: "relative" }}>
            {limited ? t("error.rate_limited") : t("airshare.location.denied")}
          </p>
        )}

        {profiles.length > 0 && (
          <div style={{ width: "100%", maxWidth: 560, position: "relative" }}>
            <div className="caption" style={{ padding: "0 20px 10px" }}>
              {t("airshare.nearby")}
            </div>
            <div className="col" style={{ gap: 10 }}>
              <AnimatePresence initial={false}>
                {profiles.map((profile) => (
                  <motion.button
                    key={profile.uid}
                    className="airshare-row"
                    initial={{ opacity: 0, x: 60 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 26 }}
                    onClick={() => setSelected(profile)}
                  >
                    <Avatar url={profile.avatarUrl} size={48} ring />
                    <div className="grow" style={{ textAlign: "left" }}>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{profile.username}</div>
                      {profile.games.length > 0 && (
                        <div className="secondary ellipsis" style={{ fontSize: 12, marginTop: 3 }}>
                          {profile.games
                            .slice(0, 3)
                            .map((game) => game.name)
                            .join(" · ")}
                        </div>
                      )}
                    </div>
                    <ChevronRight size={16} className="secondary" />
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {selected && (
          <AirShareProfileCard
            key={selected.uid}
            profile={selected}
            onDismiss={() => setSelected(null)}
            onLiked={() => {
              setStatus("sent");
              setSelected(null);
            }}
          />
        )}
      </AnimatePresence>
    </Sheet>
  );
}

/** AirShareProfileCard: medium sheet with Skip / Like. */
function AirShareProfileCard({ profile, onDismiss, onLiked }: { profile: ProfileCard; onDismiss(): void; onLiked(): void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  // Swipe down from the grabber; the rest of the card scrolls on short screens.
  const dragControls = useDragControls();
  useEscape(onDismiss);

  const like = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await api.swipe(profile.uid, "teammates", "like");
      const state = useApp.getState();
      if (result.matched && result.chatId) {
        platform.haptic("success");
        state.toast(`${t("feed.swipe.match")} · ${profile.username}`, "success");
        void state.loadChats();
        // Only while AirShare is still open: the user may have closed it during the request.
        if (state.overlays.at(-1)?.type === "airshare") {
          state.setTab("chats");
          state.replace({ type: "chat", chatId: result.chatId });
        }
        return;
      }
      state.toast(t("airshare.liked"), "success");
      onLiked();
    } catch (error) {
      useApp.getState().toastError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <motion.div className="backdrop" style={{ position: "absolute" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onDismiss} />
      <motion.div
        className="inner-sheet"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 38 }}
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => info.offset.y > 120 && onDismiss()}
      >
        <div className="brand-bg" style={{ position: "absolute" }} aria-hidden />
        <div className="col" style={{ alignItems: "center", position: "relative", height: "100%" }}>
          <span className="inner-grabber" onPointerDown={(event) => dragControls.start(event)}>
            <span />
          </span>
          <Avatar url={profile.avatarUrl} size={100} ring />
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 16 }}>{profile.username}</div>
          {profile.platforms.length > 0 && (
            <div className="row" style={{ gap: 10, marginTop: 8 }}>
              {profile.platforms.map((id) => (
                <PlatformBadge key={id} platform={id} size={26} />
              ))}
            </div>
          )}
          {profile.games.length > 0 && (
            <div className="h-scroll" style={{ margin: "16px 0 0", padding: "0 24px", width: "100%", justifyContent: profile.games.length < 3 ? "center" : undefined }}>
              {profile.games.map((game) => (
                <span key={game.name} className="chip primary" style={{ flexShrink: 0 }}>
                  {game.name}
                </span>
              ))}
            </div>
          )}
          <div style={{ flex: 1 }} />
          <div className="row" style={{ gap: 24, width: "100%", padding: "0 24px calc(var(--safe-bottom) + 32px)" }}>
            <button className="airshare-btn skip" onClick={onDismiss}>
              <X size={17} strokeWidth={2.8} /> {t("airshare.skip")}
            </button>
            <button className="airshare-btn like" onClick={like} disabled={busy}>
              <Heart size={17} fill="currentColor" /> {t("airshare.like")}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}
