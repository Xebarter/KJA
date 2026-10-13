import type { SupabaseClient } from "@supabase/supabase-js";
import type { BoardApplicant } from "@/components/admin/JobApplicationsBoard";
import { formatDateTime, timeAgo } from "@/lib/applications";
import { roleTitle, toJobApplication, type JobApplication, type JobDocument } from "@/lib/job-applications";
import { isMissingTable } from "@/lib/story-admin-server";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

export const JOB_BUCKET = "job-applications";

/** live: ready · missing: 0007_job_applications.sql hasn't run · setup: Supabase isn't connected. */
export type JobApplicationsMode = "live" | "missing" | "setup";

export type ApplicantCounts = Record<string, { total: number; fresh: number; active: number }>;

const LIST_COLUMNS =
  "id, vacancy_id, vacancy_title, full_name, email, phone, location, current_position, qualification, experience, campus, available_from, documents, status, rating, interview_at, assigned_to, read, created_at, updated_at, updated_by";

export async function loadJobApplications(
  client?: SupabaseClient | null,
): Promise<{ mode: JobApplicationsMode; rows: JobApplication[]; error?: string }> {
  const supabase = client ?? (supabaseConfigured() ? await createClient() : null);
  if (!supabase) return { mode: "setup", rows: [] };
  const { data, error } = await supabase.from("job_applications").select(LIST_COLUMNS).order("created_at", { ascending: false }).limit(2000);
  if (isMissingTable(error)) return { mode: "missing", rows: [] };
  return { mode: "live", rows: ((data ?? []) as Record<string, unknown>[]).map(toJobApplication), error: error?.message };
}

export function applicantCounts(rows: JobApplication[]): ApplicantCounts {
  const counts: ApplicantCounts = {};
  for (const row of rows) {
    if (!row.vacancy_id) continue;
    const entry = (counts[row.vacancy_id] ??= { total: 0, fresh: 0, active: 0 });
    entry.total += 1;
    if (row.status === "new") entry.fresh += 1;
    if (!["hired", "rejected", "withdrawn"].includes(row.status)) entry.active += 1;
  }
  return counts;
}

export function interviewLabel(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kampala",
  });
}

export function toBoardApplicants(rows: JobApplication[], people: Map<string, string>, now: number): BoardApplicant[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.full_name,
    email: row.email,
    phone: row.phone,
    role: roleTitle(row),
    vacancyId: row.vacancy_id,
    stage: row.status,
    rating: row.rating,
    qualification: row.qualification ?? "",
    experience: row.experience ?? "",
    campus: row.campus ?? "",
    ownerId: row.assigned_to,
    ownerName: row.assigned_to ? people.get(row.assigned_to) ?? "Former admin" : null,
    unread: !row.read,
    createdAt: row.created_at,
    received: timeAgo(row.created_at, now),
    receivedFull: formatDateTime(row.created_at),
    interview: row.interview_at ? interviewLabel(row.interview_at) : null,
    upcomingInterview: Boolean(row.interview_at && new Date(row.interview_at).getTime() >= now && !["hired", "rejected", "withdrawn"].includes(row.status)),
    documents: row.documents.length,
  }));
}

export type SignedDocument = JobDocument & { view: string | null; download: string | null };

/** Short-lived links, because the bucket is private. */
export async function signDocuments(supabase: SupabaseClient, documents: JobDocument[]): Promise<SignedDocument[]> {
  const bucket = supabase.storage.from(JOB_BUCKET);
  return Promise.all(
    documents.map(async (doc) => {
      const [view, download] = await Promise.all([
        bucket.createSignedUrl(doc.path, 60 * 60),
        bucket.createSignedUrl(doc.path, 60 * 60, { download: doc.name }),
      ]);
      return { ...doc, view: view.data?.signedUrl ?? null, download: download.data?.signedUrl ?? null };
    }),
  );
}
