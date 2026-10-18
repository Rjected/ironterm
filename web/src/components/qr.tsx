import qrcode from "qrcode-generator";
import { useMemo } from "preact/hooks";

/**
 * QR code as crisp SVG. Dark modules on white with a 4-module quiet zone: inverted or
 * low-contrast codes on a black page scan unreliably with phone cameras.
 */
export function QrCode(props: { text: string; size?: number; label?: string }) {
  const { path, n } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(props.text);
    qr.make();
    const count = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    return { path: d, n: count + 8 };
  }, [props.text]);
  const size = props.size ?? 220;
  return (
    <svg class="qr" width={size} height={size} viewBox={`0 0 ${n} ${n}`} shape-rendering="crispEdges" role="img" aria-label={props.label ?? "QR code"}>
      <rect width={n} height={n} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
