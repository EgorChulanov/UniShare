// Port of UniShare/Features/Greeting/GreetingView.swift.
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useApp } from "../app/store";
import { useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { Avatar } from "../components/ui";

export function Greeting() {
  const t = useT();
  const profile = useApp((state) => state.profile);
  const finish = useApp((state) => state.finishGreeting);
  const [showName, setShowName] = useState(false);
  const [glow, setGlow] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    platform.haptic("medium");
    const timers = [
      setTimeout(() => setShowName(true), 500),
      setTimeout(() => setGlow(true), 800),
      setTimeout(() => setLeaving(true), 2200),
      setTimeout(finish, 2700),
    ];
    return () => timers.forEach(clearTimeout);
  }, [finish]);

  return (
    <motion.div className="center" style={{ position: "absolute", inset: 0, flexDirection: "column", overflow: "hidden" }} animate={{ opacity: leaving ? 0 : 1 }} transition={{ duration: 0.5 }} onClick={finish}>
      <div className={`greeting-glow ${glow ? "expanded" : ""}`} aria-hidden />
      <div className="col" style={{ alignItems: "center", gap: 20, position: "relative" }}>
        <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 110, damping: 11 }}>
          <Avatar url={profile?.avatarUrl} size={100} ring />
        </motion.div>
        <motion.div className="col" style={{ alignItems: "center", gap: 6 }} initial={{ opacity: 0, y: 20 }} animate={showName ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" }}>
          <span className="secondary" style={{ fontSize: 20, fontWeight: 500 }}>
            {t("greeting.welcome")}
          </span>
          <span style={{ fontSize: 28, fontWeight: 700 }}>{profile?.username}</span>
        </motion.div>
      </div>
    </motion.div>
  );
}
