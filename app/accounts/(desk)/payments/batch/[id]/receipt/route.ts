import { familyReceiptPdf } from "@/lib/accounts-docs";
import { pdfResponse } from "@/lib/accounts-pdf";
import { requireAccounts } from "@/lib/accounts";
import { isUuid } from "@/lib/students";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAccounts();
  if ("error" in auth) return new Response(auth.error, { status: 401 });
  if (!isUuid(id)) return new Response("Receipt not found.", { status: 404 });
  const result = await familyReceiptPdf(auth.supabase, id, request.url);
  if (!result) return new Response("Receipt not found.", { status: 404 });
  return pdfResponse(result.bytes, result.filename, new URL(request.url).searchParams.get("download") !== "1");
}
