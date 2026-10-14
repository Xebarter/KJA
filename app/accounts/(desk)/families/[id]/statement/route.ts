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
  if (!isUuid(id)) return new Response("Family not found.", { status: 404 });
  const { supabase } = auth;
  const [{ data: family }, { data: children }] = await Promise.all([
    supabase.from("families").select("family_code, mailing_name").eq("id", id).maybeSingle(),
    supabase.from("students").select("id").eq("family_id", id).order("date_of_birth"),
  ]);
  if (!family || !children?.length) return new Response("Family not found.", { status: 404 });
  const url = new URL(request.url);
  const term = url.searchParams.get("term");
  const result = await statementPdf(supabase, children.map((child) => child.id as string), request.url, {
    termId: isUuid(term) ? term : null,
    familyName: family.mailing_name,
    familyCode: family.family_code,
  });
  if (!result) return new Response("Family not found.", { status: 404 });
  return pdfResponse(result.bytes, result.filename, url.searchParams.get("download") !== "1");
}
