import type { SupabaseClient } from "@supabase/supabase-js";
import { todayKampala } from "@/lib/library";
import type { LibraryId } from "@/lib/library-nav";

export type ReportRange = "30" | "90" | "365" | "all";

export type RankRow = {
  id: string;
  label: string;
  sub?: string;
  value: number;
  photo?: string | null;
  href?: string;
};

export type SeriesPoint = { key: string; label: string; value: number; secondary?: number };

export type Slice = { key: string; label: string; value: number; tone: string };

export type PersonLoan = {
  id: string;
  title: string;
  authors: string;
  issued_at: string;
  due_at: string;
  returned_at: string | null;
  overdue: boolean;
};

export type PersonReport = {
  kind: "pupil" | "teacher";
  id: string;
  name: string;
  meta: string;
  photo_path: string | null;
  loans: PersonLoan[];
  open: number;
  overdue: number;
  total: number;
};

export type LibraryReport = {
  libraryId: LibraryId;
  range: ReportRange;
  since: string | null;
  today: string;
  kpis: {
    openLoans: number;
    overdue: number;
    available: number;
    onLoan: number;
    missing: number;
    withdrawn: number;
    titles: number;
    unpaidFines: number;
    unpaidFineCount: number;
    readyHolds: number;
    loansInRange: number;
    returnsInRange: number;
  };
  stockSlices: Slice[];
  borrowerSlices: Slice[];
  activity: SeriesPoint[];
  topBooks: RankRow[];
  topStudents: RankRow[];
  topTeachers: RankRow[];
  topClasses: RankRow[];
  topCategories: RankRow[];
  missingBooks: { id: string; title: string; authors: string; accession: string; barcode: string }[];
  overdueLoans: {
    id: string;
    title: string;
    borrower: string;
    kind: string;
    due_at: string;
    days: number;
  }[];
  person: PersonReport | null;
};

function rangeStart(range: ReportRange, today: string): string | null {
  if (range === "all") return null;
  const days = range === "30" ? 30 : range === "90" ? 90 : 365;
  const [y, m, d] = today.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  date.setUTCDate(date.getUTCDate() - (days - 1));
  return date.toISOString().slice(0, 10);
}

