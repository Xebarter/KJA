import type { SupabaseClient } from "@supabase/supabase-js";
import { SCHOOL_CLASSES } from "@/lib/students";

export const NURSERY_DIVISION_IDS = ["rc_c2", "c3", "c4"] as const;
export type NurseryDivisionId = (typeof NURSERY_DIVISION_IDS)[number];

export const NURSERY_DIVISIONS: {
  id: NurseryDivisionId;
  label: string;
  short: string;
  codes: readonly string[];
}[] = [
  { id: "rc_c2", label: "Reception & Baby Class", short: "RC · C2", codes: ["RC", "C2"] },
  { id: "c3", label: "Middle Class", short: "C3", codes: ["C3"] },
  { id: "c4", label: "Top Class", short: "C4", codes: ["C4"] },
];

export function isNurseryDivisionId(value: string | null | undefined): value is NurseryDivisionId {
  return NURSERY_DIVISION_IDS.includes(value as NurseryDivisionId);
}

/** Map a class code to its nursery DSBA division, or null when not nursery. */
export function nurseryDivision(classCode: string | null | undefined): NurseryDivisionId | null {
  const code = String(classCode || "").trim().toUpperCase();
  if (!code) return null;
  const entry = SCHOOL_CLASSES.find((row) => row.code === code);
  if (!entry || entry.section !== "nursery") return null;
  if (code === "RC" || code === "C2") return "rc_c2";
  if (code === "C3") return "c3";
  if (code === "C4") return "c4";
  return null;
}

export function nurseryDivisionMeta(id: NurseryDivisionId) {
  return NURSERY_DIVISIONS.find((row) => row.id === id)!;
}

export type ProgressScaleRow = {
  id: string;
  key: string;
  name: string;
  sort_order: number;
};

export type ProgressCodeRow = {
  id: string;
  scale_id: string;
  code: string;
  label: string;
  sort_order: number;
};

export type NurseryDivisionRow = {
  id: NurseryDivisionId;
  label: string;
  class_codes: string[];
  progress_scale_id: string | null;
  sort_order: number;
};

export type DevelopmentalDomainRow = {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  active: boolean;
  divisions: NurseryDivisionId[];
};

export const SKILL_VALUE_KINDS = ["progress_code", "number"] as const;
export type SkillValueKind = (typeof SKILL_VALUE_KINDS)[number];

export function isSkillValueKind(value: string | null | undefined): value is SkillValueKind {
  return SKILL_VALUE_KINDS.includes(value as SkillValueKind);
}

export type DevelopmentalSkillRow = {
  id: string;
  domain_id: string;
  description: string;
  sort_order: number;
  active: boolean;
  value_kind: SkillValueKind;
  divisions: NurseryDivisionId[];
};

export type DevelopmentalAssessmentRow = {
  id: string;
  term_id: string;
  campus: string;
  class_code: string;
  stream: string;
  name: string;
  kind: "bot" | "midterm" | "endterm" | "test";
  held_on: string | null;
  status: "open" | "submitted" | "approved";
  created_at?: string;
};

export type SkillRatingRow = {
  assessment_id: string;
  student_id: string;
  skill_id: string;
  progress_code_id: string | null;
  numeric_value: number | null;
  note: string | null;
};

export type ReportSkillLineRow = {
  report_card_id: string;
  skill_id: string;
  domain_id: string | null;
  domain_name: string;
  skill_description: string;
  progress_code: string | null;
  progress_label: string | null;
  domain_sort: number;
  skill_sort: number;
};

export type ProgressLegendEntry = { code: string; label: string };

export function mapProgressScale(row: Record<string, unknown>): ProgressScaleRow {
  return {
    id: String(row.id),
    key: String(row.key || ""),
    name: String(row.name || ""),
    sort_order: Number(row.sort_order) || 0,
  };
}

export function mapProgressCode(row: Record<string, unknown>): ProgressCodeRow {
  return {
    id: String(row.id),
    scale_id: String(row.scale_id),
    code: String(row.code || ""),
    label: String(row.label || ""),
    sort_order: Number(row.sort_order) || 0,
  };
}

