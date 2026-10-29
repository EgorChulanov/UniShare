import { Check, Plus, X } from "lucide-react";
import { useState } from "react";
import { LIMITS, SUGGESTED_SKILLS } from "@unishare/shared";
import { useApp } from "../app/store";
import { api } from "../lib/api";
import { useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { Sheet, Spinner } from "../components/ui";

const STEPS = 3;

export function SkillsSheet() {
  const t = useT();
  const profile = useApp((state) => state.profile)!;
  const setProfile = useApp((state) => state.setProfile);
  const toast = useApp((state) => state.toast);
  const toastError = useApp((state) => state.toastError);
  const pop = useApp((state) => state.pop);

  const [step, setStep] = useState(0);
  const [skills, setSkills] = useState<string[]>(profile.skills);
  const [custom, setCustom] = useState("");
  const [description, setDescription] = useState(profile.skillsDescription ?? "");
  const [saving, setSaving] = useState(false);

  const allSkills = [...SUGGESTED_SKILLS, ...skills.filter((skill) => !SUGGESTED_SKILLS.includes(skill))];

  const toggle = (skill: string) => {
    platform.haptic("selection");
    setSkills((current) =>
      current.includes(skill) ? current.filter((item) => item !== skill) : current.length >= LIMITS.skills ? current : [...current, skill],
    );
  };

  const addCustom = () => {
    const value = custom.trim().slice(0, 40);
    if (value.length < 2) return;
    if (!skills.some((skill) => skill.toLowerCase() === value.toLowerCase()) && skills.length < LIMITS.skills) {
      setSkills((current) => [...current, value]);
    }
    setCustom("");
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.updateMe({ skills, skillsDescription: description.trim() || null, hasSkillsProfile: true });
      setProfile(updated);
      toast(t("common.saved"), "success");
      pop();
    } catch (error) {
      toastError(error);
    } finally {
      setSaving(false);
    }
  };

  const canContinue = step !== 0 || skills.length > 0;

  return (
    <Sheet
      full
      title={t(profile.hasSkillsProfile ? "profile.skills.edit" : "profile.skills.create")}
      footer={
        <div className="row" style={{ gap: 10 }}>
          {step > 0 && (
            <button className="btn btn-glass" onClick={() => setStep(step - 1)}>
              {t("back")}
            </button>
          )}
          <button
            className="btn btn-primary grow"
            disabled={!canContinue || saving}
            onClick={() => (step < STEPS - 1 ? setStep(step + 1) : void save())}
          >
            {saving ? <Spinner size={20} /> : step === STEPS - 1 ? <Check size={18} /> : null}
            {t(step < STEPS - 1 ? "next" : "save")}
          </button>
        </div>
      }
    >
      <div className="progress" style={{ marginBottom: 20 }}>
        <span style={{ width: `${((step + 1) / STEPS) * 100}%` }} />
      </div>

      {step === 0 && (
        <div className="col" style={{ gap: 14 }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800 }}>{t("skills.setup.question")}</h3>
            <div className="muted">{t("skills.setup.question.subtitle")}</div>
          </div>
          <div className="chips">
            {allSkills.map((skill) => (
              <button key={skill} className={`chip ${skills.includes(skill) ? "selected" : ""}`} onClick={() => toggle(skill)}>
                {skills.includes(skill) && <Check size={14} />}
                {skill}
              </button>
            ))}
          </div>
          <div className="row">
            <input
              className="field grow"
              value={custom}
              maxLength={40}
              placeholder={t("skills.setup.custom")}
              onChange={(event) => setCustom(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && addCustom()}
            />
            <button className="icon-btn" onClick={addCustom} disabled={custom.trim().length < 2} aria-label={t("skills.setup.custom")}>
              <Plus size={20} />
            </button>
          </div>
          <div className="hint">{skills.length}/{LIMITS.skills}</div>
        </div>
      )}

      {step === 1 && (
        <div className="col" style={{ gap: 14 }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800 }}>{t("skills.setup.about.title")}</h3>
            <div className="muted">{t("skills.setup.about.subtitle")}</div>
          </div>
          <textarea
            className="field"
            rows={6}
            maxLength={LIMITS.skillsDescriptionMax}
            value={description}
            placeholder={t("skills.setup.about.example")}
            onChange={(event) => setDescription(event.target.value)}
          />
          <div className="hint" style={{ textAlign: "right" }}>{description.length}/{LIMITS.skillsDescriptionMax}</div>
        </div>
      )}

      {step === 2 && (
        <div className="col" style={{ gap: 14 }}>
          <div className="glass card col">
            <b>{t("skills.setup.your")}</b>
            <div className="chips">
              {skills.map((skill) => (
                <button key={skill} className="chip selected" onClick={() => toggle(skill)}>
                  {skill} <X size={13} />
                </button>
              ))}
            </div>
          </div>
          {description.trim() && (
            <div className="glass card col">
              <b>{t("skills.setup.about.title")}</b>
              <div className="muted" style={{ whiteSpace: "pre-wrap" }}>{description.trim()}</div>
            </div>
          )}
          <div className="hint">{t("skills.setup.confirm")}</div>
        </div>
      )}
    </Sheet>
  );
}
