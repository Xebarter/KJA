import {
  DASHBOARD_META,
  DASHBOARDS,
  dashboardForPath,
  hasDashboard,
  loadGrants,
  pageAllowed,
  pathAllowed,
  shellPages,
  type DashboardId,
  type Grant,
} from "@/lib/dashboard-access";
import { requestPath } from "@/lib/request-path";
import { createClient } from "@/lib/supabase/server";

/** Explicit pages win. Otherwise the current URL is checked when it belongs to this dashboard. */
export async function dashboardAllowed(grants: Grant[], dashboard: DashboardId, pages: readonly string[]) {
  if (!hasDashboard(grants, dashboard)) return false;
  if (pages.length) return pageAllowed(grants, dashboard, pages);
  const path = await requestPath();
  if (!path) return true;
  if (dashboardForPath(path) !== dashboard) return true;
  return pathAllowed(grants, dashboard, path);
}

/** Nav filter for a dashboard shell. Unknown sessions keep the full menu; middleware still blocks the URL. */
export async function loadShellAccess(dashboard: DashboardId) {
  const open = {
    pages: null as string[] | null,
    home: DASHBOARD_META[dashboard].href,
    canSwitch: false,
    fullAdmin: true,
    known: false,
    grants: [] as Grant[],
  };
  const supabase = await createClient();
  if (!supabase) return open;
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return open;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const grants = await loadGrants(supabase, user.id, profile?.role);
  const shell = shellPages(grants, dashboard);
  return { ...shell, grants, known: true };
}

export function officeLinks(grants: Grant[]) {
  return DASHBOARDS.filter((dashboard) => dashboard !== "admin" && hasDashboard(grants, dashboard)).map((dashboard) => DASHBOARD_META[dashboard]);
}
