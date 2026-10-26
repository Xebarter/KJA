import { mapTerm } from "@/lib/academics";
import { requireAcademics } from "@/lib/academics-access";
import { loadRoll } from "@/lib/academics-roll";
import { buildPointsWorkbook, pointsFileName } from "@/lib/points-workbook";
import { buildPointRows, filterPointRows, loadTermAwards, pointFilterFromSearch, pointPupilFromRoll, schemaMissing } from "@/lib/points";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAcademics("interventions");
  if ("error" in auth) return new Response(auth.error, { status: 401 });
  if (!auth.office) return new Response("Only the academics office can export points.", { status: 403 });

  const params = new URL(request.url).searchParams;
  const termId = params.get("term") || "";
  const termQuery = termId
    ? await auth.supabase.from("fee_terms").select("id, year, term, label, starts_on, ends_on, is_current").eq("id", termId).maybeSingle()
    : await auth.supabase.from("fee_terms").select("id, year, term, label, starts_on, ends_on, is_current").eq("is_current", true).maybeSingle();
  if (termQuery.error) {
    return new Response(schemaMissing(termQuery.error.message) ? "Run supabase/0055_pupil_points.sql first." : termQuery.error.message, { status: 400 });
  }
  if (!termQuery.data) return new Response("Choose a term first.", { status: 400 });
  const term = mapTerm(termQuery.data as Record<string, unknown>);
  const [pupils, awardsPack] = await Promise.all([
    loadRoll(auth.supabase, auth.user.id),
    loadTermAwards(auth.supabase, term.id),
  ]);
  if (awardsPack.error) {
    return new Response(schemaMissing(awardsPack.error) ? "Run supabase/0055_pupil_points.sql first." : awardsPack.error, { status: 400 });
  }
  const rows = filterPointRows(buildPointRows(pupils.map(pointPupilFromRoll), awardsPack.awards), pointFilterFromSearch(params));
  const body = await buildPointsWorkbook({ school: "Kampala Junior Academy", term: term.label, rows });
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${pointsFileName(term.label)}"`,
      "Cache-Control": "no-store",
    },
  });
}
