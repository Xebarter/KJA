import { ReportsDesk } from "@/components/academics/ReportsDesk";
import { AcademicsGate, OfficeOnly } from "@/components/academics/ui";
import { groupPupils, loadCurrentTerm } from "@/lib/academics";
import { openAcademics } from "@/lib/academics-access";
import { loadTermReportSittings } from "@/lib/academics-reports";
import { loadRoll } from "@/lib/academics-roll";
import { CAMPUS_OPTIONS, operationalCampus } from "@/lib/campuses";

export const metadata = { title: "Report cards" };

type Card = { id: string; student_id: string; status: string; class_code: string | null; stream: string | null; campus: string | null; overall_score: number | null; report_title?: string | null };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ campus?: string }> }) {
  const query = await searchParams;
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Report cards" state={opened} />;
  if (!opened.auth.office) return <OfficeOnly title="Report cards" />;
  const { supabase, user, office, campuses } = opened.auth;
  const campusOptions = campuses.length ? campuses : CAMPUS_OPTIONS;
  const requestedCampus = query.campus || "";
  const selectedCampus = campusOptions.includes(requestedCampus as (typeof CAMPUS_OPTIONS)[number])
    ? requestedCampus
    : null;
  const termPack = await loadCurrentTerm(supabase);
  if (termPack.error) return <AcademicsGate title="Report cards" state={{ notice: "schema", message: termPack.error }} />;
  const term = termPack.term;
  const [pupils, cardsQuery, sittingsPack] = await Promise.all([
    loadRoll(supabase, user.id, undefined, office ? campuses : undefined),
    term
      ? supabase.from("report_cards").select("id, student_id, status, class_code, stream, campus, overall_score, report_title").eq("term_id", term.id)
      : Promise.resolve({ data: [], error: null }),
    term
      ? loadTermReportSittings(supabase, term.id)
          .then((sittingsByClass) => ({ sittingsByClass, error: null as string | null }))
          .catch((error) => ({
            sittingsByClass: {} as Awaited<ReturnType<typeof loadTermReportSittings>>,
            error: error instanceof Error ? error.message : "Assessments could not be loaded.",
          }))
      : Promise.resolve({ sittingsByClass: {}, error: null as string | null }),
  ]);
  if (sittingsPack.error) {
    return <AcademicsGate title="Report cards" state={{ notice: "schema", message: sittingsPack.error }} />;
  }
  const cardsFallback = cardsQuery.error && /report_title/i.test(cardsQuery.error.message) && term
    ? await supabase.from("report_cards").select("id, student_id, status, class_code, stream, campus, overall_score").eq("term_id", term.id)
    : null;
  if ((cardsFallback || cardsQuery).error) {
    return <AcademicsGate title="Report cards" state={{ notice: "schema", message: ((cardsFallback || cardsQuery).error as { message: string }).message }} />;
  }
  const cards = (((cardsFallback || cardsQuery).data || []) as Card[]).filter(
    (card) => !selectedCampus || operationalCampus(card.campus) === selectedCampus,
  );
  const campusPupils = selectedCampus
    ? pupils.filter((pupil) => operationalCampus(pupil.campus) === selectedCampus)
    : pupils;

  return (
    <ReportsDesk
      termLabel={term?.label ?? null}
      termId={term?.id ?? null}
      groups={groupPupils(campusPupils)}
      cards={cards}
      sittingsByClass={sittingsPack.sittingsByClass}
      campusOptions={campusOptions}
      selectedCampus={selectedCampus}
    />
  );
}
