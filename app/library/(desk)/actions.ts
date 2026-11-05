"use server";

import { isCampusId } from "@/lib/campuses";
import {
  addDays,
  assertBorrower,
  loadSettings,
  openLoanCount,
  persistActiveCampus,
  persistActiveLibrary,
  refreshLibrary,
  schemaHint,
  todayKampala,
} from "@/lib/library";
import { requireLibrary } from "@/lib/library-access";
import { LIBRARY_BASE, isLibraryId, type LibraryId } from "@/lib/library-nav";
import { logLibrary } from "@/lib/system-logs";

type Result = { error?: string; ok?: string; href?: string };

function text(formData: FormData, key: string, max = 240) {
  return String(formData.get(key) || "").trim().slice(0, max);
}

function num(formData: FormData, key: string) {
  const value = Number(formData.get(key));
  return Number.isFinite(value) ? value : NaN;
}

export async function setActiveLibrary(id: string): Promise<Result> {
  if (!isLibraryId(id)) return { error: "Unknown library." };
  const auth = await requireLibrary();
  if ("error" in auth) return { error: auth.error };
  if (!auth.libraries.includes(id)) return { error: "You cannot open that library." };
  await persistActiveLibrary(id);
  refreshLibrary();
  return { ok: "Library switched." };
}

export async function setActiveCampus(campus: string): Promise<Result> {
  if (!isCampusId(campus)) return { error: "Unknown campus." };
  const auth = await requireLibrary();
  if ("error" in auth) return { error: auth.error };
  if (!auth.campuses.includes(campus)) return { error: "You cannot open that campus." };
  await persistActiveCampus(campus);
  refreshLibrary();
  return { ok: "Campus switched." };
}

function copyCount(formData: FormData, fallback = 1) {
  const raw = Number(String(formData.get("copies") || "").trim());
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(0, Math.min(50, Math.floor(raw)));
}

async function insertAvailableCopies(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  libraryId: string,
  titleId: string,
  count: number,
  campus: string,
) {
  if (count < 1) return null;
  const rows = Array.from({ length: count }, () => ({
    library_id: libraryId,
    title_id: titleId,
    campus,
    status: "available",
  }));
  const { error } = await supabase.from("library_items").insert(rows);
  return error as { message: string } | null;
}

export async function saveTitle(formData: FormData): Promise<Result> {
  const auth = await requireLibrary("books");
  if ("error" in auth) return { error: auth.error };
  const campus = auth.activeCampus;
  const id = text(formData, "id", 80);
  const title = text(formData, "title", 200);
  const authors = text(formData, "authors", 200);
  if (title.length < 2) return { error: "Enter a title." };
  if (authors.length < 1) return { error: "Enter the author." };
  const copies = copyCount(formData, id ? 0 : 1);
  const row = {
    title,
    authors,
    isbn: "",
    category: text(formData, "category", 80),
    audience: "",
    notes: text(formData, "notes", 1000),
    updated_at: new Date().toISOString(),
  };
  if (id) {
    const { error } = await auth.supabase.from("library_titles").update(row).eq("id", id);
    if (error) return { error: schemaHint(error.message) || error.message };
    if (copies > 0) {
      const copyError = await insertAvailableCopies(auth.supabase, auth.activeLibrary, id, copies, campus);
      if (copyError) return { error: schemaHint(copyError.message) || copyError.message };
    }
    await logLibrary(auth.supabase, auth.user.id, {
      kind: "edit",
      body: `Updated library title “${title}”.`,
      entityType: "library_title",
      entityId: id,
    });
    refreshLibrary(`${LIBRARY_BASE}/books`);
    return { ok: copies > 0 ? `Book updated · ${copies} cop${copies === 1 ? "y" : "ies"} added.` : "Book updated." };
  }

  const { data, error } = await auth.supabase.from("library_titles").insert(row).select("id").maybeSingle();
  if (error) return { error: schemaHint(error.message) || error.message };
  const titleId = String(data?.id || "");
  if (!titleId) return { error: "Book saved, but the id was missing." };
  if (copies > 0) {
    const copyError = await insertAvailableCopies(auth.supabase, auth.activeLibrary, titleId, copies, campus);
    if (copyError) return { error: schemaHint(copyError.message) || copyError.message };
  }
  await logLibrary(auth.supabase, auth.user.id, {
    kind: "create",
    body: `Added library title “${title}”.`,
    entityType: "library_title",
    entityId: titleId,
  });
  refreshLibrary(`${LIBRARY_BASE}/books`);
  return { ok: copies > 0 ? `Book added · ${copies} available.` : "Book added." };
}

