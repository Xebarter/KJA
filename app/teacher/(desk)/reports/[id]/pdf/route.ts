import { classSection } from "@/lib/academics";
import { pdfResponse } from "@/lib/accounts-pdf";
import { loadReportCardPhotos, loadReportCardsByIds } from "@/lib/report-cards-pdf";
import { buildReportPrintHtml } from "@/lib/report-cards-print-html";
import { buildReportCardsPdfFromHtml } from "@/lib/report-cards-print-pdf";
import { isUuid } from "@/lib/students";
import { leadsClass } from "@/lib/teacher";
import { requireTeacher } from "@/lib/teacher-access";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** One pupil's report card as the same Playwright PDF used for stream downloads. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const teacher = await requireTeacher();
  if ("error" in teacher) return new Response(teacher.error, { status: 401 });

  const { id } = await context.params;
  if (!isUuid(id)) return new Response("Report card not found.", { status: 404 });
  const url = new URL(request.url);

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
      origin: url.origin,
      nursery,
      cards,
      photos,
    });
    const bytes = await buildReportCardsPdfFromHtml(html);
    const safeName = (card.pupil_name || "report-card").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "report-card";
    return pdfResponse(bytes, `${safeName}.pdf`, true);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't build the report card.";
    if (/Chrome|Edge|browser|playwright/i.test(message)) {
      return Response.redirect(new URL(`${url.pathname.replace(/\/pdf$/, "/sheet")}`, url.origin), 302);
    }
    return new Response(message, { status: 500 });
  }
}
