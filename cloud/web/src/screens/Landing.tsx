import { motion } from "framer-motion";
import { Gamepad2, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { telegramAppLink, vkAppLink } from "@unishare/shared";
import { useApp } from "../app/store";
import { useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { BrandIcon, PROVIDER_COLORS } from "../components/ui";

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

/** Port of UniShare/Features/Auth/LoginView.swift with Telegram / VK sign-in. */
export function Landing() {
  const t = useT();
  const config = useApp((state) => state.config);
  const signInDev = useApp((state) => state.signInDev);
  const [devName, setDevName] = useState("");

  return (
    <div className="screen login" style={{ paddingBottom: 0 }}>
      <div className="login-glow" aria-hidden />
      <div className="col" style={{ gap: 28, maxWidth: 520, margin: "0 auto", padding: "54px 24px 28px", minHeight: "100%", justifyContent: "center", position: "relative" }}>
        <motion.div className="col" style={{ alignItems: "center", gap: 12, textAlign: "center" }} initial={{ opacity: 0, scale: 0.86 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 140, damping: 16, delay: 0.08 }}>
          <span className="login-icon glass gradient-border">
            <Gamepad2 size={40} strokeWidth={2.2} />
          </span>
          <span style={{ fontSize: 34, fontWeight: 700 }}>{t("app.name")}</span>
          <span className="secondary" style={{ fontSize: 15 }}>
            {t("auth.subtitle")}
          </span>
        </motion.div>

        <motion.div className="col" style={{ gap: 14 }} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          {config?.telegramBotUsername && (
            <button className="login-btn" style={{ background: PROVIDER_COLORS.telegram }} onClick={() => platform.openLink(telegramAppLink(config.telegramBotUsername!, config.telegramAppShortName))}>
              <BrandIcon file="telegram.svg" size={20} /> {t("landing.telegram")}
            </button>
          )}
          {config?.vkAppId && (
            <button className="login-btn" style={{ background: PROVIDER_COLORS.vk }} onClick={() => platform.openLink(vkAppLink(config.vkAppId!))}>
              <BrandIcon file="vk.svg" size={20} /> {t("landing.vk")}
            </button>
          )}
          {config?.telegramBotUsername && (
            <>
              <div className="row" style={{ gap: 12 }}>
                <span className="grow" style={{ height: 1, background: "color-mix(in srgb, var(--text-2) 25%, transparent)" }} />
                <span className="secondary" style={{ fontSize: 12, fontWeight: 500 }}>
                  {t("auth.or")}
                </span>
                <span className="grow" style={{ height: 1, background: "color-mix(in srgb, var(--text-2) 25%, transparent)" }} />
              </div>
              <TelegramLoginWidget bot={config.telegramBotUsername} />
            </>
          )}
          {config?.devAuth && (
            <form
              className="row"
              style={{ gap: 10 }}
              onSubmit={(event) => {
                event.preventDefault();
                if (devName.trim().length >= 3) void signInDev(devName.trim());
              }}
            >
              <label className="field glass grow">
                <input value={devName} onChange={(event) => setDevName(event.target.value)} placeholder={t("landing.dev.placeholder")} />
              </label>
              <button className="btn-plain" type="submit" disabled={devName.trim().length < 3}>
                {t("landing.dev")}
              </button>
            </form>
          )}
          <span className="secondary" style={{ fontSize: 11, textAlign: "center" }}>
            {t("landing.legal")}
          </span>
          {config && (
            <div className="row" style={{ gap: 12, justifyContent: "center", fontSize: 13 }}>
              <a href={config.termsUrl} target="_blank" rel="noreferrer">
                {t("settings.terms")}
              </a>
              <a href={config.privacyUrl} target="_blank" rel="noreferrer">
                {t("settings.privacy")}
              </a>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

export function AuthErrorScreen() {
  const t = useT();
  const error = useApp((state) => state.authError);
  return (
    <div className="screen login">
      <div className="login-glow" aria-hidden />
      <div className="col" style={{ gap: 16, alignItems: "center", textAlign: "center", maxWidth: 420, margin: "0 auto", padding: "0 24px", minHeight: "100%", justifyContent: "center", position: "relative" }}>
        <span className="login-icon glass">
          <Gamepad2 size={40} strokeWidth={2.2} />
        </span>
        <span style={{ fontSize: 22, fontWeight: 700 }}>{t("auth.failed")}</span>
        <span className="secondary" style={{ fontSize: 14 }}>
          {error}
        </span>
        <button className="btn-primary" style={{ borderRadius: 16, height: 54, marginTop: 8 }} onClick={() => void useApp.getState().boot()}>
          <RefreshCw size={18} /> {t("auth.retry")}
        </button>
      </div>
    </div>
  );
}
