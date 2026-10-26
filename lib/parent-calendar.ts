import { academicKindLabel, type StudentAcademicDate } from "@/lib/student";
import type { Article } from "@/lib/types";

export type ParentAcademicDate = StudentAcademicDate & {
  class_code?: string | null;
  stream?: string | null;
};

type LinkedPupil = {
  class_code?: string | null;
  stream?: string | null;
  campus?: string | null;
};

type DateRow = {
  id: string;
  title: string;
  kind: string;
  starts_on: string;
  ends_on: string | null;
  campus: string | null;
  note: string | null;
  class_code?: string | null;
  stream?: string | null;
};

function classKey(classCode: string | null | undefined, stream: string | null | undefined) {
  return `${classCode || ""}|${stream || ""}`;
}

function contentKey(row: Pick<DateRow, "title" | "kind" | "starts_on" | "ends_on" | "campus">) {
  return [
    row.title.trim().toLowerCase(),
    row.kind,
    row.starts_on,
    row.ends_on || row.starts_on,
    (row.campus || "").trim().toLowerCase(),
  ].join("|");
}

/** Keep one copy when the same date appears for more than one child (or is duplicated per class). */
export function dedupeAcademicDates(rows: DateRow[]): ParentAcademicDate[] {
  const byId = new Map<string, DateRow>();
  for (const row of rows) {
    if (!row?.id || byId.has(row.id)) continue;
    byId.set(row.id, row);
  }

  const byContent = new Map<string, DateRow>();
  for (const row of [...byId.values()].sort((a, b) => {
    // Prefer school-wide / office dates over class copies of the same day.
    const aOffice = a.class_code ? 1 : 0;
    const bOffice = b.class_code ? 1 : 0;
    return aOffice - bOffice || a.starts_on.localeCompare(b.starts_on) || a.title.localeCompare(b.title);
  })) {
    const key = contentKey(row);
    if (byContent.has(key)) continue;
    byContent.set(key, row);
  }

  return [...byContent.values()]
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on) || a.title.localeCompare(b.title))
    .map((row) => ({
      id: row.id,
      title: row.title,
      kind: row.kind as ParentAcademicDate["kind"],
      starts_on: row.starts_on,
      ends_on: row.ends_on,
      campus: row.campus,
      note: row.note,
      class_code: row.class_code ?? null,
      stream: row.stream ?? null,
    }));
}

/** Filter to office-wide dates plus dates for any linked pupil's class (and campus when set). */
export function familyAcademicDates(rows: DateRow[], pupils: LinkedPupil[]): ParentAcademicDate[] {
  const classes = new Set(
    pupils
      .filter((pupil) => pupil.class_code)
      .map((pupil) => classKey(pupil.class_code, pupil.stream)),
  );
  const campuses = new Set(
    pupils.map((pupil) => (pupil.campus || "").trim()).filter(Boolean),
  );

  const visible = rows.filter((row) => {
    const scoped = Boolean(row.class_code);
    if (scoped && !classes.has(classKey(row.class_code, row.stream))) return false;
    if (!row.campus || /all/i.test(row.campus)) return true;
    if (!campuses.size) return true;
    return campuses.has(row.campus.trim());
  });

  return dedupeAcademicDates(visible);
}

/** Turn academic dates into Article-shaped rows so the parent calendar can reuse event rendering. */
export function academicDatesAsArticles(dates: ParentAcademicDate[]): Article[] {
  return dates.map((row) => ({
    id: row.id,
    slug: `academic-${row.id}`,
    title: row.title,
    excerpt: [academicKindLabel(row.kind), row.note].filter(Boolean).join(" · ") || null,
    starts_on: row.starts_on,
    ends_on: row.ends_on,
    location: row.campus,
    published: true,
    category: "academic",
    tags: ["academic", row.kind],
  }));
}

export function isAcademicCalendarSlug(slug: string | null | undefined) {
  return Boolean(slug && slug.startsWith("academic-"));
}
