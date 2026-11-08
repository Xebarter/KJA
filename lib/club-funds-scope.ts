/**
 * Clubs desk funds scoping: income by pupil campus, expenditure by club campus.
 * Kitante / Najjanankumbi only. Blank pupil campus counts as Kitante.
 */
import { CLUB_CAMPUSES, filterClubCampuses, type ClubCampusId } from "@/lib/campuses";

export const CLUB_BRANCHES = CLUB_CAMPUSES;
export type ClubBranch = ClubCampusId;

/** Income branch = pupil campus (blank → Kitante). Outside clubs → null. */
export function clubBranch(campus: string | null | undefined): ClubBranch | null {
  const value = String(campus ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  if (!value) return "Kitante";
  if (value.includes("najjanankumbi") || value === "najja" || value.startsWith("najja")) return "Najjanankumbi";
  if (value.includes("kitante")) return "Kitante";
  return null;
}

export function studentFundsBranch(campus: string | null | undefined): ClubBranch | null {
  return clubBranch(campus);
}

/**
 * Spend branch = club catalogue campus.
 * "All campuses" is club-wide (null), not attributed to one site.
 * Blank club campus defaults to Kitante.
 */
export function clubFundsBranch(campus: string | null | undefined): ClubBranch | null {
  const raw = String(campus ?? "").trim();
  if (/^all\s*campuses$/i.test(raw)) return null;
  return clubBranch(raw);
}

/** Whether a pupil's receipts/consents count for this desk (staff grant + optional campus filter). */
export function studentInFundsScope(
  campus: string | null | undefined,
  staffCampuses: readonly string[] | null | undefined,
  campusFilter?: string | null,
) {
  const branch = studentFundsBranch(campus);
  if (!branch) return false;
  const allowed = filterClubCampuses(staffCampuses);
  if (!allowed.includes(branch)) return false;
  if (campusFilter && branch !== campusFilter) return false;
  return true;
}

/** Whether a club's expenses count for this desk (staff grant + optional campus filter). */
export function clubInFundsScope(
  clubCampus: string | null | undefined,
  staffCampuses: readonly string[] | null | undefined,
  campusFilter?: string | null,
) {
  const allowed = filterClubCampuses(staffCampuses);
  if (!allowed.length) return false;
  const branch = clubFundsBranch(clubCampus);
  // All-campus clubs: whole-desk totals only, not a single-branch filter.
  if (!branch) return !campusFilter;
  if (!allowed.includes(branch)) return false;
  if (campusFilter && branch !== campusFilter) return false;
  return true;
}

/**
 * Whether a catalogue club should appear when working in a branch.
 * "All campuses" and dual-campus labels remain visible in each branch.
 */
export function clubServesBranch(clubCampus: string | null | undefined, branch: ClubBranch): boolean {
  const raw = String(clubCampus ?? "").trim();
  if (!raw || /^all\s*campuses$/i.test(raw)) return true;
  const lower = raw.toLowerCase();
  if (branch === "Kitante" && lower.includes("kitante")) return true;
  if (branch === "Najjanankumbi" && (lower.includes("najjanankumbi") || lower.includes("najja"))) return true;
  return clubBranch(raw) === branch;
}