function weekKey(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function weekLabel(key: string) {
  const date = new Date(`${key}T00:00:00Z`);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function daysLate(due: string, today: string) {
  const a = Date.parse(`${due}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

function bump(map: Map<string, { label: string; sub?: string; value: number; photo?: string | null }>, id: string, label: string, sub?: string, photo?: string | null) {
  const row = map.get(id);
  if (row) {
    row.value += 1;
    return;
  }
  map.set(id, { label, sub, value: 1, photo });
}

function ranked(map: Map<string, { label: string; sub?: string; value: number; photo?: string | null }>, limit = 8, hrefFor?: (id: string) => string): RankRow[] {
  return [...map.entries()]
    .map(([id, row]) => ({
      id,
      label: row.label,
      sub: row.sub,
      value: row.value,
      photo: row.photo,
      href: hrefFor?.(id),
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export function parseReportRange(raw: string | undefined): ReportRange {
  if (raw === "30" || raw === "365" || raw === "all") return raw;
  return "90";
}

export function parsePersonParam(raw: string | undefined): { kind: "pupil" | "teacher"; id: string } | null {
  const value = String(raw || "").trim();
  const match = /^(pupil|teacher):([0-9a-f-]{36})$/i.exec(value);
  if (!match) return null;
  return { kind: match[1].toLowerCase() as "pupil" | "teacher", id: match[2] };
}

export async function loadLibraryReport(
  supabase: SupabaseClient,
  libraryId: LibraryId,
  options: { range?: ReportRange; person?: string | null } = {},
): Promise<LibraryReport> {
  const range = options.range || "90";
  const today = todayKampala();
  const since = rangeStart(range, today);
  const personRef = parsePersonParam(options.person || undefined);

  const loanSelect =
    "id, issued_at, due_at, returned_at, borrower_kind, student_id, teacher_id, students(id, full_name, class_code, stream, photo_path, student_number), teaching_staff(id, full_name, photo_path), library_items(id, status, accession, barcode, title_id, library_titles(id, title, authors, category))";

  let loansQuery = supabase
    .from("library_loans")
    .select(loanSelect)
    .eq("library_id", libraryId)
    .order("issued_at", { ascending: false })
    .limit(4000);
  if (since) loansQuery = loansQuery.gte("issued_at", `${since}T00:00:00+03:00`);

  const [loansPack, openPack, overduePack, overdueListPack, itemsPack, unpaidPack, readyPack, titlesPack, personLoansPack, personRowPack] =
    await Promise.all([
      loansQuery,
      supabase.from("library_loans").select("id", { count: "exact", head: true }).eq("library_id", libraryId).is("returned_at", null),
      supabase
        .from("library_loans")
        .select("id", { count: "exact", head: true })
        .eq("library_id", libraryId)
        .is("returned_at", null)
        .lt("due_at", today),
      supabase
        .from("library_loans")
        .select(
          "id, due_at, borrower_kind, students(full_name), teaching_staff(full_name), library_items(library_titles(title))",
        )
        .eq("library_id", libraryId)
        .is("returned_at", null)
        .lt("due_at", today)
        .order("due_at")
        .limit(20),
      supabase.from("library_items").select("id, status, accession, barcode, library_titles(title, authors)").eq("library_id", libraryId).limit(2000),
      supabase.from("library_fines").select("amount").eq("library_id", libraryId).is("paid_at", null).is("waived_at", null),
      supabase.from("library_reservations").select("id", { count: "exact", head: true }).eq("library_id", libraryId).eq("status", "ready"),
      supabase.from("library_titles").select("id", { count: "exact", head: true }),
      personRef
        ? supabase
            .from("library_loans")
            .select(loanSelect)
            .eq("library_id", libraryId)
            .eq(personRef.kind === "pupil" ? "student_id" : "teacher_id", personRef.id)
            .order("issued_at", { ascending: false })
            .limit(80)
        : Promise.resolve({ data: [] as never[], error: null }),
      personRef
        ? personRef.kind === "pupil"
          ? supabase.from("students").select("id, full_name, class_code, stream, photo_path, student_number").eq("id", personRef.id).maybeSingle()
          : supabase.from("teaching_staff").select("id, full_name, photo_path, email").eq("id", personRef.id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

  const loans = loansPack.data || [];
  const items = itemsPack.data || [];

  const statusCounts = { available: 0, on_loan: 0, reserved: 0, missing: 0, withdrawn: 0 };
  for (const item of items) {
    const status = String(item.status || "") as keyof typeof statusCounts;
    if (status in statusCounts) statusCounts[status] += 1;
  }

  const books = new Map<string, { label: string; sub?: string; value: number; photo?: string | null }>();
  const students = new Map<string, { label: string; sub?: string; value: number; photo?: string | null }>();
  const teachers = new Map<string, { label: string; sub?: string; value: number; photo?: string | null }>();
  const classes = new Map<string, { label: string; sub?: string; value: number; photo?: string | null }>();
  const categories = new Map<string, { label: string; sub?: string; value: number; photo?: string | null }>();
  const weeks = new Map<string, { issued: number; returned: number }>();
  let pupilLoans = 0;
  let teacherLoans = 0;
  let returnsInRange = 0;

  for (const row of loans) {
    const item = row.library_items as {
      title_id?: string;
      library_titles?: { id?: string; title?: string; authors?: string; category?: string } | null;
    } | null;
    const title = item?.library_titles;
    const titleId = String(title?.id || item?.title_id || "");
    if (titleId) bump(books, titleId, String(title?.title || "Untitled"), String(title?.authors || "").trim() || undefined);

    const category = String(title?.category || "").trim() || "Uncategorised";
    bump(categories, category.toLowerCase(), category);

    if (row.borrower_kind === "teacher") {
      teacherLoans += 1;
      const teacher = row.teaching_staff as { id?: string; full_name?: string; photo_path?: string | null } | null;
      const id = String(row.teacher_id || teacher?.id || "");
      if (id) bump(teachers, id, String(teacher?.full_name || "Teacher"), "Teacher", teacher?.photo_path);
    } else {
      pupilLoans += 1;
      const pupil = row.students as {
        id?: string;
        full_name?: string;
        class_code?: string | null;
        stream?: string | null;
        photo_path?: string | null;
        student_number?: string | null;
      } | null;
      const id = String(row.student_id || pupil?.id || "");
      const klass = [pupil?.class_code, pupil?.stream].filter(Boolean).join(" ") || "Unassigned";
      if (id) {
        bump(students, id, String(pupil?.full_name || "Pupil"), klass, pupil?.photo_path);
      }
      bump(classes, klass.toLowerCase(), klass);
    }

    const issuedKey = weekKey(String(row.issued_at));
    const issuedBucket = weeks.get(issuedKey) || { issued: 0, returned: 0 };
    issuedBucket.issued += 1;
    weeks.set(issuedKey, issuedBucket);

    if (row.returned_at) {
      returnsInRange += 1;
      const returnedKey = weekKey(String(row.returned_at));
      const returnedBucket = weeks.get(returnedKey) || { issued: 0, returned: 0 };
      returnedBucket.returned += 1;
      weeks.set(returnedKey, returnedBucket);
    }
  }

  const weekKeys = [...weeks.keys()].sort();
  const activity: SeriesPoint[] = weekKeys.slice(-12).map((key) => {
    const bucket = weeks.get(key) || { issued: 0, returned: 0 };
    return { key, label: weekLabel(key), value: bucket.issued, secondary: bucket.returned };
  });

  const unpaidFineCount = (unpaidPack.data || []).length;
  const unpaidFines = (unpaidPack.data || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const missingBooks = items
    .filter((item) => item.status === "missing")
    .map((item) => {
      const title = item.library_titles as { title?: string; authors?: string } | null;
      return {
        id: String(item.id),
        title: String(title?.title || "Untitled"),
        authors: String(title?.authors || ""),
        accession: String(item.accession || ""),
        barcode: String(item.barcode || ""),
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title))
    .slice(0, 40);

  const overdueLoans = (overdueListPack.data || [])
    .map((row) => {
      const item = row.library_items as { library_titles?: { title?: string } | null } | null;
      const pupil = row.students as { full_name?: string } | null;
      const teacher = row.teaching_staff as { full_name?: string } | null;
      return {
        id: String(row.id),
        title: String(item?.library_titles?.title || "Untitled"),
        borrower: String(pupil?.full_name || teacher?.full_name || "-"),
        kind: String(row.borrower_kind),
        due_at: String(row.due_at),
        days: daysLate(String(row.due_at), today),
      };
    })
    .sort((a, b) => b.days - a.days)
    .slice(0, 12);

  let person: PersonReport | null = null;
  if (personRef && personRowPack.data) {
    const row = personRowPack.data as Record<string, unknown>;
    const history = (personLoansPack.data || []).map((loan) => {
      const item = loan.library_items as { library_titles?: { title?: string; authors?: string } | null } | null;
      return {
        id: String(loan.id),
        title: String(item?.library_titles?.title || "Untitled"),
        authors: String(item?.library_titles?.authors || ""),
        issued_at: String(loan.issued_at),
        due_at: String(loan.due_at),
        returned_at: loan.returned_at ? String(loan.returned_at) : null,
        overdue: !loan.returned_at && String(loan.due_at) < today,
      };
    });
    person = {
      kind: personRef.kind,
      id: personRef.id,
      name: String(row.full_name || (personRef.kind === "pupil" ? "Pupil" : "Teacher")),
      meta:
        personRef.kind === "pupil"
          ? [[row.student_number, [row.class_code, row.stream].filter(Boolean).join(" ")].filter(Boolean).join(" · ")].filter(Boolean).join("") || "Pupil"
          : String(row.email || "Teacher"),
      photo_path: (row.photo_path as string | null) || null,
      loans: history,
      open: history.filter((loan) => !loan.returned_at).length,
      overdue: history.filter((loan) => loan.overdue).length,
      total: history.length,
    };
  }

  return {
    libraryId,
    range,
    since,
    today,
    kpis: {
      openLoans: openPack.count ?? 0,
      overdue: overduePack.count ?? 0,
      available: statusCounts.available,
      onLoan: statusCounts.on_loan,
      missing: statusCounts.missing,
      withdrawn: statusCounts.withdrawn,
      titles: titlesPack.count ?? 0,
      unpaidFines,
      unpaidFineCount,
      readyHolds: readyPack.count ?? 0,
      loansInRange: loans.length,
      returnsInRange,
    },
    stockSlices: [
      { key: "available", label: "Available", value: statusCounts.available, tone: "ok" },
      { key: "on_loan", label: "On loan", value: statusCounts.on_loan, tone: "warn" },
      { key: "reserved", label: "Reserved", value: statusCounts.reserved, tone: "slate" },
      { key: "missing", label: "Missing", value: statusCounts.missing, tone: "danger" },
      { key: "withdrawn", label: "Withdrawn", value: statusCounts.withdrawn, tone: "slate" },
    ].filter((slice) => slice.value > 0),
    borrowerSlices: [
      { key: "pupil", label: "Pupils", value: pupilLoans, tone: "navy" },
      { key: "teacher", label: "Teachers", value: teacherLoans, tone: "gold" },
    ].filter((slice) => slice.value > 0),
    activity,
    topBooks: ranked(books, 10),
    topStudents: ranked(students, 8, (id) => {
      const params = new URLSearchParams();
      if (range !== "90") params.set("range", range);
      params.set("tab", "readers");
      params.set("who", `pupil:${id}`);
      return `/library/reports?${params.toString()}`;
    }),
    topTeachers: ranked(teachers, 8, (id) => {
      const params = new URLSearchParams();
      if (range !== "90") params.set("range", range);
      params.set("tab", "readers");
      params.set("who", `teacher:${id}`);
      return `/library/reports?${params.toString()}`;
    }),
    topClasses: ranked(classes, 8),
    topCategories: ranked(categories, 8),
    missingBooks,
    overdueLoans,
    person,
  };
}
