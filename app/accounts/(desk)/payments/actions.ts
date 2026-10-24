"use server";

import { ACCOUNTS_BASE, logAccounts, refreshAccounts, requireAccounts } from "@/lib/accounts";
import { allocateFamilyPayment, type FamilyPayBucket, type FamilyPaySlice } from "@/lib/accounts-family-pay";
import { isPaymentMethod, kampalaToday, methodInfo, parseAmount, ugx } from "@/lib/accounts-format";
import { dateField, field, type ActionResult } from "@/lib/office-forms";
import type { SidebarHit } from "@/lib/sidebar-search";
import { className, displayPhone, isUuid, searchNeedle, searchWords, studentSearchFilter } from "@/lib/students";

const PAYMENTS = `${ACCOUNTS_BASE}/payments`;

export type PupilHit = {
  student_id: string;
  full_name: string;
  student_number: string;
  class_code: string | null;
  stream: string | null;
  campus: string | null;
  status: string;
  family_id: string | null;
  family_code: string | null;
  mailing_name: string | null;
  balance: number;
};

export type PaymentFamilyHit = {
  id: string;
  code: string;
  name: string;
  area: string | null;
  parents: string[];
  phones: string[];
  children: string[];
  balance: number;
};

export type FamilyPaymentChild = {
  student_id: string;
  full_name: string;
  student_number: string;
  class_code: string | null;
  stream: string | null;
  campus: string | null;
  status: string;
  balance: number;
  terms: PupilTerm[];
};

export type FamilyPaymentContext = {
  family: { id: string; code: string; name: string; area: string | null };
  children: FamilyPaymentChild[];
  buckets: FamilyPayBucket[];
  owing: number;
};

const DIRECTORY_COLUMNS = "id, full_name, student_number, class_code, stream, campus, status, family_id, family_code, mailing_name";
const HIT_COLUMNS = "student_id, full_name, student_number, class_code, stream, campus, status, family_id, family_code, mailing_name, balance";

/** Finds pupils by name (any word order), student number, family number or parent contact. */
export async function searchPupils(raw: string): Promise<{ error?: string; rows: PupilHit[] }> {
  const auth = await requireAccounts();
  if ("error" in auth) return { error: auth.error, rows: [] };
  const needle = searchNeedle(raw).slice(0, 60);
  const words = searchWords(raw);
  if (needle.length < 2 || !words.length) return { rows: [] };
  const filter = studentSearchFilter(needle);
  if (!filter) return { rows: [] };

  // Search the light directory view first — not the heavy student_balances aggregate.
  const { data, error } = await auth.supabase
    .from("student_directory")
    .select(DIRECTORY_COLUMNS)
    .or(filter)
    .order("status")
    .order("full_name")
    .limit(12);
  if (error) return { error: error.message, rows: [] };
  const found = (data || []) as {
    id: string;
    full_name: string;
    student_number: string;
    class_code: string | null;
    stream: string | null;
    campus: string | null;
    status: string;
    family_id: string | null;
    family_code: string | null;
    mailing_name: string | null;
  }[];
  if (!found.length) return { rows: [] };

  const ids = found.map((row) => row.id);
  const { data: termRows } = await auth.supabase
    .from("student_term_balances")
    .select("student_id, balance")
    .in("student_id", ids);
  const balanceBy = new Map<string, number>();
  for (const row of termRows || []) {
    balanceBy.set(row.student_id as string, (balanceBy.get(row.student_id as string) ?? 0) + Number(row.balance));
  }

  const rows: PupilHit[] = found.map((row) => ({
    student_id: row.id,
    full_name: row.full_name,
    student_number: row.student_number,
    class_code: row.class_code,
    stream: row.stream,
    campus: row.campus,
    status: row.status,
    family_id: row.family_id,
    family_code: row.family_code,
    mailing_name: row.mailing_name,
    balance: balanceBy.get(row.id) ?? 0,
  }));
  rows.sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || a.full_name.localeCompare(b.full_name));
  return { rows };
}

/** The same pupil search, shaped for the accounts sidebar. */
export async function searchFeeAccounts(raw: string): Promise<{ error?: string; hits: SidebarHit[] }> {
  const result = await searchPupils(raw);
  return {
    error: result.error,
    hits: result.rows.slice(0, 8).map((row) => {
      const owing = row.balance > 0 ? ` · Owes ${ugx(row.balance)}` : row.balance < 0 ? " · In credit" : "";
      const status = row.status === "active" ? "" : ` · ${row.status}`;
      return {
        id: row.student_id,
        href: `${ACCOUNTS_BASE}/students/${row.student_id}`,
        title: row.full_name,
        meta: `${row.student_number} · ${className(row.class_code)}${row.stream ? ` ${row.stream}` : ""}${owing}${status}`,
        icon: "fa-user",
      };
    }),
  };
}

