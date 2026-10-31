// Port of UniShare/Features/Profile/SettingsSheet.swift (List, inset grouped),
// plus the web-only rows: linked accounts, bot notifications, home screen.
import { AnimatePresence } from "framer-motion";
import { Bell, Bug, Check, ChevronRight, FileText, Hand, Info, Link2, LogOut, Mail, ShieldCheck, Smartphone, Trash2, UserRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useApp, type ThemeMode } from "../app/store";
import { api, setToken } from "../lib/api";
import { LANGUAGES, useI18n, useT, type Language } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { ActionSheet, PROVIDER_COLORS, ProviderIcon, Sheet, Spinner, Toggle } from "../components/ui";

function legalUrl(file: string): string {
  return new URL(`/legal/${file}`, window.location.origin).toString();
}

function CheckRow({ label, selected, onClick }: { label: string; selected: boolean; onClick(): void }) {
  return (
    <button className="group-row" onClick={onClick} aria-pressed={selected}>
      <span className="grow">{label}</span>
      {selected && <Check size={18} strokeWidth={2.6} color="var(--accent-text)" />}
    </button>
  );
}

function LinkRow({ icon, label, detail, onClick }: { icon: ReactNode; label: string; detail?: ReactNode; onClick(): void }) {
  return (
    <button className="group-row with-icon" onClick={onClick}>
      <span className="ico">{icon}</span>
      <span className="grow">{label}</span>
      {detail}
      <ChevronRight size={16} className="secondary" style={{ opacity: 0.6 }} />
    </button>
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
  const [busy, setBusy] = useState<"notifications" | "delete" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
    setConfirmDelete(false);
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

  const themes: { id: ThemeMode; label: string }[] = [
    { id: "system", label: t("settings.theme.system") },
    { id: "light", label: t("settings.theme.light") },
    { id: "dark", label: t("settings.theme.dark") },
  ];
  const linked = profile.identities.map((item) => item.provider);

  return (
    <Sheet title={t("profile.settings")}>
      <div className="container form">
        {profile.isAdmin && (
          <>
            <div className="group" style={{ marginTop: 12 }}>
              <LinkRow icon={<ShieldCheck size={20} />} label={t("settings.admin")} onClick={() => push({ type: "admin" })} />
            </div>
            <div className="group-footer">{t("settings.admin.hint")}</div>
          </>
        )}

        <div className="group-title">{t("profile.theme")}</div>
        <div className="group">
          {themes.map((item) => (
            <CheckRow
              key={item.id}
              label={item.label}
              selected={themeMode === item.id}
              onClick={() => {
                platform.haptic("selection");
                setThemeMode(item.id);
              }}
            />
          ))}
        </div>

        <div className="group-title">{t("profile.language")}</div>
        <div className="group">
          {LANGUAGES.map((item) => (
            <CheckRow key={item.id} label={item.name} selected={language === item.id} onClick={() => void changeLanguage(item.id)} />
          ))}
        </div>

        <div className="group-title">{t("settings.account")}</div>
        <div className="group">
          <LinkRow
            icon={<Link2 size={20} />}
            label={t("profile.linked")}
            onClick={() => push({ type: "link" })}
            detail={
              <span className="row" style={{ gap: 4 }}>
                {linked.map((item) => (
                  <span key={item} className="platform-badge" style={{ width: 22, height: 22, background: PROVIDER_COLORS[item], color: "#fff" }}>
                    <ProviderIcon provider={item} size={12} />
                  </span>
                ))}
              </span>
            }
          />
          <div className="group-row with-icon">
            <span className="ico">
              <UserRound size={20} />
            </span>
            <span className="grow">{t("settings.contact")}</span>
            <Toggle on={profile.allowDirectContact} onChange={(value) => void toggleContact(value)} label={t("settings.contact")} />
          </div>
          {notificationsAvailable && provider && (
            <div className="group-row with-icon">
              <span className="ico">
                <Bell size={20} />
              </span>
              <span className="grow">{t("settings.notifications")}</span>
              {identity?.canMessage ? (
                <Check size={18} strokeWidth={2.6} color="var(--green)" />
              ) : (
                <button className="btn-plain" style={{ padding: 0 }} onClick={() => void enableNotifications()} disabled={busy === "notifications"}>
                  {busy === "notifications" ? <Spinner size={16} /> : t("settings.notifications.enable")}
                </button>
              )}
            </div>
          )}
          {platform.canAddToHomeScreen() && <LinkRow icon={<Smartphone size={20} />} label={t("settings.home")} onClick={() => void platform.addToHomeScreen?.()} />}
        </div>
        <div className="group-footer">{t("settings.contact.hint")}</div>

        <div className="group-title">{t("settings.about")}</div>
        <div className="group">
          <LinkRow icon={<Info size={20} />} label={t("transparency.title")} onClick={() => push({ type: "transparency" })} />
          <LinkRow icon={<Hand size={20} />} label={t("settings.privacy")} onClick={() => platform.openLink(config?.privacyUrl ?? legalUrl("privacy.html"))} />
          <LinkRow icon={<FileText size={20} />} label={t("settings.terms")} onClick={() => platform.openLink(config?.termsUrl ?? legalUrl("terms.html"))} />
          <LinkRow icon={<Bug size={20} />} label={t("settings.bug")} onClick={() => push({ type: "bug" })} />
          <LinkRow icon={<Mail size={20} />} label={t("settings.support")} onClick={() => platform.openLink(legalUrl("support.html"))} />
        </div>

        <div className="group" style={{ marginTop: 34 }}>
          {platform.kind === "web" && (
            <button className="group-row destructive" onClick={() => void signOut()}>
              <LogOut size={19} /> {t("profile.logout")}
            </button>
          )}
          <button className="group-row destructive" disabled={busy === "delete"} onClick={() => setConfirmDelete(true)}>
            <Trash2 size={19} /> <span className="grow">{t("settings.delete.account")}</span>
            {busy === "delete" && <Spinner size={16} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {confirmDelete && (
          <ActionSheet
            title={t("settings.delete.title")}
            message={t("settings.delete.message")}
            actions={[{ label: t("settings.delete.confirm"), destructive: true, onSelect: () => void deleteAccount() }]}
            cancelLabel={t("settings.delete.cancel")}
            onCancel={() => setConfirmDelete(false)}
          />
        )}
      </AnimatePresence>
    </Sheet>
  );
}
