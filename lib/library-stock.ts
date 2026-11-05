import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampusId } from "@/lib/campuses";
import { todayKampala } from "@/lib/library";
import { LIBRARY_BASE, type LibraryId } from "@/lib/library-nav";

export type StockWhere = {
  label: string;
  detail: string;
  tone: "ok" | "warn" | "danger" | "slate";
  href?: string;
};

export type StockCopy = {
  id: string;
  status: string;
  accession: string;
  barcode: string;
  location_note: string;
  where: StockWhere;
};

export type StockBook = {
  id: string;
  title: string;
  authors: string;
  category: string;
  available: number;
  unavailable: number;
  total: number;
  onLoan: number;
  reserved: number;
  missing: number;
  copies: StockCopy[];
};

export type StockBoard = {
  books: StockBook[];
  totals: {
    books: number;
    copies: number;
    available: number;
    unavailable: number;
    onLoan: number;
    reserved: number;
    missing: number;
  };
};

function whereFor(
  status: string,
  opts: {
    location_note: string;
    loan?: { borrower: string; kind: string; due_at: string; overdue: boolean } | null;
    reservation?: { borrower: string; kind: string; status: string } | null;
  },
): StockWhere {
  if (status === "on_loan" && opts.loan) {
    return {
      label: opts.loan.overdue ? "Overdue with" : "On loan to",
      detail: `${opts.loan.borrower} · due ${opts.loan.due_at}`,
      tone: opts.loan.overdue ? "danger" : "warn",
      href: opts.loan.overdue ? `${LIBRARY_BASE}/loans?view=overdue` : `${LIBRARY_BASE}/loans`,
    };
  }
  if (status === "on_loan") {
    return { label: "On loan", detail: "Borrower details unavailable", tone: "warn", href: `${LIBRARY_BASE}/loans` };
  }
  if (status === "reserved" && opts.reservation) {
    return {
      label: opts.reservation.status === "ready" ? "Ready hold for" : "Reserved for",
      detail: opts.reservation.borrower,
      tone: "warn",
      href: `${LIBRARY_BASE}/reservations`,
    };
  }
  if (status === "reserved") {
    return { label: "Reserved", detail: "Waiting for pickup", tone: "warn", href: `${LIBRARY_BASE}/reservations` };
  }
  if (status === "missing") {
    return {
      label: "Missing",
      detail: opts.location_note || "Marked missing from the shelf",
      tone: "danger",
    };
  }
  if (status === "withdrawn") {
    return { label: "Withdrawn", detail: opts.location_note || "Removed from circulation", tone: "slate" };
  }
  return {
    label: status.replace(/_/g, " "),
    detail: opts.location_note || "Unavailable",
    tone: "slate",
  };
}

