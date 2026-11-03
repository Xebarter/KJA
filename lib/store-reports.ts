import { money, qty, REQ_STATUS_LABELS, type PaymentMethod, type RequisitionStatus } from "@/lib/store";

export type ReportPeriod = "month" | "30d" | "90d" | "year";

export const REPORT_PERIODS: { id: ReportPeriod; label: string; hint: string }[] = [
  { id: "month", label: "This month", hint: "From the 1st" },
  { id: "30d", label: "30 days", hint: "Rolling window" },
  { id: "90d", label: "90 days", hint: "Quarter view" },
  { id: "year", label: "This year", hint: "Calendar year" },
];

function addDaysYmd(ymd: string, delta: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function resolveReportPeriod(raw: string | null | undefined, today: string) {
  const key = (REPORT_PERIODS.some((row) => row.id === raw) ? raw : "month") as ReportPeriod;
  let start = today;
  if (key === "month") start = `${today.slice(0, 8)}01`;
  else if (key === "30d") start = addDaysYmd(today, -29);
  else if (key === "90d") start = addDaysYmd(today, -89);
  else start = `${today.slice(0, 4)}-01-01`;
  const meta = REPORT_PERIODS.find((row) => row.id === key)!;
  return {
    key,
    label: meta.label,
    hint: meta.hint,
    start,
    end: today,
    issueSince: `${start}T00:00:00+03:00`,
  };
}

function csvEscape(value: string | number | null | undefined) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function csvTable(headers: string[], rows: (string | number | null | undefined)[][]) {
  return [headers.map(csvEscape).join(","), ...rows.map((row) => row.map(csvEscape).join(","))].join("\r\n");
}

export function issuesCsv(
  rows: {
    number: string;
    issued_at: string;
    recipient: string;
    kind: string;
    payment_method?: PaymentMethod;
    amount_paid?: number;
    total: number;
    voided: boolean;
  }[],
) {
  return csvTable(
    ["Number", "Issued", "Recipient", "Kind", "Qty issued", "Voided"],
    rows.map((row) => [
      row.number,
      row.issued_at,
      row.recipient,
      row.kind,
      row.total,
      row.voided ? "yes" : "no",
    ]),
  );
}

export function stockCsv(
  rows: {
    sku: string;
    name: string;
    category: string;
    unit: string;
    qty_on_hand: number;
    reorder_level: number;
    unit_cost: number;
    unit_price?: number;
    value: number;
    low: boolean;
  }[],
) {
  return csvTable(
    ["SKU", "Name", "Category", "Unit", "On hand", "Reorder", "Unit cost", "Stock value", "Low"],
    rows.map((row) => [
      row.sku,
      row.name,
      row.category,
      row.unit,
      qty(row.qty_on_hand),
      qty(row.reorder_level),
      row.unit_cost,
      row.value,
      row.low ? "yes" : "no",
    ]),
  );
}

export function purchasesCsv(
  rows: {
    number: string;
    received_on: string;
    supplier: string;
    reference: string;
    total: number;
  }[],
) {
  return csvTable(
    ["Number", "Received", "Supplier", "Reference", "Total cost"],
    rows.map((row) => [row.number, row.received_on, row.supplier, row.reference, row.total]),
  );
}

export function formatMoneyLabel(amount: number) {
  return money(amount);
}

export function statusLabel(status: string) {
  return REQ_STATUS_LABELS[status as RequisitionStatus] || (status === "draft" ? "Draft" : "Submitted");
}
