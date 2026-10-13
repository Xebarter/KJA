import type { SupabaseClient } from "@supabase/supabase-js";
import { ATTENTION_DAYS, OPEN_STATUSES, personName, type ApplicationFilters, type TeamMember } from "@/lib/applications";
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
  options: { count?: "exact"; statuses?: readonly string[] } = {},
) {
  let query = supabase.from("applications").select(columns, options.count ? { count: options.count } : {});
  if (options.statuses) query = query.in("status", options.statuses);
  else if (filters.status === "open" || filters.attention) query = query.in("status", OPEN_STATUSES);
  else if (filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.attention) {
    const now = new Date();
    const stale = new Date(now.getTime() - ATTENTION_DAYS * 86_400_000).toISOString();
    query = query.or(
      `assigned_to.is.null,and(status.eq.received,created_at.lt.${stale}),and(status.eq.visit_scheduled,visit_at.lt.${now.toISOString()}),and(status.eq.visit_scheduled,visit_at.is.null)`,
    );
  }
  if (filters.received) {
    query = query.gte("created_at", new Date(Date.now() - Number(filters.received) * 86_400_000).toISOString());
  }
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
  if (filters.sort === "name") return query.order("child_name", { ascending: true }).order("created_at", { ascending: false });
  if (filters.sort === "updated") return query.order("updated_at", { ascending: false });
  return query.order("created_at", { ascending: filters.sort === "oldest" });
}

/** When each application entered its current stage: the latest status change, or when it arrived. */
export async function loadStageSince(supabase: SupabaseClient, rows: { id: string; created_at: string }[]) {
  const since = new Map(rows.map((row) => [row.id, row.created_at]));
  const ids = rows.map((row) => row.id);
  for (let start = 0; start < ids.length; start += 150) {
    const { data } = await supabase
      .from("application_activity")
      .select("application_id, created_at")
      .eq("kind", "status")
      .not("body", "like", "Emailed%")
      .in("application_id", ids.slice(start, start + 150))
      .order("created_at", { ascending: false });
    const seen = new Set<string>();
    for (const entry of data || []) {
      if (seen.has(entry.application_id)) continue;
      seen.add(entry.application_id);
      since.set(entry.application_id, entry.created_at);
    }
  }
  return since;
}

export async function loadTeam(supabase: SupabaseClient): Promise<TeamMember[]> {
  const { data } = await supabase.from("profiles").select("id, full_name, email").in("role", ["admin", "admissions"]).order("full_name");
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
