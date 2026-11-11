import { ASSESSMENT_KINDS, streamFromQuery } from "@/lib/academics";
import { ACADEMICS_BASE } from "@/lib/academics-nav";
import { isClassCode } from "@/lib/students";

export type MarksheetQuery = {
  name: string;
  kind: string;
  held: string;
  classCode: string;
  stream: string;
  combine: boolean;
};

/** One subject column when every stream of a class is shown together. */
export type SittingPaper = {
  id: string;
  subjectId: string;
  stream: string;
  name: string;
  sort: number;
  maxScore: number;
  weight: number;
  status: string | null;
  heldOn: string | null;
  /** Catalogue kind from subjects.kind. */
  kind?: "core" | "cocurricular";
};

export type SittingColumn = {
  subjectId: string;
  name: string;
  sort: number;
  maxScore: number;
  weight: number;
  kind?: "core" | "cocurricular";
  papers: SittingPaper[];
};

/** Line papers up by subject. Cells still belong to the paper for that pupil's stream. */
export function sittingColumns(papers: SittingPaper[]): SittingColumn[] {
  const grouped = new Map<string, SittingColumn>();
  const ordered = [...papers].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name) || a.stream.localeCompare(b.stream) || a.id.localeCompare(b.id));
  for (const paper of ordered) {
    const column = grouped.get(paper.subjectId);
    if (!column) {
      grouped.set(paper.subjectId, {
        subjectId: paper.subjectId,
        name: paper.name,
        sort: paper.sort,
        maxScore: paper.maxScore,
        weight: paper.weight,
        kind: paper.kind || "core",
        papers: [paper],
      });
      continue;
    }
    column.papers.push(paper);
    if (column.papers.some((item) => item.maxScore !== paper.maxScore)) column.maxScore = 0;
    if (column.papers.some((item) => item.weight !== paper.weight)) column.weight = 0;
  }
  return [...grouped.values()];
}

/** Class marksheet for one assessment sitting: same name, kind and date. */
export function marksheetHref(input: {
  name: string;
  kind: string;
  classCode: string;
  stream: string;
  heldOn: string;
  combine?: boolean;
  campus?: string;
  /** Defaults to academics office marksheet. Pass teacher path for class-teacher desk. */
  basePath?: string;
}) {
  const params = new URLSearchParams({
    name: input.name,
    kind: input.kind,
    class: input.classCode,
    stream: input.stream || "-",
  });
  if (input.heldOn) params.set("held", input.heldOn);
  if (input.combine) params.set("combine", "1");
  if (input.campus) params.set("campus", input.campus);
  const base = input.basePath || `${ACADEMICS_BASE}/assessments/marksheet`;
  return `${base}?${params.toString()}`;
}

export function marksheetExportHref(input: {
  name?: string;
  kind?: string;
  held?: string;
  classCode: string;
  stream: string;
  combine?: boolean;
  sort: string;
  format?: "xlsx" | "pdf";
  campus?: string;
  /** Multi-assessment combined worksheet (class teacher). */
  assessmentsCombined?: boolean;
  sittings?: CombinedSitting[];
  /** Defaults to academics office export. Pass teacher export path for class-teacher desk. */
  basePath?: string;
}) {
  const params = new URLSearchParams({
    class: input.classCode,
    stream: input.stream || "-",
    sort: input.sort,
  });
  if (input.assessmentsCombined && input.sittings && input.sittings.length >= 2) {
    params.set("mode", "combined");
    for (const sitting of input.sittings) {
      params.append("s", encodeCombinedSitting(sitting));
    }
  } else {
    params.set("name", input.name || "");
    params.set("kind", input.kind || "");
    if (input.held) params.set("held", input.held);
    if (input.combine) params.set("combine", "1");
  }
  if (input.campus) params.set("campus", input.campus);
  if (input.format === "pdf") params.set("format", "pdf");
  const base = input.basePath || `${ACADEMICS_BASE}/assessments/marksheet/export`;
  return `${base}?${params.toString()}`;
}

