import { Ban, CreditCard, Flag, Layers, MessageCircle, QrCode, ShieldCheck, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "../i18n/i18n";
import { Sheet } from "../components/ui";

function Item({ icon, color, title, detail }: { icon: ReactNode; color: string; title: string; detail: string }) {
  return (
    <div className="row" style={{ alignItems: "flex-start", gap: 12, padding: "10px 4px" }}>
      <span className="platform-badge" style={{ width: 40, height: 40, borderRadius: 12, background: color, color: "#fff" }}>{icon}</span>
      <div className="grow">
        <div style={{ fontWeight: 800 }}>{title}</div>
        <div className="muted" style={{ fontSize: 14, marginTop: 2 }}>{detail}</div>
      </div>
    </div>
  );
}

export function TransparencySheet() {
  const t = useT();
  return (
    <Sheet full title={t("transparency.title")}>
      <div className="section-title" style={{ marginTop: 4 }}>{t("transparency.features")}</div>
      <div className="glass card">
        <Item icon={<Layers size={19} />} color="#0057FF" title={t("transparency.feed.title")} detail={t("transparency.feed.detail")} />
        <Item icon={<MessageCircle size={19} />} color="#30D158" title={t("transparency.chat.title")} detail={t("transparency.chat.detail")} />
        <Item icon={<QrCode size={19} />} color="#7B5CFF" title={t("transparency.nearby.title")} detail={t("transparency.nearby.detail")} />
        <Item icon={<UserRound size={19} />} color="#FF9F0A" title={t("transparency.profile.title")} detail={t("transparency.profile.detail")} />
      </div>
      <div className="section-title">{t("transparency.safety")}</div>
      <div className="glass card">
        <Item icon={<Ban size={19} />} color="#FF453A" title="UniShare" detail={t("transparency.not.marketplace")} />
        <Item icon={<CreditCard size={19} />} color="#FF453A" title={t("transparency.credentials.title")} detail={t("transparency.no.credentials")} />
        <Item icon={<Flag size={19} />} color="#8E8E93" title={t("chat.report")} detail={t("transparency.report")} />
        <Item icon={<ShieldCheck size={19} />} color="#30D158" title={t("transparency.data.title")} detail={t("transparency.data.detail")} />
      </div>
    </Sheet>
  );
}
