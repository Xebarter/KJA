import { loadPeople, requireAdmin } from "@/lib/admin-applications";
import { formatDate, formatDateTime } from "@/lib/applications";
import { ACTIVE_STAGES, CLOSED_STAGES, isJobStage, jobReference, roleTitle, stageInfo, toJobApplication } from "@/lib/job-applications";

export const dynamic = "force-dynamic";

function cell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return new Response(auth.error, { status: 403 });
  const { supabase } = auth;
  const params = new URL(request.url).searchParams;
  const role = params.get("role") ?? "";
  const stage = params.get("stage") ?? "";

  let query = supabase.from("job_applications").select("*").order("created_at", { ascending: false }).limit(5000);
  if (role === "general") query = query.is("vacancy_id", null);
  else if (/^[0-9a-f-]{36}$/i.test(role)) query = query.eq("vacancy_id", role);
  if (stage === "active") query = query.in("status", ACTIVE_STAGES);
  else if (stage === "closed") query = query.in("status", CLOSED_STAGES);
  else if (isJobStage(stage)) query = query.eq("status", stage);

  const { data, error } = await query;
  if (error) return new Response(error.message, { status: 500 });
  const rows = (data ?? []).map((row) => toJobApplication(row as Record<string, unknown>));
  const people = await loadPeople(supabase, rows.map((row) => row.assigned_to));

  const header = [
    "Reference", "Received", "Role", "Stage", "Rating", "Name", "Email", "Phone", "Lives in", "Qualification", "Experience",
    "Current role", "Preferred campus", "Available from", "Interview", "Owner", "Documents", "Cover note",
  ];
  const lines = rows.map((row) => [
    jobReference(row.id),
    formatDateTime(row.created_at),
    roleTitle(row),
    stageInfo(row.status).label,
    row.rating ?? "",
    row.full_name,
    row.email,
    row.phone,
    row.location,
    row.qualification,
    row.experience,
    row.current_position,
    row.campus,
    formatDate(row.available_from),
    formatDateTime(row.interview_at),
    row.assigned_to ? people.get(row.assigned_to) ?? "" : "",
    row.documents.map((doc) => doc.name).join("; "),
    row.cover_letter,
  ].map(cell).join(","));

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(`\uFEFF${[header.join(","), ...lines].join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kja-job-applications-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
