import { NextResponse } from "next/server";
import { EXPENSE_RECEIPTS, requireAccounts } from "@/lib/accounts";
import { isUuid } from "@/lib/students";

export const dynamic = "force-dynamic";

/** Sends staff to a short-lived link for the private receipt file. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAccounts();
  if ("error" in auth) return new Response(auth.error, { status: 401 });
  if (!isUuid(id)) return new Response("Receipt not found.", { status: 404 });
  const { data: expense } = await auth.supabase.from("expenses").select("receipt_path").eq("id", id).maybeSingle();
  if (!expense?.receipt_path) return new Response("No receipt attached.", { status: 404 });
  const { data, error } = await auth.supabase.storage.from(EXPENSE_RECEIPTS).createSignedUrl(expense.receipt_path, 300);
  if (error || !data?.signedUrl) return new Response(error?.message ?? "Receipt not found.", { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "private, no-store" } });
}
