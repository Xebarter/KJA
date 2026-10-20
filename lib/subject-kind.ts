/** Client-safe subject kind helpers (no next/cache). */

/** Stored values: core = Academic marks table; cocurricular = Other / co-curricular table. */
export type SubjectKind = "core" | "cocurricular";

export function isCocurricularSubject(subject: { kind?: string | null } | string | null | undefined) {
  const kind = typeof subject === "string" || subject == null ? subject : subject.kind;
  return kind === "cocurricular";
}

export function isAcademicSubject(subject: { kind?: string | null } | string | null | undefined) {
  return !isCocurricularSubject(subject);
}

export function subjectKindLabel(kind: SubjectKind | string | null | undefined) {
  if (kind === "cocurricular") return "Other";
  return "Academic";
}

/** Normalize DB / form values to a stored kind. Legacy 'other' electives become Academic. */
export function normalizeSubjectKind(raw: string | null | undefined): SubjectKind {
  return raw === "cocurricular" ? "cocurricular" : "core";
}