export async function loadPupilHit(studentId: string): Promise<PupilHit | null> {
  const auth = await requireAccounts("payments");
  if ("error" in auth || !isUuid(studentId)) return null;
  const { data } = await auth.supabase.from("student_balances").select(HIT_COLUMNS).eq("student_id", studentId).maybeSingle();
  return data ? { ...(data as PupilHit), balance: Number(data.balance) } : null;
}

export type PupilTerm = { term_id: string; invoiced: number; paid: number; balance: number };

/** What the pupil owes in each term, so the form can suggest an amount. */
export async function pupilTerms(studentId: string): Promise<PupilTerm[]> {
  const auth = await requireAccounts("payments");
  if ("error" in auth || !isUuid(studentId)) return [];
  const { data } = await auth.supabase.from("student_term_balances").select("term_id, invoiced, paid, balance").eq("student_id", studentId);
  return (data || []).map((row) => ({ term_id: row.term_id, invoiced: Number(row.invoiced), paid: Number(row.paid), balance: Number(row.balance) }));
}

/** Finds families for the family-payment picker (accounts staff, not admissions). */
export async function searchPaymentFamilies(raw: string): Promise<{ error?: string; items: PaymentFamilyHit[] }> {
  const auth = await requireAccounts("payments");
  if ("error" in auth) return { error: auth.error, items: [] };
  const { supabase } = auth;
  const needle = searchNeedle(String(raw || "")).slice(0, 60);
  if (needle.length < 2) return { items: [] };
  const like = `%${needle}%`;
  const digits = needle.replace(/\D/g, "");
  const phoneLike = digits.length >= 6 ? `%${digits.slice(-9)}%` : null;
  const filter = studentSearchFilter(needle);

  // Light discovery only — avoid student_balances / family_balances views.
  const [families, guardians, directory] = await Promise.all([
    supabase.from("families").select("id").or(`family_code.ilike.${like},mailing_name.ilike.${like}`).limit(16),
    supabase.from("guardians").select("family_id").or([`full_name.ilike.${like}`, `email.ilike.${like}`, ...(phoneLike ? [`phone.ilike.${phoneLike}`] : [])].join(",")).limit(16),
    filter
      ? supabase.from("student_directory").select("family_id").or(filter).not("family_id", "is", null).limit(16)
      : Promise.resolve({ data: [] as { family_id: string | null }[] }),
  ]);
  const ids = [...new Set([
    ...(families.data || []).map((row) => row.id as string),
    ...(guardians.data || []).map((row) => row.family_id as string),
    ...(directory.data || []).map((row) => row.family_id as string),
  ])].filter(Boolean).slice(0, 10);
  if (!ids.length) return { items: [] };

  const [{ data: rows }, { data: parentRows }, { data: kids }] = await Promise.all([
    supabase.from("families").select("id, family_code, mailing_name, home_area").in("id", ids),
    supabase.from("guardians").select("family_id, full_name, phone, is_primary").in("family_id", ids).order("is_primary", { ascending: false }),
    supabase.from("students").select("id, family_id, full_name, class_code, status").in("family_id", ids).eq("status", "active").order("date_of_birth"),
  ]);

  const childIds = (kids || []).map((row) => row.id as string);
  const balanceByFamily = new Map<string, number>();
  if (childIds.length) {
    const { data: termRows } = await supabase.from("student_term_balances").select("student_id, balance").in("student_id", childIds);
    const balanceByStudent = new Map<string, number>();
    for (const row of termRows || []) {
      balanceByStudent.set(row.student_id as string, (balanceByStudent.get(row.student_id as string) ?? 0) + Number(row.balance));
    }
    for (const kid of kids || []) {
      const familyId = kid.family_id as string;
      balanceByFamily.set(familyId, (balanceByFamily.get(familyId) ?? 0) + (balanceByStudent.get(kid.id as string) ?? 0));
    }
  }

  const order = new Map(ids.map((id, index) => [id, index]));
  const items = (rows || [])
    .map((family) => {
      const parents = (parentRows || []).filter((row) => row.family_id === family.id);
      return {
        id: family.id as string,
        code: family.family_code as string,
        name: (family.mailing_name as string | null) || parents.map((row) => row.full_name).join(" & ") || (family.family_code as string),
        area: family.home_area as string | null,
        parents: parents.map((row) => row.full_name as string),
        phones: parents.map((row) => displayPhone(row.phone as string | null)).filter(Boolean),
        children: (kids || [])
          .filter((row) => row.family_id === family.id)
          .map((row) => `${row.full_name}${row.class_code ? ` (${row.class_code})` : ""}`),
        balance: balanceByFamily.get(family.id as string) ?? 0,
      };
    })
    .sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));

  return { items };
}

