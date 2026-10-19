import { SCHOOL_CLASSES } from "@/lib/students";

export const SUBJECT_BANDS = [
  { id: "nursery", label: "Nursery", hint: "Reception to Top", codes: ["RC", "C2", "C3", "C4"] },
  { id: "lower", label: "Lower primary", hint: "P1–P3", codes: ["P1", "P2", "P3"] },
  { id: "upper", label: "Upper primary", hint: "P4–P7", codes: ["P4", "P5", "P6", "P7"] },
] as const;

export type SubjectBandId = (typeof SUBJECT_BANDS)[number]["id"];

const ORDER: SubjectBandId[] = ["nursery", "lower", "upper"];

export function isSubjectBand(value: string): value is SubjectBandId {
  return ORDER.includes(value as SubjectBandId);
}

export function bandOrders(id: SubjectBandId) {
  const codes = SUBJECT_BANDS.find((band) => band.id === id)?.codes ?? [];
  const rows = SCHOOL_CLASSES.filter((entry) => (codes as readonly string[]).includes(entry.code));
  return { from: rows[0]?.order ?? 0, to: rows[rows.length - 1]?.order ?? 0 };
}

/** The sections in between are included, so a subject always covers a continuous run of classes. */
export function spanForBands(ids: readonly string[]) {
  const picked = ORDER.filter((id) => ids.includes(id));
  if (!picked.length) return null;
  const start = ORDER.indexOf(picked[0]);
  const end = ORDER.indexOf(picked[picked.length - 1]);
  const span = ORDER.slice(start, end + 1);
  const from = bandOrders(span[0]).from;
  const to = bandOrders(span[span.length - 1]).to;
  const nursery = bandOrders("nursery");
  const lower = bandOrders("lower");
  const upper = bandOrders("upper");
  const touchesNursery = from <= nursery.to;
  const touchesPrimary = to >= lower.from;
  const section = touchesNursery && touchesPrimary ? "both" : touchesNursery ? "nursery" : "primary";
  const wholeNursery = section === "nursery" && from === nursery.from && to === nursery.to;
  const wholePrimary = section === "primary" && from === lower.from && to === upper.to;
  const wholeSchool = section === "both" && from === nursery.from && to === upper.to;
  const open = wholeNursery || wholePrimary || wholeSchool;
  return {
    span,
    section: section as "nursery" | "primary" | "both",
    applies_from: open ? null : from,
    applies_to: open ? null : to,
  };
}

/** True when an active subject is taught in this class. */
export function subjectFits(
  subject: { active: boolean; section: "nursery" | "primary" | "both"; applies_from: number | null; applies_to: number | null },
  code: string | null | undefined,
) {
  if (!subject.active) return false;
  const entry = SCHOOL_CLASSES.find((row) => row.code === code);
  if (!entry) return false;
  const section = entry.section === "nursery" ? "nursery" : "primary";
  if (subject.section !== "both" && subject.section !== section) return false;
  if (subject.applies_from != null && entry.order < subject.applies_from) return false;
  if (subject.applies_to != null && entry.order > subject.applies_to) return false;
  return true;
}

export function bandsForSubject(subject: { section: "nursery" | "primary" | "both"; applies_from: number | null; applies_to: number | null }) {
  const nurseryEnd = bandOrders("nursery").to;
  return SUBJECT_BANDS.filter((band) => {
    const { from, to } = bandOrders(band.id);
    for (let order = from; order <= to; order += 1) {
      const level = order <= nurseryEnd ? "nursery" : "primary";
      if (subject.section !== "both" && subject.section !== level) continue;
      if (subject.applies_from != null && order < subject.applies_from) continue;
      if (subject.applies_to != null && order > subject.applies_to) continue;
      return true;
    }
    return false;
  }).map((band) => band.id);
}

export function bandPhrase(ids: readonly SubjectBandId[]) {
  const rows = SUBJECT_BANDS.filter((band) => ids.includes(band.id));
  if (!rows.length) return "No section";
  if (rows.length === SUBJECT_BANDS.length) return "All three sections";
  const [first, second] = rows;
  if (!first) return "No section";
  if (!second) return first.label;
  return `${first.label} and ${second.label.toLowerCase()}`;
}
