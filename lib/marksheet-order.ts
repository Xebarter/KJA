/** Shared arrangement for the class marksheet and its Excel register. */

export type MarksheetSort =
  | "roll"
  | "name-asc"
  | "name-desc"
  | "best"
  | "worst"
  | "number"
  | "gaps"
  | "academic-high"
  | "academic-low"
  | "other-high"
  | "other-low"
  | `subject-high:${string}`
  | `subject-low:${string}`;

export type MarksheetOrderRow = {
  id: string;
  name: string;
  number: string;
  roll: number;
  average: number | null;
  /** Weighted average across Academic (core) subjects only. */
  academicAverage: number | null;
  /** Weighted average across Other (cocurricular) subjects only. */
  otherAverage: number | null;
  gaps: number;
  /** Percent per subject id. Null when the mark is blank or the pupil was absent. */
  percents: Record<string, number | null>;
};

const PLAIN = new Set<MarksheetSort>([
  "roll",
  "name-asc",
  "name-desc",
  "best",
  "worst",
  "number",
  "gaps",
  "academic-high",
  "academic-low",
  "other-high",
  "other-low",
]);

export function parseMarksheetSort(value: string | null | undefined, subjectIds: ReadonlySet<string>): MarksheetSort {
  const raw = (value || "").trim();
  if (PLAIN.has(raw as MarksheetSort)) return raw as MarksheetSort;
  const match = /^(subject-high|subject-low):([0-9a-f-]{36})$/i.exec(raw);
  if (match && subjectIds.has(match[2])) return `${match[1]}:${match[2]}` as MarksheetSort;
  return "roll";
}

export type MarksheetSortSubject = {
  id: string;
  name: string;
  kind?: string | null;
  /** Catalogue subject id — used to combine the same subject across sittings. */
  subjectId?: string;
};

/** One arrange target per catalogue subject (falls back to column id). */
export function marksheetArrangeKey(subject: Pick<MarksheetSortSubject, "id" | "subjectId">) {
  return subject.subjectId || subject.id;
}

function dedupeSortSubjects(subjects: MarksheetSortSubject[]) {
  const seen = new Set<string>();
  const unique: MarksheetSortSubject[] = [];
  for (const subject of subjects) {
    const key = marksheetArrangeKey(subject);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ ...subject, id: key });
  }
  return unique;
}

function subjectSortRows(subjects: MarksheetSortSubject[]) {
  return subjects.flatMap((subject) => [
    { value: `subject-high:${subject.id}` as MarksheetSort, label: `${subject.name}, highest first` },
    { value: `subject-low:${subject.id}` as MarksheetSort, label: `${subject.name}, lowest first` },
  ]);
}

export function marksheetSortChoices(subjects: MarksheetSortSubject[]) {
  const unique = dedupeSortSubjects(subjects);
  const academic = unique.filter((subject) => subject.kind !== "cocurricular");
  const extras = unique.filter((subject) => subject.kind === "cocurricular");
  const academicChoices: { value: MarksheetSort; label: string }[] = [];
  const extraChoices: { value: MarksheetSort; label: string }[] = [];
  if (academic.length) {
    academicChoices.push(
      { value: "academic-high", label: "All academic, highest first" },
      { value: "academic-low", label: "All academic, lowest first" },
      ...subjectSortRows(academic),
    );
  }
  if (extras.length) {
    extraChoices.push(
      { value: "other-high", label: "All extras, highest first" },
      { value: "other-low", label: "All extras, lowest first" },
      ...subjectSortRows(extras),
    );
  }
  return {
    classChoices: [
      { value: "roll" as const, label: "Roll order" },
      { value: "name-asc" as const, label: "Name, A to Z" },
      { value: "name-desc" as const, label: "Name, Z to A" },
      { value: "best" as const, label: "Best performed to worst" },
      { value: "worst" as const, label: "Worst performed to best" },
      { value: "number" as const, label: "Student number" },
      { value: "gaps" as const, label: "Most gaps first" },
    ],
    academicChoices,
    extraChoices,
    /** @deprecated Prefer academicChoices / extraChoices. Kept for older callers. */
    subjectChoices: [...academicChoices, ...extraChoices],
  };
}

export function marksheetSortLabel(sort: MarksheetSort, subjectName = "") {
  switch (sort) {
    case "roll": return "Roll order";
    case "name-asc": return "Name, A to Z";
    case "name-desc": return "Name, Z to A";
    case "best": return "Best performed to worst";
    case "worst": return "Worst performed to best";
    case "number": return "Student number";
    case "gaps": return "Most gaps first";
    case "academic-high": return "All academic, highest first";
    case "academic-low": return "All academic, lowest first";
    case "other-high": return "All extras, highest first";
    case "other-low": return "All extras, lowest first";
    default:
      return sort.startsWith("subject-high:") ? `${subjectName}, highest first` : `${subjectName}, lowest first`;
  }
}

export function marksheetFileSlug(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, 48);
}

