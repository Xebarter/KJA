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
};

export type SittingColumn = {
  subjectId: string;
  name: string;
  sort: number;
  maxScore: number;
  weight: number;
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
}) {
  const params = new URLSearchParams({
    name: input.name,
    kind: input.kind,
    class: input.classCode,
    stream: input.stream || "-",
  });
  if (input.heldOn) params.set("held", input.heldOn);
  if (input.combine) params.set("combine", "1");
  return `${ACADEMICS_BASE}/assessments/marksheet?${params.toString()}`;
}

export function marksheetExportHref(input: MarksheetQuery & { sort: string }) {
  const params = new URLSearchParams({
    name: input.name,
    kind: input.kind,
    class: input.classCode,
    stream: input.stream || "-",
    sort: input.sort,
  });
  if (input.held) params.set("held", input.held);
  if (input.combine) params.set("combine", "1");
  return `${ACADEMICS_BASE}/assessments/marksheet/export?${params.toString()}`;
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
