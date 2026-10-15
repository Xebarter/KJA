import { loadTerms, requireAccounts } from "@/lib/accounts";
import { expenseStatusInfo } from "@/lib/accounts-format";
import { loadAccountsReport, rateText, type AccountsReport } from "@/lib/accounts-reports";
import { csvResponse, pick, studentStatusInfo } from "@/lib/students";

export const dynamic = "force-dynamic";

function positionRows(report: AccountsReport) {
  return [
    ["Period", report.periodLabel],
    ["Fees billed (UGX)", report.billed],
    ["Discounts in those bills (UGX)", report.discounts],
    ["Collected (UGX)", report.collected],
    ["Applied on fee accounts (UGX)", report.paid],
    ["Still owed (UGX)", report.owing],
    ["Credit balances (UGX)", report.credit],
    ["Spending, approved and paid (UGX)", report.spent],
    ["Net, collections minus spending (UGX)", report.net],
    ["Collection %", report.rate ?? ""],
    ["Receipts", report.receipts],
    ["Issued invoices", report.issuedInvoices],
    ["Draft invoices", report.draftInvoices],
    ["Void invoices", report.voidInvoices],
    ["Voided receipts", report.voidedReceipts],
    ["Reminders sent", report.reminders],
    ["Pupils on the roll", report.pupilsOnRoll],
    ["Pupils not billed", report.pupilsNotBilled],
    ["Pupils owing", report.pupilsOwing],
    ["Families owing", report.familiesOwing],
  ];
}

function csvFor(kind: string, report: AccountsReport) {
  if (kind === "position") return csvResponse("fee-report", ["Figure", "Value"], positionRows(report));
  if (kind === "methods") {
    return csvResponse("collections-by-method", ["Method", "Receipts", "Amount (UGX)", "Share %"], report.methods.map((row) => [row.label, row.count, row.total, report.collected ? Math.round((row.total / report.collected) * 100) : ""]));
  }
  if (kind === "classes") {
    return csvResponse(
      "collections-by-class",
      ["Class", "Class name", "On roll", "Not billed", "Pupils billed", "Billed (UGX)", "Collected (UGX)", "Owed (UGX)", "Credit (UGX)", "Receipts", "Collection %"],
      report.classes.map((row) => [row.code, row.name, row.onRoll, row.notBilled, row.billedPupils, row.invoiced, row.paid, row.owing, row.credit, row.receipts, rateText(row.paid, row.invoiced)]),
    );
  }
  if (kind === "campuses") {
    return csvResponse(
      "collections-by-campus",
      ["Campus", "Receipts", "Collected (UGX)", "Billed (UGX)", "Owed (UGX)"],
      report.campuses.map((row) => [row.campus, row.receipts, row.collected, row.billed, row.owing]),
    );
  }
  if (kind === "cashiers") {
    return csvResponse("collections-by-person", ["Recorded by", "Receipts", "Amount (UGX)"], report.cashiers.map((row) => [row.name, row.count, row.total]));
  }
  if (kind === "days") {
    return csvResponse("collections-by-day", ["Date", "Receipts", "Amount (UGX)"], report.days.map((row) => [row.date, row.count, row.total]));
  }
  if (kind === "terms") {
    return csvResponse(
      "collections-by-term",
      ["Term", "Current", "Billed (UGX)", "Collected (UGX)", "Owed (UGX)", "Collection %", "Spending (UGX)", "Net (UGX)", "Receipts"],
      report.terms.map((row) => [row.label, row.isCurrent ? "Yes" : "", row.invoiced, row.paid, row.owing, rateText(row.paid, row.invoiced), row.dated ? row.spent : "", row.dated ? row.paid - row.spent : "", row.receipts]),
    );
  }
  if (kind === "monthly") {
    return csvResponse("income-vs-expenses", ["Month", "Fees received (UGX)", "Spending (UGX)", "Net (UGX)"], report.months.map((row) => [row.key, row.income, row.spend, row.income - row.spend]));
  }
  if (kind === "debtors") {
    return csvResponse(
      "debtors",
      ["Pupil", "Class", "Status", "Due", "Balance (UGX)"],
      report.debtors.map((row) => [row.name, row.classCode ?? "", studentStatusInfo(row.status).label, row.due ?? "", row.balance]),
    );
  }
  if (kind === "aging") {
    return csvResponse("debt-aging", ["Bucket", "Pupils", "Amount (UGX)"], [
      ["Not yet due", report.aging.current.count, report.aging.current.total],
      ["1–30 days overdue", report.aging.d30.count, report.aging.d30.total],
      ["31–60 days overdue", report.aging.d60.count, report.aging.d60.total],
      ["Over 60 days overdue", report.aging.d60plus.count, report.aging.d60plus.total],
    ]);
  }
  if (kind === "fees") {
    return csvResponse("fees-billed", ["Item", "Kind", "Lines", "Amount (UGX)"], report.fees.map((row) => [row.name, row.kind, row.count, row.amount]));
  }
  if (kind === "discounts") {
    return csvResponse("discounts", ["Discount", "Lines", "Amount (UGX)"], report.discountLines.map((row) => [row.label, row.count, row.amount]));
  }
  if (kind === "categories") {
    return csvResponse(
      "spending-by-category",
      ["Category", "Expenses", "Amount in period (UGX)", "Monthly budget (UGX)", `Spent in ${report.budgetMonth} (UGX)`],
      report.categories.filter((row) => row.amount || row.budget).map((row) => [row.name, row.count, row.amount, row.budget ?? "", row.monthSpend]),
    );
  }
  if (kind === "expenses") {
    return csvResponse(
      "expenses",
      ["Reference", "Date", "Payee", "Category", "Campus", "Status", "Method", "Amount (UGX)"],
      report.expenseRows.map((row) => [row.ref, row.spentOn, row.payee, row.category, row.campus, expenseStatusInfo(row.status).label, row.method, row.amount]),
    );
  }
  return csvResponse(
    "collections",
    ["Receipt", "Date", "Pupil", "Class", "Campus", "Term", "Method", "Amount (UGX)", "Source", "Recorded by"],
    report.receiptRows.map((row) => [row.receiptNo, row.paidOn, row.pupil, row.classCode, row.campus, row.term, row.method, row.amount, row.source, row.cashier]),
  );
}

export async function GET(request: Request) {
  const auth = await requireAccounts();
  if ("error" in auth) return new Response(auth.error, { status: 401 });
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const { terms, current, error } = await loadTerms(auth.supabase);
  if (error) return new Response(error, { status: 500 });
  try {
    const report = await loadAccountsReport(auth.supabase, terms, current, pick(params, "term"));
    return csvFor(pick(params, "kind") || "collections", report);
  } catch (loadError) {
    return new Response(loadError instanceof Error ? loadError.message : "Export failed.", { status: 500 });
  }
}
