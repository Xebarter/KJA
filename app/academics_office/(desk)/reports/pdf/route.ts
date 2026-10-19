import { classLabel, classSection, loadCurrentTerm, requireAcademics, streamFromQuery } from "@/lib/academics";
import { loadCrest, pdfResponse } from "@/lib/accounts-pdf";
import { buildReportCardsPdf, loadReportCardPhotos, loadStreamReportCards } from "@/lib/report-cards-pdf";
import { isClassCode } from "@/lib/students";

export const dynamic = "force-dynamic";

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
    const bytes = await buildReportCardsPdf(
      { title: classLabel(classCode, stream), nursery: classSection(classCode) === "nursery", cards },
      await loadCrest(request.url),
      await loadReportCardPhotos(cards),
    );
    return pdfResponse(bytes, `${classCode}-${stream || "class"}-report-cards.pdf`, false);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't build the report cards.";
    return new Response(message, { status: 500 });
  }
}
