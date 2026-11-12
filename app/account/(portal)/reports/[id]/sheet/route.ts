import { classSection } from "@/lib/academics";
import { getSessionUser } from "@/lib/portal";
import { loadReportCardPhotos, loadReportCardsByIds } from "@/lib/report-cards-pdf";
import { buildReportPrintHtml } from "@/lib/report-cards-print-html";
import { isUuid } from "@/lib/students";

export const dynamic = "force-dynamic";

/** Bare published report-card HTML for parent print — same builder as the office PDF. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isUuid(id)) return new Response("Report card not found.", { status: 404 });
  const { supabase } = await getSessionUser();
  if (!supabase) return new Response("Sign in to print this report card.", { status: 401 });

  try {
    await Promise.resolve(supabase.rpc("claim_guardian_links")).catch(() => undefined);
    const { data: card } = await supabase
      .from("report_cards")
      .select("id, student_id, status")
      .eq("id", id)
      .eq("status", "published")
      .maybeSingle();
    if (!card) return new Response("Report card not found.", { status: 404 });

    const linked = await supabase.rpc("my_student_ids");
    const allowed = new Set(
      (Array.isArray(linked.data) ? linked.data : []).map((row) =>
        typeof row === "string" ? row : String((row as { my_student_ids?: string }).my_student_ids || ""),
      ),
    );
    if (!allowed.has(card.student_id)) return new Response("Report card not found.", { status: 404 });

    const cards = await loadReportCardsByIds(supabase, { cardIds: [id] });
    if (!cards[0]) return new Response("Report card not found.", { status: 404 });
    const photos = await loadReportCardPhotos(cards);
    const nursery = classSection(cards[0].class_code) === "nursery";
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
