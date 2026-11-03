import { pdfResponse } from "@/lib/accounts-pdf";
import { requisitionPdf } from "@/lib/store-docs-pdf";
import { requireStore } from "@/lib/store-access";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireStore("requisitions");
  if ("error" in auth) return new Response(auth.error, { status: 401 });
  const { id } = await context.params;
  const doc = await requisitionPdf(auth.supabase, id, request.url);
  if (!doc) return new Response("Requisition not found.", { status: 404 });
  return pdfResponse(doc.bytes, doc.filename, false);
}
