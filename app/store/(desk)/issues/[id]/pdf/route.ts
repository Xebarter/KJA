import { pdfResponse } from "@/lib/accounts-pdf";
import { issueSlipPdf } from "@/lib/store-docs-pdf";
import { requireStore } from "@/lib/store-access";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireStore("issues");
  if ("error" in auth) return new Response(auth.error, { status: 401 });
  const { id } = await context.params;
  const doc = await issueSlipPdf(auth.supabase, id, request.url);
  if (!doc) return new Response("Issue not found.", { status: 404 });
  return pdfResponse(doc.bytes, doc.filename);
}
