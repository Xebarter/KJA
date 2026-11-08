import { loadTerms } from "@/lib/accounts";
import { classLabel } from "@/lib/academics";
import { enrichClubExpenses, loadClubExpenses } from "@/lib/club-accounts";
import { studentInFundsScope } from "@/lib/club-funds-scope";
import { requireClubs } from "@/lib/clubs-access";

function csvEscape(value: string | number | null | undefined) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export async function GET(request: Request) {
  const auth = await requireClubs("accounts");
  if ("error" in auth) return new Response(auth.error, { status: 401 });
  if (!auth.activeCampus) return new Response("Choose a campus first.", { status: 400 });
  const url = new URL(request.url);
  const { current } = await loadTerms(auth.supabase);
  const termId = url.searchParams.get("term") || current?.id || "";
  if (!termId) return new Response("Choose a term.", { status: 400 });
  const view = url.searchParams.get("view") === "expenses" ? "expenses" : "collections";
  const campusFilter = auth.activeCampus;

  if (view === "expenses") {
    const clubFilter = url.searchParams.get("club") || "";
    const { expenses, error, missing } = await loadClubExpenses(auth.supabase, {
      termId,
      clubId: clubFilter || null,
      limit: 5000,
      campuses: auth.campuses,
      campusFilter,
    });
    if (missing) return new Response("Apply supabase/0072_club_expenses.sql first.", { status: 503 });
    if (error) return new Response(error, { status: 500 });
    const rows = await enrichClubExpenses(auth.supabase, expenses);
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const categoryFilter = url.searchParams.get("category") || "";
    const methodFilter = url.searchParams.get("method") || "";
    const filtered = rows.filter((row) => {
      if (categoryFilter && row.category_id !== categoryFilter) return false;
      if (methodFilter && row.method !== methodFilter) return false;
      if (!q) return true;
      return `${row.ref_no} ${row.clubTitle} ${row.categoryName} ${row.payee} ${row.description} ${row.reference || ""}`
        .toLowerCase()
        .includes(q);
    });
    const header = ["Ref", "Spent on", "Club", "Category", "Payee", "Description", "Method", "Reference", "Amount", "Notes", "Recorded by"];
    const lines = [
      header.join(","),
      ...filtered.map((row) =>
        [
          row.ref_no,
          row.spent_on,
          row.clubTitle,
          row.categoryName,
          row.payee,
          row.description,
          row.method || "",
          row.reference || "",
          row.amount,
          row.notes || "",
          row.recordedByName || "",
        ]
          .map(csvEscape)
          .join(","),
      ),
    ];
    return new Response(`\uFEFF${lines.join("\n")}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="kja-club-expenses.csv"`,
      },
    });
  }

  const [{ data: payments, error }, { data: clubs }] = await Promise.all([
    auth.supabase
      .from("club_payments")
      .select("receipt_no, amount, method, source, paid_on, student_id, club_id, payer_name, reference, notes")
      .eq("term_id", termId)
      .is("voided_at", null)
      .order("paid_on", { ascending: false })
      .limit(5000),
    auth.supabase.from("clubs").select("id, title"),
  ]);
  if (error) return new Response(error.message, { status: 500 });

  const studentIds = [...new Set((payments || []).map((row) => row.student_id as string))];
  const { data: pupils } = studentIds.length
    ? await auth.supabase.from("students").select("id, full_name, student_number, class_code, stream, campus").in("id", studentIds)
    : { data: [] };
  const pupilMap = new Map((pupils || []).map((row) => [row.id as string, row]));
  const clubMap = new Map((clubs || []).map((row) => [row.id as string, row.title as string]));
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const clubFilter = url.searchParams.get("club") || "";
  const methodFilter = url.searchParams.get("method") || "";
  const sourceFilter = url.searchParams.get("source") || "";

  const rows = (payments || []).filter((row) => {
    const pupil = pupilMap.get(row.student_id as string);
    if (!pupil) return false;
    if (!studentInFundsScope((pupil.campus as string | null) ?? null, auth.campuses, campusFilter)) return false;
    if (clubFilter && row.club_id !== clubFilter) return false;
    if (methodFilter && row.method !== methodFilter) return false;
    if (sourceFilter && row.source !== sourceFilter) return false;
    if (!q) return true;
    return `${pupil.full_name} ${pupil.student_number} ${clubMap.get(row.club_id as string) || ""} ${row.receipt_no} ${row.payer_name || ""} ${row.reference || ""}`
      .toLowerCase()
      .includes(q);
  });

  const header = ["Receipt", "Paid on", "Pupil", "Number", "Class", "Campus", "Club", "Method", "Source", "Reference", "Amount", "Payer", "Notes"];
  const lines = [
    header.join(","),
    ...rows.map((row) => {
      const pupil = pupilMap.get(row.student_id as string)!;
      return [
        row.receipt_no,
        row.paid_on,
        pupil.full_name,
        pupil.student_number,
        pupil.class_code ? classLabel(pupil.class_code as string, pupil.stream as string | null) : "",
        pupil.campus || "",
        clubMap.get(row.club_id as string) || "",
        row.method,
        row.source,
        row.reference || "",
        row.amount,
        row.payer_name || "",
        row.notes || "",
      ]
        .map(csvEscape)
        .join(",");
    }),
  ];
  return new Response(`\uFEFF${lines.join("\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kja-club-collections.csv"`,
    },
  });
}
