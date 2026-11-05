/** Operational campus names used across desks, fees, and Team grants. */
export const CAMPUS_OPTIONS = ["Kitante", "Najjanankumbi", "Makindye", "Bunga"] as const;

export type CampusId = (typeof CAMPUS_OPTIONS)[number];

/** Campuses that run clubs. Makindye and Bunga are out of clubs scope. */
export const CLUB_CAMPUSES = ["Kitante", "Najjanankumbi"] as const;
export type ClubCampusId = (typeof CLUB_CAMPUSES)[number];

/** Default when a form omits campus or legacy rows have a blank site. */
export const DEFAULT_CAMPUS: CampusId = "Kitante";

/** Normalise pupil/register campus to an operational site name. */
export function operationalCampus(value: string | null | undefined): CampusId {
  const trimmed = (value || "").trim();
  return isCampusId(trimmed) ? trimmed : DEFAULT_CAMPUS;
}

/** Read campus from a trimmed form value; invalid explicit values return null. */
export function campusFromFormValue(raw: string): CampusId | null {
  const trimmed = raw.trim();
  if (!trimmed) return DEFAULT_CAMPUS;
  return isCampusId(trimmed) ? trimmed : null;
}

export const CAMPUS_DASHBOARDS = ["admin", "admissions", "accounts", "academics", "store", "library", "clubs"] as const;
export type CampusDashboardId = (typeof CAMPUS_DASHBOARDS)[number];

export function isCampusId(value: string): value is CampusId {
  return (CAMPUS_OPTIONS as readonly string[]).includes(value);
}

export function isClubCampus(value: string): value is ClubCampusId {
  return (CLUB_CAMPUSES as readonly string[]).includes(value);
}

export function isCampusDashboard(value: string): value is CampusDashboardId {
  return (CAMPUS_DASHBOARDS as readonly string[]).includes(value);
}

export function filterCampuses(raw: string[] | null | undefined): CampusId[] {
  if (!raw?.length) return [];
  return CAMPUS_OPTIONS.filter((campus) => raw.includes(campus));
}

/** Keep only clubs campuses; when `raw` is empty, return every clubs campus. */
export function filterClubCampuses(raw: readonly string[] | null | undefined): ClubCampusId[] {
  if (!raw?.length) return [...CLUB_CAMPUSES];
  return CLUB_CAMPUSES.filter((campus) => raw.includes(campus));
}

export function campusesLabel(campuses: readonly string[]): string {
  if (!campuses.length) return "No campuses";
  if (campuses.length === CAMPUS_OPTIONS.length) return "All campuses";
  return campuses.join(", ");
}
