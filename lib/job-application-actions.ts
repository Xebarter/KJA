"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { loadPeople, requireAdmin } from "@/lib/admin-applications";
import { formatDateTime, fromKampalaInput } from "@/lib/applications";
import { kampalaClock } from "@/lib/events-calendar";
import {
  CV_TYPES,
  EXPERIENCE_LEVELS,
  MAX_FILE_BYTES,
  MAX_SUPPORTING,
  QUALIFICATIONS,
  SUPPORTING_TYPES,
  fileType,
  isJobStage,
  jobReference as reference,
  safeFileName,
  stageInfo,
  toDocuments,
  type JobActionResult,
  type JobDocument,
} from "@/lib/job-applications";
import { JOB_BUCKET } from "@/lib/job-applications-server";
import { createClient } from "@/lib/supabase/server";

type DbError = { code?: string; message: string } | null;

const MAX_BULK = 200;
const MIN_FILL_MS = 4000;
const SETUP_HINT = "Run supabase/0007_job_applications.sql in the Supabase SQL editor.";

const text = (value: FormDataEntryValue | null, max = 200) => String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const isId = (value: string) => /^[0-9a-f-]{36}$/i.test(value);
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isPhone = (value: string) => /^\+?[\d\s()-]{7,20}$/.test(value);
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const missingSetup = (error: DbError) =>
  error?.code === "PGRST205" || error?.code === "42P01" || /bucket not found/i.test(error?.message ?? "");

function ids(list: string[]) {
  return [...new Set(list.map(String).filter(isId))].slice(0, MAX_BULK);
}

function refresh(id?: string) {
  revalidatePath("/admin", "layout");
  if (id) revalidatePath(`/admin/content/vacancies/applications/${id}`);
}

function friendly(error: NonNullable<DbError>) {
  if (missingSetup(error)) return `Job applications aren't set up yet. ${SETUP_HINT}`;
  if (error.code === "42501") return "Your account doesn't have permission to do that.";
  return error.message;
}

/** Checks the first bytes, so a renamed file can't pass as a PDF or Word document. */
function signatureMatches(bytes: Uint8Array, type: string) {
  const starts = (...sig: number[]) => sig.every((value, index) => bytes[index] === value);
  if (type === "application/pdf") return starts(0x25, 0x50, 0x44, 0x46);
  if (type.includes("openxmlformats")) return starts(0x50, 0x4b, 0x03, 0x04);
  if (type === "application/msword") return starts(0xd0, 0xcf, 0x11, 0xe0);
  if (type === "image/jpeg") return starts(0xff, 0xd8, 0xff);
  if (type === "image/png") return starts(0x89, 0x50, 0x4e, 0x47);
  return false;
}

async function checkFile(file: File, allowed: string[], label: string) {
  const type = fileType(file.name, file.type);
  if (!allowed.includes(type)) {
    return { error: `${label} must be ${allowed.length > CV_TYPES.length ? "a PDF, Word document, JPG or PNG" : "a PDF or Word document"}.` };
  }
  if (file.size > MAX_FILE_BYTES) return { error: `${label} is larger than 5 MB. Please upload a smaller file.` };
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (!signatureMatches(bytes, type)) return { error: `${label} doesn't look like a valid ${type.startsWith("image/") ? "image" : "document"}. Please export it again and retry.` };
  return { type };
}

