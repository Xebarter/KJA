import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { LIBRARY_BASE, LIBRARY_LABELS, type LibraryId } from "@/lib/library-nav";
import { cookies } from "next/headers";
import { LIBRARY_COOKIE } from "@/lib/library-access";

export type LibrarySettings = {
  library_id: LibraryId;
  loan_days: number;
  max_loans_pupil: number;
  max_loans_teacher: number;
  fine_per_day: number;
  reservation_hold_days: number;
};

export type LibraryTitle = {
  id: string;
  title: string;
  authors: string;
  isbn: string;
  category: string;
  audience: string;
  notes: string;
};

export type ItemStatus = "available" | "on_loan" | "reserved" | "missing" | "withdrawn";

/** Live-search hit for issuing loans / reservations. */
export type LibraryBorrowerHit = {
  id: string;
  kind: "pupil" | "teacher";
  name: string;
  meta: string;
  photo_path: string | null;
};

/** Live-search hit for book / reservation title pickers. */
export type LibraryTitleHit = {
  id: string;
  title: string;
  meta: string;
};

/** Live-search hit for issuing a loan — one row per book. */
export type LibraryCopyHit = {
  id: string;
  title: string;
  meta: string;
  status: "available" | "unavailable";
  available: number;
};

export function libraryLabel(id: LibraryId) {
  return LIBRARY_LABELS[id];
}

export function refreshLibrary(...paths: string[]) {
  revalidatePath(LIBRARY_BASE, "layout");
  for (const path of paths) revalidatePath(path);
}

export async function persistActiveLibrary(id: LibraryId) {
  const jar = await cookies();
  jar.set(LIBRARY_COOKIE, id, {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 180,
  });
}

export async function loadSettings(supabase: SupabaseClient, libraryId: LibraryId): Promise<LibrarySettings> {
  const { data } = await supabase.from("library_settings").select("*").eq("library_id", libraryId).maybeSingle();
  return {
    library_id: libraryId,
    loan_days: Number(data?.loan_days ?? 14),
    max_loans_pupil: Number(data?.max_loans_pupil ?? 3),
    max_loans_teacher: Number(data?.max_loans_teacher ?? 5),
    fine_per_day: Number(data?.fine_per_day ?? 500),
    reservation_hold_days: Number(data?.reservation_hold_days ?? 3),
  };
}

export function addDays(isoDate: string, days: number) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function todayKampala() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function money(amount: number) {
  return new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", maximumFractionDigits: 0 }).format(amount);
}

export async function assertBorrower(
  supabase: SupabaseClient,
  kind: "pupil" | "teacher",
  id: string,
): Promise<{ error?: string; name?: string }> {
  if (kind === "pupil") {
    const { data } = await supabase.from("students").select("id, full_name, status").eq("id", id).maybeSingle();
    if (!data) return { error: "Pupil not found." };
    if (data.status !== "active") return { error: "Only registered active pupils may borrow." };
    return { name: data.full_name as string };
  }
  const { data } = await supabase.from("teaching_staff").select("id, full_name, active").eq("id", id).maybeSingle();
  if (!data) return { error: "Teacher not found." };
  if (!data.active) return { error: "Only active teachers may borrow." };
  return { name: data.full_name as string };
}

export async function openLoanCount(
  supabase: SupabaseClient,
  libraryId: LibraryId,
  kind: "pupil" | "teacher",
  id: string,
) {
  let query = supabase.from("library_loans").select("id", { count: "exact", head: true }).eq("library_id", libraryId).is("returned_at", null);
  query = kind === "pupil" ? query.eq("student_id", id) : query.eq("teacher_id", id);
  const { count } = await query;
  return count ?? 0;
}

export function schemaHint(message: string | null | undefined) {
  if (!message) return null;
  if (/library_|relation .* does not exist|schema cache/i.test(message)) {
    return "Run supabase/0056_library.sql before using the library desk.";
  }
  return null;
}
