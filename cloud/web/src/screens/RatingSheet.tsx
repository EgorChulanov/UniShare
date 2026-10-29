import { Star } from "lucide-react";
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

  const submit = async () => {
    if (!rating) return;
    setBusy(true);
    try {
      await api.review(uid, chatId, rating, comment.trim());
      useApp.getState().toast(t("rating.sent"), "success");
      pop();
    } catch (error) {
      useApp.getState().toastError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={t("chat.review.title")}
      footer={
        <button className="btn btn-primary btn-block" disabled={!rating || busy} onClick={() => void submit()}>
          {busy ? <Spinner size={20} /> : t("rating.submit")}
        </button>
      }
    >
      <div className="col" style={{ alignItems: "center", textAlign: "center", gap: 6, padding: "8px 0 18px" }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{t("rating.title", username)}</h3>
        <div className="muted">{t("rating.subtitle")}</div>
        <div className="row" style={{ gap: 8, marginTop: 14 }} role="radiogroup">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              role="radio"
              aria-checked={rating === value}
              aria-label={`${value}`}
              onClick={() => {
                platform.haptic("selection");
                setRating(value);
              }}
              style={{ transition: "transform 0.18s var(--ease-spring)", transform: value <= rating ? "scale(1.08)" : undefined }}
            >
              <Star size={40} color="#FFB020" fill={value <= rating ? "#FFB020" : "none"} strokeWidth={1.8} />
            </button>
          ))}
        </div>
      </div>
      <label className="label" htmlFor="rating-comment">
        {t("rating.comment")}
      </label>
      <textarea
        id="rating-comment"
        className="field"
        rows={3}
        maxLength={LIMITS.reviewMax}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
      />
    </Sheet>
  );
}
