// "Report a problem" from Settings: a description, an optional screenshot and
// a few device details, sent to the admins (POST /api/bugs).
import { ImagePlus, Info, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { BUG_TEXT_MAX, BUG_TEXT_MIN, type BugContext } from "@unishare/shared";
import { version as packageVersion } from "../../package.json";
import { useApp } from "../app/store";
import { api, compressImage } from "../lib/api";
import { useI18n, useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { Sheet, Spinner } from "../components/ui";

/** Package version plus the hash of the built bundle, which tells deployments apart. */
function appVersion(): string {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]');
  const build = /index-([\w-]+)\.js/.exec(script?.src ?? "")?.[1];
  return build ? `${packageVersion}+${build.slice(0, 8)}` : `${packageVersion}${import.meta.env.DEV ? "-dev" : ""}`;
}

const CLIENT_NAMES = { telegram: "Telegram", vk: "VK", web: "Web" } as const;

function deviceContext(language: string): BugContext {
  let timezone: string | undefined;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    timezone = undefined;
  }
  return {
    client: platform.kind,
    platform: platform.os || undefined,
    appVersion: appVersion(),
    // Origin and path only: the hash of a Mini App carries the sign-in data.
    url: `${window.location.origin}${window.location.pathname}`,
    userAgent: navigator.userAgent,
    screen: `${window.innerWidth}x${window.innerHeight}@${Math.round(window.devicePixelRatio * 100) / 100}`,
    language,
    theme: document.documentElement.dataset.theme,
    timezone,
  };
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function BugReportSheet() {
  const t = useT();
  const language = useI18n((state) => state.language);
  const pop = useApp((state) => state.pop);
  const toast = useApp((state) => state.toast);
  const toastError = useApp((state) => state.toastError);
  const [text, setText] = useState("");
  const [shot, setShot] = useState<{ blob: Blob; preview: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const context = useMemo(() => deviceContext(language), [language]);

  useEffect(() => () => {
    if (shot) URL.revokeObjectURL(shot.preview);
  }, [shot]);

  const length = [...text.trim()].length;
  const ready = length >= BUG_TEXT_MIN && length <= BUG_TEXT_MAX && !busy && !preparing;

  const pickScreenshot = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPreparing(true);
    try {
      // Same downscaling as chat photos: a phone screenshot becomes a few hundred KB of JPEG.
      const blob = await compressImage(file, 1600, 0.82);
      setShot({ blob, preview: URL.createObjectURL(blob) });
    } finally {
      setPreparing(false);
    }
  };

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const screenshot = shot ? await readAsDataUrl(shot.blob) : null;
      await api.reportBug({ text: text.trim(), context, screenshot });
      toast(t("bug.sent"), "success");
      pop();
    } catch (error) {
      toastError(error);
      setBusy(false);
    }
  };

  const summary = [
    CLIENT_NAMES[platform.kind],
    context.platform,
    context.screen?.replace("x", "×").replace(/@.*/, ""),
    language.toUpperCase(),
    context.appVersion,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Sheet
      title={t("bug.title")}
      lead={
        <button className="btn-plain secondary" onClick={pop}>
          {t("cancel")}
        </button>
      }
      trail={
        <button className="btn-plain" disabled={!ready} onClick={() => void submit()}>
          {busy ? <Spinner size={16} /> : t("bug.send")}
        </button>
      }
    >
      <div className="container form bug-sheet">
        <p className="bug-intro">{t("bug.intro")}</p>

        <div className="bug-field">
          <textarea
            rows={7}
            maxLength={BUG_TEXT_MAX}
            placeholder={t("bug.placeholder")}
            value={text}
            onChange={(event) => setText(event.target.value)}
            autoFocus={platform.kind === "web"}
          />
          <div className="bug-counter">
            {length > 0 && length < BUG_TEXT_MIN ? (
              <span>{t("bug.min", BUG_TEXT_MIN - length)}</span>
            ) : (
              <span>{t("bug.counter", length, BUG_TEXT_MAX)}</span>
            )}
          </div>
        </div>

        {shot ? (
          <div className="bug-shot">
            <img src={shot.preview} alt="" />
            <button className="bug-shot-remove" onClick={() => setShot(null)} aria-label={t("bug.screenshot.remove")}>
              <X size={14} strokeWidth={3} />
            </button>
          </div>
        ) : (
          <button className="bug-attach" onClick={() => fileInput.current?.click()} disabled={preparing}>
            <span className="ico">{preparing ? <Spinner size={18} /> : <ImagePlus size={20} />}</span>
            <span className="col" style={{ gap: 2 }}>
              <span className="label">{t("bug.screenshot.add")}</span>
              <span className="hint">{t("bug.screenshot.hint")}</span>
            </span>
          </button>
        )}
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => void pickScreenshot(event)} />

        <div className="bug-context">
          <Info size={16} />
          <span>
            {t("bug.context", summary)}
            <br />
            {t("bug.context.private")}
          </span>
        </div>
      </div>
    </Sheet>
  );
}