export async function addCopies(formData: FormData): Promise<Result> {
  const auth = await requireLibrary("books");
  if ("error" in auth) return { error: auth.error };
  const titleId = text(formData, "title_id", 80);
  if (!titleId) return { error: "Choose a book." };
  const copies = copyCount(formData, 1);
  if (copies < 1) return { error: "Enter how many copies to add." };
  const { data: title } = await auth.supabase.from("library_titles").select("id").eq("id", titleId).maybeSingle();
  if (!title) return { error: "Book not found." };
  const copyError = await insertAvailableCopies(auth.supabase, auth.activeLibrary, titleId, copies, auth.activeCampus);
  if (copyError) return { error: schemaHint(copyError.message) || copyError.message };
  refreshLibrary(`${LIBRARY_BASE}/books`);
  return { ok: `Added ${copies} available cop${copies === 1 ? "y" : "ies"}.` };
}

export async function saveItem(formData: FormData): Promise<Result> {
  const auth = await requireLibrary("books");
  if ("error" in auth) return { error: auth.error };
  const libraryId = auth.activeLibrary;
  const campus = auth.activeCampus;
  const titleId = text(formData, "title_id", 80);
  if (!titleId) return { error: "Choose a book." };
  const id = text(formData, "id", 80);
  const status = text(formData, "status", 20) || "available";
  const allowed = ["available", "on_loan", "reserved", "missing", "withdrawn"];
  if (!allowed.includes(status)) return { error: "Invalid status." };
  if (status === "on_loan" && !id) return { error: "New copies start as available." };
  const row = {
    library_id: libraryId,
    title_id: titleId,
    campus,
    accession: text(formData, "accession", 60),
    barcode: text(formData, "barcode", 60),
    status: id ? status : "available",
    location_note: text(formData, "location_note", 120),
    updated_at: new Date().toISOString(),
  };
  const { error } = id
    ? await auth.supabase.from("library_items").update(row).eq("id", id).eq("library_id", libraryId).eq("campus", campus)
    : await auth.supabase.from("library_items").insert(row);
  if (error) return { error: schemaHint(error.message) || error.message };
  refreshLibrary(`${LIBRARY_BASE}/books`);
  return { ok: id ? "Copy updated." : "Copy added." };
}

