import type { SupabaseClient } from "@supabase/supabase-js";
import { classLabel } from "@/lib/academics";
import type { ClubConsentRow, ClubMembership, ClubPupilRow } from "@/components/clubs/ClubsDesk";
import { isClubCampus, type CampusId } from "@/lib/campuses";
import type { ClubListFilters } from "@/lib/clubs";
import { fetchAll } from "@/lib/students";

export type ClubCatalogueRow = {
  id: string;
  title: string;
  category: string | null;
  fee_amount: number | null;
  section: string | null;
  description: string | null;
  meeting: string | null;
  campus: string | null;
  active: boolean | null;
  sort_order: number | null;
  guide_no: number | null;
};

type ConsentRow = {
  id: string;
  student_id: string;
  club_id: string;
  consented_at: string;
  withdrawn_at: string | null;
};

type PaymentRow = { student_id: string; club_id: string; receipt_no: string; amount: number };
type Pupil = {
  id: string;
  full_name: string;
  student_number: string;
  class_code: string | null;
  stream: string | null;
  campus: string | null;
  photo_path?: string | null;
};

export function listFilters(params: {
  q?: string;
  pay?: string;
  club?: string;
  class?: string;
  stream?: string;
  campus?: string;
  withdrawn?: string;
}): ClubListFilters {
  const pay = String(params.pay || "");
  return {
    q: String(params.q || "").trim(),
    pay: pay === "paid" || pay === "unpaid" || pay === "waiting" ? pay : "",
    club: String(params.club || "").trim(),
    classCode: String(params.class || "").trim(),
    stream: String(params.stream || "").trim(),
    campus: String(params.campus || "").trim(),
    withdrawn: String(params.withdrawn || "") === "1" ? "1" : "",
  };
}

export function audienceLabel(section: string | null) {
  if (section === "nursery") return "Nursery";
  if (section === "primary") return "Primary";
  return "All classes";
}

export const CATEGORY_ICONS: Record<string, string> = {
  "Games and Sports": "fa-futbol",
  "Art and Entertainment": "fa-palette",
  "Science and Technology": "fa-flask",
  "Travel and Adventure": "fa-compass",
  "Information and Language": "fa-language",
  Religion: "fa-book-open",
};

export const CATEGORY_TONES: Record<string, string> = {
  "Games and Sports": "sports",
  "Art and Entertainment": "arts",
  "Science and Technology": "science",
  "Travel and Adventure": "travel",
  "Information and Language": "language",
  Religion: "faith",
};

export function categoryTone(category: string) {
  return CATEGORY_TONES[category] || "other";
}

export async function loadGuideClubs(supabase: SupabaseClient) {
  const clubsQuery = await supabase
    .from("clubs")
    .select("id, title, category, fee_amount, section, description, meeting, campus, active, sort_order, guide_no")
    .not("guide_no", "is", null)
    .order("sort_order");
  if (clubsQuery.error && /meeting|campus/.test(clubsQuery.error.message)) {
    const fallback = await supabase
      .from("clubs")
      .select("id, title, category, fee_amount, section, description, active, sort_order, guide_no")
      .not("guide_no", "is", null)
      .order("sort_order");
    return {
      clubs: ((fallback.data || []) as ClubCatalogueRow[]).map((club) => ({
        ...club,
        meeting: null,
        campus: null,
      })),
      error: fallback.error?.message ?? null,
    };
  }
  return { clubs: (clubsQuery.data || []) as ClubCatalogueRow[], error: clubsQuery.error?.message ?? null };
}