/** Children, term balances and allocation buckets for a family payment. */
export async function loadFamilyPayment(familyId: string, preferredTermId = ""): Promise<{ error?: string; context?: FamilyPaymentContext }> {
  const auth = await requireAccounts("payments");
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(familyId)) return { error: "Choose a family." };
  const { supabase } = auth;

  const [{ data: family }, { data: childRows }, { data: terms }] = await Promise.all([
    supabase.from("families").select("id, family_code, mailing_name, home_area").eq("id", familyId).maybeSingle(),
    supabase.from("student_balances").select("student_id, full_name, student_number, class_code, stream, campus, status, balance, class_order").eq("family_id", familyId).order("class_order", { ascending: false, nullsFirst: false }),
    supabase.from("fee_terms").select("id, label, year, term, due_on, is_current").order("year").order("term"),
  ]);
  if (!family) return { error: "Family not found." };

  const childrenBase = (childRows || []).map((row) => ({
    student_id: row.student_id as string,
    full_name: row.full_name as string,
    student_number: row.student_number as string,
    class_code: (row.class_code as string | null) ?? null,
    stream: (row.stream as string | null) ?? null,
    campus: (row.campus as string | null) ?? null,
    status: row.status as string,
    balance: Number(row.balance),
  }));
  const ids = childrenBase.map((child) => child.student_id);
  const { data: termRows } = ids.length
    ? await supabase.from("student_term_balances").select("student_id, term_id, invoiced, paid, balance").in("student_id", ids)
    : { data: [] as { student_id: string; term_id: string; invoiced: number; paid: number; balance: number }[] };

  const termMeta = new Map((terms || []).map((term, index) => [term.id as string, {
    label: term.label as string,
    order: index,
    dueOn: (term.due_on as string | null) ?? null,
    isCurrent: Boolean(term.is_current),
  }]));
  const preferred = preferredTermId && termMeta.has(preferredTermId)
    ? preferredTermId
    : (terms || []).find((term) => term.is_current)?.id as string | undefined
      ?? (terms || [])[0]?.id as string | undefined
      ?? "";

  const byStudent = new Map<string, PupilTerm[]>();
  for (const row of termRows || []) {
    const list = byStudent.get(row.student_id) ?? [];
    list.push({
      term_id: row.term_id,
      invoiced: Number(row.invoiced),
      paid: Number(row.paid),
      balance: Number(row.balance),
    });
    byStudent.set(row.student_id, list);
  }

  const children: FamilyPaymentChild[] = childrenBase.map((child) => ({
    ...child,
    terms: byStudent.get(child.student_id) ?? [],
  }));

  const buckets: FamilyPayBucket[] = [];
  for (const child of children) {
    if (child.status !== "active" && child.balance <= 0) continue;
    for (const term of child.terms) {
      if (term.balance <= 0) continue;
      const meta = termMeta.get(term.term_id);
      buckets.push({
        studentId: child.student_id,
        studentName: child.full_name,
        classCode: child.class_code,
        termId: term.term_id,
        termLabel: meta?.label ?? "Term",
        owing: term.balance,
        termOrder: meta?.order ?? 999,
        dueOn: meta?.dueOn ?? null,
      });
    }
  }

  return {
    context: {
      family: {
        id: family.id as string,
        code: family.family_code as string,
        name: (family.mailing_name as string | null) || (family.family_code as string),
        area: (family.home_area as string | null) ?? null,
      },
      children,
      buckets,
      owing: buckets.reduce((sum, row) => sum + row.owing, 0),
    },
  };
}