export async function submitJobApplication(formData: FormData): Promise<JobActionResult & { unavailable?: boolean; reference?: string }> {
  const supabase = await createClient();
  if (!supabase) return { error: "Online applications aren't available right now.", unavailable: true };

  // Bots fill the hidden field or submit instantly; pretend it worked so they don't retry.
  const started = Number(formData.get("started") || 0);
  if (text(formData.get("company_website")) || (started && Date.now() - started < MIN_FILL_MS)) {
    return { ok: "Application received.", reference: reference(randomUUID()) };
  }

  const fullName = text(formData.get("full_name"), 120);
  const email = text(formData.get("email"), 160).toLowerCase();
  const phone = text(formData.get("phone"), 40);
  const qualification = text(formData.get("qualification"), 80);
  const experience = text(formData.get("experience"), 40);
  const coverLetter = String(formData.get("cover_letter") ?? "").trim().slice(0, 5000);
  const availableFrom = text(formData.get("available_from"), 10);

  if (fullName.length < 3) return { error: "Please enter your full name." };
  if (!isEmail(email)) return { error: "Please enter a valid email address." };
  if (!isPhone(phone)) return { error: "Please enter a valid phone number." };
  if (!QUALIFICATIONS.includes(qualification)) return { error: "Please choose your highest qualification." };
  if (!EXPERIENCE_LEVELS.includes(experience)) return { error: "Please choose your years of experience." };
  if (coverLetter.length < 50) return { error: "Please write a few lines about why you're a good fit (at least 50 characters)." };
  if (availableFrom && !isDate(availableFrom)) return { error: "The availability date isn't valid." };
  if (formData.get("consent") !== "on") return { error: "Please confirm the declaration at the end of the form." };

  let vacancyId: string | null = null;
  let vacancyTitle = "General application";
  const roleId = text(formData.get("vacancy_id"), 40);
  if (roleId) {
    if (!isId(roleId)) return { error: "This role could not be found. Please choose it again from the careers page." };
    const { data: role } = await supabase.from("vacancies").select("id, title, closes_on, published").eq("id", roleId).maybeSingle();
    const today = kampalaClock().today;
    if (!role || role.published === false || (role.closes_on && String(role.closes_on).slice(0, 10) < today)) {
      return { error: "This role is no longer taking applications. You can still send a general application." };
    }
    vacancyId = role.id;
    vacancyTitle = role.title;
  }

  const cv = formData.get("cv");
  if (!(cv instanceof File) || cv.size === 0) return { error: "Please attach your CV." };
  const cvCheck = await checkFile(cv, CV_TYPES, "Your CV");
  if ("error" in cvCheck) return { error: cvCheck.error };

  const extras = formData.getAll("documents").filter((item): item is File => item instanceof File && item.size > 0);
  if (extras.length > MAX_SUPPORTING) return { error: `You can attach up to ${MAX_SUPPORTING} supporting documents.` };
  const files: { file: File; type: string; kind: JobDocument["kind"] }[] = [{ file: cv, type: cvCheck.type, kind: "cv" }];
  for (const [index, file] of extras.entries()) {
    const check = await checkFile(file, SUPPORTING_TYPES, `Supporting document ${index + 1}`);
    if ("error" in check) return { error: check.error };
    files.push({ file, type: check.type, kind: "supporting" });
  }

  const id = randomUUID();
  const documents: JobDocument[] = [];
  for (const [index, entry] of files.entries()) {
    const path = `${id}/${index + 1}-${safeFileName(entry.file.name)}`;
    const { error } = await supabase.storage.from(JOB_BUCKET).upload(path, entry.file, { contentType: entry.type, upsert: false });
    if (error) {
      if (missingSetup(error)) return { error: "Online applications are still being set up.", unavailable: true };
      return { error: "We couldn't upload your documents. Please check your connection and try again." };
    }
    documents.push({ path, name: entry.file.name.slice(0, 120), size: entry.file.size, type: entry.type, kind: entry.kind });
  }

  const { error } = await supabase.from("job_applications").insert({
    id,
    vacancy_id: vacancyId,
    vacancy_title: vacancyTitle,
    full_name: fullName,
    email,
    phone,
    location: text(formData.get("location"), 120) || null,
    current_position: text(formData.get("current_position"), 160) || null,
    qualification,
    experience,
    campus: text(formData.get("campus"), 80) || null,
    available_from: availableFrom || null,
    cover_letter: coverLetter,
    documents,
  });
  if (error) {
    if (error.code === "23505") return { error: "You've already applied for this role with this email address. We'll be in touch about your application." };
    if (missingSetup(error)) return { error: "Online applications are still being set up.", unavailable: true };
    if (error.code === "42501") return { error: "This role is no longer taking applications. You can still send a general application." };
    return { error: "We couldn't send your application right now. Please try again in a moment." };
  }
  refresh();
  return { ok: "Application received.", reference: reference(id) };
}

export async function updateJobApplication(formData: FormData): Promise<JobActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const { supabase, user } = auth;

  const id = String(formData.get("id") || "");
  if (!isId(id)) return { error: "This application could not be found." };
  const expected = String(formData.get("updated_at") || "");
  const { data: current, error: loadError } = await supabase
    .from("job_applications").select("status, assigned_to, interview_at, updated_at").eq("id", id).maybeSingle();
  if (loadError) return { error: friendly(loadError) };
  if (!current) return { error: "This application no longer exists." };
  if (expected && current.updated_at && new Date(current.updated_at).getTime() !== new Date(expected).getTime()) {
    return { error: "Another admin changed this application while you were viewing it. Refresh the page to see the latest, then try again." };
  }

  const status = String(formData.get("status") || current.status);
  if (!isJobStage(status)) return { error: "Choose a valid stage." };
  const owner = String(formData.get("assigned_to") || "") || null;
  if (owner && !isId(owner)) return { error: "Choose a valid owner." };
  const interviewAt = fromKampalaInput(String(formData.get("interview_at") || ""));

  const patch: Record<string, unknown> = {};
  const activity: { kind: string; body: string }[] = [];
  if (status !== current.status) {
    patch.status = status;
    activity.push({ kind: "status", body: `Moved from ${stageInfo(current.status).label} to ${stageInfo(status).label}` });
  }
  if (owner !== current.assigned_to) {
    patch.assigned_to = owner;
    const names = await loadPeople(supabase, [owner]);
    activity.push({ kind: "assign", body: owner ? `Assigned to ${owner === user.id ? "themselves" : names.get(owner) ?? "a teammate"}` : "Removed the owner" });
  }
  const currentInterview = current.interview_at ? new Date(current.interview_at).toISOString() : null;
  if (interviewAt !== currentInterview) {
    patch.interview_at = interviewAt;
    activity.push({ kind: "interview", body: interviewAt ? `Scheduled an interview for ${formatDateTime(interviewAt)}` : "Cleared the interview" });
    if (interviewAt && status === current.status && ["new", "reviewing", "shortlisted"].includes(status)) {
      patch.status = "interview";
      activity.push({ kind: "status", body: `Moved from ${stageInfo(status).label} to Interview` });
    }
  }
  if (!activity.length) return { ok: "No changes to save." };

  const { error } = await supabase.from("job_applications").update(patch).eq("id", id);
  if (error) return { error: friendly(error) };
  await supabase.from("job_application_activity").insert(activity.map((entry) => ({ ...entry, application_id: id, actor_id: user.id })));
  refresh(id);
  return { ok: "Saved." };
}

