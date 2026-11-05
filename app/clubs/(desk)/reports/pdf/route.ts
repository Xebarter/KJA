import { loadTerms } from "@/lib/accounts";
import { pdfResponse, type School } from "@/lib/accounts-pdf";
import { requireClubs } from "@/lib/clubs-access";
import { buildClubReportPdf, loadCrest } from "@/lib/club-report-pdf";
import { loadClubReport } from "@/lib/club-reports";
import { getContent } from "@/lib/content";

export const dynamic = "force-dynamic";

const FALLBACK_SCHOOL: School = {
  phone: "",
  email: "",
  address: "Kampala Junior Academy",
};

function asSchool(settings: { phone?: string; email?: string; address?: string } | null | undefined): School {
  return {
    phone: String(settings?.phone || FALLBACK_SCHOOL.phone),
    email: String(settings?.email || FALLBACK_SCHOOL.email),
    address: String(settings?.address || FALLBACK_SCHOOL.address),
  };
}

export async function GET(request: Request) {
  const auth = await requireClubs("reports");
  if ("error" in auth) return new Response(auth.error, { status: 401 });
  const { terms, error } = await loadTerms(auth.supabase);
  if (error) return new Response(error, { status: 500 });
  const term = new URL(request.url).searchParams.get("term");
  try {
    const report = await loadClubReport(auth.supabase, terms, term);
    let school = FALLBACK_SCHOOL;
    try {
      const { settings } = await getContent();
      school = asSchool(settings);
    } catch {
      school = FALLBACK_SCHOOL;
    }
    const bytes = await buildClubReportPdf(report, school, await loadCrest(request.url));
    const name = `KJA-club-report-${report.termLabel || "term"}.pdf`;
    return pdfResponse(bytes, name, true);
  } catch (loadError) {
    const message = loadError instanceof Error ? loadError.message : "Couldn't build the club report.";
    return new Response(message, { status: 500 });
  }
}