export function mapNurseryDivision(row: Record<string, unknown>): NurseryDivisionRow {
  const id = String(row.id || "");
  return {
    id: isNurseryDivisionId(id) ? id : "rc_c2",
    label: String(row.label || ""),
    class_codes: Array.isArray(row.class_codes) ? row.class_codes.map(String) : [],
    progress_scale_id: row.progress_scale_id ? String(row.progress_scale_id) : null,
    sort_order: Number(row.sort_order) || 0,
  };
}

export function mapDomain(
  row: Record<string, unknown>,
  divisions: NurseryDivisionId[] = [],
): DevelopmentalDomainRow {
  return {
    id: String(row.id),
    code: String(row.code || ""),
    name: String(row.name || ""),
    sort_order: Number(row.sort_order) || 0,
    active: row.active !== false,
    divisions,
  };
}

export function mapSkill(
  row: Record<string, unknown>,
  divisions: NurseryDivisionId[] = [],
): DevelopmentalSkillRow {
  const kind = String(row.value_kind || "progress_code");
  return {
    id: String(row.id),
    domain_id: String(row.domain_id),
    description: String(row.description || ""),
    sort_order: Number(row.sort_order) || 0,
    active: row.active !== false,
    value_kind: isSkillValueKind(kind) ? kind : "progress_code",
    divisions,
  };
}

/** Parse a posted marksheet/workbook cell for a number skill (positive whole number). */
export function parseSkillNumericValue(raw: string | null | undefined): number | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
}

export function mapDevelopmentalAssessment(row: Record<string, unknown>): DevelopmentalAssessmentRow {
  const kind = String(row.kind || "endterm");
  const status = String(row.status || "open");
  return {
    id: String(row.id),
    term_id: String(row.term_id),
    campus: String(row.campus || "Kitante"),
    class_code: String(row.class_code || ""),
    stream: String(row.stream || ""),
    name: String(row.name || ""),
    kind: (["bot", "midterm", "endterm", "test"].includes(kind) ? kind : "endterm") as DevelopmentalAssessmentRow["kind"],
    held_on: row.held_on ? String(row.held_on) : null,
    status: (["open", "submitted", "approved"].includes(status) ? status : "open") as DevelopmentalAssessmentRow["status"],
    created_at: row.created_at ? String(row.created_at) : undefined,
  };
}

/** Load catalogue for one nursery division (active domains + skills + scale codes). */
export async function loadDivisionCatalogue(
  supabase: SupabaseClient,
  divisionId: NurseryDivisionId,
) {
  const [divRes, domainLinks, skillLinks, domainsRes, skillsRes, scalesRes, codesRes] = await Promise.all([
    supabase.from("nursery_divisions").select("*").eq("id", divisionId).maybeSingle(),
    supabase.from("domain_division_links").select("domain_id").eq("division_id", divisionId),
    supabase.from("skill_division_links").select("skill_id").eq("division_id", divisionId),
    supabase.from("developmental_domains").select("*").eq("active", true).order("sort_order"),
    supabase.from("developmental_skills").select("*").eq("active", true).order("sort_order"),
    supabase.from("progress_scales").select("*").order("sort_order"),
    supabase.from("progress_codes").select("*").order("sort_order"),
  ]);

  const error =
    divRes.error?.message ||
    domainLinks.error?.message ||
    skillLinks.error?.message ||
    domainsRes.error?.message ||
    skillsRes.error?.message ||
    scalesRes.error?.message ||
    codesRes.error?.message;
  if (error) return { error } as const;

  const division = divRes.data ? mapNurseryDivision(divRes.data as Record<string, unknown>) : null;
  const domainIds = new Set((domainLinks.data || []).map((row) => String(row.domain_id)));
  const skillIds = new Set((skillLinks.data || []).map((row) => String(row.skill_id)));

  const domains = (domainsRes.data || [])
    .map((row) => mapDomain(row as Record<string, unknown>, [divisionId]))
    .filter((row) => domainIds.has(row.id))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

  const skills = (skillsRes.data || [])
    .map((row) => mapSkill(row as Record<string, unknown>, [divisionId]))
    .filter((row) => skillIds.has(row.id) && domainIds.has(row.domain_id))
    .sort((a, b) => a.sort_order - b.sort_order || a.description.localeCompare(b.description));

  const scales = (scalesRes.data || []).map((row) => mapProgressScale(row as Record<string, unknown>));
  const codes = (codesRes.data || []).map((row) => mapProgressCode(row as Record<string, unknown>));
  // One shared nursery progress scale for every division.
  const scale =
    scales.find((row) => row.key === "nursery") ||
    scales.find((row) => row.id === division?.progress_scale_id) ||
    scales[0] ||
    null;
  const progressCodes = scale
    ? codes.filter((row) => row.scale_id === scale.id).sort((a, b) => a.sort_order - b.sort_order)
    : [];

  return {
    division,
    domains,
    skills,
    scale,
    progressCodes,
    legend: progressCodes.map((row): ProgressLegendEntry => ({ code: row.code, label: row.label })),
  } as const;
}

