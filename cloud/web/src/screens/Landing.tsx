import { motion } from "framer-motion";
import { Heart, Layers, QrCode, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { telegramAppLink, vkAppLink } from "@unishare/shared";
import { useApp } from "../app/store";
import { useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { BrandIcon } from "../components/ui";

declare global {
  interface Window {
    onUniShareTelegramAuth?: (user: Record<string, unknown>) => void;
  }
}

/** Telegram Login Widget (requires /setdomain in BotFather for this domain). */
function TelegramLoginWidget({ bot }: { bot: string }) {
  const container = useRef<HTMLDivElement>(null);
  const signIn = useApp((state) => state.signInTelegramWidget);
  useEffect(() => {
    window.onUniShareTelegramAuth = (user) => void signIn(user);
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", bot);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "16");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", "onUniShareTelegramAuth(user)");
    container.current?.appendChild(script);
    const node = container.current;
    return () => {
      if (node) node.innerHTML = "";
    };
  }, [bot, signIn]);
  return <div ref={container} className="center" style={{ minHeight: 48 }} />;
}

export function Landing() {
  const t = useT();
  const config = useApp((state) => state.config);
  const signInDev = useApp((state) => state.signInDev);
  const [devName, setDevName] = useState("");

  const features = [
    { icon: <Layers size={20} />, title: t("landing.feature.feed"), text: t("landing.feature.feed.text") },
    { icon: <Heart size={20} />, title: t("landing.feature.match"), text: t("landing.feature.match.text") },
    { icon: <QrCode size={20} />, title: t("landing.feature.nearby"), text: t("landing.feature.nearby.text") },
    { icon: <ShieldCheck size={20} />, title: t("landing.feature.safe"), text: t("landing.feature.safe.text") },
  ];

  return (
    <div className="screen" style={{ padding: 0 }}>
      <motion.div className="landing" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <img className="logo" src="/icons/icon-192.png" alt="UniShare" />
        <h1>
          UniShare
          <br />
          <em>{t("landing.title")}</em>
        </h1>
        <p className="muted" style={{ margin: 0, fontSize: 16 }}>{t("landing.subtitle")}</p>

        <div className="col" style={{ width: "100%", maxWidth: 380, marginTop: 8 }}>
          {config?.telegramBotUsername && (
            <>
              <button
                className="btn btn-telegram btn-block"
                onClick={() => platform.openLink(telegramAppLink(config.telegramBotUsername!, config.telegramAppShortName))}
              >
                <BrandIcon file="telegram.svg" size={20} /> {t("landing.telegram")}
              </button>
              <TelegramLoginWidget bot={config.telegramBotUsername} />
            </>
          )}
          {config?.vkAppId && (
            <button className="btn btn-vk btn-block" onClick={() => platform.openLink(vkAppLink(config.vkAppId!))}>
              <BrandIcon file="vk.svg" size={20} /> {t("landing.vk")}
            </button>
          )}
          {config?.devAuth && (
            <form
              className="row"
              onSubmit={(event) => {
                event.preventDefault();
                if (devName.trim().length >= 3) void signInDev(devName.trim());
              }}
            >
              <input className="field grow" value={devName} onChange={(event) => setDevName(event.target.value)} placeholder={t("landing.dev.placeholder")} />
              <button className="btn btn-glass" type="submit" disabled={devName.trim().length < 3}>
                {t("landing.dev")}
              </button>
            </form>
          )}
        </div>

        <div className="feature-list">
          {features.map((feature) => (
            <div className="glass" key={feature.title}>
              <span style={{ color: "var(--primary)" }}>{feature.icon}</span>
              <b>{feature.title}</b>
              <span className="muted">{feature.text}</span>
            </div>
          ))}
        </div>
        <p className="faint" style={{ fontSize: 12, margin: 0 }}>
          {t("landing.legal")}{" "}
          {config && (
            <>
              <a href={config.termsUrl} target="_blank" rel="noreferrer">{t("settings.terms")}</a> ·{" "}
              <a href={config.privacyUrl} target="_blank" rel="noreferrer">{t("settings.privacy")}</a>
            </>
          )}
        </p>
      </motion.div>
    </div>
  );
}

export function AuthErrorScreen() {
  const t = useT();
  const error = useApp((state) => state.authError);
  return (
    <div className="landing">
      <img className="logo" src="/icons/icon-192.png" alt="UniShare" />
      <h2 style={{ margin: 0 }}>{t("auth.failed")}</h2>
      <p className="muted" style={{ margin: 0 }}>{error}</p>
      <button className="btn btn-primary" onClick={() => void useApp.getState().boot()}>
        <RefreshCw size={18} /> {t("auth.retry")}
      </button>
    </div>
  );
}
