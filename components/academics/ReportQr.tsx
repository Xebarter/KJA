import QRCode from "qrcode";
import { reportOnlineUrl, requestOrigin } from "@/lib/report-link";

/** Sync mark used when the URL and SVG are already known (PDF pack). */
export function ReportQrMark({ href, svg }: { href: string; svg: string }) {
  return (
    <a className="acd-sheet-qr" href={href} aria-label="Open the online copy of this report">
      <span dangerouslySetInnerHTML={{ __html: svg }} />
      <small>Online report</small>
    </a>
  );
}

export async function buildReportQrSvg(url: string) {
  return QRCode.toString(url, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#19232bff", light: "#ffffffff" },
  });
}

/** Code beside the headteacher's comment. Scanning it opens this report. */
export async function ReportQr({ id }: { id: string }) {
  const url = reportOnlineUrl(await requestOrigin(), id);
  return <ReportQrMark href={url} svg={await buildReportQrSvg(url)} />;
}