export function marksheetSortSlug(sort: MarksheetSort, subjectName = "") {
  switch (sort) {
    case "roll": return "roll-order";
    case "name-asc": return "name-a-z";
    case "name-desc": return "name-z-a";
    case "best": return "best-to-worst";
    case "worst": return "worst-to-best";
    case "number": return "student-number";
    case "gaps": return "most-gaps";
    case "academic-high": return "academic-highest";
    case "academic-low": return "academic-lowest";
    case "other-high": return "other-highest";
    case "other-low": return "other-lowest";
    default: {
      const name = marksheetFileSlug(subjectName || "subject") || "subject";
      return sort.startsWith("subject-high:") ? `${name}-highest` : `${name}-lowest`;
    }
  }
}

export function marksheetWorkbookFilename(input: { classLabel: string; name: string; held: string; sort: MarksheetSort; subjectName?: string }) {
  const parts = [
    marksheetFileSlug(input.classLabel),
    marksheetFileSlug(input.name),
    input.held || "undated",
    marksheetSortSlug(input.sort, input.subjectName || ""),
  ].filter(Boolean);
  return `${parts.join("-").slice(0, 140)}.xlsx`;
}

function byName(left: string, right: string) {
  return left.localeCompare(right, "en", { sensitivity: "base" });
}

/** Ascending numeric order. Missing values sort last. */
function compareAsc(left: number | null, right: number | null) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

/** Descending numeric order. Missing values sort last. */
function compareDesc(left: number | null, right: number | null) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

function compareNumber(left: string, right: string) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right, "en", { numeric: true, sensitivity: "base" });
}

function subjectIdOf(sort: MarksheetSort) {
  const split = sort.indexOf(":");
  return split < 0 ? "" : sort.slice(split + 1);
}

export function compareMarksheet(left: MarksheetOrderRow, right: MarksheetOrderRow, sort: MarksheetSort) {
  let diff = 0;
  switch (sort) {
    case "roll":
      diff = left.roll - right.roll;
      break;
    case "name-asc":
      diff = byName(left.name, right.name);
      break;
    case "name-desc":
      diff = byName(right.name, left.name);
      break;
    case "best":
      diff = compareDesc(left.average, right.average);
      break;
    case "worst":
      diff = compareAsc(left.average, right.average);
      break;
    case "number":
      diff = compareNumber(left.number, right.number);
      break;
    case "gaps":
      diff = right.gaps - left.gaps;
      break;
    case "academic-high":
      diff = compareDesc(left.academicAverage, right.academicAverage);
      break;
    case "academic-low":
      diff = compareAsc(left.academicAverage, right.academicAverage);
      break;
    case "other-high":
      diff = compareDesc(left.otherAverage, right.otherAverage);
      break;
    case "other-low":
      diff = compareAsc(left.otherAverage, right.otherAverage);
      break;
    default: {
      const id = subjectIdOf(sort);
      const high = sort.startsWith("subject-high:");
      diff = high ? compareDesc(left.percents[id] ?? null, right.percents[id] ?? null) : compareAsc(left.percents[id] ?? null, right.percents[id] ?? null);
      break;
    }
  }
  if (diff) return diff;
  return byName(left.name, right.name) || left.roll - right.roll || left.id.localeCompare(right.id);
}

export function arrangeMarksheet<T extends MarksheetOrderRow>(rows: T[], sort: MarksheetSort) {
  return [...rows].sort((left, right) => compareMarksheet(left, right, sort));
}

/** Subjects shown for the active arrange choice. Class sorts keep every column. */
export function marksheetVisibleSubjects<T extends { id: string; kind?: string | null; subjectId?: string }>(
  subjects: T[],
  sort: MarksheetSort,
): T[] {
  if (sort === "academic-high" || sort === "academic-low") {
    return subjects.filter((subject) => subject.kind !== "cocurricular");
  }
  if (sort === "other-high" || sort === "other-low") {
    return subjects.filter((subject) => subject.kind === "cocurricular");
  }
  if (sort.startsWith("subject-high:") || sort.startsWith("subject-low:")) {
    const id = subjectIdOf(sort);
    return subjects.filter((subject) => subject.id === id || subject.subjectId === id);
  }
  return subjects;
}

/** Display / rank average for the active arrange filter. */
export function marksheetDisplayAverage(row: MarksheetOrderRow, sort: MarksheetSort): number | null {
  if (sort === "academic-high" || sort === "academic-low") return row.academicAverage;
  if (sort === "other-high" || sort === "other-low") return row.otherAverage;
  if (sort.startsWith("subject-high:") || sort.startsWith("subject-low:")) {
    return row.percents[subjectIdOf(sort)] ?? null;
  }
  return row.average;
}

export type MarksheetTone = "blank" | "missed" | "low" | "mid" | "high";

export function markPercent(score: number | null, max: number, missed: boolean) {
  if (missed || score === null || max <= 0) return null;
  return (score / max) * 100;
}

export function markTone(percent: number | null, missed: boolean, blank: boolean): MarksheetTone {
  if (missed) return "missed";
  if (blank || percent === null) return "blank";
  if (percent >= 80) return "high";
  if (percent < 50) return "low";
  return "mid";
}
