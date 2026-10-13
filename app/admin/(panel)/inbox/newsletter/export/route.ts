import { requireAdmin } from "@/lib/admin-applications";
import { formatDateTime } from "@/lib/applications";
import { emailDomain } from "@/lib/inbox";

export const dynamic = "force-dynamic";

function cell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return new Response(auth.error, { status: 403 });
  const { data, error } = await auth.supabase
    .from("newsletter_subscribers")
    .select("email, created_at")
    .order("created_at", { ascending: false })
    .limit(10000);
  if (error) return new Response(error.message, { status: 500 });

  const lines = (data ?? []).map((row) => [row.email, formatDateTime(row.created_at), emailDomain(row.email)].map(cell).join(","));
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(`\uFEFF${["Email,Subscribed,Provider", ...lines].join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kja-newsletter-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