export async function loadConsentRegister(
  supabase: SupabaseClient,
  termId: string | null,
  campuses: CampusId[],
  includeWithdrawn = true,
) {
  let consentsQuery = supabase
    .from("club_consents")
    .select("id, student_id, club_id, consented_at, withdrawn_at")
    .order("consented_at", { ascending: false });
  if (!includeWithdrawn) consentsQuery = consentsQuery.is("withdrawn_at", null);

  const [consentsRes, paymentsRes, waitingRes, clubsPack] = await Promise.all([
    consentsQuery,
    termId
      ? supabase.from("club_payments").select("student_id, club_id, receipt_no, amount").eq("term_id", termId).is("voided_at", null)
      : Promise.resolve({ data: [] as PaymentRow[], error: null }),
    termId
      ? supabase.from("club_collections").select("id, student_id, club_id").eq("term_id", termId).eq("status", "pending")
      : Promise.resolve({ data: [] as { id: string; student_id: string; club_id: string }[], error: null }),
    loadGuideClubs(supabase),
  ]);

  if (consentsRes.error) return { rows: [] as ClubConsentRow[], clubs: clubsPack.clubs, payments: [] as PaymentRow[], error: consentsRes.error.message };
  if (clubsPack.error) return { rows: [] as ClubConsentRow[], clubs: [], payments: [] as PaymentRow[], error: clubsPack.error };

  const consents = (consentsRes.data || []) as ConsentRow[];
  const payments = (paymentsRes.data || []) as PaymentRow[];
  const paid = new Set(payments.map((row) => `${row.student_id}:${row.club_id}`));
  const receiptOf = new Map(payments.map((row) => [`${row.student_id}:${row.club_id}`, row.receipt_no]));
  const waitingRows = (waitingRes.data || []) as { id: string; student_id: string; club_id: string }[];
  let waitingItems: { collection_id: string; club_id: string }[] = [];
  if (waitingRows.length) {
    const itemsQuery = await supabase.from("club_collection_items").select("collection_id, club_id").in(
      "collection_id",
      waitingRows.map((row) => row.id),
    );
    if (!itemsQuery.error) waitingItems = (itemsQuery.data || []) as { collection_id: string; club_id: string }[];
  }
  const waiting = new Set(waitingRows.map((row) => `${row.student_id}:${row.club_id}`));
  const studentByCollection = new Map(waitingRows.map((row) => [row.id, row.student_id]));
  for (const item of waitingItems) {
    const studentId = studentByCollection.get(item.collection_id);
    if (studentId) waiting.add(`${studentId}:${item.club_id}`);
  }

  const studentIds = [...new Set(consents.map((row) => row.student_id))];
  let pupilRows: Pupil[] = [];
  if (studentIds.length) {
    const withPhoto = await supabase
      .from("students")
      .select("id, full_name, student_number, class_code, stream, campus, photo_path")
      .in("id", studentIds);
    if (withPhoto.error && /photo_path/.test(withPhoto.error.message)) {
      const plain = await supabase.from("students").select("id, full_name, student_number, class_code, stream, campus").in("id", studentIds);
      pupilRows = (plain.data || []) as Pupil[];
    } else {
      pupilRows = (withPhoto.data || []) as Pupil[];
    }
  }

  const campusSet = new Set(campuses);
  const pupils = new Map(
    pupilRows
      .filter((pupil) => {
        const site = String(pupil.campus || "").trim();
        if (site && !isClubCampus(site)) return false;
        if (!campusSet.size) return true;
        return !site || campusSet.has(site as CampusId);
      })
      .map((pupil) => [pupil.id, pupil]),
  );
  const clubById = new Map(clubsPack.clubs.map((club) => [club.id, club]));

  const rows = consents
    .map((consent) => {
      const pupil = pupils.get(consent.student_id);
      const club = clubById.get(consent.club_id);
      if (!pupil || !club) return null;
      const key = `${consent.student_id}:${consent.club_id}`;
      const status: ClubConsentRow["status"] = consent.withdrawn_at
        ? "withdrawn"
        : paid.has(key)
          ? "paid"
          : waiting.has(key)
            ? "waiting"
            : "unpaid";
      return {
        id: consent.id,
        studentId: pupil.id,
        studentName: pupil.full_name,
        studentNumber: pupil.student_number,
        classCode: pupil.class_code || "",
        stream: pupil.stream?.trim() || "",
        classLabel: pupil.class_code ? classLabel(pupil.class_code, pupil.stream) : "No class",
        campus: pupil.campus,
        photoPath: pupil.photo_path || null,
        clubId: club.id,
        clubTitle: club.title,
        fee: Number(club.fee_amount) || 0,
        status,
        receiptNo: receiptOf.get(key) || null,
        consentedAt: consent.consented_at,
        withdrawnAt: consent.withdrawn_at,
      } satisfies ClubConsentRow;
    })
    .filter((row): row is ClubConsentRow => Boolean(row));

  return { rows, clubs: clubsPack.clubs, payments, error: null as string | null };
}

