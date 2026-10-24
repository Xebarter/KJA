import { PageHeader } from "@/components/admin/PageHeader";
import { GradingDesk } from "@/components/academics/GradingDesk";
import { AcademicsGate, OfficeOnly } from "@/components/academics/ui";
import { loadCurrentTerm, mapBand, mapDivisionBand } from "@/lib/academics";
import { openAcademics } from "@/lib/academics-access";
import { nextTermSlot } from "@/lib/report-closing";
import { serviceClient } from "@/lib/supabase/service";

export const metadata = { title: "Grading" };

export default async function GradingPage() {
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Grading" state={opened} />;
  if (!opened.auth.office) return <OfficeOnly title="Grading" />;
  const [{ data, error }, divisionsQuery] = await Promise.all([
    opened.auth.supabase.from("grade_bands").select("*").order("section").order("sort_order"),
    opened.auth.supabase.from("division_bands").select("*").order("track").order("sort_order"),
  ]);
  if (error) return <AcademicsGate title="Grading" state={{ notice: "schema", message: error.message }} />;
  const bands = ((data || []) as Record<string, unknown>[]).map(mapBand);
  const divisionReady = !divisionsQuery.error;
  const divisions = divisionReady
    ? ((divisionsQuery.data || []) as Record<string, unknown>[]).map(mapDivisionBand)
    : [];
  const nextTerm = await loadNextTerm(opened.auth.supabase);

  return (
    <div className="app-page ofc-page grd-page">
      <PageHeader
        kicker="Setup"
        icon="fa-sliders"
        title="Grading"
        description="Three short jobs: subject grades, the report card grade from AGG, and the next-term date printed on reports."
      />
      <GradingDesk
        bands={bands}
        divisions={divisions}
        divisionReady={divisionReady}
        nextTerm={nextTerm}
      />
    </div>
  );
}

async function loadNextTerm(supabase: Parameters<typeof loadCurrentTerm>[0]) {
  const termPack = await loadCurrentTerm(supabase);
  if (!termPack.term) return { ready: false, current: "", label: "", startsOn: null as string | null };
  const slot = nextTermSlot(termPack.term.year, termPack.term.term);
  const db = serviceClient() ?? supabase;
  const { data } = await db.from("fee_terms").select("label, starts_on").eq("year", slot.year).eq("term", slot.term).maybeSingle();
  return {
    ready: true,
    current: termPack.term.label,
    label: data?.label || `${slot.year} Term ${slot.term}`,
    startsOn: data?.starts_on ? String(data.starts_on).slice(0, 10) : null,
  };
}
