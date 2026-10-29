import { motion } from "framer-motion";
import { useEffect } from "react";
import { useApp } from "../app/store";
import { useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { Avatar } from "../components/ui";

/** Short animated welcome shown once per launch (GreetingView.swift). */
export function Greeting() {
  const t = useT();
  const profile = useApp((state) => state.profile);
  const finish = useApp((state) => state.finishGreeting);

  useEffect(() => {
    platform.haptic("light");
    const timer = setTimeout(finish, 1700);
    return () => clearTimeout(timer);
  }, [finish]);

  return (
    <motion.div
      className="center"
      style={{ height: "100%", width: "100%", flexDirection: "column", gap: 18 }}
      onClick={finish}
      exit={{ opacity: 0 }}
    >
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }}>
        <Avatar url={profile?.avatarUrl} name={profile?.username} size={112} ring />
      </motion.div>
      <motion.div initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} style={{ textAlign: "center" }}>
        <div className="muted" style={{ fontSize: 18, fontWeight: 700 }}>{t("greeting.welcome")}</div>
        <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.02em" }}>{profile?.username}</div>
      </motion.div>
    </motion.div>
  );
}