export async function issueLoan(formData: FormData): Promise<Result> {
  const auth = await requireLibrary("loans");
  if ("error" in auth) return { error: auth.error };
  const libraryId = auth.activeLibrary;
  const campus = auth.activeCampus;
  const itemId = text(formData, "item_id", 80);
  const kind = text(formData, "borrower_kind", 20) as "pupil" | "teacher";
  const borrowerId = kind === "teacher" ? text(formData, "teacher_id", 80) : text(formData, "pupil_id", 80);
  if (!itemId || (kind !== "pupil" && kind !== "teacher") || !borrowerId) {
    return { error: "Choose an available book and a registered pupil or teacher." };
  }
  const borrower = await assertBorrower(auth.supabase, kind, borrowerId);
  if (borrower.error) return { error: borrower.error };

  const settings = await loadSettings(auth.supabase, libraryId);
  const open = await openLoanCount(auth.supabase, libraryId, kind, borrowerId, campus);
  const max = kind === "pupil" ? settings.max_loans_pupil : settings.max_loans_teacher;
  if (open >= max) return { error: `${borrower.name} already has ${open} open loans (max ${max}).` };

  const { data: item } = await auth.supabase
    .from("library_items")
    .select("id, status, library_id")
    .eq("id", itemId)
    .eq("library_id", libraryId)
    .eq("campus", campus)
    .maybeSingle();
  if (!item) return { error: "Copy not found in this library." };
  if (item.status !== "available" && item.status !== "reserved") {
    return { error: "That copy is not available to issue." };
  }

  const due = text(formData, "due_at", 12) || addDays(todayKampala(), settings.loan_days);
  const { data: loan, error } = await auth.supabase
    .from("library_loans")
    .insert({
      library_id: libraryId,
      campus,
      item_id: itemId,
      borrower_kind: kind,
      student_id: kind === "pupil" ? borrowerId : null,
      teacher_id: kind === "teacher" ? borrowerId : null,
      due_at: due,
      issued_by: auth.user.id,
      note: text(formData, "note", 400),
    })
    .select("id")
    .maybeSingle();
  if (error) return { error: schemaHint(error.message) || error.message };

  await auth.supabase.from("library_items").update({ status: "on_loan", updated_at: new Date().toISOString() }).eq("id", itemId);

  const reservationId = text(formData, "reservation_id", 80);
  if (reservationId) {
    await auth.supabase
      .from("library_reservations")
      .update({ status: "fulfilled", fulfilled_at: new Date().toISOString(), item_id: itemId })
      .eq("id", reservationId)
      .eq("library_id", libraryId)
      .eq("campus", campus);
  }

  await logLibrary(auth.supabase, auth.user.id, {
    kind: "loan",
    body: `Issued a loan to ${borrower.name} (due ${due}).`,
    entityType: "library_loan",
    entityId: loan?.id ?? null,
    studentId: kind === "pupil" ? borrowerId : null,
  });
  refreshLibrary(LIBRARY_BASE, `${LIBRARY_BASE}/loans`, `${LIBRARY_BASE}/reservations`, `${LIBRARY_BASE}/books`);
  return { ok: `Issued to ${borrower.name}. Due ${due}.${loan?.id ? "" : ""}` };
}

export async function returnLoan(formData: FormData): Promise<Result> {
  const auth = await requireLibrary("loans");
  if ("error" in auth) return { error: auth.error };
  const libraryId = auth.activeLibrary;
  const campus = auth.activeCampus;
  const loanId = text(formData, "loan_id", 80);
  if (!loanId) return { error: "Choose a loan to return." };
  const { data: loan } = await auth.supabase
    .from("library_loans")
    .select("id, item_id, due_at, returned_at, library_id")
    .eq("id", loanId)
    .eq("library_id", libraryId)
    .eq("campus", campus)
    .maybeSingle();
  if (!loan) return { error: "Loan not found." };
  if (loan.returned_at) return { error: "Already returned." };

  const now = new Date().toISOString();
  const { error } = await auth.supabase.from("library_loans").update({ returned_at: now }).eq("id", loanId);
  if (error) return { error: error.message };
  await auth.supabase.from("library_items").update({ status: "available", updated_at: now }).eq("id", loan.item_id);

  const settings = await loadSettings(auth.supabase, libraryId);
  const today = todayKampala();
  if (loan.due_at < today && settings.fine_per_day > 0) {
    const due = new Date(`${loan.due_at}T00:00:00Z`);
    const end = new Date(`${today}T00:00:00Z`);
    const days = Math.max(1, Math.round((end.getTime() - due.getTime()) / 86400000));
    const amount = days * settings.fine_per_day;
    await auth.supabase.from("library_fines").insert({
      library_id: libraryId,
      campus,
      loan_id: loanId,
      amount,
      reason: `Overdue ${days} day${days === 1 ? "" : "s"}`,
    });
  }

  await logLibrary(auth.supabase, auth.user.id, {
    kind: "return",
    body: "Returned a library loan.",
    entityType: "library_loan",
    entityId: loanId,
  });
  refreshLibrary(LIBRARY_BASE, `${LIBRARY_BASE}/loans`, `${LIBRARY_BASE}/fines`, `${LIBRARY_BASE}/books`);
  return { ok: "Returned." };
}

