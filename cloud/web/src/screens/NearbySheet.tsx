import { Copy, ScanLine, Share2 } from "lucide-react";
import { useApp, openAnyLink } from "../app/store";
import { useT } from "../i18n/i18n";
import { platform } from "../platform/platform";
import { Avatar, PlatformBadge, Sheet } from "../components/ui";
import { QrCode } from "./QrCode";
import { bestLink, copyText, shareProfile } from "./profileShare";

export function NearbySheet() {
  const t = useT();
  const profile = useApp((state) => state.profile)!;
  const config = useApp((state) => state.config);
  const toast = useApp((state) => state.toast);
  const closeOverlay = useApp((state) => state.pop);
  const link = bestLink(config, { kind: "profile", uid: profile.uid });

  const scan = async () => {
    if (!platform.scanQr) {
      toast(t("nearby.scan.unsupported"));
      return;
    }
    const result = await platform.scanQr(t("nearby.scan.prompt"));
    if (!result) return;
    platform.haptic("success");
    // Close the nearby sheet first so the opened profile sits on top of the stack.
    closeOverlay();
    setTimeout(() => {
      if (!openAnyLink(result)) toast(t("nearby.scan.invalid"), "error");
    }, 250);
  };

  return (
    <Sheet title={t("nearby.title")}>
      <div className="col" style={{ alignItems: "center", gap: 16, textAlign: "center", paddingBottom: 8 }}>
        <div className="muted" style={{ maxWidth: 380 }}>{t("nearby.subtitle")}</div>
        <QrCode value={link} />
        <div className="row" style={{ gap: 10 }}>
          <Avatar url={profile.avatarUrl} name={profile.username} size={40} />
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: 800 }}>@{profile.username}</div>
            <div className="row" style={{ gap: 4, marginTop: 2 }}>
              {profile.platforms.slice(0, 5).map((id) => (
                <PlatformBadge key={id} platform={id} size={20} />
              ))}
            </div>
          </div>
        </div>
        <div className="col" style={{ width: "100%", gap: 10, marginTop: 6 }}>
          <button className="btn btn-primary btn-block" onClick={() => void scan()}>
            <ScanLine size={18} /> {t("nearby.scan")}
          </button>
          <div className="row" style={{ gap: 10 }}>
            <button className="btn btn-glass grow" onClick={() => void shareProfile(config, profile.uid, `UniShare: @${profile.username}`)}>
              <Share2 size={17} /> {t("nearby.share")}
            </button>
            <button
              className="btn btn-glass grow"
              onClick={() => void copyText(link).then((ok) => ok && toast(t("nearby.copied"), "success"))}
            >
              <Copy size={17} /> {t("nearby.copy")}
            </button>
          </div>
          {!platform.scanQr && <div className="hint">{t("nearby.scan.unsupported")}</div>}
        </div>
      </div>
    </Sheet>
  );
}
