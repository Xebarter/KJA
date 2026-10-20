import { ACADEMICS_BASE, loadCurrentTerm, requireAcademics, streamFromQuery, streamQuery } from "@/lib/academics";
import { pdfResponse } from "@/lib/accounts-pdf";
import { loadStreamReportCards } from "@/lib/report-cards-pdf";
import { buildReportCardsPdfFromPrintPack } from "@/lib/report-cards-print-pdf";
import { isClassCode } from "@/lib/students";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const auth = await requireAcademics();
  if ("error" in auth) return new Response(auth.error, { status: 401 });
  if (!auth.office) return new Response("Only the academics office can do that.", { status: 403 });
  const url = new URL(request.url);
  const classCode = url.searchParams.get("class") || "";
  const stream = streamFromQuery(url.searchParams.get("stream") ?? undefined);
  if (!isClassCode(classCode) || stream === null) return new Response("Choose a class.", { status: 400 });
  const termPack = await loadCurrentTerm(auth.supabase);
  if (termPack.error) return new Response(termPack.error, { status: 500 });
  if (!termPack.term) return new Response("Report cards need a current term.", { status: 400 });
  try {
    const cards = await loadStreamReportCards(auth.supabase, {
      termId: termPack.term.id,
      classCode,
      stream,
      termLabel: termPack.term.label,
    });
    if (!cards.length) return new Response("Generate the report cards before downloading them.", { status: 404 });
    const bytes = await buildReportCardsPdfFromPrintPack({
      origin: url.origin,
      cookieHeader: request.headers.get("cookie"),
      classCode,
      stream,
    });
    return pdfResponse(bytes, `${classCode}-${stream || "class"}-report-cards.pdf`, false);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't build the report cards.";
    // Fall back to the same HTML sheets so staff can still Save as PDF from print.
    if (/Chrome|Edge|browser|playwright/i.test(message)) {
      const print = new URL(`${ACADEMICS_BASE}/reports/print`, url.origin);
      print.searchParams.set("class", classCode);
      print.searchParams.set("stream", streamQuery(stream));
      return Response.redirect(print, 302);
    }
    return new Response(message, { status: 500 });
  }
}
