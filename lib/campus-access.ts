import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CAMPUS_OPTIONS,
  filterCampuses,
  isCampusDashboard,
  type CampusDashboardId,
  type CampusId,
} from "@/lib/campuses";
import type { DashboardId } from "@/lib/dashboard-access";

export type CampusScopeMap = Partial<Record<CampusDashboardId, CampusId[]>>;

/** Campuses this profile may manage on a desk. Full admins get all four. */
export async function loadCampusScope(
  supabase: SupabaseClient,
  profileId: string,
  role: string | null | undefined,
  dashboard: CampusDashboardId | DashboardId,
): Promise<CampusId[]> {
  if (!isCampusDashboard(dashboard)) return [...CAMPUS_OPTIONS];
  if (role === "admin") return [...CAMPUS_OPTIONS];
  const { data } = await supabase
    .from("desk_staff_campus_scope")
    .select("campuses")
    .eq("profile_id", profileId)
    .eq("dashboard", dashboard)
    .maybeSingle();
  const ids = filterCampuses(Array.isArray(data?.campuses) ? data.campuses.map(String) : []);
  if (ids.length) return ids;
  // Grant without scope row — allow all until Team assigns (matches SQL helper / library parity).
  return [...CAMPUS_OPTIONS];
}

/** Load campus scopes for every campus-using desk in one query. */
export async function loadCampusScopes(
  supabase: SupabaseClient,
  profileId: string,
  role: string | null | undefined,
  dashboards: CampusDashboardId[] = ["admin", "admissions", "accounts", "academics", "store", "library"],
): Promise<CampusScopeMap> {
  const out: CampusScopeMap = {};
  if (role === "admin") {
    for (const dashboard of dashboards) out[dashboard] = [...CAMPUS_OPTIONS];
    return out;
  }
  const { data } = await supabase
    .from("desk_staff_campus_scope")
    .select("dashboard, campuses")
    .eq("profile_id", profileId)
    .in("dashboard", dashboards);
  const byDesk = new Map<string, CampusId[]>();
  for (const row of data || []) {
    const dashboard = String(row.dashboard || "");
    if (!isCampusDashboard(dashboard)) continue;
    byDesk.set(dashboard, filterCampuses(Array.isArray(row.campuses) ? row.campuses.map(String) : []));
  }
  for (const dashboard of dashboards) {
    const ids = byDesk.get(dashboard);
    out[dashboard] = ids?.length ? ids : [...CAMPUS_OPTIONS];
  }
  return out;
}

/** Restrict a campus filter choice to the staffer's allowed set. Empty wanted = all allowed. */
export function resolveCampusFilter(allowed: readonly CampusId[], wanted?: string | null): CampusId[] {
  if (!wanted) return [...allowed];
  if (!isCampusIdSafe(wanted)) return [...allowed];
  return allowed.includes(wanted as CampusId) ? [wanted as CampusId] : [...allowed];
}

function isCampusIdSafe(value: string): boolean {
  return (CAMPUS_OPTIONS as readonly string[]).includes(value);
}

/** Apply campus scope to a PostgREST query that has a `campus` column. */
export function applyCampusFilter<T extends { in: (column: string, values: readonly string[]) => T }>(
  query: T,
  campuses: readonly string[],
): T {
  if (!campuses.length) return query.in("campus", ["__none__"]);
  if (campuses.length === CAMPUS_OPTIONS.length) return query;
  return query.in("campus", campuses);
}