export async function loadStockBoard(
  supabase: SupabaseClient,
  libraryId: LibraryId,
  q = "",
  campus?: CampusId,
): Promise<StockBoard> {
  const today = todayKampala();
  const needle = q.trim();

  let itemsQuery = supabase
    .from("library_items")
    .select("id, title_id, accession, barcode, status, location_note, library_titles(id, title, authors, category)")
    .eq("library_id", libraryId)
    .neq("status", "withdrawn");
  let loansQuery = supabase
    .from("library_loans")
    .select(
      "id, item_id, due_at, borrower_kind, students(full_name, class_code, stream), teaching_staff(full_name)",
    )
    .eq("library_id", libraryId)
    .is("returned_at", null);
  let reservationsQuery = supabase
    .from("library_reservations")
    .select(
      "id, title_id, item_id, status, borrower_kind, students(full_name, class_code, stream), teaching_staff(full_name)",
    )
    .eq("library_id", libraryId)
    .in("status", ["queued", "ready"]);
  if (campus) {
    itemsQuery = itemsQuery.eq("campus", campus);
    loansQuery = loansQuery.eq("campus", campus);
    reservationsQuery = reservationsQuery.eq("campus", campus);
  }

  const [itemsPack, loansPack, reservationsPack] = await Promise.all([
    itemsQuery.order("accession").limit(800),
    loansQuery.limit(500),
    reservationsQuery.limit(300),
  ]);

  const loanByItem = new Map<
    string,
    { borrower: string; kind: string; due_at: string; overdue: boolean }
  >();
  for (const loan of loansPack.data || []) {
    const pupil = loan.students as { full_name?: string; class_code?: string | null; stream?: string | null } | null;
    const teacher = loan.teaching_staff as { full_name?: string } | null;
    const classBit = [pupil?.class_code, pupil?.stream].filter(Boolean).join(" ");
    const borrower =
      loan.borrower_kind === "teacher"
        ? String(teacher?.full_name || "Teacher")
        : [pupil?.full_name, classBit].filter(Boolean).join(" · ") || "Pupil";
    loanByItem.set(String(loan.item_id), {
      borrower,
      kind: String(loan.borrower_kind),
      due_at: String(loan.due_at),
      overdue: String(loan.due_at) < today,
    });
  }

  const reservationByItem = new Map<string, { borrower: string; kind: string; status: string }>();
  const reservationByTitle = new Map<string, { borrower: string; kind: string; status: string }>();
  for (const row of reservationsPack.data || []) {
    const pupil = row.students as { full_name?: string; class_code?: string | null; stream?: string | null } | null;
    const teacher = row.teaching_staff as { full_name?: string } | null;
    const classBit = [pupil?.class_code, pupil?.stream].filter(Boolean).join(" ");
    const borrower =
      row.borrower_kind === "teacher"
        ? String(teacher?.full_name || "Teacher")
        : [pupil?.full_name, classBit].filter(Boolean).join(" · ") || "Pupil";
    const info = { borrower, kind: String(row.borrower_kind), status: String(row.status) };
    if (row.item_id) reservationByItem.set(String(row.item_id), info);
    else reservationByTitle.set(String(row.title_id), info);
  }

  const booksMap = new Map<string, StockBook>();
  for (const item of itemsPack.data || []) {
    const title = item.library_titles as { id?: string; title?: string; authors?: string; category?: string } | null;
    const titleId = String(title?.id || item.title_id);
    const book =
      booksMap.get(titleId) ||
      ({
        id: titleId,
        title: String(title?.title || "Untitled"),
        authors: String(title?.authors || ""),
        category: String(title?.category || ""),
        available: 0,
        unavailable: 0,
        total: 0,
        onLoan: 0,
        reserved: 0,
        missing: 0,
        copies: [],
      } satisfies StockBook);

    const status = String(item.status || "available");
    const location_note = String(item.location_note || "");
    const copy: StockCopy = {
      id: String(item.id),
      status,
      accession: String(item.accession || ""),
      barcode: String(item.barcode || ""),
      location_note,
      where: whereFor(status, {
        location_note,
        loan: loanByItem.get(String(item.id)) || null,
        reservation: reservationByItem.get(String(item.id)) || reservationByTitle.get(titleId) || null,
      }),
    };

    book.total += 1;
    if (status === "available") book.available += 1;
    else {
      book.unavailable += 1;
      book.copies.push(copy);
      if (status === "on_loan") book.onLoan += 1;
      if (status === "reserved") book.reserved += 1;
      if (status === "missing") book.missing += 1;
    }
    // Keep available copies too for detail completeness when expanded? User asked for unavailable with where. Summaries per book. Available count in summary is enough. Optionally list available briefly.
    booksMap.set(titleId, book);
  }

  // Attach available copy stubs lightly for completeness when user expands
  for (const item of itemsPack.data || []) {
    if (item.status !== "available") continue;
    const title = item.library_titles as { id?: string } | null;
    const titleId = String(title?.id || item.title_id);
    const book = booksMap.get(titleId);
    if (!book) continue;
    book.copies.push({
      id: String(item.id),
      status: "available",
      accession: String(item.accession || ""),
      barcode: String(item.barcode || ""),
      location_note: String(item.location_note || ""),
      where: {
        label: "On shelf",
        detail: item.location_note ? String(item.location_note) : "Available in this library",
        tone: "ok",
      },
    });
  }

  for (const book of booksMap.values()) {
    book.copies.sort((a, b) => {
      const rank = (status: string) =>
        status === "missing" ? 0 : status === "on_loan" ? 1 : status === "reserved" ? 2 : status === "available" ? 4 : 3;
      const diff = rank(String(a.status)) - rank(String(b.status));
      if (diff) return diff;
      return (a.accession || a.barcode || a.id).localeCompare(b.accession || b.barcode || b.id);
    });
  }

  let books = [...booksMap.values()].sort((a, b) => {
    if (b.unavailable !== a.unavailable) return b.unavailable - a.unavailable;
    return a.title.localeCompare(b.title, "en", { sensitivity: "base" });
  });

  if (needle) {
    const lower = needle.toLowerCase();
    books = books.filter((book) => {
      const hay = `${book.title} ${book.authors} ${book.category}`.toLowerCase();
      if (hay.includes(lower)) return true;
      return book.copies.some((copy) =>
        `${copy.accession} ${copy.barcode} ${copy.where.detail}`.toLowerCase().includes(lower),
      );
    });
  }

  const totals = books.reduce(
    (acc, book) => {
      acc.books += 1;
      acc.copies += book.total;
      acc.available += book.available;
      acc.unavailable += book.unavailable;
      acc.onLoan += book.onLoan;
      acc.reserved += book.reserved;
      acc.missing += book.missing;
      return acc;
    },
    { books: 0, copies: 0, available: 0, unavailable: 0, onLoan: 0, reserved: 0, missing: 0 },
  );

  return { books, totals };
}
