import { saveIntervention, voidPupilPoints } from "@/app/academics_office/(desk)/actions";
import { InterventionsWorkbench } from "@/components/academics/InterventionsWorkbench";
import type { InterventionCase } from "@/components/academics/InterventionsDesk";
import { PageHeader } from "@/components/admin/PageHeader";
import { AcademicsGate, Empty, OfficeOnly } from "@/components/academics/ui";
import { INTERVENTION_REASONS, classLabel, kampalaToday, loadCurrentTerm, mapTerm, reasonLabel } from "@/lib/academics";
import { openAcademics } from "@/lib/academics-access";
import { loadRoll } from "@/lib/academics-roll";
import { ACADEMICS_BASE } from "@/lib/academics-nav";
import { buildPointRows, loadTermAwards, pointPupilFromRoll, schemaMissing } from "@/lib/points";

export const metadata = { title: "Interventions" };

type Row = { id: string; student_id: string; reason: string; note: string; follow_up_on: string | null; status: string };

const nf = (value: number) => value.toLocaleString("en-GB");

function shortDay(iso: string | null) {
  if (!iso) return "No follow-up date";
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function dueOf(iso: string | null, status: string, today: string): InterventionCase["due"] {
  if (!iso || status !== "open") return "none";
  if (iso < today) return "overdue";
  if (iso === today) return "today";
  return "later";
}

export default async function InterventionsPage({ searchParams }: { searchParams: Promise<{ term?: string; view?: string }> }) {
  const params = await searchParams;
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Interventions" state={opened} />;
  if (!opened.auth.office) return <OfficeOnly title="Interventions" />;
  const { supabase, user } = opened.auth;
  const termPack = await loadCurrentTerm(supabase);
  if (termPack.error) return <AcademicsGate title="Interventions" state={{ notice: "schema", message: termPack.error }} />;
  const term = termPack.term;
  const today = kampalaToday();
  const termsQuery = await supabase.from("fee_terms").select("id, year, term, label, starts_on, ends_on, is_current").order("year", { ascending: false }).order("term", { ascending: false });
  const terms = ((termsQuery.data || []) as Record<string, unknown>[]).map(mapTerm);
  const selected = terms.find((row) => row.id === params.term) || term;
  const [rowsQuery, pupils, awardsPack] = await Promise.all([
    term ? supabase.from("learner_interventions").select("id, student_id, reason, note, follow_up_on, status").eq("term_id", term.id).order("follow_up_on") : Promise.resolve({ data: [], error: null }),
    loadRoll(supabase, user.id),
    selected ? loadTermAwards(supabase, selected.id) : Promise.resolve({ awards: [], error: null as string | null }),
  ]);
  if (rowsQuery.error) return <AcademicsGate title="Interventions" state={{ notice: "schema", message: rowsQuery.error.message }} />;
  const people = new Map(pupils.map((pupil) => [pupil.id, pupil]));
  const rank = { overdue: 0, today: 1, later: 2, none: 3 };
  const cases: InterventionCase[] = ((rowsQuery.data || []) as Row[])
    .map((row) => {
      const pupil = people.get(row.student_id);
      const status = row.status === "done" ? "done" : "open";
      return {
        id: row.id,
        studentId: row.student_id,
        href: `${ACADEMICS_BASE}/students/${row.student_id}`,
        name: pupil?.full_name || "Pupil",
        photoPath: pupil?.photo_path ?? null,
        meta: pupil ? [classLabel(pupil.class_code, pupil.stream), pupil.student_number].filter(Boolean).join(" · ") : "Not on the current roll",
        reasonLabel: reasonLabel(row.reason),
        note: row.note,
        followUp: shortDay(row.follow_up_on),
        due: dueOf(row.follow_up_on, status, today),
        status,
      } satisfies InterventionCase;
    })
    .sort((a, b) => Number(b.status === "open") - Number(a.status === "open") || rank[a.due] - rank[b.due] || a.name.localeCompare(b.name));
  const openCount = cases.filter((row) => row.status === "open").length;
  const dueCount = cases.filter((row) => row.due === "overdue" || row.due === "today").length;

  const pointRows = buildPointRows(pupils.map(pointPupilFromRoll), awardsPack.awards);
  const pointsMissing = schemaMissing(awardsPack.error);
  const pointsLoadError = pointsMissing
    ? "Run supabase/0055_pupil_points.sql before using points."
    : awardsPack.error;
  const initialView = params.view === "points" || (params.term && selected && term && params.term !== term.id) ? "points" : "cases";

  return (
    <div className="app-page ofc-page ivn-page">
      <PageHeader
        kicker="Assessment"
        icon="fa-hand-holding-heart"
        title="Interventions"
        description={term
          ? <>{term.label}. Follow up pupils who need support{openCount ? <> · <strong>{nf(openCount)}</strong> open</> : ""}{dueCount ? <> · <strong>{nf(dueCount)}</strong> due</> : ""}.</>
          : "Set a current term first."}
      />
      {term ? (
        <InterventionsWorkbench
          initialView={initialView}
          openCount={openCount}
          dueCount={dueCount}
          cases={cases}
          pupils={pupils.map((pupil) => ({
            id: pupil.id,
            name: pupil.full_name,
            meta: [classLabel(pupil.class_code, pupil.stream), pupil.student_number].filter(Boolean).join(" · "),
            photoPath: pupil.photo_path,
          }))}
          reasons={[...INTERVENTION_REASONS]}
          termId={term.id}
          saveCase={saveIntervention}
          points={selected ? {
            termId: selected.id,
            termLabel: selected.label,
            terms: terms.map((row) => ({ id: row.id, label: row.label, current: row.is_current })),
            rows: pointRows,
            loadError: pointsLoadError,
            save: voidPupilPoints,
          } : null}
        />
      ) : <Empty title="No current term" />}
    </div>
  );
}
