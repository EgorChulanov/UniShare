import { Check, CircleCheck, CircleHelp, Ellipsis, Hand, MessageSquareWarning, UserMinus, UserX } from "lucide-react";
import { useState, type ReactNode } from "react";
import { LIMITS, REPORT_REASONS } from "@unishare/shared";
import { useApp } from "../app/store";
import { api } from "../lib/api";
import { useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { Sheet, Spinner } from "../components/ui";

const ICONS: Record<(typeof REPORT_REASONS)[number]["icon"], ReactNode> = {
  spam: <MessageSquareWarning size={18} />,
  content: <Hand size={18} />,
  harassment: <UserX size={18} />,
  fake: <CircleHelp size={18} />,
  underage: <UserMinus size={18} />,
  other: <Ellipsis size={18} />,
};

export function ReportSheet({ uid, username }: { uid: string; username: string }) {
  const t = useT();
  const pop = useApp((state) => state.pop);
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    try {
      await api.report(uid, reason, details.trim());
      platform.haptic("success");
      setSent(true);
    } catch (error) {
      useApp.getState().toastError(error);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Sheet title={t("report.submitted")}>
        <div className="empty">
          <div className="ico glass" style={{ color: "var(--success)" }}>
            <CircleCheck size={34} />
          </div>
          <h3>{t("report.submitted")}</h3>
          <div>{t("report.submitted.subtitle")}</div>
          <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={pop}>
            {t("report.done")}
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={t("report.title", username)}
      footer={
        <button className="btn btn-danger btn-block" disabled={!reason || busy} onClick={() => void submit()}>
          {busy ? <Spinner size={20} /> : t("report.send")}
        </button>
      }
    >
      <p className="muted" style={{ margin: "4px 4px 14px", fontWeight: 600 }}>
        {t("report.question")}
      </p>
      <div className="glass settings-group">
        {REPORT_REASONS.map((item) => (
          <button
            key={item.key}
            className="settings-row"
            aria-pressed={reason === item.key}
            onClick={() => {
              platform.haptic("selection");
              setReason(item.key);
            }}
          >
            <span className="ico" style={{ background: reason === item.key ? "var(--danger)" : "var(--text-3)" }}>
              {ICONS[item.icon]}
            </span>
            <span className="grow">{t(item.key)}</span>
            {reason === item.key && <Check size={18} color="var(--danger)" />}
          </button>
        ))}
      </div>
      <label className="label" style={{ marginTop: 16 }} htmlFor="report-details">
        {t("report.details")}
      </label>
      <textarea
        id="report-details"
        className="field"
        rows={reason === "report.reason.other" ? 4 : 2}
        maxLength={LIMITS.reportDetailsMax}
        value={details}
        onChange={(event) => setDetails(event.target.value)}
      />
    </Sheet>
  );
}
