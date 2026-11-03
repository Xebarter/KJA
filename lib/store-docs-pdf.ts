import type { SupabaseClient } from "@supabase/supabase-js";
import { getContent } from "@/lib/content";
import { buildAccountsPdf, loadCrest, type AccountsDoc } from "@/lib/accounts-pdf";
import { loadSettings, normalizeRequisitionStatus, REQ_STATUS_LABELS } from "@/lib/store";

async function render(doc: AccountsDoc, requestUrl: string) {
  const { settings } = await getContent();
  return buildAccountsPdf(doc, settings, await loadCrest(requestUrl));
}

function day(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kampala",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** Plain amount for PDF table cells (currency lives in the column header). */
function amountCell(value: number) {
  const n = Number(value) || 0;
  if (Number.isInteger(n)) return n.toLocaleString("en-US");
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export async function requisitionPdf(supabase: SupabaseClient, id: string, requestUrl: string) {
  const { data: req } = await supabase
    .from("store_requisitions")
    .select("id, number, status, source, notes, created_at, submitted_at, supplier_id, store_suppliers(name, contact_name, phone)")
    .eq("id", id)
    .maybeSingle();
  if (!req) return null;

  const [{ data: lines }, settings] = await Promise.all([
    supabase
      .from("store_requisition_lines")
      .select("description, qty_requested, qty_ordered, unit_price, notes, item_id, store_items(sku, name, unit, unit_price)")
      .eq("requisition_id", id)
      .order("sort_order"),
    loadSettings(supabase),
  ]);

  const currency = settings.currency_label || "UGX";
  const supplier = req.store_suppliers as { name?: string; contact_name?: string; phone?: string } | null;
  const status = normalizeRequisitionStatus(req.status);

  let grandTotal = 0;
  const tableRows = (lines || []).map((line) => {
    const item = line.store_items as { sku?: string; name?: string; unit?: string; unit_price?: number } | null;
    const label =
      line.description ||
      (item ? `${item.sku || ""} · ${item.name || ""}`.trim() : "Item");
    const qty = Number(line.qty_requested || 0);
    const unitPrice = Number(line.unit_price || item?.unit_price || 0);
    const lineTotal = qty * unitPrice;
    grandTotal += lineTotal;
    return {
      cells: [
        label,
        amountCell(qty),
        amountCell(unitPrice),
        amountCell(lineTotal),
        String(line.notes || "-"),
      ],
    };
  });

  const doc: AccountsDoc = {
    tag: "STORE REQUISITION",
    number: String(req.number),
    issued: `Prepared ${day(req.created_at)}`,
    title: "Purchase requisition",
    intro:
      req.source === "low_stock"
        ? "Generated from items at or below reorder level."
        : "Manual store requisition for restocking or unavailable items.",
    status: {
      label: REQ_STATUS_LABELS[status],
      tone: status === "submitted" ? "green" : "grey",
    },
    parties: [
      {
        title: "Store Office",
        rows: [
          ["Document", String(req.number)],
          ["Source", req.source === "low_stock" ? "Low stock" : "Manual"],
          ["Submitted", req.submitted_at ? day(req.submitted_at) : "-"],
        ],
      },
      {
        title: "Preferred supplier",
        rows: [
          ["Supplier", supplier?.name || "To be assigned"],
          ["Contact", supplier?.contact_name || "-"],
          ["Phone", supplier?.phone || "-"],
        ],
      },
    ],
    table: {
      headers: ["Item", "Qty", `Unit Price (${currency})`, `Total (${currency})`, "Notes"],
      widths: [0.34, 0.1, 0.16, 0.16, 0.24],
      right: [1, 2, 3],
      rows: tableRows,
    },
    totals: [{ label: "Grand total", value: amountCell(grandTotal), strong: true }],
    notes: {
      title: "Authorisation",
      lines: [
        req.notes ? String(req.notes) : "Please supply the items listed above to Kampala Junior Academy Store.",
        "Requested By: ___________________________    Date ____________",
        "Approved By:  ___________________________    Date ____________",
      ],
    },
    footer: "Kampala Junior Academy · Store Office · Quote the requisition number on all quotations and delivery notes.",
  };

  return { bytes: await render(doc, requestUrl), filename: `KJA-Store-Requisition-${req.number}.pdf` };
}

export async function issueSlipPdf(supabase: SupabaseClient, id: string, requestUrl: string) {
  const { data: issue } = await supabase
    .from("store_issues")
    .select(
      "id, number, issued_at, notes, voided_at, recipient_kind, student_id, teacher_id, students(full_name, student_number, class_code, stream), teaching_staff(full_name, email)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!issue) return null;

  const { data: lines } = await supabase
    .from("store_issue_lines")
    .select("qty, store_items(sku, name, unit)")
    .eq("issue_id", id);

  const pupil = issue.students as { full_name?: string; student_number?: string; class_code?: string; stream?: string } | null;
  const teacher = issue.teaching_staff as { full_name?: string; email?: string } | null;
  const recipientName = issue.recipient_kind === "pupil" ? pupil?.full_name || "Pupil" : teacher?.full_name || "Teacher";
  const lineRows = lines || [];
  const pieceCount = lineRows.reduce((sum, line) => sum + Number(line.qty || 0), 0);

  const doc: AccountsDoc = {
    tag: "STORE ISSUE SLIP",
    number: String(issue.number),
    issued: `Issued ${day(issue.issued_at)}`,
    title: "Materials issued",
    intro: `School materials issued free of charge to ${recipientName}.`,
    status: issue.voided_at
      ? { label: "Voided", tone: "red" }
      : { label: "Issued", tone: "green" },
    parties: [
      {
        title: issue.recipient_kind === "pupil" ? "Pupil" : "Teacher",
        rows:
          issue.recipient_kind === "pupil"
            ? [
                ["Name", pupil?.full_name || "-"],
                ["Student no.", pupil?.student_number || "-"],
                ["Class", `${pupil?.class_code || "-"}${pupil?.stream ? ` ${pupil.stream}` : ""}`],
              ]
            : [
                ["Name", teacher?.full_name || "-"],
                ["Email", teacher?.email || "-"],
                ["Type", "Teaching staff"],
              ],
      },
      {
        title: "Store Office",
        rows: [
          ["Slip", String(issue.number)],
          ["Issued", day(issue.issued_at)],
          ["Lines", String(lineRows.length)],
          ["Total qty", String(pieceCount)],
          ["Notes", String(issue.notes || "-")],
        ].slice(0, 5) as [string, string][],
      },
    ],
    table: {
      headers: ["Item", "Quantity"],
      widths: [0.72, 0.28],
      right: [1],
      rows: lineRows.map((line) => {
        const item = line.store_items as { sku?: string; name?: string; unit?: string } | null;
        return {
          cells: [
            String(item?.name || "Item"),
            `${line.qty}${item?.unit ? ` ${item.unit}` : ""}`,
          ],
        };
      }),
    },
    notes: {
      title: "Acknowledgement",
      lines: [
        "I confirm receipt of the school materials listed above. No payment is due.",
        "Recipient signature ______________________ · Store officer ______________________",
      ],
    },
    footer: "Kampala Junior Academy · Store Office · Materials issued free of charge",
  };

  return { bytes: await render(doc, requestUrl), filename: `KJA-Store-Issue-${issue.number}.pdf` };
}
