import { loadTerms } from "@/lib/accounts";
import { pdfResponse, type School } from "@/lib/accounts-pdf";
import { enrichClubExpenses, loadClubExpenses } from "@/lib/club-accounts";
import { buildClubAccountsPdf, clubAccountsPdfFromReport, loadCrest } from "@/lib/club-accounts-pdf";
import { loadClubReport } from "@/lib/club-reports";
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

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireClubs("catalogue", "accounts");
  if ("error" in auth) return new Response(auth.error, { status: 401 });
  const { id } = await context.params;
  if (!isUuid(id)) return new Response("Club not found.", { status: 404 });

  const { terms, current, error } = await loadTerms(auth.supabase);
  if (error) return new Response(error, { status: 500 });
  const termParam = new URL(request.url).searchParams.get("term");
  const term = terms.find((row) => row.id === termParam) || current;
  if (!term) return new Response("Choose a term.", { status: 400 });

  const { data: club } = await auth.supabase.from("clubs").select("id, title").eq("id", id).maybeSingle();
  if (!club) return new Response("Club not found.", { status: 404 });

  try {
    const [report, expensesPack] = await Promise.all([
      loadClubReport(auth.supabase, terms, term.id, auth.campuses),
      loadClubExpenses(auth.supabase, { termId: term.id, clubId: id, limit: 2000, campuses: auth.campuses }),
    ]);
    const expenses = await enrichClubExpenses(auth.supabase, expensesPack.expenses);

    let school = FALLBACK_SCHOOL;
    try {
      const { settings } = await getContent();
      school = asSchool(settings);
    } catch {
      school = FALLBACK_SCHOOL;
    }

    const bytes = await buildClubAccountsPdf(
      clubAccountsPdfFromReport(report, {
        title: club.title as string,
        clubId: id,
        expenses,
      }),
      school,
      await loadCrest(request.url),
    );
    const slug = String(club.title).replace(/[^\w]+/g, "-").slice(0, 40);
    return pdfResponse(bytes, `KJA-club-accounts-${slug}-${term.label}.pdf`, true);
  } catch (loadError) {
    const message = loadError instanceof Error ? loadError.message : "Couldn't build the club accounts PDF.";
    return new Response(message, { status: 500 });
  }
}