export async function createReservation(formData: FormData): Promise<Result> {
  const auth = await requireLibrary("reservations");
  if ("error" in auth) return { error: auth.error };
  const libraryId = auth.activeLibrary;
  const campus = auth.activeCampus;
  const titleId = text(formData, "title_id", 80);
  const kind = text(formData, "borrower_kind", 20) as "pupil" | "teacher";
  const borrowerId = kind === "teacher" ? text(formData, "teacher_id", 80) : text(formData, "pupil_id", 80);
  if (!titleId || (kind !== "pupil" && kind !== "teacher") || !borrowerId) {
    return { error: "Choose a title and a registered pupil or teacher." };
  }
  const borrower = await assertBorrower(auth.supabase, kind, borrowerId);
  if (borrower.error) return { error: borrower.error };
  const { error } = await auth.supabase.from("library_reservations").insert({
    library_id: libraryId,
    campus,
    title_id: titleId,
    borrower_kind: kind,
    student_id: kind === "pupil" ? borrowerId : null,
    teacher_id: kind === "teacher" ? borrowerId : null,
    created_by: auth.user.id,
    note: text(formData, "note", 400),
  });
  if (error) return { error: schemaHint(error.message) || error.message };
  refreshLibrary(`${LIBRARY_BASE}/reservations`);
  return { ok: `Reserved for ${borrower.name}.` };
}

export async function updateReservation(formData: FormData): Promise<Result> {
  const auth = await requireLibrary("reservations");
  if ("error" in auth) return { error: auth.error };
  const id = text(formData, "id", 80);
  const intent = text(formData, "intent", 20);
  if (!id || !["ready", "cancel"].includes(intent)) return { error: "Nothing to update." };
  const patch =
    intent === "ready"
      ? { status: "ready", ready_at: new Date().toISOString() }
      : { status: "cancelled", cancelled_at: new Date().toISOString() };
  const { error } = await auth.supabase
    .from("library_reservations")
    .update(patch)
    .eq("id", id)
    .eq("library_id", auth.activeLibrary)
    .eq("campus", auth.activeCampus)
    .in("status", ["queued", "ready"]);
  if (error) return { error: error.message };
  refreshLibrary(`${LIBRARY_BASE}/reservations`);
  return { ok: intent === "ready" ? "Marked ready." : "Reservation cancelled." };
}

export async function settleFine(formData: FormData): Promise<Result> {
  const auth = await requireLibrary("fines");
  if ("error" in auth) return { error: auth.error };
  const id = text(formData, "id", 80);
  const intent = text(formData, "intent", 20);
  if (!id || !["pay", "waive"].includes(intent)) return { error: "Nothing to settle." };
  const patch =
    intent === "pay"
      ? { paid_at: new Date().toISOString(), note: text(formData, "note", 400) }
      : { waived_at: new Date().toISOString(), waived_by: auth.user.id, note: text(formData, "note", 400) };
  const { error } = await auth.supabase
    .from("library_fines")
    .update(patch)
    .eq("id", id)
    .eq("library_id", auth.activeLibrary)
    .eq("campus", auth.activeCampus)
    .is("paid_at", null)
    .is("waived_at", null);
  if (error) return { error: error.message };
  await logLibrary(auth.supabase, auth.user.id, {
    kind: intent === "pay" ? "payment" : "waive",
    body: intent === "pay" ? "Settled a library fine." : "Waived a library fine.",
    entityType: "library_fine",
    entityId: id,
    severity: intent === "waive" ? "sensitive" : "info",
  });
  refreshLibrary(`${LIBRARY_BASE}/fines`);
  return { ok: intent === "pay" ? "Marked paid." : "Waived." };
}

