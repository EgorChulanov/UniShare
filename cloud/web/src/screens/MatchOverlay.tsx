import { motion } from "framer-motion";
import { Heart } from "lucide-react";
import { useApp } from "../app/store";
import { useT } from "../i18n/i18n";
import { Avatar } from "../components/ui";

/** "It's a match!" celebration with a shortcut into the new chat. */
export function MatchOverlay() {
  const t = useT();
  const match = useApp((state) => state.match);
  const profile = useApp((state) => state.profile);
  const dismiss = useApp((state) => state.dismissMatch);
  if (!match) return null;

  const write = () => {
    dismiss();
    const state = useApp.getState();
    state.setTab("chats");
    state.push({ type: "chat", chatId: match.chatId });
  };

  return (
    <motion.div className="match-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div initial={{ scale: 0.4, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 14 }}>
        <Heart size={64} fill="#ff4d6d" color="#ff4d6d" />
      </motion.div>
      <h1>{t("feed.match.title")}</h1>
      <div className="row" style={{ gap: 0 }}>
        <motion.div initial={{ x: -60, opacity: 0 }} animate={{ x: 12, opacity: 1 }} transition={{ type: "spring", delay: 0.1 }}>
          <Avatar url={profile?.avatarUrl} name={profile?.username} size={110} ring />
        </motion.div>
        <motion.div initial={{ x: 60, opacity: 0 }} animate={{ x: -12, opacity: 1 }} transition={{ type: "spring", delay: 0.15 }}>
          <Avatar url={match.partner.avatarUrl} name={match.partner.username} size={110} ring />
        </motion.div>
      </div>
      <p style={{ fontSize: 17, fontWeight: 700, opacity: 0.9, margin: 0 }}>{t("feed.match.subtitle", match.partner.username)}</p>
      <div className="col" style={{ width: "100%", maxWidth: 340 }}>
        <button className="btn btn-primary btn-block" onClick={write}>
          {t("feed.match.write")}
        </button>
        <button className="btn btn-ghost" style={{ color: "#fff" }} onClick={dismiss}>
          {t("feed.match.later")}
        </button>
      </div>
    </motion.div>
  );
}
