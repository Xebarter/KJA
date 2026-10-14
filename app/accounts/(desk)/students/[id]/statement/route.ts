import { statementPdf } from "@/lib/accounts-docs";
import { pdfResponse } from "@/lib/accounts-pdf";
import { requireAccounts } from "@/lib/accounts";
import { isUuid } from "@/lib/students";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAccounts();
  if ("error" in auth) return new Response(auth.error, { status: 401 });
  if (!isUuid(id)) return new Response("Pupil not found.", { status: 404 });
  const url = new URL(request.url);
  const term = url.searchParams.get("term");
  const result = await statementPdf(auth.supabase, [id], request.url, { termId: isUuid(term) ? term : null });
  if (!result) return new Response("Pupil not found.", { status: 404 });
  return pdfResponse(result.bytes, result.filename, url.searchParams.get("download") !== "1");
}