export async function setJobStage(list: string[], stage: string): Promise<JobActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  if (!isJobStage(stage)) return { error: "Choose a valid stage." };
  const targets = ids(list);
  if (!targets.length) return { error: "Select at least one application." };
  const { supabase, user } = auth;
  const { data: before } = await supabase.from("job_applications").select("id, status").in("id", targets);
  const changed = (before ?? []).filter((row) => row.status !== stage);
  if (!changed.length) return { ok: "Already in that stage." };
  const { error } = await supabase.from("job_applications").update({ status: stage, read: true }).in("id", changed.map((row) => row.id));
  if (error) return { error: friendly(error) };
  await supabase.from("job_application_activity").insert(
    changed.map((row) => ({ application_id: row.id, actor_id: user.id, kind: "status", body: `Moved from ${stageInfo(row.status).label} to ${stageInfo(stage).label}` })),
  );
  refresh();
  return { ok: `Moved ${changed.length} ${changed.length === 1 ? "applicant" : "applicants"} to ${stageInfo(stage).label}.` };
}

export async function assignJobApplications(list: string[], owner: string | null): Promise<JobActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const targets = ids(list);
  if (!targets.length) return { error: "Select at least one application." };
  if (owner && !isId(owner)) return { error: "Choose a valid owner." };
  const { supabase, user } = auth;
  const { error } = await supabase.from("job_applications").update({ assigned_to: owner }).in("id", targets);
  if (error) return { error: friendly(error) };
  const names = await loadPeople(supabase, [owner]);
  const body = owner ? `Assigned to ${owner === user.id ? "themselves" : names.get(owner) ?? "a teammate"}` : "Removed the owner";
  await supabase.from("job_application_activity").insert(targets.map((id) => ({ application_id: id, actor_id: user.id, kind: "assign", body })));
  refresh();
  return { ok: `Updated ${targets.length} ${targets.length === 1 ? "applicant" : "applicants"}.` };
}

export async function markJobApplicationsRead(list: string[], read: boolean): Promise<JobActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const targets = ids(list);
  if (!targets.length) return { error: "Select at least one application." };
  const { error } = await auth.supabase.from("job_applications").update({ read }).in("id", targets);
  if (error) return { error: friendly(error) };
  refresh();
  return { ok: read ? "Marked as read." : "Marked as unread." };
}

export async function rateJobApplication(id: string, rating: number | null): Promise<JobActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  if (!isId(id)) return { error: "This application could not be found." };
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) return { error: "Ratings go from 1 to 5 stars." };
  const { supabase, user } = auth;
  const { error } = await supabase.from("job_applications").update({ rating }).eq("id", id);
  if (error) return { error: friendly(error) };
  await supabase.from("job_application_activity").insert({
    application_id: id, actor_id: user.id, kind: "rating", body: rating ? `Rated ${rating} out of 5` : "Cleared the rating",
  });
  refresh(id);
  return { ok: "Rating saved." };
}

export async function addJobNote(formData: FormData): Promise<JobActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const id = String(formData.get("id") || "");
  if (!isId(id)) return { error: "This application could not be found." };
  const body = String(formData.get("body") || "").trim().slice(0, 4000);
  if (!body) return { error: "Write a note first." };
  const { error } = await auth.supabase.from("job_application_activity").insert({ application_id: id, actor_id: auth.user.id, kind: "note", body });
  if (error) return { error: friendly(error) };
  refresh(id);
  return { ok: "Note added." };
}

export async function deleteJobNote(noteId: string, applicationId: string): Promise<JobActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const { error } = await auth.supabase
    .from("job_application_activity").delete().eq("id", noteId).eq("actor_id", auth.user.id).eq("kind", "note");
  if (error) return { error: friendly(error) };
  refresh(applicationId);
  return { ok: "Note deleted." };
}

export async function deleteJobApplications(list: string[]): Promise<JobActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const targets = ids(list);
  if (!targets.length) return { error: "Select at least one application." };
  const { supabase } = auth;
  const { data } = await supabase.from("job_applications").select("documents").in("id", targets);
  const paths = (data ?? []).flatMap((row) => toDocuments(row.documents).map((doc) => doc.path));
  const { error } = await supabase.from("job_applications").delete().in("id", targets);
  if (error) return { error: friendly(error) };
  if (paths.length) await supabase.storage.from(JOB_BUCKET).remove(paths);
  refresh();
  return { ok: `Deleted ${targets.length} ${targets.length === 1 ? "application" : "applications"}.` };
}
