import { loadTerms, requireAccounts } from "@/lib/accounts";
import { pdfResponse } from "@/lib/accounts-pdf";
import { buildClubReportPdf, loadCrest } from "@/lib/club-report-pdf";
import { loadClubReport } from "@/lib/club-reports";
import { getContent } from "@/lib/content";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAccounts();
  if ("error" in auth) return new Response(auth.error, { status: 401 });
  const { terms, error } = await loadTerms(auth.supabase);
  if (error) return new Response(error, { status: 500 });
  const term = new URL(request.url).searchParams.get("term");
  try {
    const report = await loadClubReport(auth.supabase, terms, term);
    const { settings } = await getContent();
    const bytes = await buildClubReportPdf(report, settings, await loadCrest(request.url));
    const name = `KJA-club-report-${report.termLabel}.pdf`;
    return pdfResponse(bytes, name, true);
  } catch (loadError) {
    const message = loadError instanceof Error ? loadError.message : "Couldn't build the club report.";
    return new Response(message, { status: 500 });
  }
}
