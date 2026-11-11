import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { DevelopmentalMarksheetDesk } from "@/components/academics/DevelopmentalMarksheetDesk";
import { AcademicsGate, Empty } from "@/components/academics/ui";
import { ACADEMICS_BASE, classLabel, kindLabel, streamOf } from "@/lib/academics";
import { openAcademics } from "@/lib/academics-access";
import { loadRoll } from "@/lib/academics-roll";
import { operationalCampus } from "@/lib/campuses";
import {
  groupSkillsByDomain,
  loadDivisionCatalogue,
  mapDevelopmentalAssessment,
  nurseryDivision,
} from "@/lib/nursery-dsba";
import { isUuid } from "@/lib/students";

export const metadata = { title: "Developmental assessment" };

function shortDay(iso: string | null) {
  if (!iso) return "Date not set";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return "Date not set";
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function DevelopmentalMarkbookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Developmental assessment" state={opened} />;
  const { supabase, office, user, campuses } = opened.auth;

  const { data: paperRow, error } = await supabase.from("developmental_assessments").select("*").eq("id", id).maybeSingle();
  if (error) return <AcademicsGate title="Developmental assessment" state={{ notice: "schema", message: error.message }} />;
  if (!paperRow) notFound();
  const paper = mapDevelopmentalAssessment(paperRow as Record<string, unknown>);
  const divisionId = nurseryDivision(paper.class_code);
  if (!divisionId) {
    return <AcademicsGate title="Developmental assessment" state={{ notice: "schema", message: "This class is not a nursery division." }} />;
  }

  const campusFilter = paper.campus ? operationalCampus(paper.campus) : undefined;
  const [pupils, ratingsQuery, catalogue, termQuery] = await Promise.all([
    loadRoll(supabase, user.id, [paper.class_code], office ? (campusFilter ? [campusFilter] : campuses) : undefined).then((rows) =>
      rows.filter((pupil) => pupil.class_code === paper.class_code && streamOf(pupil.stream) === streamOf(paper.stream)),
    ),
    supabase.from("skill_ratings").select("student_id, skill_id, progress_code_id").eq("assessment_id", id),
    loadDivisionCatalogue(supabase, divisionId),
    supabase.from("fee_terms").select("label").eq("id", paper.term_id).maybeSingle(),
  ]);

  if ("error" in catalogue) {
    return <AcademicsGate title="Developmental assessment" state={{ notice: "schema", message: catalogue.error }} />;
  }
  if (ratingsQuery.error) {
    return <AcademicsGate title="Developmental assessment" state={{ notice: "schema", message: ratingsQuery.error.message }} />;
  }

  if (!pupils.length) {
    return (
      <div className="app-page ofc-page asm-page msh-page">
        <PageHeader
          kicker="Assessment"
          icon="fa-table-cells"
          title={paper.name}
          description={
            <>
              Developmental skills · {classLabel(paper.class_code, paper.stream)} · {kindLabel(paper.kind)}
            </>
          }
          actions={
            <Link className="admin-hero-btn" href={`${ACADEMICS_BASE}/assessments`}>
              All assessments
            </Link>
          }
        />
        <Empty title="No pupils on this roll">Add pupils to this class before entering skill codes.</Empty>
      </div>
    );
  }

  const grouped = groupSkillsByDomain(catalogue.domains, catalogue.skills);
  const ratings: Record<string, string> = {};
  for (const row of ratingsQuery.data || []) {
    if (row.progress_code_id) ratings[`${row.student_id}|${row.skill_id}`] = String(row.progress_code_id);
  }

  const phase = paper.status === "approved" ? "approved" : paper.status === "submitted" ? "submitted" : "open";
  const exportParams = new URLSearchParams({ dsba: paper.id });
  if (campusFilter) exportParams.set("campus", campusFilter);
  const termLabel = (termQuery.data as { label?: string } | null)?.label || "Current term";

  return (
    <DevelopmentalMarksheetDesk
      assessmentId={id}
      domains={grouped.map((row) => ({
        id: row.domain.id,
        name: row.domain.name,
        sort: row.domain.sort_order,
        skills: row.skills.map((skill) => ({
          id: skill.id,
          description: skill.description,
          sort: skill.sort_order,
        })),
      }))}
      progressCodes={catalogue.progressCodes}
      pupils={pupils.map((pupil, index) => ({
        id: pupil.id,
        name: pupil.full_name,
        number: pupil.student_number || "",
        photoPath: pupil.photo_path,
        roll: index + 1,
      }))}
      ratings={ratings}
      phase={phase}
      office={office}
      heading={{
        classLabel: classLabel(paper.class_code, paper.stream),
        sittingName: paper.name,
        kindLabel: kindLabel(paper.kind),
        heldLabel: shortDay(paper.held_on),
        termLabel,
      }}
      closeHref={`${ACADEMICS_BASE}/assessments`}
      exportHref={`${ACADEMICS_BASE}/assessments/marksheet/export?${exportParams.toString()}`}
      allowExport
    />
  );
}
