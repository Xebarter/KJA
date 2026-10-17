import { CLUB_CATEGORIES } from "@/lib/clubs";

const ICONS: [RegExp, string][] = [
  [/swim/i, "fa-person-swimming"],
  [/soccer|football/i, "fa-futbol"],
  [/badminton/i, "fa-table-tennis-paddle-ball"],
  [/chess/i, "fa-chess-knight"],
  [/piano|guitar|music/i, "fa-music"],
  [/ballet|dance/i, "fa-shoe-prints"],
  [/art/i, "fa-palette"],
  [/computer/i, "fa-laptop-code"],
  [/home/i, "fa-house-chimney"],
  [/scout|guide/i, "fa-campground"],
  [/french|chinese|reader/i, "fa-language"],
  [/catholic|anglican|islam|relig/i, "fa-hands-praying"],
];

export const CLUB_SHORT: Record<string, string> = {
  "Games and Sports": "Sports",
  "Art and Entertainment": "Arts",
  "Science and Technology": "Science",
  "Travel and Adventure": "Adventure",
  "Information and Language": "Language",
  Religion: "Religion",
  Other: "Other",
};

export function clubIcon(title: string) {
  return ICONS.find(([pattern]) => pattern.test(title))?.[1] || "fa-puzzle-piece";
}

export const ugx = (value: number) => `UGX ${Math.round(value).toLocaleString("en-US")}`;

export type ClubChoice = {
  id: string;
  title: string;
  category: string;
  fee: number;
  state: "open" | "consented" | "waiting" | "paid";
  consentId: string | null;
  receiptNo: string | null;
  collectionId: string | null;
};

export type ClubPatch = Partial<Pick<ClubChoice, "state" | "consentId" | "receiptNo" | "collectionId">>;

export type ClubChild = {
  id: string;
  name: string;
  detail: string;
  clubs: ClubChoice[];
};

export function needsPayment(club: ClubChoice) {
  return club.fee > 0 && (club.state === "consented" || club.state === "waiting");
}

export function isConfirmed(club: ClubChoice) {
  return club.state === "paid" || (club.fee === 0 && club.state === "consented");
}

export function clubBucket(club: ClubChoice) {
  return CLUB_CATEGORIES.includes(club.category as (typeof CLUB_CATEGORIES)[number]) ? club.category : "Other";
}

export function chosenClubs(child: ClubChild) {
  return child.clubs
    .filter((club) => club.state !== "open")
    .slice()
    .sort((a, b) => Number(isConfirmed(a)) - Number(isConfirmed(b)) || a.title.localeCompare(b.title));
}

export function childSummary(child: ClubChild) {
  const chosen = chosenClubs(child);
  if (!chosen.length) return "No clubs yet";
  const due = chosen.filter(needsPayment);
  if (!due.length) return "All confirmed";
  const total = due.reduce((sum, club) => sum + club.fee, 0);
  const label = due.length === 1 ? "1 to pay" : `${due.length} to pay`;
  return `${label} · ${ugx(total)}`;
}

export function clubStatus(club: ClubChoice) {
  if (isConfirmed(club)) return { label: "Confirmed", tone: "paid" as const };
  if (club.state === "waiting") return { label: "Waiting", tone: "wait" as const };
  if (needsPayment(club)) return { label: "To pay", tone: "due" as const };
  return { label: "Consented", tone: "due" as const };
}
