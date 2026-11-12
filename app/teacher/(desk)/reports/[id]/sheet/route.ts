import { classSection } from "@/lib/academics";
import { loadReportCardPhotos, loadReportCardsByIds } from "@/lib/report-cards-pdf";
import { buildReportPrintHtml } from "@/lib/report-cards-print-html";
import { isUuid } from "@/lib/students";
import { leadsClass } from "@/lib/teacher";
import { requireTeacher } from "@/lib/teacher-access";

export const dynamic = "force-dynamic";

/** Bare report-card HTML identical to the PDF builder — used by Print on /teacher/reports/[id]. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const teacher = await requireTeacher();
  if ("error" in teacher) return new Response(teacher.error, { status: 401 });

  const { id } = await context.params;
  if (!isUuid(id)) return new Response("Report card not found.", { status: 404 });

  try {
    const cards = await loadReportCardsByIds(teacher.supabase, { cardIds: [id] });
    const card = cards[0];
    if (!card) return new Response("Report card not found.", { status: 404 });
    if (!leadsClass(teacher.classes, card.class_code || "", card.stream || "")) {
      return new Response("You can only print report cards for a class you lead.", { status: 403 });
    }
    const photos = await loadReportCardPhotos(cards);
    const nursery = classSection(card.class_code) === "nursery";
    const html = await buildReportPrintHtml({
      origin: new URL(request.url).origin,
      nursery,
      cards,
      photos,
    });
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't prepare the print sheet.";
    return new Response(message, { status: 500 });
  }
}
