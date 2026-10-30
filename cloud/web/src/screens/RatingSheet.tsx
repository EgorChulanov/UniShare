// Port of UniShare/Features/Chat/RatingSheet.swift.
import { Check, Star } from "lucide-react";
import { useState } from "react";
import { LIMITS } from "@unishare/shared";
import { useApp } from "../app/store";
import { api } from "../lib/api";
import { useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { Sheet, Spinner } from "../components/ui";

export function RatingSheet({ chatId, uid, username }: { chatId: string; uid: string; username: string }) {
  const t = useT();
  const pop = useApp((state) => state.pop);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submit = async () => {
    if (!rating || busy || submitted) return;
    setBusy(true);
    try {
      await api.review(uid, chatId, rating, comment.trim());
      setSubmitted(true);
      platform.haptic("success");
      window.dispatchEvent(new CustomEvent("unishare:reviewed", { detail: chatId }));
      setTimeout(pop, 800);
    } catch (error) {
      useApp.getState().toastError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      detent="medium"
      lead={
        <button className="btn-plain secondary" onClick={pop}>
          {t("skip")}
        </button>
      }
      trail={null}
    >
      <div className="brand-bg" style={{ position: "absolute", zIndex: -1 }} aria-hidden />
      <div className="container col" style={{ gap: 28, padding: "20px 24px" }}>
        <div className="col" style={{ gap: 12, alignItems: "center", textAlign: "center" }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{t("rating.title", username)}</h3>
          <span className="secondary" style={{ fontSize: 14 }}>
            {t("rating.subtitle")}
          </span>
          <div className="row" style={{ gap: 14, marginTop: 4 }} role="radiogroup">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                role="radio"
                aria-checked={rating === value}
                aria-label={`${value}`}
                className="rating-star"
                style={{ transform: value <= rating ? "scale(1.15)" : undefined }}
                onClick={() => {
                  platform.haptic("light");
                  setRating(value);
                }}
              >
                <Star size={36} color={value <= rating ? "var(--yellow)" : "color-mix(in srgb, var(--text-2) 40%, transparent)"} fill={value <= rating ? "var(--yellow)" : "none"} strokeWidth={1.6} />
              </button>
            ))}
          </div>
        </div>
        <div className="col" style={{ gap: 8 }}>
          <label className="secondary" style={{ fontSize: 13, fontWeight: 500 }} htmlFor="rating-comment">
            {t("rating.comment")}
          </label>
          <textarea id="rating-comment" className="textarea" style={{ height: 110 }} maxLength={LIMITS.reviewMax} value={comment} onChange={(event) => setComment(event.target.value)} />
        </div>
        <button className="btn-primary" style={{ borderRadius: 16 }} disabled={!rating || submitted} onClick={() => void submit()}>
          {busy ? <Spinner size={20} /> : submitted ? (
            <>
              <Check size={18} strokeWidth={3} /> {t("rating.sent")}
            </>
          ) : (
            t("rating.submit")
          )}
        </button>
      </div>
    </Sheet>
  );
}
