import { Copy, ExternalLink, RefreshCw, Unlink } from "lucide-react";
import { useState } from "react";
import type { LinkTokenResponse } from "@unishare/shared";
import { useApp } from "../app/store";
import { api } from "../lib/api";
import { useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { PROVIDER_COLORS, ProviderIcon, Sheet, Spinner } from "../components/ui";
import { QrCode } from "./QrCode";
import { copyText } from "./profileShare";

type Provider = "telegram" | "vk";
const NAMES: Record<Provider, string> = { telegram: "Telegram", vk: "ВКонтакте" };

export function LinkAccountsSheet() {
  const t = useT();
  const profile = useApp((state) => state.profile)!;
  const config = useApp((state) => state.config);
  const setProfile = useApp((state) => state.setProfile);
  const toast = useApp((state) => state.toast);
  const toastError = useApp((state) => state.toastError);
  const [link, setLink] = useState<{ provider: Provider; token: LinkTokenResponse } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const available: Record<Provider, boolean> = { telegram: Boolean(config?.telegramBotUsername), vk: Boolean(config?.vkAppId) };

  const createLink = async (provider: Provider) => {
    setBusy(provider);
    try {
      const token = await api.linkToken();
      setLink({ provider, token });
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(null);
    }
  };

  const unlink = async (provider: Provider) => {
    setBusy(`unlink-${provider}`);
    try {
      setProfile(await api.unlink(provider));
      toast(t("common.saved"), "success");
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(null);
    }
  };

  const refresh = async () => {
    setBusy("refresh");
    try {
      const fresh = await api.me();
      setProfile(fresh);
      if (link && fresh.identities.some((identity) => identity.provider === link.provider)) {
        toast(t("profile.link.done", NAMES[link.provider]), "success");
        setLink(null);
      }
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(null);
    }
  };

  const url = link ? (link.provider === "telegram" ? link.token.telegramUrl : link.token.vkUrl) : null;

  return (
    <Sheet
      title={t("profile.linked")}
      headerLeft={
        <button className="icon-btn small" onClick={() => void refresh()} aria-label={t("feed.refresh")}>
          {busy === "refresh" ? <Spinner size={16} /> : <RefreshCw size={16} />}
        </button>
      }
    >
      <div className="col" style={{ gap: 12 }}>
        <div className="muted">{t("profile.linked.hint")}</div>
        {(["telegram", "vk"] as const).map((provider) => {
          const identity = profile.identities.find((item) => item.provider === provider);
          return (
            <div key={provider} className="identity-row">
              <span className="ico" style={{ background: PROVIDER_COLORS[provider] }}>
                <ProviderIcon provider={provider} size={20} />
              </span>
              <div className="grow">
                <div style={{ fontWeight: 800 }}>{NAMES[provider]}</div>
                <div className="muted ellipsis" style={{ fontSize: 13 }}>
                  {identity
                    ? identity.username
                      ? provider === "telegram" ? `@${identity.username}` : identity.username
                      : identity.displayName ?? t("profile.connected")
                    : "—"}
                </div>
              </div>
              {identity ? (
                <button className="chip" onClick={() => void unlink(provider)} disabled={busy === `unlink-${provider}`}>
                  {busy === `unlink-${provider}` ? <Spinner size={14} /> : <Unlink size={14} />} {t("profile.unlink")}
                </button>
              ) : (
                <button className="chip selected" onClick={() => void createLink(provider)} disabled={!available[provider] || busy === provider}>
                  {busy === provider ? <Spinner size={14} /> : null}
                  {t(provider === "telegram" ? "profile.link.telegram" : "profile.link.vk")}
                </button>
              )}
            </div>
          );
        })}

        {link && url && (
          <div className="glass card col" style={{ alignItems: "center", gap: 14, textAlign: "center" }}>
            <QrCode value={url} size={200} />
            <div className="muted" style={{ fontSize: 13.5 }}>{t("profile.link.open")}</div>
            <div className="row" style={{ width: "100%", gap: 10 }}>
              <button
                className={`btn grow ${link.provider === "telegram" ? "btn-telegram" : "btn-vk"}`}
                onClick={() => platform.openLink(url)}
              >
                <ExternalLink size={17} /> {NAMES[link.provider]}
              </button>
              <button
                className="btn btn-glass"
                aria-label={t("profile.link.copy")}
                onClick={() => void copyText(url).then((ok) => ok && toast(t("common.copied"), "success"))}
              >
                <Copy size={17} />
              </button>
            </div>
            <button className="btn btn-ghost" onClick={() => void refresh()}>
              <RefreshCw size={15} /> {t("feed.refresh")}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
