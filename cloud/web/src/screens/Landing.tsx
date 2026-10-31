import { motion } from "framer-motion";
import { Heart, Layers, RefreshCw, ShieldCheck, Vibrate, type LucideIcon } from "lucide-react";
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

const FEATURES: { key: string; Icon: LucideIcon }[] = [
  { key: "feed", Icon: Layers },
  { key: "match", Icon: Heart },
  { key: "nearby", Icon: Vibrate },
  { key: "safe", Icon: ShieldCheck },
];

/** The UniShare planet on a soft lavender halo, so the dark sphere reads on the night background. */
function LoginMark({ size = 112 }: { size?: number }) {
  return (
    <span className="login-mark" style={{ width: size, height: size }}>
      <img src="/brand/logo.png" alt="" width={size} height={size} draggable={false} />
    </span>
  );
}

/** "By continuing you accept the Terms and Privacy Policy." with both names as links. */
function LegalLine({ termsUrl, privacyUrl }: { termsUrl: string; privacyUrl: string }) {
  const t = useT();
  const links: Record<string, { href: string; label: string }> = {
    "{terms}": { href: termsUrl, label: t("landing.legal.terms") },
    "{privacy}": { href: privacyUrl, label: t("landing.legal.privacy") },
  };
  return (
    <p className="login-legal">
      {t("landing.legal.inline")
        .split(/(\{terms\}|\{privacy\})/)
        .map((part, index) =>
          links[part] ? (
            <a key={index} href={links[part].href} target="_blank" rel="noreferrer">
              {links[part].label}
            </a>
          ) : (
            part
          ),
        )}
    </p>
  );
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
      <div className="col" style={{ gap: 26, maxWidth: 520, margin: "0 auto", padding: "calc(var(--safe-top) + 40px) 24px calc(var(--safe-bottom) + 24px)", minHeight: "100%", justifyContent: "center", position: "relative" }}>
        <motion.div className="col" style={{ alignItems: "center", gap: 8, textAlign: "center" }} initial={{ opacity: 0, scale: 0.86 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 140, damping: 16, delay: 0.08 }}>
          <LoginMark />
          <h1 style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.02em", margin: "6px 0 0" }}>{t("app.name")}</h1>
          <span style={{ fontSize: 17, fontWeight: 600, color: "var(--text-2)" }}>{t("landing.title")}</span>
        </motion.div>

        <motion.div className="feature-grid" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          {FEATURES.map(({ key, Icon }) => (
            <div key={key} className="feature-tile glass">
              <span className="ico">
                <Icon size={18} strokeWidth={2.4} />
              </span>
              <span className="title">{t(`landing.feature.${key}`)}</span>
              <span className="text">{t(`landing.feature.${key}.text`)}</span>
            </div>
          ))}
        </motion.div>

        <motion.div className="col" style={{ gap: 12 }} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
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
          {config?.telegramBotUsername && config.telegramLoginWidget && (
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
              className="col"
              style={{ gap: 10, marginTop: 4 }}
              onSubmit={(event) => {
                event.preventDefault();
                if (devName.trim().length >= 3) void signInDev(devName.trim());
              }}
            >
              <label className="field glass" style={{ borderRadius: 16 }}>
                <input value={devName} onChange={(event) => setDevName(event.target.value)} placeholder={t("landing.dev.placeholder")} />
              </label>
              <button className="btn-secondary" style={{ flex: "0 0 auto", height: 54 }} type="submit" disabled={devName.trim().length < 3}>
                {t("landing.dev")}
              </button>
            </form>
          )}
          {config && <LegalLine termsUrl={config.termsUrl} privacyUrl={config.privacyUrl} />}
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
        <LoginMark size={96} />
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