export async function saveSettings(formData: FormData): Promise<Result> {
  const auth = await requireLibrary("settings");
  if ("error" in auth) return { error: auth.error };
  const libraryId = auth.activeLibrary;
  const loan_days = Math.round(num(formData, "loan_days"));
  const max_loans_pupil = Math.round(num(formData, "max_loans_pupil"));
  const max_loans_teacher = Math.round(num(formData, "max_loans_teacher"));
  const fine_per_day = Math.round(num(formData, "fine_per_day"));
  const reservation_hold_days = Math.round(num(formData, "reservation_hold_days"));
  if (![loan_days, max_loans_pupil, max_loans_teacher, fine_per_day, reservation_hold_days].every((n) => Number.isFinite(n) && n >= 0)) {
    return { error: "Check the numbers." };
  }
  const { error } = await auth.supabase.from("library_settings").upsert({
    library_id: libraryId,
    loan_days: Math.min(90, Math.max(1, loan_days)),
    max_loans_pupil: Math.min(20, Math.max(1, max_loans_pupil)),
    max_loans_teacher: Math.min(30, Math.max(1, max_loans_teacher)),
    fine_per_day,
    reservation_hold_days: Math.min(30, Math.max(1, reservation_hold_days)),
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: schemaHint(error.message) || error.message };
  refreshLibrary(`${LIBRARY_BASE}/settings`);
  return { ok: "Settings saved." };
}

export async function startStockCount(formData: FormData): Promise<Result> {
  const auth = await requireLibrary("books");
  if ("error" in auth) return { error: auth.error };
  const { data, error } = await auth.supabase
    .from("library_stock_counts")
    .insert({
      library_id: auth.activeLibrary,
      campus: auth.activeCampus,
      counted_by: auth.user.id,
      notes: text(formData, "notes", 400),
    })
    .select("id")
    .maybeSingle();
  if (error) return { error: schemaHint(error.message) || error.message };
  refreshLibrary(`${LIBRARY_BASE}/books`);
  return {
    ok: "Count started.",
    ...(data?.id ? { href: `${LIBRARY_BASE}/books?view=stock&count=${data.id}` } : {}),
  };
}

export async function saveStockLine(formData: FormData): Promise<Result> {
  const auth = await requireLibrary("books");
  if ("error" in auth) return { error: auth.error };
  const campus = auth.activeCampus;
  const countId = text(formData, "count_id", 80);
  const itemId = text(formData, "item_id", 80);
  const observed = text(formData, "observed_status", 20);
  if (!countId || !itemId || !observed) return { error: "Missing stock line." };
  const { data: item } = await auth.supabase
    .from("library_items")
    .select("id, status, library_id")
    .eq("id", itemId)
    .eq("library_id", auth.activeLibrary)
    .eq("campus", campus)
    .maybeSingle();
  if (!item) return { error: "Copy not found." };
  const { data: count } = await auth.supabase
    .from("library_stock_counts")
    .select("id, closed_at")
    .eq("id", countId)
    .eq("library_id", auth.activeLibrary)
    .eq("campus", campus)
    .maybeSingle();
  if (!count || count.closed_at) return { error: "This count is closed." };
  const { error } = await auth.supabase.from("library_stock_lines").upsert({
    count_id: countId,
    item_id: itemId,
    expected_status: item.status,
    observed_status: observed,
  });
  if (error) return { error: error.message };
  if (observed !== item.status && ["available", "missing", "withdrawn", "reserved", "on_loan"].includes(observed)) {
    await auth.supabase.from("library_items").update({ status: observed, updated_at: new Date().toISOString() }).eq("id", itemId);
  }
  refreshLibrary(`${LIBRARY_BASE}/books`);
  return { ok: "Saved." };
}

export async function closeStockCount(formData: FormData): Promise<Result> {
  const auth = await requireLibrary("books");
  if ("error" in auth) return { error: auth.error };
  const countId = text(formData, "count_id", 80);
  if (!countId) return { error: "Missing count." };
  const { error } = await auth.supabase
    .from("library_stock_counts")
    .update({ closed_at: new Date().toISOString(), notes: text(formData, "notes", 400) })
    .eq("id", countId)
    .eq("library_id", auth.activeLibrary)
    .eq("campus", auth.activeCampus)
    .is("closed_at", null);
  if (error) return { error: error.message };
  refreshLibrary(`${LIBRARY_BASE}/books`);
  return { ok: "Count closed." };
}

/** Keep TypeScript happy for unused LibraryId import in some editors. */
export type _Lib = LibraryId;