/** Preview how a lump sum would be shared — same rules as saving. */
export async function previewFamilyAllocation(familyId: string, amount: number, preferredTermId = ""): Promise<{ error?: string; slices?: FamilyPaySlice[]; owing?: number }> {
  const loaded = await loadFamilyPayment(familyId, preferredTermId);
  if (loaded.error || !loaded.context) return { error: loaded.error ?? "Family not found." };
  const value = Math.round(Number(amount) || 0);
  if (value <= 0) return { slices: [], owing: loaded.context.owing };
  const creditChild = loaded.context.children.find((child) => child.status === "active")
    ?? loaded.context.children[0]
    ?? null;
  return {
    owing: loaded.context.owing,
    slices: allocateFamilyPayment(
      value,
      loaded.context.buckets,
      preferredTermId || loaded.context.buckets.find((row) => row.termId)?.termId || "",
      creditChild
        ? { studentId: creditChild.student_id, studentName: creditChild.full_name, classCode: creditChild.class_code }
        : null,
    ),
  };
}

export async function recordPayment(form: FormData): Promise<ActionResult> {
  const auth = await requireAccounts("payments");
  if ("error" in auth) return { error: auth.error };
  const studentId = String(form.get("student_id") || "");
  const termId = String(form.get("term_id") || "");
  const method = String(form.get("method") || "");
  const value = parseAmount(form.get("amount"));
  if (!isUuid(studentId)) return { error: "Choose the pupil this payment is for." };
  if (!isUuid(termId)) return { error: "Choose the term this payment is for." };
  if (!value || value <= 0) return { error: "Enter the amount received." };
  if (value > 100_000_000) return { error: "That amount looks too large. Check the number of zeros." };
  if (!isPaymentMethod(method)) return { error: "Choose how the money was paid." };
  const reference = field(form, "reference", 80);
  if (methodInfo(method).needsReference && !reference) {
    return { error: `Enter the ${method === "bank" ? "bank slip or transaction" : method === "cheque" ? "cheque" : "transaction"} reference so the payment can be traced.` };
  }
  const paid = dateField(form, "paid_on");
  if (paid.error) return { error: "Check the payment date." };
  const paidOn = paid.value ?? kampalaToday();
  if (paidOn > kampalaToday()) return { error: "The payment date can't be in the future." };

  const { supabase, user } = auth;
  const { data: student } = await supabase.from("students").select("full_name, family_id").eq("id", studentId).maybeSingle();
  if (!student) return { error: "Pupil not found." };
  const invoiceId = String(form.get("invoice_id") || "");
  const { data: payment, error } = await supabase
    .from("payments")
    .insert({
      student_id: studentId,
      family_id: student.family_id,
      term_id: termId,
      invoice_id: isUuid(invoiceId) ? invoiceId : null,
      amount: value,
      method,
      reference,
      paid_on: paidOn,
      payer_name: field(form, "payer_name", 120),
      notes: field(form, "notes", 500),
      source: "manual",
      received_by: user.id,
    })
    .select("id, receipt_no")
    .single();
  if (error) {
    if (error.code === "23505") return { error: `A ${methodInfo(method).label.toLowerCase()} payment with reference "${reference}" is already recorded. Check it isn't a duplicate.` };
    return { error: error.message };
  }
  await logAccounts(supabase, user.id, {
    kind: "payment",
    entity: "payment",
    entityId: payment.id,
    studentId,
    body: `Received ${ugx(value)} by ${methodInfo(method).label.toLowerCase()} for ${student.full_name} (${payment.receipt_no})`,
  });
  refreshAccounts(PAYMENTS, `${ACCOUNTS_BASE}/students/${studentId}`, `${ACCOUNTS_BASE}/debtors`);

  const { data: balance } = await supabase.from("student_term_balances").select("balance").eq("student_id", studentId).eq("term_id", termId).maybeSingle();
  const left = Number(balance?.balance ?? 0);
  return {
    ok: `Receipt ${payment.receipt_no} saved.`,
    id: payment.id,
    warning: left < 0 ? `This leaves ${student.full_name} ${ugx(-left)} in credit for the term.` : undefined,
  };
}

/**
 * Records one family payment: a single receipt covering several sibling allocations.
 * Expects FormData fields shared with a normal payment, plus family_id and optional
 * allocation JSON (`allocations` = [{studentId, termId, amount}, ...]). When omitted,
 * amounts are shared automatically across owing balances.
 */
