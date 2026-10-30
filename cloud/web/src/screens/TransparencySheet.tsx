// Port of UniShare/Features/Profile/ProductTransparencyView.swift.
import { KeyRound, Layers, MessageCircle, MessageSquareWarning, Radio, ShieldCheck, UserCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "../i18n/i18n";
import { Sheet } from "../components/ui";

function FeatureRow({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <div className="group-row" style={{ alignItems: "flex-start", padding: "14px 16px" }}>
      <span style={{ width: 24, display: "flex", justifyContent: "center", color: "var(--accent-text)", paddingTop: 2 }}>{icon}</span>
      <div className="grow col" style={{ gap: 3 }}>
        <span style={{ fontSize: 17, fontWeight: 600 }}>{title}</span>
        <span className="secondary" style={{ fontSize: 15 }}>
          {detail}
        </span>
      </div>
    </div>
  );
}

function SafetyRow({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="group-row" style={{ alignItems: "flex-start" }}>
      <span style={{ width: 24, display: "flex", justifyContent: "center", color: "var(--accent-text)", paddingTop: 2 }}>{icon}</span>
      <span className="grow" style={{ fontSize: 16 }}>
        {text}
      </span>
    </div>
  );
}

export function TransparencySheet() {
  const t = useT();
  return (
    <Sheet title={t("transparency.title")}>
      <div className="container form">
        <div className="group-title">{t("transparency.features")}</div>
        <div className="group">
          <FeatureRow icon={<Layers size={20} />} title={t("transparency.feed.title")} detail={t("transparency.feed.detail")} />
          <FeatureRow icon={<MessageCircle size={20} fill="currentColor" />} title={t("transparency.chat.title")} detail={t("transparency.chat.detail")} />
          <FeatureRow icon={<Radio size={20} />} title={t("transparency.airshare.title")} detail={t("transparency.airshare.detail")} />
          <FeatureRow icon={<UserCircle2 size={20} />} title={t("transparency.profile.title")} detail={t("transparency.profile.detail")} />
        </div>
        <div className="group-title">{t("transparency.safety")}</div>
        <div className="group">
          <SafetyRow icon={<ShieldCheck size={20} />} text={t("transparency.not.marketplace")} />
          <SafetyRow icon={<KeyRound size={20} />} text={t("transparency.no.credentials")} />
          <SafetyRow icon={<MessageSquareWarning size={20} />} text={t("transparency.report")} />
        </div>
      </div>
    </Sheet>
  );
}
