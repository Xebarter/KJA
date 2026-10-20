import QRCode from "qrcode";
import { reportOnlineUrl, requestOrigin } from "@/lib/report-link";

/** Code beside the headteacher's comment. Scanning it opens this report. */
export async function ReportQr({ id }: { id: string }) {
  const url = reportOnlineUrl(await requestOrigin(), id);
  const svg = await QRCode.toString(url, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#19232bff", light: "#ffffffff" },
  });
  return (
    <a className="acd-sheet-qr" href={url} aria-label="Open the online copy of this report">
      <span dangerouslySetInnerHTML={{ __html: svg }} />
      <small>Online report</small>
    </a>
  );
}