export async function recordFamilyPayment(form: FormData): Promise<ActionResult> {
  const auth = await requireAccounts("payments");
  if ("error" in auth) return { error: auth.error };
  const familyId = String(form.get("family_id") || "");
  const method = String(form.get("method") || "");
  const value = parseAmount(form.get("amount"));
  const preferredTermId = String(form.get("term_id") || "");
  if (!isUuid(familyId)) return { error: "Choose the family this payment is for." };
  if (!value || value <= 0) return { error: "Enter the amount received." };
  if (value > 100_000_000) return { error: "That amount looks too large. Check the number of zeros." };
  if (!isPaymentMethod(method)) return { error: "Choose how the money was paid." };
  const reference = field(form, "reference", 80);
  if (methodInfo(method).needsReference && !reference) {
    return { error: `Enter the ${method === "bank" ? "bank slip or transaction" : method === "cheque" ? "cheque" : "transaction"} reference so the payment can be traced.` };
  }
  const paid = dateField(form, "paid_on");
  if (paid.error) return { error: "Check the payment date." };
  const paidOn = paid.value ?? kampalaToday();
  if (paidOn > kampalaToday()) return { error: "The payment date can't be in the future." };

  const loaded = await loadFamilyPayment(familyId, preferredTermId);
  if (loaded.error || !loaded.context) return { error: loaded.error ?? "Family not found." };
  const { context } = loaded;
  if (!context.children.length) return { error: "This family has no children on the fee roll." };

  let slices: FamilyPaySlice[];
  const rawAlloc = String(form.get("allocations") || "").trim();
  if (rawAlloc) {
    let parsed: { studentId?: string; termId?: string; amount?: number }[] = [];
    try {
      parsed = JSON.parse(rawAlloc) as { studentId?: string; termId?: string; amount?: number }[];
    } catch {
      return { error: "The allocation list could not be read. Try again." };
    }
    const byId = new Map(context.children.map((child) => [child.student_id, child]));
    const termLabels = new Map(context.buckets.map((row) => [row.termId, row.termLabel]));
    const cleaned: FamilyPaySlice[] = [];
    for (const row of parsed) {
      const child = byId.get(String(row.studentId || ""));
      const termId = String(row.termId || "");
      const amount = Math.round(Number(row.amount) || 0);
      if (!child || !isUuid(termId) || amount <= 0) continue;
      cleaned.push({
        studentId: child.student_id,
        studentName: child.full_name,
        classCode: child.class_code,
        termId,
        termLabel: termLabels.get(termId) ?? "Term",
        amount,
        credit: false,
      });
    }
    const sum = cleaned.reduce((n, row) => n + row.amount, 0);
    if (!cleaned.length) return { error: "Enter how much goes to at least one child." };
    if (sum !== value) return { error: `The amounts add up to ${ugx(sum)}, not ${ugx(value)}.` };
    slices = cleaned;
  } else {
    const creditChild = context.children.find((child) => child.status === "active") ?? context.children[0];
    slices = allocateFamilyPayment(
      value,
      context.buckets,
      preferredTermId,
      creditChild
        ? { studentId: creditChild.student_id, studentName: creditChild.full_name, classCode: creditChild.class_code }
        : null,
    );
  }
  if (!slices.length) return { error: "Nothing to apply — choose a family with balances, or enter an amount." };

  const { supabase, user } = auth;
  const payerName = field(form, "payer_name", 120);
  const notes = field(form, "notes", 500);

  const { data: batch, error: batchError } = await supabase
    .from("payment_batches")
    .insert({
      family_id: familyId,
      amount: value,
      method,
      reference,
      paid_on: paidOn,
      payer_name: payerName,
      notes,
      source: "manual",
      received_by: user.id,
    })
    .select("id, receipt_no")
    .single();
  if (batchError) {
    if (batchError.code === "23505") {
      return { error: `A ${methodInfo(method).label.toLowerCase()} payment with reference "${reference}" is already recorded. Check it isn't a duplicate.` };
    }
    if (/payment_batches|schema cache|does not exist/i.test(batchError.message)) {
      return { error: "Family payments need the latest accounts migration (0049_family_payments.sql). Run it in Supabase, then try again." };
    }
    return { error: batchError.message };
  }

  const rows = slices.map((slice, index) => ({
    receipt_no: `${batch.receipt_no}-${index + 1}`,
    student_id: slice.studentId,
    family_id: familyId,
    term_id: slice.termId,
    amount: slice.amount,
    method,
    reference: null as string | null,
    paid_on: paidOn,
    payer_name: payerName,
    notes: notes ? `${notes} · Part of family receipt ${batch.receipt_no}` : `Part of family receipt ${batch.receipt_no}`,
    source: "manual" as const,
    received_by: user.id,
    batch_id: batch.id,
  }));

  const { data: payments, error: payError } = await supabase.from("payments").insert(rows).select("id, student_id, amount, receipt_no");
  if (payError) {
    await supabase.from("payment_batches").delete().eq("id", batch.id);
    if (payError.code === "23505") {
      return { error: `Could not save the family receipt — a line number for ${batch.receipt_no} is already in use. Try again.` };
    }
    return { error: payError.message };
  }

  const names = slices.map((slice) => slice.studentName.split(" ").slice(-1)[0] || slice.studentName).join(", ");
  await logAccounts(supabase, user.id, {
    kind: "payment",
    entity: "family",
    entityId: familyId,
    body: `Received ${ugx(value)} by ${methodInfo(method).label.toLowerCase()} for family ${context.family.code} (${batch.receipt_no}) · shared across ${slices.length} ${slices.length === 1 ? "account" : "accounts"}: ${names}`,
  });

  const studentPaths = [...new Set(slices.map((slice) => `${ACCOUNTS_BASE}/students/${slice.studentId}`))];
  refreshAccounts(PAYMENTS, `${ACCOUNTS_BASE}/families/${familyId}`, `${ACCOUNTS_BASE}/debtors`, ...studentPaths);

  const creditSlices = slices.filter((slice) => slice.credit);
  const warning = creditSlices.length
    ? `After clearing what was owed, ${ugx(creditSlices.reduce((n, row) => n + row.amount, 0))} is held as credit.`
    : undefined;

  return {
    ok: `Family receipt ${batch.receipt_no} saved.`,
    id: batch.id,
    warning,
  };
}

