import { applicationsQuery, loadPeople, requireAdmin } from "@/lib/admin-applications";
import { formatDate, formatDateTime, parseFilters, statusInfo, type Application } from "@/lib/applications";

export const dynamic = "force-dynamic";

function cell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return new Response(auth.error, { status: 403 });
  const { supabase, user } = auth;
  const filters = parseFilters(Object.fromEntries(new URL(request.url).searchParams));
  const { data, error } = await applicationsQuery(supabase, filters, user.id, "*").limit(5000);
  if (error) return new Response(error.message, { status: 500 });
  const rows = (data || []) as unknown as Application[];
  const people = await loadPeople(supabase, rows.map((row) => row.assigned_to));

  const header = [
    "Received", "Status", "Child", "Date of birth", "Class", "Campus", "Parent", "Phone", "Email", "Owner", "School visit", "Message",
  ];
  const lines = rows.map((row) => [
    formatDateTime(row.created_at),
    statusInfo(row.status).label,
    row.child_name,
    formatDate(row.child_dob),
    row.grade,
    row.campus,
    row.parent_name,
    row.phone,
    row.email,
    row.assigned_to ? people.get(row.assigned_to) ?? "" : "",
    formatDateTime(row.visit_at),
    row.message,
  ].map(cell).join(","));

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(`\uFEFF${[header.join(","), ...lines].join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kja-applications-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
