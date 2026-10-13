"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-applications";
import { isEmail } from "@/lib/vacancy-admin";

export type VacancyActionResult = { ok?: string; error?: string; warning?: string; id?: string; updatedAt?: string | null };

type DbError = { code?: string; message: string };

const EXTENDED_FIELDS = ["summary", "department", "employment_type", "positions", "salary", "start_date", "apply_email"] as const;
const SETUP_HINT = "Run supabase/0006_vacancies.sql in the Supabase SQL editor to enable them.";

const text = (value: FormDataEntryValue | null) => String(value ?? "").trim();
const isId = (value: string) => /^[0-9a-f-]{36}$/i.test(value);
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const isMissingColumn = (error: DbError | null) => error?.code === "PGRST204" || error?.code === "42703";

function friendly(error: DbError) {
  if (error.code === "PGRST205" || error.code === "42P01") return "The vacancies table is missing. Run supabase/0001_schema.sql in the Supabase SQL editor.";
  if (isMissingColumn(error)) return `Your database is missing the newer vacancy fields. ${SETUP_HINT}`;
  if (error.code === "23514") return "Number of positions must be between 1 and 99.";
  if (error.code === "42501") return "Your account doesn't have permission to change vacancies.";
  return error.message;
}

function refresh() {
  revalidatePath("/", "layout");
}

function withoutExtended(payload: Record<string, unknown>) {
  const copy = { ...payload };
  for (const field of EXTENDED_FIELDS) delete copy[field];
  return copy;
}

export async function saveVacancy(formData: FormData): Promise<VacancyActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const { supabase } = auth;

  const id = text(formData.get("id"));
  if (id && !isId(id)) return { error: "This vacancy could not be found." };
  const title = text(formData.get("title"));
  if (!title) return { error: "Give the vacancy a job title." };

  const closesOn = text(formData.get("closes_on"));
  if (closesOn && !isDate(closesOn)) return { error: "The closing date isn't valid." };
  const startDate = text(formData.get("start_date"));
  if (startDate && !isDate(startDate)) return { error: "The start date isn't valid." };
  const positions = Number(text(formData.get("positions")) || 1);
  if (!Number.isInteger(positions) || positions < 1 || positions > 99) return { error: "Number of positions must be a whole number between 1 and 99." };
  const applyEmail = text(formData.get("apply_email")).toLowerCase();
  if (applyEmail && !isEmail(applyEmail)) return { error: "The application email address doesn't look right." };

  const payload: Record<string, unknown> = {
    title,
    location: text(formData.get("location")) || null,
    closes_on: closesOn || null,
    published: formData.get("published") === "on",
    summary: text(formData.get("summary")) || null,
    department: text(formData.get("department")) || null,
    employment_type: text(formData.get("employment_type")) || null,
    positions,
    salary: text(formData.get("salary")) || null,
    start_date: startDate || null,
    apply_email: applyEmail || null,
  };
  if (formData.has("body")) payload.body = String(formData.get("body") ?? "");

  if (id) {
    const { data, error } = await supabase.from("vacancies").select("*").eq("id", id).maybeSingle();
    if (error) return { error: friendly(error) };
    if (!data) return { error: "This vacancy no longer exists. It may have been deleted by another admin." };
    const expected = text(formData.get("expected_updated_at"));
    if (expected && data.updated_at && new Date(data.updated_at).getTime() !== new Date(expected).getTime()) {
      return { error: "Another admin saved this vacancy while you were editing. Copy your changes, reload the page, then save again." };
    }
  }

  const write = (body: Record<string, unknown>) =>
    id ? supabase.from("vacancies").update(body).eq("id", id).select("*").single() : supabase.from("vacancies").insert(body).select("*").single();

  let result = await write(payload);
  let warning: string | undefined;
  if (isMissingColumn(result.error)) {
    result = await write(withoutExtended(payload));
    warning = `Saved, but the summary, role details and application email were skipped. ${SETUP_HINT}`;
  }
  if (result.error) return { error: friendly(result.error) };

  refresh();
  const saved = (result.data ?? {}) as Record<string, unknown>;
  return {
    ok: payload.published ? "Vacancy saved. It's live on the careers page." : "Draft saved. Only admins can see it.",
    warning,
    id: String(saved.id ?? id),
    updatedAt: (saved.updated_at as string | null | undefined) ?? null,
  };
}

export async function setVacancyPublished(id: string, value: boolean): Promise<VacancyActionResult> {
  if (!isId(id)) return { error: "Unknown vacancy." };
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const { error } = await auth.supabase.from("vacancies").update({ published: value }).eq("id", id);
  if (error) return { error: friendly(error) };
  refresh();
  return { ok: value ? "Published to the careers page." : "Moved to drafts." };
}

/** Pass null to remove the closing date. */
export async function setVacancyDeadline(id: string, closesOn: string | null): Promise<VacancyActionResult> {
  if (!isId(id)) return { error: "Unknown vacancy." };
  if (closesOn !== null && !isDate(closesOn)) return { error: "The closing date isn't valid." };
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const { error } = await auth.supabase.from("vacancies").update({ closes_on: closesOn }).eq("id", id);
  if (error) return { error: friendly(error) };
  refresh();
  return { ok: closesOn ? "Closing date updated." : "Closing date removed." };
}

export async function duplicateVacancy(id: string): Promise<VacancyActionResult> {
  if (!isId(id)) return { error: "Unknown vacancy." };
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const { supabase } = auth;
  const { data, error } = await supabase.from("vacancies").select("*").eq("id", id).maybeSingle();
  if (error) return { error: friendly(error) };
  if (!data) return { error: "This vacancy no longer exists." };
  const copy: Record<string, unknown> = { ...data, title: `${data.title} (copy)`, published: false, closes_on: null };
  for (const key of ["id", "created_at", "updated_at"]) delete copy[key];
  const inserted = await supabase.from("vacancies").insert(copy).select("id").single();
  if (inserted.error) return { error: friendly(inserted.error) };
  refresh();
  return { ok: "Copy created as a draft. Set a new closing date before publishing.", id: String(inserted.data.id) };
}

export async function deleteVacancy(id: string): Promise<VacancyActionResult> {
  if (!isId(id)) return { error: "Unknown vacancy." };
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const { error } = await auth.supabase.from("vacancies").delete().eq("id", id);
  if (error) return { error: friendly(error) };
  refresh();
  return { ok: "Vacancy deleted." };
}
