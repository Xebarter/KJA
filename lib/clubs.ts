import { ACCOUNTS_BASE } from "@/lib/accounts-nav";
import { SCHOOL_CLASSES } from "@/lib/students";

export const CLUB_CATEGORIES = [
  "Games and Sports",
  "Art and Entertainment",
  "Science and Technology",
  "Travel and Adventure",
  "Information and Language",
  "Religion",
] as const;

export const CLUB_SECTIONS = [
  { value: "both", label: "Nursery and primary" },
  { value: "nursery", label: "Nursery" },
  { value: "primary", label: "Primary" },
] as const;

export type ClubSection = (typeof CLUB_SECTIONS)[number]["value"];

export function sectionLabel(value: string | null | undefined) {
  return CLUB_SECTIONS.find((section) => section.value === value)?.label ?? "Nursery and primary";
}

export function isClubSection(value: string): value is ClubSection {
  return CLUB_SECTIONS.some((section) => section.value === value);
}

export type ClubListFilters = {
  q: string;
  pay: string;
  club: string;
  classCode: string;
  stream: string;
  campus: string;
};

/** Search link for the clubs register. Safe to call from the server page. */
export function clubListHref(filters: Partial<ClubListFilters>) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.pay) params.set("pay", filters.pay);
  if (filters.club) params.set("club", filters.club);
  if (filters.classCode) params.set("class", filters.classCode);
  if (filters.stream) params.set("stream", filters.stream);
  if (filters.campus) params.set("campus", filters.campus);
  const query = params.toString();
  const base = `${ACCOUNTS_BASE}/clubs`;
  return query ? `${base}?${query}` : base;
}

/** A nursery-only or primary-only club is hidden once the child's class is known. */
export function clubFits(section: string | null | undefined, classCode: string | null | undefined) {
  if (!section || section === "both") return true;
  if (!classCode) return true;
  const level = SCHOOL_CLASSES.find((entry) => entry.code === classCode)?.section === "nursery" ? "nursery" : "primary";
  return level === section;
}
