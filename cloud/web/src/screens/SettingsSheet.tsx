import { Bell, ChevronRight, FileText, Globe, Info, Link2, LogOut, Mail, Moon, Shield, Smartphone, Sun, SunMoon, Trash2, UserRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useApp, type ThemeMode } from "../app/store";
import { api, setToken } from "../lib/api";
import { LANGUAGES, useI18n, useT, type Language } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { Sheet, Spinner, Toggle } from "../components/ui";

const APP_VERSION = "1.0.0";

function Row({ icon, color, title, subtitle, right, onClick, danger }: { icon: ReactNode; color: string; title: string; subtitle?: string; right?: ReactNode; onClick?: () => void; danger?: boolean }) {
  const content = (
    <>
      <span className="ico" style={{ background: color }}>{icon}</span>
      <div className="grow">
        <div style={{ color: danger ? "var(--danger)" : undefined }}>{title}</div>
        {subtitle && <div className="muted" style={{ fontSize: 12.5, fontWeight: 600, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {right ?? (onClick ? <ChevronRight size={18} className="faint" /> : null)}
    </>
  );
  return onClick ? (
    <button className="settings-row" onClick={onClick}>{content}</button>
  ) : (
    <div className="settings-row">{content}</div>
  );
}

export function SettingsSheet() {
  const t = useT();
  const profile = useApp((state) => state.profile)!;
  const config = useApp((state) => state.config);
  const themeMode = useApp((state) => state.themeMode);
  const setThemeMode = useApp((state) => state.setThemeMode);
  const setProfile = useApp((state) => state.setProfile);
  const push = useApp((state) => state.push);
  const signOut = useApp((state) => state.signOut);
  const toast = useApp((state) => state.toast);
  const toastError = useApp((state) => state.toastError);
  const language = useI18n((state) => state.language);
  const setLanguage = useI18n((state) => state.setLanguage);
  const [busy, setBusy] = useState<string | null>(null);

  const provider = platform.kind === "telegram" ? "telegram" : platform.kind === "vk" ? "vk" : null;
  const identity = provider ? profile.identities.find((item) => item.provider === provider) : undefined;
  const notificationsAvailable = provider === "telegram" || (provider === "vk" && Boolean(config?.vkGroupId));

  const changeLanguage = async (value: Language) => {
    if (value === language) return;
    platform.haptic("selection");
    setLanguage(value);
    try {
      setProfile(await api.updateMe({ language: value }));
    } catch (error) {
      toastError(error);
    }
  };

  const enableNotifications = async () => {
    if (!provider || !platform.requestNotifications) return;
    setBusy("notifications");
    try {
      const allowed = await platform.requestNotifications(config?.vkGroupId ?? null);
      setProfile(await api.setNotifications(provider, allowed));
      if (allowed) toast(t("common.saved"), "success");
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(null);
    }
  };

  const toggleContact = async (value: boolean) => {
    try {
      setProfile(await api.updateMe({ allowDirectContact: value }));
    } catch (error) {
      toastError(error);
    }
  };

  const deleteAccount = async () => {
    if (!window.confirm(`${t("settings.delete.title")}\n\n${t("settings.delete.message")}`)) return;
    setBusy("delete");
    try {
      await api.deleteAccount();
      setToken(null);
      window.location.reload();
    } catch (error) {
      toastError(error);
      setBusy(null);
    }
  };

  const themes: { id: ThemeMode; label: string; icon: ReactNode }[] = [
    { id: "system", label: t("settings.theme.system"), icon: <SunMoon size={17} /> },
    { id: "light", label: t("settings.theme.light"), icon: <Sun size={17} /> },
    { id: "dark", label: t("settings.theme.dark"), icon: <Moon size={17} /> },
  ];

  return (
    <Sheet full title={t("profile.settings")}>
      <div className="col" style={{ gap: 6 }}>
        <div className="section-title" style={{ marginTop: 6 }}>{t("profile.theme")}</div>
        <div className="settings-group glass">
          {themes.map((item) => (
            <Row
              key={item.id}
              icon={item.icon}
              color="#5856D6"
              title={item.label}
              onClick={() => {
                platform.haptic("selection");
                setThemeMode(item.id);
              }}
              right={themeMode === item.id ? <span className="pill" style={{ color: "var(--primary)" }}>✓</span> : <span />}
            />
          ))}
        </div>

        <div className="section-title">{t("profile.language")}</div>
        <div className="settings-group glass">
          {LANGUAGES.map((item) => (
            <Row
              key={item.id}
              icon={<Globe size={17} />}
              color="#0A84FF"
              title={item.name}
              onClick={() => void changeLanguage(item.id)}
              right={language === item.id ? <span className="pill" style={{ color: "var(--primary)" }}>✓</span> : <span />}
            />
          ))}
        </div>

        <div className="section-title">{t("settings.notifications")}</div>
        <div className="settings-group glass">
          {notificationsAvailable && provider && (
            <Row
              icon={<Bell size={17} />}
              color="#FF9F0A"
              title={t("settings.notifications")}
              subtitle={t(provider === "telegram" ? "settings.notifications.telegram" : "settings.notifications.vk")}
              right={
                identity?.canMessage ? (
                  <span className="pill" style={{ color: "var(--success)" }}>{t("profile.connected")}</span>
                ) : (
                  <button className="chip selected" onClick={() => void enableNotifications()} disabled={busy === "notifications"}>
                    {busy === "notifications" ? <Spinner size={14} /> : t("settings.notifications.enable")}
                  </button>
                )
              }
            />
          )}
          <Row
            icon={<UserRound size={17} />}
            color="#30D158"
            title={t("settings.contact")}
            subtitle={t("settings.contact.hint")}
            right={<Toggle on={profile.allowDirectContact} onChange={(value) => void toggleContact(value)} label={t("settings.contact")} />}
          />
          <Row icon={<Link2 size={17} />} color="#2AABEE" title={t("profile.linked")} subtitle={t("profile.linked.hint")} onClick={() => push({ type: "link" })} />
          {platform.canAddToHomeScreen() && (
            <Row icon={<Smartphone size={17} />} color="#64D2FF" title={t("settings.home")} onClick={() => void platform.addToHomeScreen?.()} />
          )}
        </div>

        <div className="section-title">{t("settings.about")}</div>
        <div className="settings-group glass">
          <Row icon={<Info size={17} />} color="#0057FF" title={t("transparency.title")} onClick={() => push({ type: "transparency" })} />
          <Row icon={<Shield size={17} />} color="#8E8E93" title={t("settings.privacy")} onClick={() => platform.openLink(config?.privacyUrl ?? "/legal/privacy.html")} />
          <Row icon={<FileText size={17} />} color="#8E8E93" title={t("settings.terms")} onClick={() => platform.openLink(config?.termsUrl ?? "/legal/terms.html")} />
          <Row
            icon={<Mail size={17} />}
            color="#8E8E93"
            title={t("settings.support")}
            subtitle={config?.supportEmail}
            onClick={() => {
              window.location.href = `mailto:${config?.supportEmail ?? "official@egorchulanov.ru"}`;
            }}
          />
        </div>

        <div className="settings-group glass" style={{ marginTop: 18 }}>
          {platform.kind === "web" && (
            <Row icon={<LogOut size={17} />} color="#FF453A" title={t("profile.logout")} danger onClick={() => void signOut()} />
          )}
          <Row
            icon={busy === "delete" ? <Spinner size={16} /> : <Trash2 size={17} />}
            color="#FF453A"
            title={t("settings.delete.account")}
            danger
            onClick={() => void deleteAccount()}
          />
        </div>

        <div className="faint center" style={{ fontSize: 12, padding: "18px 0 4px" }}>
          UniShare {t("settings.version")} {APP_VERSION} · {platform.kind === "telegram" ? "Telegram" : platform.kind === "vk" ? "VK" : "Web"}
        </div>
      </div>
    </Sheet>
  );
}
