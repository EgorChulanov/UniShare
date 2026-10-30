// Linked sign-in accounts: one UniShare profile in Telegram, VK and the browser.
import { Copy, ExternalLink, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { LinkTokenResponse } from "@unishare/shared";
import { useApp } from "../app/store";
import { api } from "../lib/api";
import { useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { PROVIDER_COLORS, ProviderIcon, Sheet, Spinner } from "../components/ui";

type Provider = "telegram" | "vk";
const NAMES: Record<Provider, string> = { telegram: "Telegram", vk: "ВКонтакте" };

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

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
      setLink({ provider, token: await api.linkToken() });
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
      lead={
        <button className="icon-circle" onClick={() => void refresh()} aria-label={t("feed.refresh")}>
          {busy === "refresh" ? <Spinner size={14} /> : <RefreshCw size={15} strokeWidth={2.6} />}
        </button>
      }
    >
      <div className="container form">
        <div className="group" style={{ marginTop: 20 }}>
          {(["telegram", "vk"] as const).map((provider) => {
            const identity = profile.identities.find((item) => item.provider === provider);
            return (
              <div key={provider} className="group-row with-icon">
                <span className="platform-badge" style={{ width: 30, height: 30, background: PROVIDER_COLORS[provider], color: "#fff", borderRadius: 8 }}>
                  <ProviderIcon provider={provider} size={17} />
                </span>
                <div className="grow col" style={{ minWidth: 0 }}>
                  <span>{NAMES[provider]}</span>
                  <span className="secondary ellipsis" style={{ fontSize: 13 }}>
                    {identity ? (identity.username ? (provider === "telegram" ? `@${identity.username}` : identity.username) : identity.displayName ?? t("profile.connected")) : "—"}
                  </span>
                </div>
                {identity ? (
                  <button className="btn-plain" style={{ color: "var(--red)", padding: 0, fontSize: 15 }} onClick={() => void unlink(provider)} disabled={busy === `unlink-${provider}`}>
                    {busy === `unlink-${provider}` ? <Spinner size={14} /> : t("profile.unlink")}
                  </button>
                ) : (
                  <button className="btn-plain" style={{ padding: 0, fontSize: 15 }} onClick={() => void createLink(provider)} disabled={!available[provider] || busy === provider}>
                    {busy === provider ? <Spinner size={14} /> : t(provider === "telegram" ? "profile.link.telegram" : "profile.link.vk")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="group-footer">{t("profile.linked.hint")}</div>

        {link && url && (
          <>
            <div className="group" style={{ marginTop: 24 }}>
              <button className="group-row with-icon" onClick={() => platform.openLink(url)}>
                <span className="ico">
                  <ExternalLink size={19} />
                </span>
                <span className="grow" style={{ color: "var(--accent-text)" }}>
                  {NAMES[link.provider]}
                </span>
              </button>
              <button className="group-row with-icon" onClick={() => void copyText(url).then((ok) => ok && toast(t("common.copied"), "success"))}>
                <span className="ico">
                  <Copy size={19} />
                </span>
                <span className="grow" style={{ color: "var(--accent-text)" }}>
                  {t("profile.link.copy")}
                </span>
              </button>
            </div>
            <div className="group-footer">{t("profile.link.open")}</div>
          </>
        )}
      </div>
    </Sheet>
  );
}
