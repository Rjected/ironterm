import { useMemo } from "preact/hooks";
import { encodeQr, qrPath } from "../../packages/qr";

/**
 * QR code as crisp SVG. Dark modules on white with a 4-module quiet zone: inverted or
 * low-contrast codes on a black page scan unreliably with phone cameras.
 */
export function QrCode(props: { text: string; size?: number; label?: string }) {
  const { path, n } = useMemo(() => {
    const qr = encodeQr(props.text);
    return { path: qrPath(qr, 4), n: qr.size + 8 };
  }, [props.text]);
  const size = props.size ?? 220;
  return (
    <svg class="qr" width={size} height={size} viewBox={`0 0 ${n} ${n}`} shape-rendering="crispEdges" role="img" aria-label={props.label ?? "QR code"}>
      <rect width={n} height={n} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