/** Full-school pupil roll with open club memberships and term payment status. */
export async function loadPupilRegister(
  supabase: SupabaseClient,
  termId: string | null,
  campuses: CampusId[],
) {
  const campusSet = new Set(campuses);

  const [pupilsRes, consentsRes, paymentsRes, waitingRes, clubsPack] = await Promise.all([
    fetchAll<Pupil>(async (from, to) => {
      const withPhoto = await supabase
        .from("students")
        .select("id, full_name, student_number, class_code, stream, campus, photo_path")
        .eq("status", "active")
        .order("full_name")
        .range(from, to);
      if (withPhoto.error && /photo_path/.test(withPhoto.error.message)) {
        return supabase
          .from("students")
          .select("id, full_name, student_number, class_code, stream, campus")
          .eq("status", "active")
          .order("full_name")
          .range(from, to);
      }
      return withPhoto;
    }, 5000).then(
      (rows) => ({ rows, error: null as string | null }),
      (err: Error) => ({ rows: [] as Pupil[], error: err.message }),
    ),
    fetchAll<ConsentRow>(async (from, to) =>
      supabase
        .from("club_consents")
        .select("id, student_id, club_id, consented_at, withdrawn_at")
        .is("withdrawn_at", null)
        .order("consented_at", { ascending: false })
        .range(from, to),
    5000).then(
      (rows) => ({ rows, error: null as string | null }),
      (err: Error) => ({ rows: [] as ConsentRow[], error: err.message }),
    ),
    termId
      ? fetchAll<PaymentRow>(async (from, to) =>
          supabase
            .from("club_payments")
            .select("student_id, club_id, receipt_no, amount")
            .eq("term_id", termId)
            .is("voided_at", null)
            .range(from, to),
        5000).then(
          (rows) => ({ rows, error: null as string | null }),
          (err: Error) => ({ rows: [] as PaymentRow[], error: err.message }),
        )
      : Promise.resolve({ rows: [] as PaymentRow[], error: null as string | null }),
    termId
      ? supabase
          .from("club_collections")
          .select("id, student_id, club_id")
          .eq("term_id", termId)
          .in("status", ["pending", "initiated"])
      : Promise.resolve({ data: [] as { id: string; student_id: string; club_id: string }[], error: null }),
    loadGuideClubs(supabase),
  ]);

  if (pupilsRes.error) return { rows: [] as ClubPupilRow[], clubs: clubsPack.clubs, error: pupilsRes.error };
  if (consentsRes.error) return { rows: [] as ClubPupilRow[], clubs: clubsPack.clubs, error: consentsRes.error };
  if (paymentsRes.error) return { rows: [] as ClubPupilRow[], clubs: clubsPack.clubs, error: paymentsRes.error };
  if (waitingRes.error) return { rows: [] as ClubPupilRow[], clubs: clubsPack.clubs, error: waitingRes.error.message };
  if (clubsPack.error) return { rows: [] as ClubPupilRow[], clubs: [], error: clubsPack.error };

  const payments = paymentsRes.rows;
  const paid = new Set(payments.map((row) => `${row.student_id}:${row.club_id}`));
  const receiptOf = new Map(payments.map((row) => [`${row.student_id}:${row.club_id}`, row.receipt_no]));
  const waitingRows = (waitingRes.data || []) as { id: string; student_id: string; club_id: string }[];
  let waitingItems: { collection_id: string; club_id: string }[] = [];
  if (waitingRows.length) {
    const itemsQuery = await supabase.from("club_collection_items").select("collection_id, club_id").in(
      "collection_id",
      waitingRows.map((row) => row.id),
    );
    if (!itemsQuery.error) waitingItems = (itemsQuery.data || []) as { collection_id: string; club_id: string }[];
  }
  const waiting = new Set(waitingRows.map((row) => `${row.student_id}:${row.club_id}`));
  const studentByCollection = new Map(waitingRows.map((row) => [row.id, row.student_id]));
  for (const item of waitingItems) {
    const studentId = studentByCollection.get(item.collection_id);
    if (studentId) waiting.add(`${studentId}:${item.club_id}`);
  }

  const clubById = new Map(clubsPack.clubs.map((club) => [club.id, club]));
  const membershipsByStudent = new Map<string, ClubMembership[]>();
  for (const consent of consentsRes.rows) {
    const club = clubById.get(consent.club_id);
    if (!club) continue;
    const key = `${consent.student_id}:${consent.club_id}`;
    const status: ClubMembership["status"] = paid.has(key) ? "paid" : waiting.has(key) ? "waiting" : "unpaid";
    const entry: ClubMembership = {
      consentId: consent.id,
      clubId: club.id,
      title: club.title,
      fee: Number(club.fee_amount) || 0,
      status,
      receiptNo: receiptOf.get(key) || null,
    };
    const list = membershipsByStudent.get(consent.student_id);
    if (list) list.push(entry);
    else membershipsByStudent.set(consent.student_id, [entry]);
  }

  const rows: ClubPupilRow[] = pupilsRes.rows
    .filter((pupil) => {
      const site = String(pupil.campus || "").trim();
      if (site && !isClubCampus(site)) return false;
      if (!campusSet.size) return true;
      return !site || campusSet.has(site as CampusId);
    })
    .map((pupil) => {
      const clubs = (membershipsByStudent.get(pupil.id) || []).sort((a, b) => a.title.localeCompare(b.title));
      return {
        studentId: pupil.id,
        studentName: pupil.full_name,
        studentNumber: pupil.student_number,
        classCode: pupil.class_code || "",
        stream: pupil.stream?.trim() || "",
        classLabel: pupil.class_code ? classLabel(pupil.class_code, pupil.stream) : "No class",
        campus: pupil.campus,
        photoPath: pupil.photo_path || null,
        clubs,
      } satisfies ClubPupilRow;
    });

  return { rows, clubs: clubsPack.clubs, error: null as string | null };
}
