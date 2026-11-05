/*
 * Consented learners for the current term, grouped by club, for the printable roll.
 * A club with nobody consented (after filters) is left out.
 * Paid and unpaid consents both appear; expected vs collected close each club sheet.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { classLabel, classOrder } from "@/lib/academics";
import { day, kampalaToday } from "@/lib/accounts-format";
import type { CampusId } from "@/lib/campuses";
import { sectionLabel } from "@/lib/clubs";

export type ClubRollLearner = {
  name: string;
  number: string;
  classLabel: string;
  campus: string;
  /** Current club fee. This is what the school expects from this learner. */
  expected: number;
  /** Receipt amount for this term, or 0 when nothing has been received. */
  paid: number;
};

export type ClubRollSheet = {
  title: string;
  category: string;
  audience: string;
  fee: number;
  learners: ClubRollLearner[];
};

export type ClubRoll = {
  termLabel: string;
  generatedOn: string;
  clubs: ClubRollSheet[];
};

export type ClubRollFilters = {
  /** Limit to these clubs. Omit or empty to include every club that still has members after other filters. */
  clubIds?: readonly string[] | null;
  classCode?: string;
  stream?: string;
  campus?: string;
  q?: string;
};

type ClubRow = {
  id: string;
  title: string;
  category: string | null;
  fee_amount: number | null;
  section: string | null;
  sort_order: number | null;
};

type Pupil = {
  id: string;
  full_name: string;
  student_number: string | null;
  class_code: string | null;
  stream: string | null;
  campus: string | null;
};

function asFilters(input?: ClubRollFilters | readonly string[] | null): ClubRollFilters {
  if (Array.isArray(input) || input == null) return { clubIds: input ?? null };
  return input;
}

/** `filters.clubIds` limits the roll to those clubs. Omit it to include every club that has consent. */
export async function loadClubRoll(
  supabase: SupabaseClient,
  input?: ClubRollFilters | readonly string[] | null,
  campuses: readonly CampusId[] = [],
): Promise<ClubRoll> {
  const filters = asFilters(input);
  const termQuery = await supabase.from("fee_terms").select("id, label").eq("is_current", true).maybeSingle();
  if (termQuery.error) throw new Error(termQuery.error.message);
  const term = termQuery.data as { id: string; label: string } | null;
  if (!term) throw new Error("Set the current term before printing the club roll.");

  const [clubsQuery, consentsQuery, paymentsQuery] = await Promise.all([
    supabase.from("clubs").select("id, title, category, fee_amount, section, sort_order").not("guide_no", "is", null).order("sort_order"),
    supabase.from("club_consents").select("student_id, club_id").is("withdrawn_at", null),
    supabase.from("club_payments").select("student_id, club_id, amount").eq("term_id", term.id).is("voided_at", null),
  ]);
  if (clubsQuery.error) throw new Error(clubsQuery.error.message);
  if (consentsQuery.error) throw new Error(consentsQuery.error.message);
  if (paymentsQuery.error) throw new Error(paymentsQuery.error.message);

  const clubs = (clubsQuery.data || []) as ClubRow[];
  const consents = (consentsQuery.data || []) as { student_id: string; club_id: string }[];
  const payments = (paymentsQuery.data || []) as { student_id: string; club_id: string; amount: number }[];
  const paidOf = new Map(payments.map((row) => [`${row.student_id}:${row.club_id}`, Number(row.amount) || 0]));
  const catalogueIds = new Set(clubs.map((club) => club.id));

  const learnersOf = new Map<string, string[]>();
  for (const consent of consents) {
    if (!catalogueIds.has(consent.club_id)) continue;
    const list = learnersOf.get(consent.club_id);
    if (list) list.push(consent.student_id);
    else learnersOf.set(consent.club_id, [consent.student_id]);
  }

  const studentIds = [...new Set([...learnersOf.values()].flat())];
  let pupils: Pupil[] = [];
  if (studentIds.length) {
    const pupilsQuery = await supabase.from("students").select("id, full_name, student_number, class_code, stream, campus").in("id", studentIds);
    if (pupilsQuery.error) throw new Error(pupilsQuery.error.message);
    pupils = (pupilsQuery.data || []) as Pupil[];
  }
  const campusSet = new Set(campuses);
  const needle = (filters.q || "").trim().toLowerCase();
  const pupilOf = new Map(
    pupils
      .filter((pupil) => !campusSet.size || !pupil.campus || campusSet.has(pupil.campus as CampusId))
      .map((pupil) => [pupil.id, pupil]),
  );

  const matchesPupil = (pupil: Pupil, clubTitle: string) => {
    if (filters.classCode === "none" && pupil.class_code) return false;
    if (filters.classCode && filters.classCode !== "none" && pupil.class_code !== filters.classCode) return false;
    if (filters.stream && (pupil.stream || "").trim() !== filters.stream) return false;
    if (filters.campus && (pupil.campus || "").trim() !== filters.campus) return false;
    if (!needle) return true;
    const hay = `${pupil.full_name} ${pupil.student_number || ""} ${clubTitle} ${pupil.class_code || ""} ${pupil.stream || ""} ${pupil.campus || ""}`.toLowerCase();
    return hay.includes(needle);
  };

  const wanted = filters.clubIds?.length ? new Set(filters.clubIds) : null;
  const sheets = clubs.flatMap((club) => {
    if (wanted && !wanted.has(club.id)) return [];
    const fee = Number(club.fee_amount) || 0;
    const ids = learnersOf.get(club.id) || [];
    const learners = ids.flatMap((studentId) => {
      const pupil = pupilOf.get(studentId);
      if (!pupil || !matchesPupil(pupil, club.title)) return [];
      return [{
        name: pupil.full_name,
        number: pupil.student_number || "",
        classLabel: pupil.class_code ? classLabel(pupil.class_code, pupil.stream) : "No class",
        campus: pupil.campus?.trim() || "",
        expected: fee,
        paid: paidOf.get(`${pupil.id}:${club.id}`) ?? 0,
        order: classOrder(pupil.class_code) ?? 99,
        stream: (pupil.stream || "").trim(),
      }];
    });
    if (!learners.length) return [];
    learners.sort((a, b) => a.order - b.order || a.stream.localeCompare(b.stream) || a.name.localeCompare(b.name));
    return [{
      sort: club.sort_order ?? 0,
      title: club.title,
      category: club.category?.trim() || "Club",
      audience: sectionLabel(club.section),
      fee,
      learners: learners.map(({ name, number, classLabel: label, campus, expected, paid }) => ({
        name,
        number,
        classLabel: label,
        campus,
        expected,
        paid,
      })),
    }];
  });
  sheets.sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));

  return {
    termLabel: term.label,
    generatedOn: day(kampalaToday()),
    clubs: sheets.map(({ title, category, audience, fee, learners }) => ({ title, category, audience, fee, learners })),
  };
}
