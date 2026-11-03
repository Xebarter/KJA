import { pdfResponse } from "@/lib/accounts-pdf";
import { requireStore } from "@/lib/store-access";
import { todayKampala } from "@/lib/store";
import { resolveReportPeriod, type ReportPeriod } from "@/lib/store-reports";
import {
  storeIssuesReportPdf,
  storePurchasesReportPdf,
  storeStockReportPdf,
  storeSummaryReportPdf,
} from "@/lib/store-reports-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireStore("reports");
  if ("error" in auth) return new Response(auth.error, { status: 401 });

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") || "summary";
  const today = todayKampala();
  const period = resolveReportPeriod(url.searchParams.get("period"), today).key as ReportPeriod;

  try {
    const doc =
      kind === "stock"
        ? await storeStockReportPdf(auth.supabase, request.url)
        : kind === "issues"
          ? await storeIssuesReportPdf(auth.supabase, request.url, period, today)
          : kind === "purchases"
            ? await storePurchasesReportPdf(auth.supabase, request.url, period, today)
            : await storeSummaryReportPdf(auth.supabase, request.url, period, today);
    return pdfResponse(doc.bytes, doc.filename, false);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not build the PDF.";
    return new Response(message, { status: 500 });
  }
}
