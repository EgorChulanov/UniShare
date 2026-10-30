// Port of UniShare/Features/AirShare/AirShareView.swift. Instead of Bluetooth,
// phones that open AirShare at the same time find each other by location
// (Telegram LocationManager, VK geodata or the browser) or the same network.
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Heart, HelpCircle, Smartphone, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ProfileCard } from "@unishare/shared";
import { api } from "../lib/api";
import { useApp } from "../app/store";
import { platform, type GeoPoint } from "../platform/platform";
import { useT } from "../i18n/i18n";
import { Avatar, PlatformBadge, Sheet } from "../components/ui";

type Status = "searching" | "received" | "sent";

const PING_INTERVAL_MS = 2500;
/** Bumped whenever searching starts, here or in a newly opened sheet: a late leave must not end it. */
let searches = 0;

export function AirShareSheet() {
  const t = useT();
  const me = useApp((state) => state.profile);
  const [profiles, setProfiles] = useState<ProfileCard[]>([]);
  const [status, setStatus] = useState<Status>("searching");
  const [noLocation, setNoLocation] = useState(false);
  const [selected, setSelected] = useState<ProfileCard | null>(null);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    let alive = true;
    let location: GeoPoint | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Searching only while the page / Mini App is on screen, like onAppear / onDisappear on iOS.
    // `run` changes on every stop, so a ping still in flight does not schedule the next one.
    let active = false;
    let run = 0;
    let inflight: Promise<unknown> | null = null;
    let appHidden = false;

    const ping = async (current: number) => {
      const request = api.airsharePing(location);
      inflight = request;
      try {
        const result = await request;
        if (current !== run) return;
        const fresh = result.profiles.filter((profile) => !seen.current.has(profile.uid));
        if (fresh.length) {
          fresh.forEach((profile) => seen.current.add(profile.uid));
          platform.haptic("success");
          setProfiles((list) => [...list, ...fresh]);
          setStatus((value) => (value === "sent" ? value : "received"));
        }
      } catch {
        /* keep trying while the sheet is open */
      } finally {
        if (inflight === request) inflight = null;
      }
      if (current === run) timer = setTimeout(() => void ping(current), PING_INTERVAL_MS);
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

    // Search on the same network right away; the coordinates join the next ping once they
    // arrive (the permission prompt can take a while).
    void platform
      .getLocation()
      .catch(() => null)
      .then((point) => {
        if (!alive) return;
        location = point;
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
  }, []);

  const connected = status !== "searching";
  const first = profiles[0];
  const statusText = status === "searching" ? t("airshare.searching") : status === "sent" ? t("airshare.success") : t("airshare.found");
  const statusColor = status === "searching" ? "var(--text-2)" : "var(--green)";

  return (
    <Sheet>
      <div className="airshare">
        <div className="airshare-glow" aria-hidden />
        <div className="col" style={{ alignItems: "center", gap: 6, textAlign: "center", padding: "0 32px", position: "relative" }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>{t("airshare.title")}</h1>
          <p className="secondary" style={{ margin: 0, fontSize: 14 }}>
            {t("airshare.description")}
          </p>
        </div>

        <motion.div className="row" style={{ justifyContent: "center", padding: "16px 0", position: "relative" }} animate={{ gap: connected ? 0 : 40 }} transition={{ type: "spring", stiffness: 160, damping: 13 }}>
          <div className="col" style={{ alignItems: "center", gap: 8 }}>
            <motion.div className="airshare-phone" style={{ color: "var(--primary)", rotate: -12 }} animate={{ x: connected ? 16 : 0 }} transition={{ type: "spring", stiffness: 160, damping: 13 }}>
              <Smartphone size={72} strokeWidth={1.6} />
              <span className="screen-slot">
                <Avatar url={me?.avatarUrl} size={28} />
              </span>
            </motion.div>
            <span className="secondary ellipsis airshare-name">
              {me?.username ?? t("airshare.me")}
            </span>
          </div>
          <div className="col" style={{ alignItems: "center", gap: 8 }}>
            <motion.div className="airshare-phone" style={{ color: "var(--tertiary)", rotate: 12 }} animate={{ x: connected ? -16 : 0 }} transition={{ type: "spring", stiffness: 160, damping: 13 }}>
              <Smartphone size={72} strokeWidth={1.6} />
              <span className="screen-slot">{first ? <Avatar url={first.avatarUrl} size={28} /> : <HelpCircle size={20} strokeWidth={2.6} className="secondary" />}</span>
            </motion.div>
            <span className="secondary ellipsis airshare-name">
              {first?.username ?? "?"}
            </span>
          </div>
        </motion.div>

        <div className="airshare-pill" style={{ borderColor: `color-mix(in srgb, ${statusColor} 40%, transparent)` }}>
          <span className="dot" style={{ background: statusColor }} />
          {statusText}
        </div>
        {noLocation && status === "searching" && (
          <p className="secondary" style={{ margin: "-14px 32px 0", fontSize: 12, textAlign: "center", position: "relative" }}>
            {t("airshare.location.denied")}
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
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => info.offset.y > 120 && onDismiss()}
      >
        <div className="brand-bg" style={{ position: "absolute" }} aria-hidden />
        <div className="col" style={{ alignItems: "center", position: "relative", height: "100%" }}>
          <span style={{ width: 40, height: 4, borderRadius: 2, background: "color-mix(in srgb, var(--text-2) 60%, transparent)", margin: "14px 0 24px" }} />
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
