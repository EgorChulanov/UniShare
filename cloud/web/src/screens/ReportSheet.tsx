// Port of ReportSheet in UniShare/Features/Chat/ChatView.swift.
import { AnimatePresence, motion } from "framer-motion";
import { BadgeCheck, CheckCircle2, CircleEllipsis, CircleHelp, Hand, MessageSquareWarning, UserMinus, UserX } from "lucide-react";
import { useState, type ReactNode } from "react";
import { LIMITS, REPORT_REASONS } from "@unishare/shared";
import { useApp } from "../app/store";
import { api } from "../lib/api";
import { useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { Sheet, Spinner } from "../components/ui";

const ICONS: Record<(typeof REPORT_REASONS)[number]["icon"], ReactNode> = {
  spam: <MessageSquareWarning size={19} />,
  content: <Hand size={19} />,
  harassment: <UserX size={19} />,
  fake: <CircleHelp size={19} />,
  underage: <UserMinus size={19} />,
  other: <CircleEllipsis size={19} />,
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

  return (
    <Sheet
      title={t("report.title", username)}
      lead={
        <button className="btn-plain secondary" onClick={pop}>
          {t("cancel")}
        </button>
      }
      trail={
        sent ? null : (
          <button className="btn-plain" style={{ fontWeight: 600 }} disabled={!reason || busy} onClick={() => void submit()}>
            {busy ? <Spinner size={16} /> : t("report.send")}
          </button>
        )
      }
    >
      {sent ? (
        <div className="col" style={{ alignItems: "center", gap: 20, textAlign: "center", padding: "80px 32px 0" }}>
          <BadgeCheck size={56} fill="var(--green)" color="var(--bg)" />
          <span style={{ fontSize: 20, fontWeight: 600 }}>{t("report.submitted")}</span>
          <span className="secondary" style={{ fontSize: 14 }}>
            {t("report.submitted.subtitle")}
          </span>
          <button className="btn-primary" style={{ width: "auto", height: 44, padding: "0 32px", borderRadius: 999, background: "var(--primary)", fontSize: 15 }} onClick={pop}>
            {t("report.done")}
          </button>
        </div>
      ) : (
        <div className="container" style={{ paddingBottom: 32 }}>
          <p className="secondary" style={{ margin: 0, padding: "16px 24px 12px", fontSize: 14, textAlign: "center" }}>
            {t("report.question")}
          </p>
          <div className="report-list">
            {REPORT_REASONS.map((item) => (
              <button
                key={item.key}
                className={reason === item.key ? "selected" : ""}
                aria-pressed={reason === item.key}
                onClick={() => {
                  platform.haptic("selection");
                  setReason(item.key);
                }}
              >
                <span style={{ width: 28, display: "flex", justifyContent: "center", color: "var(--accent-text)" }}>{ICONS[item.icon]}</span>
                <span className="grow">{t(item.key)}</span>
                <AnimatePresence>
                  {reason === item.key && (
                    <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} style={{ display: "flex" }}>
                      <CheckCircle2 size={21} fill="var(--primary)" color="var(--card)" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            ))}
          </div>
          <AnimatePresence>
            {reason === "report.reason.other" && (
              <motion.textarea
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="textarea"
                style={{ margin: "12px 16px 0", width: "calc(100% - 32px)", border: 0, borderRadius: 16, padding: 14 }}
                rows={4}
                placeholder={t("report.details")}
                maxLength={LIMITS.reportDetailsMax}
                value={details}
                onChange={(event) => setDetails(event.target.value)}
              />
            )}
          </AnimatePresence>
        </div>
      )}
    </Sheet>
  );
}
