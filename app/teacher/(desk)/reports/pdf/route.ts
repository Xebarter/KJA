import { classSection, loadCurrentTerm, streamFromQuery, streamQuery } from "@/lib/academics";
import { pdfResponse } from "@/lib/accounts-pdf";
import { loadReportCardPhotos, loadStreamReportCards } from "@/lib/report-cards-pdf";
import { buildReportPrintHtml } from "@/lib/report-cards-print-html";
import { buildReportCardsPdfFromHtmlChunks, reportPdfChunkSize } from "@/lib/report-cards-print-pdf";
import { isClassCode } from "@/lib/students";
import { leadsClass, TEACHER_BASE } from "@/lib/teacher";
import { requireTeacher } from "@/lib/teacher-access";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const teacher = await requireTeacher();
  if ("error" in teacher) return new Response(teacher.error, { status: 401 });
  if (!teacher.classes.length) return new Response("Report cards are for the class you lead this term.", { status: 403 });

  const url = new URL(request.url);
  const classCode = url.searchParams.get("class") || "";
  const stream = streamFromQuery(url.searchParams.get("stream") ?? undefined);
  if (!isClassCode(classCode) || stream === null) return new Response("Choose a class.", { status: 400 });
  if (!leadsClass(teacher.classes, classCode, stream)) {
    return new Response("You can only download report cards for a class you lead.", { status: 403 });
  }

  const termPack = await loadCurrentTerm(teacher.supabase);
  if (termPack.error) return new Response(termPack.error, { status: 500 });
  if (!termPack.term) return new Response("Report cards need a current term.", { status: 400 });

  try {
    const cards = await loadStreamReportCards(teacher.supabase, {
      termId: termPack.term.id,
      classCode,
      stream,
      termLabel: termPack.term.label,
    });
    if (!cards.length) return new Response("Generate the report cards before downloading them.", { status: 404 });
    const photos = await loadReportCardPhotos(cards);
    const nursery = classSection(classCode) === "nursery";
    const size = reportPdfChunkSize(cards.length);
    const slices: typeof cards[] = [];
    for (let index = 0; index < cards.length; index += size) slices.push(cards.slice(index, index + size));
    const [firstHtml, ...restHtml] = await Promise.all([
      buildReportPrintHtml({ origin: url.origin, nursery, cards: slices[0], photos }),
      ...slices.slice(1).map((slice) => buildReportPrintHtml({ origin: url.origin, nursery, cards: slice, photos })),
    ]);
    const bytes = await buildReportCardsPdfFromHtmlChunks([firstHtml, ...restHtml]);
    return pdfResponse(bytes, `${classCode}-${stream || "class"}-report-cards.pdf`, false);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't build the report cards.";
    if (/Chrome|Edge|browser|playwright/i.test(message)) {
      const print = new URL(`${TEACHER_BASE}/reports`, url.origin);
      print.searchParams.set("class", classCode);
      print.searchParams.set("stream", streamQuery(stream));
      return Response.redirect(print, 302);
    }
    return new Response(message, { status: 500 });
  }
}
