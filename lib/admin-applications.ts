import type { SupabaseClient } from "@supabase/supabase-js";
import { OPEN_STATUSES, personName, type ApplicationFilters, type TeamMember } from "@/lib/applications";
import { createClient } from "@/lib/supabase/server";

export async function requireAdmin() {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase is not connected yet." } as const;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Your session has expired. Sign in again." } as const;
  const { data: profile } = await supabase.from("profiles").select("id, role, full_name, email").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return { error: "This account is not an admin." } as const;
  return { supabase, user, profile } as const;
}

export function applicationsQuery(
  supabase: SupabaseClient,
  filters: ApplicationFilters,
  userId: string,
  columns: string,
  options: { count?: "exact" } = {},
) {
  let query = supabase.from("applications").select(columns, options);
  if (filters.status === "open") query = query.in("status", OPEN_STATUSES);
  else if (filters.status !== "all") query = query.eq("status", filters.status);
  const needle = filters.q.replace(/[%,()*\\:"']/g, " ").trim();
  if (needle) {
    const like = `%${needle}%`;
    query = query.or(`child_name.ilike.${like},parent_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`);
  }
  if (filters.campus) query = query.eq("campus", filters.campus);
  if (filters.grade) query = query.eq("grade", filters.grade);
  if (filters.owner === "me") query = query.eq("assigned_to", userId);
  else if (filters.owner === "none") query = query.is("assigned_to", null);
  else if (filters.owner) query = query.eq("assigned_to", filters.owner);
  if (filters.payment === "paid") query = query.eq("payment_status", "paid");
  else if (filters.payment === "unpaid") query = query.is("payment_status", null);
  return query.order("created_at", { ascending: filters.sort === "oldest" });
}

export async function loadTeam(supabase: SupabaseClient): Promise<TeamMember[]> {
  const { data } = await supabase.from("profiles").select("id, full_name, email").eq("role", "admin").order("full_name");
  return (data || []).map((row) => ({ id: row.id, name: personName(row), email: row.email }));
}

export async function loadPeople(supabase: SupabaseClient, ids: Array<string | null | undefined>) {
  const unique = [...new Set(ids.filter(Boolean) as string[])];
  const names = new Map<string, string>();
  if (!unique.length) return names;
  const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", unique);
  for (const row of data || []) names.set(row.id, personName(row));
  return names;
}
