import { getAdminContent } from "@/lib/content";
import { decodeEntities } from "@/lib/html";
import { isMissingColumn, isMissingTable } from "@/lib/story-admin-server";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";
import { toVacancyRow, type VacancyRow } from "@/lib/vacancy-admin";

/** live: fully set up · migrate: the table exists but 0006_vacancies.sql hasn't run · setup: no database yet (read-only imported content). */
export type VacanciesMode = "live" | "migrate" | "setup";

const EXTENDED_PROBE = "id, summary, department, employment_type, positions, salary, start_date, apply_email, updated_at";

export async function loadAdminVacancies(): Promise<{ mode: VacanciesMode; rows: VacancyRow[]; error?: string }> {
  const supabase = supabaseConfigured() ? await createClient() : null;
  if (supabase) {
    const { data, error } = await supabase.from("vacancies").select("*").order("created_at", { ascending: false });
    if (!isMissingTable(error)) {
      const probe = await supabase.from("vacancies").select(EXTENDED_PROBE).limit(1);
      const rows = ((data ?? []) as Record<string, unknown>[]).map(toVacancyRow);
      return { mode: isMissingColumn(probe.error) ? "migrate" : "live", rows, error: error?.message };
    }
  }
  const content = await getAdminContent();
  return { mode: "setup", rows: (content.vacancies as unknown as Record<string, unknown>[]).map((row) => toVacancyRow({ ...row, id: null })) };
}

export async function loadVacancy(id: string) {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data } = await supabase.from("vacancies").select("*").eq("id", id).maybeSingle();
  return data ? toVacancyRow(data as Record<string, unknown>) : null;
}

/** Campus names plus any location already used on a vacancy, offered as suggestions. */
export async function vacancyLocations(rows: VacancyRow[]) {
  const content = await getAdminContent();
  const campuses = content.campuses.map((campus) => decodeEntities(String(campus.title ?? "")).trim()).filter(Boolean);
  return [...new Set([...campuses, ...rows.map((row) => row.location.trim()).filter(Boolean)])].sort((a, b) => a.localeCompare(b));
}

export async function careersEmail() {
  const content = await getAdminContent();
  const page = content.pages.find((entry) => entry.slug === "vacancies");
  const fromPage = String(page?.body ?? "").match(/[\w.+-]+@[\w-]+\.[\w.]+[a-z]/i)?.[0];
  return fromPage || content.settings.email || "";
}