export async function voidPayment(id: string, reason: string): Promise<ActionResult> {
  const auth = await requireAccounts("payments");
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(id)) return { error: "Payment not found." };
  const why = reason.replace(/\s+/g, " ").trim().slice(0, 300);
  if (why.length < 4) return { error: "Say why the payment is being voided." };
  const { supabase, user } = auth;

  const { data: existing } = await supabase.from("payments").select("id, batch_id, receipt_no, student_id, amount").eq("id", id).maybeSingle();
  if (!existing) return { error: "Payment not found." };

  if (existing.batch_id) {
    return voidPaymentBatch(existing.batch_id, why);
  }

  const { data, error } = await supabase
    .from("payments")
    .update({ voided_at: new Date().toISOString(), voided_by: user.id, void_reason: why })
    .eq("id", id)
    .is("voided_at", null)
    .select("receipt_no, student_id, amount")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "This payment is already void." };
  await logAccounts(supabase, user.id, { kind: "void", entity: "payment", entityId: id, studentId: data.student_id, body: `Voided receipt ${data.receipt_no} (${ugx(data.amount)}): ${why}` });
  refreshAccounts(PAYMENTS, `${PAYMENTS}/${id}`, `${ACCOUNTS_BASE}/students/${data.student_id}`);
  return { ok: `Receipt ${data.receipt_no} voided.` };
}

export async function voidPaymentBatch(batchId: string, reason: string): Promise<ActionResult> {
  const auth = await requireAccounts("payments");
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(batchId)) return { error: "Family receipt not found." };
  const why = reason.replace(/\s+/g, " ").trim().slice(0, 300);
  if (why.length < 4) return { error: "Say why the payment is being voided." };
  const { supabase, user } = auth;
  const now = new Date().toISOString();

  const { data: batch, error: batchError } = await supabase
    .from("payment_batches")
    .update({ voided_at: now, voided_by: user.id, void_reason: why })
    .eq("id", batchId)
    .is("voided_at", null)
    .select("id, receipt_no, family_id, amount")
    .maybeSingle();
  if (batchError) return { error: batchError.message };
  if (!batch) return { error: "This family receipt is already void." };

  const { data: lines, error } = await supabase
    .from("payments")
    .update({ voided_at: now, voided_by: user.id, void_reason: why })
    .eq("batch_id", batchId)
    .is("voided_at", null)
    .select("id, student_id");
  if (error) return { error: error.message };

  await logAccounts(supabase, user.id, {
    kind: "void",
    entity: "family",
    entityId: batch.family_id,
    body: `Voided family receipt ${batch.receipt_no} (${ugx(batch.amount)}): ${why}`,
  });

  const studentPaths = [...new Set((lines || []).map((row) => `${ACCOUNTS_BASE}/students/${row.student_id}`))];
  refreshAccounts(PAYMENTS, `${PAYMENTS}/batch/${batchId}`, `${ACCOUNTS_BASE}/families/${batch.family_id}`, ...studentPaths);
  return { ok: `Family receipt ${batch.receipt_no} voided.` };
}
