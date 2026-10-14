/*
 * Loads an invoice, receipt or statement and lays it out for lib/accounts-pdf.ts.
 * Works with staff and parent clients alike: row level security decides what each can see.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getContent } from "@/lib/content";
import { buildAccountsPdf, loadCrest, type AccountsDoc } from "@/lib/accounts-pdf";
import {
  amount,
  day,
  invoiceStatusInfo,
  kampalaToday,
  methodInfo,
  sortTerms,
  statementRows,
  ugx,
  type Invoice,
  type InvoiceLine,
  type Payment,
  type Term,
} from "@/lib/accounts-format";
import { className } from "@/lib/students";

type Pupil = {
  id: string;
  student_number: string;
  full_name: string;
  class_code: string | null;
  stream: string | null;
  campus: string | null;
  family_id: string | null;
  family_code: string | null;
  mailing_name: string | null;
};

const FOOTER = "Thank you for choosing Kampala Junior Academy. Please quote the pupil's name and student number with every payment.";

export async function loadPupils(supabase: SupabaseClient, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map<string, Pupil>();
  const { data } = await supabase
    .from("students")
    .select("id, student_number, full_name, class_code, stream, campus, family_id")
    .in("id", unique);
  const rows = (data || []) as Omit<Pupil, "family_code" | "mailing_name">[];
  const familyIds = [...new Set(rows.map((row) => row.family_id).filter(Boolean))] as string[];
  const families = new Map<string, { family_code: string | null; mailing_name: string | null }>();
  if (familyIds.length) {
    const { data: fams } = await supabase.from("families").select("id, family_code, mailing_name").in("id", familyIds);
    for (const fam of fams || []) families.set(fam.id, fam);
  }
  return new Map(
    rows.map((row) => {
      const family = row.family_id ? families.get(row.family_id) : undefined;
      return [row.id, { ...row, family_code: family?.family_code ?? null, mailing_name: family?.mailing_name ?? null }];
    }),
  );
}

function classLine(pupil: Pupil | undefined, code?: string | null) {
  const value = code ?? pupil?.class_code;
  if (!value) return "-";
  return `${className(value)}${pupil?.stream ? ` ${pupil.stream}` : ""}`;
}

function pupilRows(pupil: Pupil | undefined, extras: [string, string][] = []): [string, string][] {
  return [
    ["Pupil", pupil?.full_name ?? "-"],
    ["Student no.", pupil?.student_number ?? "-"],
    ["Class", classLine(pupil)],
    ...(pupil?.campus ? ([["Campus", pupil.campus]] as [string, string][]) : []),
    ...extras,
  ].slice(0, 5) as [string, string][];
}

async function render(doc: AccountsDoc, requestUrl: string) {
  const { settings } = await getContent();
  return buildAccountsPdf(doc, settings, await loadCrest(requestUrl));
}

// ---------------------------------------------------------------- invoice

export async function invoicePdf(supabase: SupabaseClient, id: string, requestUrl: string) {
  const { data: invoice } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle<Invoice>();
  if (!invoice) return null;
  const [{ data: lines }, { data: term }, { data: payments }, pupils] = await Promise.all([
    supabase.from("invoice_lines").select("*").eq("invoice_id", id).order("position"),
    supabase.from("fee_terms").select("id, label, due_on").eq("id", invoice.term_id).maybeSingle(),
    supabase.from("payments").select("amount").eq("student_id", invoice.student_id).eq("term_id", invoice.term_id).is("voided_at", null),
    loadPupils(supabase, [invoice.student_id]),
  ]);
  const { data: termTotals } = await supabase
    .from("student_term_balances")
    .select("invoiced, paid, balance")
    .eq("student_id", invoice.student_id)
    .eq("term_id", invoice.term_id)
    .maybeSingle();
  const pupil = pupils.get(invoice.student_id);
  const rows = (lines || []) as InvoiceLine[];
  const charges = rows.filter((line) => line.kind === "charge").reduce((sum, line) => sum + line.amount, 0);
  const discounts = rows.filter((line) => line.kind === "discount").reduce((sum, line) => sum + line.amount, 0);
  const paid = (payments || []).reduce((sum, payment) => sum + Number(payment.amount), 0);
  const balance = Number(termTotals?.balance ?? invoice.total - paid);
  const status = invoiceStatusInfo(invoice.status);
  const settled = invoice.status === "issued" && balance <= 0;

  const doc: AccountsDoc = {
    tag: invoice.status === "draft" ? "DRAFT INVOICE" : "INVOICE",
    number: invoice.invoice_no,
    issued: `Issued ${day(invoice.issued_on)}`,
    title: invoice.kind === "term" ? `${term?.label ?? "Term"} fees` : "Fee invoice",
    intro:
      invoice.status === "void"
        ? `This invoice was cancelled${invoice.void_reason ? `: ${invoice.void_reason}` : "."}`
        : `For ${pupil?.full_name ?? "the pupil"}${invoice.due_on ? `, payable by ${day(invoice.due_on)}` : ""}.`,
    status: {
      label: invoice.status === "void" ? "Void" : invoice.status === "draft" ? status.label : settled ? "Paid in full" : paid > 0 ? "Part paid" : "Unpaid",
      tone: invoice.status === "void" ? "grey" : invoice.status === "draft" ? "gold" : settled ? "green" : "red",
    },
    hero: {
      label: invoice.status === "void" ? "Invoice total (cancelled)" : "Amount due this term",
      amount: invoice.status === "void" ? invoice.total : Math.max(0, balance),
      words: invoice.status !== "void",
      facts: [
        ["Invoice total", ugx(invoice.total)],
        ["Paid this term", ugx(paid)],
        ["Due date", invoice.due_on ? day(invoice.due_on) : "On receipt"],
      ],
    },
    parties: [
      { title: "Pupil", rows: pupilRows(pupil) },
      {
        title: "Billed to",
        rows: [
          ["Family", pupil?.mailing_name || pupil?.full_name || "-"],
          ["Family no.", pupil?.family_code ?? "-"],
          ["Term", term?.label ?? "-"],
          ["Invoice", invoice.kind === "term" ? "Term fees" : "Additional charges"],
        ],
      },
    ],
    table: {
      headers: ["Item", "Type", "Amount (UGX)"],
      widths: [0.6, 0.18, 0.22],
      right: [2],
      rows: rows.map((line) => ({
        cells: [line.description, line.kind === "discount" ? "Discount" : "Charge", amount(line.amount)],
        muted: line.kind === "discount",
      })),
    },
    totals: [
      { label: "Charges", value: ugx(charges) },
      ...(discounts ? [{ label: "Discounts", value: ugx(discounts) }] : []),
      { label: "Invoice total", value: ugx(invoice.total) },
      { label: "Paid this term", value: ugx(paid) },
      { label: invoice.status === "void" ? "Cancelled" : "Balance due", value: ugx(invoice.status === "void" ? 0 : Math.max(0, balance)), strong: true },
    ],
    notes: {
      title: "How to pay",
      lines: [
        "Pay at the school bank account, by mobile money or with SchoolPay, or in cash at the accounts office.",
        `Quote ${pupil?.student_number ?? "the student number"} and ${invoice.invoice_no} as the reference so we can match your payment.`,
        "Keep every receipt. Speak to the accounts office about payment plans.",
      ],
    },
    stamp:
      invoice.status === "void"
        ? { top: "KJA ACCOUNTS", middle: "VOID", bottom: day(invoice.voided_at ?? invoice.issued_on), tone: "red" }
        : settled
          ? { top: "KJA ACCOUNTS", middle: "PAID", bottom: day(kampalaToday()), tone: "green" }
          : undefined,
    footer: FOOTER,
  };
  return { bytes: await render(doc, requestUrl), filename: `KJA-Invoice-${invoice.invoice_no}.pdf` };
}

// ---------------------------------------------------------------- receipt

export async function receiptPdf(supabase: SupabaseClient, id: string, requestUrl: string) {
  const { data: payment } = await supabase.from("payments").select("*").eq("id", id).maybeSingle<Payment>();
  if (!payment) return null;
  const [{ data: term }, pupils, { data: termTotals }, { data: receiver }] = await Promise.all([
    supabase.from("fee_terms").select("id, label").eq("id", payment.term_id).maybeSingle(),
    loadPupils(supabase, [payment.student_id]),
    supabase.from("student_term_balances").select("invoiced, paid, balance").eq("student_id", payment.student_id).eq("term_id", payment.term_id).maybeSingle(),
    payment.received_by
      ? supabase.from("profiles").select("full_name").eq("id", payment.received_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const pupil = pupils.get(payment.student_id);
  const method = methodInfo(payment.method);
  const voided = Boolean(payment.voided_at);
  const balance = Number(termTotals?.balance ?? 0);

  const doc: AccountsDoc = {
    tag: "OFFICIAL RECEIPT",
    number: payment.receipt_no,
    issued: `Paid ${day(payment.paid_on)}`,
    title: "Fee payment receipt",
    intro: voided
      ? `This receipt was cancelled${payment.void_reason ? `: ${payment.void_reason}` : "."}`
      : `Received with thanks from ${payment.payer_name || pupil?.mailing_name || "the family"}.`,
    status: voided ? { label: "Void", tone: "grey" } : { label: "Received", tone: "green" },
    hero: {
      label: "Amount received",
      amount: payment.amount,
      words: true,
      facts: [
        ["Method", method.label],
        ["Reference", payment.reference || "-"],
        ["Date", day(payment.paid_on)],
      ],
    },
    parties: [
      { title: "Pupil", rows: pupilRows(pupil) },
      {
        title: "Payment",
        rows: [
          ["Term", term?.label ?? "-"],
          ["Paid by", payment.payer_name || pupil?.mailing_name || "-"],
          ["Received by", receiver?.full_name || "Accounts office"],
          ["Recorded", day(payment.created_at)],
        ],
      },
    ],
    table: {
      headers: ["This term", "Amount (UGX)"],
      widths: [0.7, 0.3],
      right: [1],
      rows: [
        { cells: [`Fees billed for ${term?.label ?? "the term"}`, amount(termTotals?.invoiced ?? 0)] },
        { cells: ["Paid so far, including this receipt", amount(termTotals?.paid ?? payment.amount)] },
        { cells: [balance < 0 ? "Credit carried forward" : "Balance still due", amount(Math.abs(balance))], strong: true },
      ],
    },
    notes: payment.notes ? { title: "Notes", lines: [payment.notes] } : undefined,
    stamp: voided
      ? { top: "KJA ACCOUNTS", middle: "VOID", bottom: day(payment.voided_at), tone: "red" }
      : { top: "KJA ACCOUNTS", middle: "PAID", bottom: day(payment.paid_on), tone: "green" },
    footer: "This receipt was produced by the KJA accounts office. Keep it as proof of payment.",
  };
  return { bytes: await render(doc, requestUrl), filename: `KJA-Receipt-${payment.receipt_no}.pdf` };
}

// ---------------------------------------------------------------- statement

/** A statement for one pupil, or for a whole family when several ids are given. */
export async function statementPdf(
  supabase: SupabaseClient,
  studentIds: string[],
  requestUrl: string,
  options: { termId?: string | null; familyName?: string | null; familyCode?: string | null } = {},
) {
  if (!studentIds.length) return null;
  let invoicesQuery = supabase
    .from("invoices")
    .select("id, invoice_no, student_id, term_id, kind, status, issued_on, total, notes, created_at")
    .in("student_id", studentIds)
    .eq("status", "issued");
  let paymentsQuery = supabase
    .from("payments")
    .select("id, receipt_no, student_id, term_id, amount, method, reference, paid_on, voided_at, created_at")
    .in("student_id", studentIds)
    .is("voided_at", null);
  if (options.termId) {
    invoicesQuery = invoicesQuery.eq("term_id", options.termId);
    paymentsQuery = paymentsQuery.eq("term_id", options.termId);
  }
  const [{ data: invoices }, { data: payments }, { data: termRows }, pupils] = await Promise.all([
    invoicesQuery,
    paymentsQuery,
    supabase.from("fee_terms").select("id, year, term, label, starts_on, ends_on, due_on, is_current"),
    loadPupils(supabase, studentIds),
  ]);
  if (!pupils.size) return null;
  const terms = sortTerms((termRows || []) as Term[]);
  const names = new Map([...pupils.values()].map((pupil) => [pupil.id, pupil.full_name.split(" ").slice(1).join(" ") || pupil.full_name]));
  const entries = statementRows((invoices || []) as Invoice[], (payments || []) as Payment[], terms, names);
  const charged = entries.reduce((sum, entry) => sum + entry.charge, 0);
  const credited = entries.reduce((sum, entry) => sum + entry.credit, 0);
  const balance = charged - credited;
  const term = options.termId ? terms.find((row) => row.id === options.termId) : null;
  const family = studentIds.length > 1;
  const first = pupils.get(studentIds[0]) ?? [...pupils.values()][0];

  const doc: AccountsDoc = {
    tag: "FEE STATEMENT",
    number: family ? `FAM-${options.familyCode ?? first.family_code ?? "STATEMENT"}` : first.student_number,
    issued: `As at ${day(kampalaToday())}`,
    title: family ? "Family fee statement" : "Fee statement",
    intro: `${term ? term.label : "All terms"}, for ${family ? options.familyName || first.mailing_name || "the family" : first.full_name}.`,
    status: balance > 0 ? { label: "Balance due", tone: "red" } : balance < 0 ? { label: "In credit", tone: "green" } : { label: "Fully paid", tone: "green" },
    hero: {
      label: balance < 0 ? "Credit on account" : "Balance due",
      amount: Math.abs(balance),
      words: balance !== 0,
      facts: [
        ["Total billed", ugx(charged)],
        ["Total paid", ugx(credited)],
        ["Period", term?.label ?? "All terms"],
      ],
    },
    parties: family
      ? [
          {
            title: "Family",
            rows: [
              ["Family", options.familyName || first.mailing_name || "-"],
              ["Family no.", options.familyCode || first.family_code || "-"],
              ["Children", String(pupils.size)],
            ],
          },
          {
            title: "Children",
            rows: [...pupils.values()].slice(0, 5).map((pupil) => [pupil.student_number, `${pupil.full_name} (${classLine(pupil)})`] as [string, string]),
          },
        ]
      : [
          { title: "Pupil", rows: pupilRows(first) },
          { title: "Family", rows: [["Family", first.mailing_name || "-"], ["Family no.", first.family_code || "-"], ["Period", term?.label ?? "All terms"]] },
        ],
    table: {
      headers: ["Date", "Details", "Charges", "Paid", "Balance"],
      widths: [0.14, 0.42, 0.14, 0.14, 0.16],
      right: [2, 3, 4],
      rows: entries.map((entry) => ({
        cells: [day(entry.date), entry.description, entry.charge ? amount(entry.charge) : "", entry.credit ? amount(entry.credit) : "", amount(entry.balance)],
        sub: entry.ref,
      })),
    },
    totals: [
      { label: "Total billed", value: ugx(charged) },
      { label: "Total paid", value: ugx(credited) },
      { label: balance < 0 ? "Credit" : "Balance due", value: ugx(Math.abs(balance)), strong: true },
    ],
    notes: {
      title: "Questions about this statement?",
      lines: [
        "Contact the accounts office with the reference shown under each line.",
        "Payments made in the last few days may not appear yet.",
      ],
    },
    stamp: balance <= 0 ? { top: "KJA ACCOUNTS", middle: "CLEAR", bottom: day(kampalaToday()), tone: "green" } : undefined,
    footer: FOOTER,
  };
  const name = family ? options.familyCode || first.family_code || "family" : first.student_number;
  return { bytes: await render(doc, requestUrl), filename: `KJA-Statement-${name}.pdf` };
}
