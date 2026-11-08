import { loadTerms } from "@/lib/accounts";
import { pdfResponse, type School } from "@/lib/accounts-pdf";
import { enrichClubExpenses, loadClubExpenses } from "@/lib/club-accounts";
import { buildClubAccountsPdf, clubAccountsPdfFromReport, loadCrest } from "@/lib/club-accounts-pdf";
import { loadClubReport } from "@/lib/club-reports";
import { isClubCampus } from "@/lib/campuses";
import { requireClubs } from "@/lib/clubs-access";
import { getContent } from "@/lib/content";
import { isUuid } from "@/lib/students";

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
  const auth = await requireClubs("accounts");
  if ("error" in auth) return new Response(auth.error, { status: 401 });
  const { terms, current, error } = await loadTerms(auth.supabase);
  if (error) return new Response(error, { status: 500 });

  const url = new URL(request.url);
  const termParam = url.searchParams.get("term");
  const clubParam = url.searchParams.get("club");
  const campusParam = url.searchParams.get("campus");
  const term = terms.find((row) => row.id === termParam) || current;
  if (!term) return new Response("Choose a term.", { status: 400 });
  if (!auth.activeCampus) return new Response("Choose a campus first.", { status: 400 });
  const clubId = isUuid(String(clubParam || "")) ? String(clubParam) : null;
  const campus =
    campusParam && isClubCampus(campusParam) && auth.clubCampuses.includes(campusParam)
      ? campusParam
      : auth.activeCampus;

  try {
    let clubTitle = "All clubs";
    if (clubId) {
      const { data: club } = await auth.supabase.from("clubs").select("title").eq("id", clubId).maybeSingle();
      if (!club) return new Response("Club not found.", { status: 404 });
      clubTitle = club.title as string;
    }

    const report = await loadClubReport(auth.supabase, terms, term.id, auth.campuses);
    const expenses = clubId
      ? await enrichClubExpenses(
          auth.supabase,
          (
            await loadClubExpenses(auth.supabase, {
              termId: term.id,
              clubId,
              limit: 2000,
              campuses: auth.campuses,
              campusFilter: campus,
            })
          ).expenses,
        )
      : undefined;

    let school = FALLBACK_SCHOOL;
    try {
      const { settings } = await getContent();
      school = asSchool(settings);
    } catch {
      school = FALLBACK_SCHOOL;
    }

    const title = campus ? `${clubTitle} · ${campus}` : clubTitle;
    const bytes = await buildClubAccountsPdf(
      clubAccountsPdfFromReport(report, { title, clubId, campus, expenses }),
      school,
      await loadCrest(request.url),
    );
    const slug = clubId ? clubTitle.replace(/[^\w]+/g, "-").slice(0, 40) : campus ? campus : "all-clubs";
    return pdfResponse(bytes, `KJA-club-accounts-${slug}-${term.label}.pdf`, true);
  } catch (loadError) {
    const message = loadError instanceof Error ? loadError.message : "Couldn't build the club accounts PDF.";
    return new Response(message, { status: 500 });
  }
}