export function readMarksheetQuery(input: {
  name?: string | null;
  kind?: string | null;
  held?: string | null;
  classCode?: string | null;
  stream?: string | null;
  combine?: string | null;
}): MarksheetQuery | null {
  const name = (input.name || "").trim().slice(0, 200);
  const kind = (input.kind || "").trim();
  const held = (input.held || "").trim();
  const classCode = (input.classCode || "").trim();
  const stream = streamFromQuery(input.stream ?? undefined);
  const valid = name.length >= 2
    && ASSESSMENT_KINDS.some((entry) => entry.value === kind)
    && isClassCode(classCode)
    && stream !== null
    && (!held || /^\d{4}-\d{2}-\d{2}$/.test(held));
  if (!valid || stream === null) return null;
  return { name, kind, held, classCode, stream, combine: input.combine === "1" };
}

/** One assessment sitting in a combined marksheet URL or form payload. */
export type CombinedSitting = {
  name: string;
  kind: string;
  held: string;
};

export type CombinedMarksheetQuery = {
  classCode: string;
  stream: string;
  sittings: CombinedSitting[];
};

/** Encode a sitting as name|kind|held for combined marksheet query params. */
export function encodeCombinedSitting(sitting: CombinedSitting) {
  return `${sitting.name}|${sitting.kind}|${sitting.held}`;
}

/** Parse a sitting token from query/form. Returns null when invalid. */
export function parseCombinedSitting(raw: string): CombinedSitting | null {
  const parts = raw.split("|");
  if (parts.length < 2) return null;
  const name = (parts[0] || "").trim().slice(0, 200);
  const kind = (parts[1] || "").trim();
  const held = (parts[2] || "").trim();
  if (name.length < 2) return null;
  if (!ASSESSMENT_KINDS.some((entry) => entry.value === kind)) return null;
  if (held && !/^\d{4}-\d{2}-\d{2}$/.test(held)) return null;
  return { name, kind, held };
}

export function sittingKey(sitting: Pick<CombinedSitting, "name" | "kind" | "held">) {
  return `${sitting.name}\u001f${sitting.kind}\u001f${sitting.held}`;
}

/** Class marksheet that stacks two or more assessment sittings in one worksheet. */
export function combinedMarksheetHref(input: {
  classCode: string;
  stream: string;
  campus?: string;
  sittings: CombinedSitting[];
  basePath?: string;
}) {
  const params = new URLSearchParams({
    class: input.classCode,
    stream: input.stream || "-",
    mode: "combined",
  });
  if (input.campus) params.set("campus", input.campus);
  for (const sitting of input.sittings) {
    params.append("s", encodeCombinedSitting(sitting));
  }
  const base = input.basePath || `${ACADEMICS_BASE}/assessments/marksheet`;
  return `${base}?${params.toString()}`;
}

export function readCombinedMarksheetQuery(input: {
  mode?: string | null;
  classCode?: string | null;
  stream?: string | null;
  sittings?: string | string[] | null;
}): CombinedMarksheetQuery | null {
  if ((input.mode || "").trim() !== "combined") return null;
  const classCode = (input.classCode || "").trim();
  const stream = streamFromQuery(input.stream ?? undefined);
  if (!isClassCode(classCode) || stream === null) return null;

  const rawList = Array.isArray(input.sittings)
    ? input.sittings
    : input.sittings
      ? [input.sittings]
      : [];
  const seen = new Set<string>();
  const sittings: CombinedSitting[] = [];
  for (const raw of rawList) {
    const sitting = parseCombinedSitting(String(raw || ""));
    if (!sitting) continue;
    const key = sittingKey(sitting);
    if (seen.has(key)) continue;
    seen.add(key);
    sittings.push(sitting);
  }
  if (sittings.length < 2) return null;
  return { classCode, stream, sittings };
}
