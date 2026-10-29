import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Spinner } from "../components/ui";

/** Renders a QR code for a link inside the white `.qr-box`. */
export function QrCode({ value, size = 240 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { margin: 1, width: size * 2, errorCorrectionLevel: "M", color: { dark: "#0E1117", light: "#FFFFFF" } })
      .then((url) => !cancelled && setSrc(url))
      .catch(() => !cancelled && setSrc(null));
    return () => {
      cancelled = true;
    };
  }, [value, size]);
  return (
    <div className="qr-box">
      {src ? <img src={src} alt="QR" width={size} height={size} /> : <div className="center" style={{ width: size, height: size }}><Spinner /></div>}
    </div>
  );
}
