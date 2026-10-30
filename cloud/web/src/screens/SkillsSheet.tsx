// Port of UniShare/Features/Profile/SkillsProfileSetupView.swift (four steps).
import { AnimatePresence, motion } from "framer-motion";
import { Images, PlusCircle, XCircle } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { LIMITS, SUGGESTED_SKILLS } from "@unishare/shared";
import { useApp } from "../app/store";
import { api } from "../lib/api";
import { useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { Sheet, Spinner } from "../components/ui";

const STEPS = 4;
const MAX_PHOTOS = 6;

export function SkillsSheet() {
  const t = useT();
  const profile = useApp((state) => state.profile)!;
  const setProfile = useApp((state) => state.setProfile);
  const toastError = useApp((state) => state.toastError);
  const pop = useApp((state) => state.pop);

  const [step, setStep] = useState(0);
  const [skills, setSkills] = useState<string[]>(profile.skills);
  const [custom, setCustom] = useState("");
  const [description, setDescription] = useState(profile.skillsDescription ?? "");
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => photos.forEach((url) => URL.revokeObjectURL(url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const allSkills = [...SUGGESTED_SKILLS, ...skills.filter((skill) => !SUGGESTED_SKILLS.includes(skill))];

  const toggle = (skill: string) => {
    platform.haptic("light");
    setSkills((current) => (current.includes(skill) ? current.filter((item) => item !== skill) : current.length >= LIMITS.skills ? current : [...current, skill]));
  };

  const addCustom = () => {
    const value = custom.trim().slice(0, 40);
    // The server drops skills shorter than 2 characters (profileUpdateToColumns).
    if (value.length < 2) return;
    if (!skills.some((skill) => skill.toLowerCase() === value.toLowerCase()) && skills.length < LIMITS.skills) setSkills((current) => [...current, value]);
    setCustom("");
    platform.haptic("light");
  };

  const onPhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, MAX_PHOTOS);
    event.target.value = "";
    if (!files.length) return;
    photos.forEach((url) => URL.revokeObjectURL(url));
    setPhotos(files.map((file) => URL.createObjectURL(file)));
  };

  const save = async () => {
    setSaving(true);
    try {
      setProfile(await api.updateMe({ skills, skillsDescription: description.trim() || null, hasSkillsProfile: true }));
      platform.haptic("success");
      pop();
    } catch (error) {
      toastError(error);
    } finally {
      setSaving(false);
    }
  };

  const canProceed = step !== 0 || skills.length > 0;

  return (
    <Sheet
      title={t("skills.sheet.title")}
      lead={
        <button className="btn-plain secondary" onClick={pop}>
          {t("cancel")}
        </button>
      }
      trail={
        <span className="step-count" aria-live="polite">
          {step + 1}/{STEPS}
        </span>
      }
      footer={
        <div className="row" style={{ gap: 14, padding: "12px 24px calc(var(--safe-bottom) + 24px)", maxWidth: 608, width: "100%", margin: "0 auto" }}>
          {step > 0 && (
            <button className="btn-secondary" onClick={() => setStep(step - 1)}>
              {t("back")}
            </button>
          )}
          <button className="btn-primary" style={{ flex: 1, borderRadius: 16 }} disabled={!canProceed || saving} onClick={() => (step < STEPS - 1 ? setStep(step + 1) : void save())}>
            {saving ? <Spinner size={20} /> : t(step < STEPS - 1 ? "next" : "save")}
          </button>
        </div>
      }
    >
      <div className="brand-bg" style={{ position: "absolute", zIndex: -1 }} aria-hidden />
      <div className="container">
        <div className="progress-caps" style={{ padding: "8px 24px 24px" }}>
          {Array.from({ length: STEPS }, (_, index) => (
            <span key={index} className={index <= step ? "on" : ""} />
          ))}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }} className="col" style={{ gap: 20, padding: "0 24px 20px" }}>
            {step === 0 && (
              <>
                <StepTitle title={t("skills.setup.question")} subtitle={t("skills.setup.question.subtitle")} />
                <div className="flow" style={{ gap: 10 }}>
                  {allSkills.map((skill) => (
                    <button key={skill} className={`skill-option ${skills.includes(skill) ? "selected" : ""}`} onClick={() => toggle(skill)}>
                      {skill}
                    </button>
                  ))}
                </div>
                <form
                  className="row"
                  style={{ gap: 10 }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    addCustom();
                  }}
                >
                  <input className="plain-input grow" value={custom} maxLength={40} onChange={(event) => setCustom(event.target.value)} placeholder={t("skills.setup.custom")} />
                  <AnimatePresence>
                    {custom.trim().length >= 2 && (
                      <motion.button type="submit" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} style={{ display: "flex", color: "var(--primary)" }} aria-label={t("profile.add.game")}>
                        <PlusCircle size={28} fill="currentColor" color="var(--bg)" />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </form>
              </>
            )}
            {step === 1 && (
              <>
                <StepTitle title={t("skills.setup.about.title")} subtitle={t("skills.setup.about.subtitle")} />
                <textarea className="textarea" style={{ height: 180, borderRadius: 16, padding: 14 }} maxLength={LIMITS.skillsDescriptionMax} value={description} onChange={(event) => setDescription(event.target.value)} />
                {!description && (
                  <span className="secondary" style={{ fontSize: 13, opacity: 0.6 }}>
                    {t("skills.setup.about.example")}
                  </span>
                )}
              </>
            )}
            {step === 2 && (
              <>
                <StepTitle title={t("skills.setup.portfolio.title")} subtitle={t("skills.setup.portfolio.subtitle")} />
                {photos.length > 0 && (
                  <div className="h-scroll" style={{ margin: "0 -24px", padding: "6px 24px 0", gap: 10 }}>
                    {photos.map((url, index) => (
                      <div key={url} style={{ position: "relative", flexShrink: 0 }}>
                        <img src={url} alt="" style={{ width: 110, height: 110, objectFit: "cover", borderRadius: 12 }} />
                        <button
                          style={{ position: "absolute", right: -4, top: -4, color: "#fff", display: "flex", filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.4))" }}
                          onClick={() => setPhotos((current) => current.filter((_, i) => i !== index))}
                          aria-label={t("delete")}
                        >
                          <XCircle size={22} fill="rgba(0,0,0,0.35)" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={onPhotos} />
                <button className="portfolio-add" onClick={() => fileInput.current?.click()}>
                  <Images size={20} color="var(--accent-text)" />
                  <span className="grow" style={{ fontSize: 15, fontWeight: 500 }}>
                    {t(photos.length ? "skills.setup.portfolio.more" : "skills.setup.portfolio.add")}
                  </span>
                  <span className="secondary" style={{ fontSize: 13 }}>
                    {photos.length}/{MAX_PHOTOS}
                  </span>
                </button>
                <span className="secondary" style={{ fontSize: 12, opacity: 0.7 }}>
                  {t("skills.setup.portfolio.help")}
                </span>
              </>
            )}
            {step === 3 && (
              <div className="col" style={{ gap: 24 }}>
                {skills.length > 0 && (
                  <div className="col" style={{ gap: 12 }}>
                    <span className="caption" style={{ fontSize: 14 }}>
                      {t("skills.setup.your")}
                    </span>
                    <div className="flow">
                      {skills.map((skill) => (
                        <span key={skill} className="skill-option selected" style={{ fontSize: 13, padding: "7px 12px", transform: "none" }}>
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {description.trim() && (
                  <div className="col" style={{ gap: 8 }}>
                    <span className="caption" style={{ fontSize: 14 }}>
                      {t("skills.setup.about.title")}
                    </span>
                    <span style={{ fontSize: 14, padding: 14, background: "var(--card)", borderRadius: 12, whiteSpace: "pre-line" }}>{description.trim()}</span>
                  </div>
                )}
                <span className="secondary" style={{ fontSize: 13, textAlign: "center", padding: "0 8px" }}>
                  {t("skills.setup.confirm")}
                </span>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </Sheet>
  );
}

function StepTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="col" style={{ gap: 6 }}>
      <span style={{ fontSize: 22, fontWeight: 700 }}>{title}</span>
      <span className="secondary" style={{ fontSize: 14 }}>
        {subtitle}
      </span>
    </div>
  );
}
