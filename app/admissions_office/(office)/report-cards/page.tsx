import { ReportsDesk } from "@/components/academics/ReportsDesk";
import { LoadErrorNotice, OfficeNotice } from "@/components/office/ui";
import { groupPupils, loadCurrentTerm } from "@/lib/academics";
import { loadTermReportSittings, type ReportSitting } from "@/lib/academics-reports";
import { loadRoll } from "@/lib/academics-roll";
import { OFFICE_BASE, requireOffice } from "@/lib/office";
import { serviceClient } from "@/lib/supabase/service";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Nursery report cards" };

type Card = {
  id: string;
  student_id: string;
  status: string;
  class_code: string | null;
  stream: string | null;
  campus?: string | null;
  overall_score: number | null;
  report_title?: string | null;
};

export default async function AdmissionsNurseryReportCardsPage() {
  if (!supabaseConfigured()) {
    return (
      <OfficeNotice title="Nursery report cards" heading="Connect Supabase">
        <p>
          Add your Supabase keys to <code>.env.local</code>.
        </p>
      </OfficeNotice>
    );
  }

  const auth = await requireOffice("report-cards");
  if ("error" in auth) {
    return (
      <OfficeNotice title="Nursery report cards" icon="fa-lock" heading="Not available">
        <p>{auth.error}</p>
      </OfficeNotice>
    );
  }

  const db = serviceClient() ?? auth.supabase;
  const termPack = await loadCurrentTerm(db);
  if (termPack.error) {
    return (
      <LoadErrorNotice
        title="Nursery report cards"
        message={termPack.error}
        fallbackHeading="Could not load the current term"
      />
    );
  }
  const term = termPack.term;

  const [pupils, cardsQuery, sittingsPack] = await Promise.all([
    loadRoll(db, auth.user.id, undefined, auth.campuses),
    term
      ? db
          .from("report_cards")
          .select("id, student_id, status, class_code, stream, campus, overall_score, report_title")
          .eq("term_id", term.id)
      : Promise.resolve({ data: [] as Card[], error: null }),
    term
      ? loadTermReportSittings(db, term.id)
          .then((sittingsByClass) => ({ sittingsByClass, error: null as string | null }))
          .catch((error) => ({
            sittingsByClass: {} as Awaited<ReturnType<typeof loadTermReportSittings>>,
            error: error instanceof Error ? error.message : "Assessments could not be loaded.",
          }))
      : Promise.resolve({ sittingsByClass: {}, error: null as string | null }),
  ]);

  if (sittingsPack.error) {
    return (
      <LoadErrorNotice
        title="Nursery report cards"
        message={sittingsPack.error}
        fallbackHeading="Could not load developmental sittings"
      />
    );
  }

  const cardsFallback =
    cardsQuery.error && /report_title/i.test(cardsQuery.error.message) && term
      ? await db
          .from("report_cards")
          .select("id, student_id, status, class_code, stream, campus, overall_score")
          .eq("term_id", term.id)
      : null;
  if ((cardsFallback || cardsQuery).error) {
    return (
      <LoadErrorNotice
        title="Nursery report cards"
        message={((cardsFallback || cardsQuery).error as { message: string }).message}
        fallbackHeading="Could not load report cards"
      />
    );
  }

  const nurseryGroups = groupPupils(pupils).filter((group) => group.section === "nursery");
  const nurseryCodes = new Set(nurseryGroups.map((group) => group.code));
  const cards = (((cardsFallback || cardsQuery).data || []) as Card[]).filter((card) =>
    nurseryCodes.has(String(card.class_code || "")),
  );

  const sittingsByClass: Record<string, ReportSitting[]> = {};
  for (const [key, sittings] of Object.entries(sittingsPack.sittingsByClass) as [string, ReportSitting[]][]) {
    const nurserySittings = sittings.filter((row) => row.dsba);
    if (nurserySittings.length) sittingsByClass[key] = nurserySittings;
  }

  return (
    <ReportsDesk
      termLabel={term?.label ?? null}
      termId={term?.id ?? null}
      groups={nurseryGroups}
      cards={cards}
      sittingsByClass={sittingsByClass}
      basePath={`${OFFICE_BASE}/report-cards`}
      mode="admissions"
    />
  );
}
