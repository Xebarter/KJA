import { receiptPdf } from "@/lib/accounts-docs";
import { pdfResponse } from "@/lib/accounts-pdf";
import { getSessionUser } from "@/lib/portal";
import { isUuid } from "@/lib/students";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, supabase } = await getSessionUser();
  if (!user || !supabase) return new Response("Sign in to open this receipt.", { status: 401 });
  if (!isUuid(id)) return new Response("Receipt not found.", { status: 404 });
  const result = await receiptPdf(supabase, id, request.url);
  if (!result) return new Response("Receipt not found.", { status: 404 });
  return pdfResponse(result.bytes, result.filename, true);
}
