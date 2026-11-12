import { classSection } from "@/lib/academics";
import { pdfResponse } from "@/lib/accounts-pdf";
import { getSessionUser } from "@/lib/portal";
import { loadReportCardPhotos, loadReportCardsByIds } from "@/lib/report-cards-pdf";
import { buildReportPrintHtml } from "@/lib/report-cards-print-html";
import { buildReportCardsPdfFromHtml } from "@/lib/report-cards-print-pdf";
import { isUuid } from "@/lib/students";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Published parent report card as the same Playwright PDF used in the office. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isUuid(id)) return new Response("Report card not found.", { status: 404 });
  const { supabase } = await getSessionUser();
  if (!supabase) return new Response("Sign in to print this report card.", { status: 401 });
  const url = new URL(request.url);

  try {
    await Promise.resolve(supabase.rpc("claim_guardian_links")).catch(() => undefined);
    const { data: gate } = await supabase
      .from("report_cards")
      .select("id, student_id, status")
      .eq("id", id)
      .eq("status", "published")
      .maybeSingle();
    if (!gate) return new Response("Report card not found.", { status: 404 });

    const linked = await supabase.rpc("my_student_ids");
    const allowed = new Set(
      (Array.isArray(linked.data) ? linked.data : []).map((row) =>
        typeof row === "string" ? row : String((row as { my_student_ids?: string }).my_student_ids || ""),
      ),
    );
    if (!allowed.has(gate.student_id)) return new Response("Report card not found.", { status: 404 });

    const cards = await loadReportCardsByIds(supabase, { cardIds: [id] });
    const card = cards[0];
    if (!card) return new Response("Report card not found.", { status: 404 });
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
