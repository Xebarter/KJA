import { readFile } from "fs/promises";
import path from "path";
import { getContent } from "@/lib/content";
import { isOfficeRole } from "@/lib/office";
import { loadPayment, refreshPayment, tokenMatches } from "@/lib/payments/admission";
import { buildReceiptPdf } from "@/lib/payments/receipt";
import { getSessionUser } from "@/lib/portal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function isAdmin() {
  const { user, supabase } = await getSessionUser();
  if (!user || !supabase) return false;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return isOfficeRole(data?.role);
}

async function crest(request: Request) {
  try {
    return new Uint8Array(await readFile(path.join(process.cwd(), "public", "images", "icon.png")));
  } catch {
    try {
      const response = await fetch(new URL("/images/icon.png", request.url));
      return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
    } catch {
      return null;
    }
  }
}

function notAvailable(message: string, status: number) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = new URL(request.url).searchParams.get("t");
  let row = await loadPayment(id);
  if (!row) return notAvailable("Receipt not found.", 404);
  if (!tokenMatches(row.receipt_token, token) && !(await isAdmin())) return notAvailable("Receipt not found.", 404);
  if (row.status !== "paid") row = await refreshPayment(row);
  if (row.status !== "paid") return notAvailable("This payment has not been completed, so there is no receipt yet.", 409);

  const { settings } = await getContent();
  const bytes = await buildReceiptPdf(row, settings, await crest(request));
  const name = `KJA-Admission-Receipt-${row.receipt_no ?? row.id.slice(0, 8)}.pdf`;
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
