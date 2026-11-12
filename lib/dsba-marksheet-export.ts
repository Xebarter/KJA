import type { SupabaseClient } from "@supabase/supabase-js";
import { classLabel, classOrder, kampalaToday, kindLabel, streamOf } from "@/lib/academics";
import { loadRoll } from "@/lib/academics-roll";
import { operationalCampus } from "@/lib/campuses";
import { buildDsbaMarksheetPdf } from "@/lib/dsba-marksheet-pdf";
import {
  groupSkillsByDomain,
  loadDivisionCatalogue,
  mapDevelopmentalAssessment,
  nurseryDivision,
  type ProgressCodeRow,
} from "@/lib/nursery-dsba";
import {
  buildNurseryDsbaWorkbook,
  nurseryDsbaWorkbookFilename,
  type NurseryDsbaBookInput,
} from "@/lib/nursery-dsba-workbook";
import { className, isUuid } from "@/lib/students";

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

function longDay(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export type DsbaMarksheetExportFormat = "pdf" | "xlsx";

export function parseDsbaMarksheetExportFormat(value: string | null): DsbaMarksheetExportFormat {
  return value === "pdf" ? "pdf" : "xlsx";
}

export async function loadDsbaMarksheetExportBundle(input: {
  supabase: SupabaseClient;
  userId: string;
  assessmentId: string;
  domainFilter?: string | null;
  campuses?: string[];
}) {
  if (!isUuid(input.assessmentId)) return { error: "Choose a developmental assessment.", status: 400 } as const;

  const { data: paperRow, error } = await input.supabase
    .from("developmental_assessments")
    .select("*")
    .eq("id", input.assessmentId)
    .maybeSingle();
  if (error) return { error: error.message, status: 500 } as const;
  if (!paperRow) return { error: "That developmental assessment was not found.", status: 404 } as const;

  const paper = mapDevelopmentalAssessment(paperRow as Record<string, unknown>);
  const divisionId = nurseryDivision(paper.class_code);
  if (!divisionId) return { error: "This class is not a nursery division.", status: 400 } as const;

  const [pupils, ratingsQuery, catalogue, termQuery] = await Promise.all([
    loadRoll(input.supabase, input.userId, [paper.class_code], input.campuses).then((rows) =>
      rows.filter((pupil) => pupil.class_code === paper.class_code && streamOf(pupil.stream) === streamOf(paper.stream)),
    ),
    input.supabase.from("skill_ratings").select("student_id, skill_id, progress_code_id, numeric_value").eq("assessment_id", paper.id),
    loadDivisionCatalogue(input.supabase, divisionId),
    input.supabase.from("fee_terms").select("label").eq("id", paper.term_id).maybeSingle(),
  ]);

  if ("error" in catalogue) return { error: catalogue.error, status: 500 } as const;
  if (ratingsQuery.error) return { error: ratingsQuery.error.message, status: 500 } as const;

  const grouped = groupSkillsByDomain(catalogue.domains, catalogue.skills);
  const domainFilter = (input.domainFilter || "").trim();
  const domains = domainFilter ? grouped.filter((row) => row.domain.id === domainFilter) : grouped;
  const skills = domains.flatMap((row) =>
    row.skills.map((skill) => ({
      id: skill.id,
      description: skill.description,
      domainId: row.domain.id,
      domainName: row.domain.name,
      domainSort: row.domain.sort_order,
      sort: skill.sort_order,
      value_kind: skill.value_kind,
    })),
  );

  const codeById = new Map(catalogue.progressCodes.map((row) => [row.id, row]));
  const codes: Record<string, string> = {};
  const ratings: NurseryDsbaBookInput["ratings"] = [];
  for (const row of ratingsQuery.data || []) {
    let display: string | null = null;
    if (row.progress_code_id) {
      display = codeById.get(String(row.progress_code_id))?.code || null;
    } else if (row.numeric_value !== null && row.numeric_value !== undefined) {
      display = String(row.numeric_value);
    }
    if (!display) continue;
    codes[`${row.student_id}|${row.skill_id}`] = display;
    ratings.push({
      assessmentId: paper.id,
      studentId: String(row.student_id),
      skillId: String(row.skill_id),
      code: display,
    });
  }

  const progressCodes: ProgressCodeRow[] = catalogue.progressCodes;
  const book: NurseryDsbaBookInput = {
    termId: paper.term_id,
    term: termQuery.data?.label || "Current term",
    name: paper.name,
    kind: paper.kind,
    kindLabel: kindLabel(paper.kind),
    heldOn: shortDay(paper.held_on),
    heldOnIso: paper.held_on || "",
    preparedOn: longDay(kampalaToday()),
    papers: [
      {
        id: paper.id,
        campus: operationalCampus(paper.campus),
        classCode: paper.class_code,
        className: className(paper.class_code),
        stream: streamOf(paper.stream),
        label: classLabel(paper.class_code, paper.stream),
        order: classOrder(paper.class_code) ?? 99,
        skills: skills.map((skill) => ({
          id: skill.id,
          domainId: skill.domainId,
          domainName: skill.domainName,
          domainSort: skill.domainSort,
          description: skill.description,
          sort: skill.sort,
          value_kind: skill.value_kind,
        })),
      },
    ],
    pupils: pupils.map((pupil) => ({
      id: pupil.id,
      number: pupil.student_number || "",
      name: pupil.full_name,
      classCode: pupil.class_code || "",
      stream: streamOf(pupil.stream),
    })),
    ratings,
    progressCodes,
  };

  // Keep stable roll order for PDF
  const orderedPupils = pupils.map((pupil, index) => ({
    id: pupil.id,
    name: pupil.full_name,
    number: pupil.student_number || "",
    roll: index + 1,
  }));

  return {
    ok: true as const,
    paper,
    termLabel: termQuery.data?.label || "Current term",
    classLabel: classLabel(paper.class_code, paper.stream),
    skills,
    pupils: orderedPupils,
    codes,
    progressCodes,
    book,
    filenameBase: nurseryDsbaWorkbookFilename(paper.name, [classLabel(paper.class_code, paper.stream)]).replace(/\.xlsx$/i, ""),
  };
}

export type DsbaMarksheetExportBundle = Extract<
  Awaited<ReturnType<typeof loadDsbaMarksheetExportBundle>>,
  { ok: true }
>;

export async function buildDsbaMarksheetExportBytes(
  bundle: DsbaMarksheetExportBundle,
  format: DsbaMarksheetExportFormat,
) {
  if (format === "pdf") {
    return buildDsbaMarksheetPdf({
      term: bundle.termLabel,
      classLabel: bundle.classLabel,
      sittingName: bundle.paper.name,
      kindLabel: kindLabel(bundle.paper.kind),
      heldOn: shortDay(bundle.paper.held_on),
      skills: bundle.skills,
      pupils: bundle.pupils,
      codes: bundle.codes,
      progressCodes: bundle.progressCodes,
    });
  }
  return buildNurseryDsbaWorkbook(bundle.book);
}