/** Group skills under domains for UI / reports. */
export function groupSkillsByDomain(
  domains: DevelopmentalDomainRow[],
  skills: DevelopmentalSkillRow[],
) {
  return domains.map((domain) => ({
    domain,
    skills: skills.filter((skill) => skill.domain_id === domain.id),
  }));
}

export function missingNurseryDsbaSchema(message: string | null | undefined) {
  return Boolean(
    message &&
      /developmental_domains|developmental_skills|developmental_assessments|skill_ratings|report_skill_lines|progress_scales|progress_codes|nursery_divisions|domain_division_links|skill_division_links|progress_legend|value_kind|numeric_value|0077_nursery_dsba|0078_unify_nursery_progress_scale|0081_developmental_assessments_campus|0082_nursery_skill_value_kind|operational_campus/i.test(
        message,
      ),
  );
}

/** Page-1 domains on the printed nursery report (by seeded sort_order). */
export const NURSERY_REPORT_PAGE1_SORT_MAX = 4;

const DOMAIN_IMAGE_BY_CODE: Record<string, string> = {
  FUNC: "Functional_living_skills.png",
  WRITE: "Writing_skills.png",
  LANG: "language_skills.png",
  MATH: "Math_skills.png",
  SOC: "Personal_&_Social_Development.png",
  PHYS: "Physical_and_Motor_Skills.png",
  ART: "Creative_art.png",
  MUSIC: "Music.png",
};

const DOMAIN_CODE_BY_NAME: Record<string, string> = {
  "functional / living skills": "FUNC",
  "writing skills": "WRITE",
  "language skills": "LANG",
  "maths skills": "MATH",
  "math skills": "MATH",
  "personal & social development": "SOC",
  "personal and social development": "SOC",
  "physical and motor skills": "PHYS",
  "creative art": "ART",
  music: "MUSIC",
};

/** Resolve a domain illustration under /nursery_report. */
export function nurseryDomainImagePath(input: {
  domain_code?: string | null;
  domain_name?: string | null;
  domain_sort?: number | null;
}) {
  const code =
    String(input.domain_code || "").trim().toUpperCase() ||
    DOMAIN_CODE_BY_NAME[String(input.domain_name || "").trim().toLowerCase()] ||
    "";
  const file = code ? DOMAIN_IMAGE_BY_CODE[code] : null;
  if (!file) return null;
  return `/nursery_report/${encodeURIComponent(file).replace(/%2F/gi, "/")}`;
}

/** Class label for nursery report cards: code + stream (e.g. C2 A), not “Baby Class”. */
export function nurseryReportClassLabel(classCode: string | null | undefined, stream?: string | null) {
  const code = String(classCode || "").trim().toUpperCase();
  if (!code) return "";
  const streamPart = String(stream || "").trim();
  return streamPart ? `${code} ${streamPart}` : code;
}

/** Age as years and months for nursery report cards. */
export function nurseryAgeLabel(dob: string | null | undefined, now = new Date()) {
  if (!dob) return null;
  const birth = new Date(`${dob.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return null;
  const yearUnit = years === 1 ? "year" : "years";
  const monthUnit = months === 1 ? "month" : "months";
  return `${years} ${yearUnit} ${months} ${monthUnit}`;
}

export function nurseryReportPageForDomainSort(domainSort: number) {
  return domainSort <= NURSERY_REPORT_PAGE1_SORT_MAX ? 1 : 2;
}
