import type { SupabaseClient } from "@supabase/supabase-js";
import { contentGroups } from "@/lib/admin";
import { ACADEMICS_BASE, academicsNav } from "@/lib/academics-nav";
import { ACCOUNTS_BASE, accountsNav } from "@/lib/accounts-nav";
import { OFFICE_BASE, officeNav } from "@/lib/office-nav";
import { safeNext } from "@/lib/safe-next";

export const DASHBOARDS = ["admin", "admissions", "accounts", "academics"] as const;
export type DashboardId = (typeof DASHBOARDS)[number];

export type Grant = { dashboard: DashboardId; pages: string[] };

export type DashboardPage = {
  id: string;
  label: string;
  group: string;
  icon: string;
  href: string;
  paths: string[];
  exact?: boolean;
};

export const DASHBOARD_META: Record<DashboardId, { label: string; description: string; href: string; icon: string }> = {
  admin: {
    label: "Admin",
    description: "Website, applications, communications, and school settings.",
    href: "/admin",
    icon: "fa-user-shield",
  },
  admissions: {
    label: "Admissions",
    description: "Applications, enrolment, visits, and the student register.",
    href: OFFICE_BASE,
    icon: "fa-building-user",
  },
  accounts: {
    label: "Accounts",
    description: "Fees, invoices, payments, and expenses.",
    href: ACCOUNTS_BASE,
    icon: "fa-calculator",
  },
  academics: {
    label: "Academics",
    description: "Classes, attendance, assessments, and report cards.",
    href: ACADEMICS_BASE,
    icon: "fa-graduation-cap",
  },
};

const CONTENT_SECTIONS: { id: string; label: string; group: string; icon: string; keys: readonly string[] }[] = [
  { id: "content-website", label: "Website", group: "Website", icon: "fa-globe", keys: ["pages", "campuses", "campus_sections"] },
  { id: "content-people", label: "People", group: "People", icon: "fa-chalkboard-user", keys: ["teachers"] },
  { id: "content-events", label: "Events & gallery", group: "Events & gallery", icon: "fa-calendar-days", keys: ["events", "gallery_items"] },
  { id: "content-alumni", label: "Alumni", group: "Alumni", icon: "fa-user-graduate", keys: ["alumni_events", "alumni_profiles", "alumni_photos"] },
  { id: "content-careers", label: "Careers", group: "Careers", icon: "fa-briefcase", keys: ["vacancies"] },
];

/** CMS table → admin page id. Tables outside the sidebar still belong to the closest section. */
export const CONTENT_TABLE_PAGE: Record<string, string> = {
  pages: "content-website",
  campuses: "content-website",
  campus_sections: "content-website",
  testimonials: "content-website",
  teachers: "content-people",
  events: "content-events",
  gallery_items: "content-events",
  news: "stories",
  posts: "stories",
  alumni_news: "content-alumni",
  alumni_events: "content-alumni",
  alumni_stories: "content-alumni",
  alumni_profiles: "content-alumni",
  alumni_photos: "content-alumni",
  vacancies: "content-careers",
};

export const CONTENT_KEY_PAGE: Record<string, string> = Object.fromEntries(
  CONTENT_SECTIONS.flatMap((section) => section.keys.map((key) => [key, section.id])),
);

function navPages(
  base: string,
  items: { href: string; label: string; icon: string; group: string }[],
  extras: Record<string, string[]> = {},
): DashboardPage[] {
  return items.map((item) => {
    const id = item.href === base ? "overview" : item.href.slice(base.length + 1);
    return {
      id,
      label: item.label,
      group: item.group,
      icon: item.icon,
      href: item.href,
      paths: [item.href, ...(extras[id] ?? [])],
      exact: item.href === base,
    };
  });
}

const ADMIN_PAGES: DashboardPage[] = [
  { id: "overview", label: "Dashboard", group: "Office", icon: "fa-gauge-high", href: "/admin", paths: ["/admin"], exact: true },
  { id: "applications", label: "Applications", group: "Admissions", icon: "fa-file-signature", href: "/admin/applications", paths: ["/admin/applications"] },
  { id: "students", label: "Students", group: "People", icon: "fa-user-graduate", href: "/admin/students", paths: ["/admin/students"] },
  { id: "communications", label: "Communications", group: "Inbox", icon: "fa-comments", href: "/admin/communications", paths: ["/admin/communications"] },
  { id: "enquiries", label: "Enquiries", group: "Inbox", icon: "fa-envelope", href: "/admin/inbox/enquiries", paths: ["/admin/inbox/enquiries", "/admin/inbox/messages"] },
  { id: "stories", label: "Stories", group: "Website", icon: "fa-newspaper", href: "/admin/stories", paths: ["/admin/stories"] },
  { id: "newsletter", label: "Newsletter", group: "Website", icon: "fa-paper-plane", href: "/admin/inbox/newsletter", paths: ["/admin/inbox/newsletter"] },
  { id: "images", label: "Images", group: "Website", icon: "fa-images", href: "/admin/images", paths: ["/admin/images"] },
  { id: "settings", label: "Site settings", group: "Website", icon: "fa-sliders", href: "/admin/settings", paths: ["/admin/settings"] },
  ...CONTENT_SECTIONS.map((section) => ({
    id: section.id,
    label: section.label,
    group: section.group,
    icon: section.icon,
    href: `/admin/content/${section.keys[0]}`,
    paths: section.keys.map((key) => `/admin/content/${key}`),
  })),
];

export const DASHBOARD_PAGES: Record<DashboardId, DashboardPage[]> = {
  admin: ADMIN_PAGES,
  admissions: navPages(OFFICE_BASE, officeNav),
  accounts: navPages(ACCOUNTS_BASE, accountsNav, { students: [`${ACCOUNTS_BASE}/families`] }),
  academics: navPages(ACADEMICS_BASE, academicsNav, { classes: [`${ACADEMICS_BASE}/students`] }),
};

export function isDashboardId(value: string): value is DashboardId {
  return (DASHBOARDS as readonly string[]).includes(value);
}

export function contentGroupPage(title: string) {
  return CONTENT_SECTIONS.find((section) => section.group === title)?.id ?? null;
}

export function visibleContentKeys(pages: string[] | null) {
  return contentGroups.map((group) => ({
    ...group,
    keys: group.keys.filter((key) => pages === null || (CONTENT_KEY_PAGE[key] && pages.includes(CONTENT_KEY_PAGE[key]))),
  })).filter((group) => group.keys.length > 0);
}

export function legacyGrants(role: string | null | undefined): Grant[] {
  if (role === "admin") return DASHBOARDS.map((dashboard) => ({ dashboard, pages: [] }));
  if (role === "admissions" || role === "accounts" || role === "academics") return [{ dashboard: role, pages: [] }];
  return [];
}

export function isFullAdmin(grants: Grant[]) {
  return DASHBOARDS.every((dashboard) => grants.some((grant) => grant.dashboard === dashboard && grant.pages.length === 0));
}

export function roleForGrants(grants: Grant[]): "admin" | "admissions" | "accounts" | "academics" | "officer" {
  if (isFullAdmin(grants)) return "admin";
  const ids = [...new Set(grants.map((grant) => grant.dashboard))];
  if (ids.length === 1 && ids[0] !== "admin") return ids[0];
  return "officer";
}

export function hasDashboard(grants: Grant[], dashboard: DashboardId) {
  return grants.some((grant) => grant.dashboard === dashboard);
}

export function pageAllowed(grants: Grant[], dashboard: DashboardId, page: string | readonly string[]) {
  const grant = grants.find((row) => row.dashboard === dashboard);
  if (!grant) return false;
  if (grant.pages.length === 0) return true;
  const pages = typeof page === "string" ? [page] : page;
  return pages.some((id) => grant.pages.includes(id));
}

export function dashboardForPath(pathname: string): DashboardId | null {
  const path = pathname.split("?")[0];
  if (path === "/admin" || path.startsWith("/admin/")) return "admin";
  if (path === OFFICE_BASE || path.startsWith(`${OFFICE_BASE}/`)) return "admissions";
  if (path === ACCOUNTS_BASE || path.startsWith(`${ACCOUNTS_BASE}/`)) return "accounts";
  if (path === ACADEMICS_BASE || path.startsWith(`${ACADEMICS_BASE}/`)) return "academics";
  return null;
}

export function pageIdForPath(dashboard: DashboardId, pathname: string) {
  const path = pathname.split("?")[0].replace(/\/$/, "") || "/";
  let best: { id: string; length: number } | null = null;
  for (const page of DASHBOARD_PAGES[dashboard]) {
    for (const prefix of page.paths) {
      const hit = page.exact ? path === prefix : path === prefix || path.startsWith(`${prefix}/`);
      if (!hit) continue;
      if (!best || prefix.length > best.length) best = { id: page.id, length: prefix.length };
    }
  }
  return best?.id ?? null;
}

export function pathAllowed(grants: Grant[], dashboard: DashboardId, pathname: string) {
  const path = pathname.split("?")[0];
  if (dashboard === "admin" && (path === "/admin/team" || path.startsWith("/admin/team/"))) return isFullAdmin(grants);
  if (path.includes("/api/")) return hasDashboard(grants, dashboard);
  const grant = grants.find((row) => row.dashboard === dashboard);
  if (!grant) return false;
  if (grant.pages.length === 0) return true;
  const page = pageIdForPath(dashboard, path);
  if (!page) return false;
  return grant.pages.includes(page);
}

export function landingPath(grants: Grant[], dashboard: DashboardId) {
  const grant = grants.find((row) => row.dashboard === dashboard);
  if (!grant) return null;
  const pages = DASHBOARD_PAGES[dashboard];
  if (grant.pages.length === 0) return pages[0]?.href ?? DASHBOARD_META[dashboard].href;
  return pages.find((page) => grant.pages.includes(page.id))?.href ?? null;
}

export function homeForGrants(grants: Grant[]) {
  // One desk → go straight there. Several → choose after sign-in.
  // Never fall through to the parent portal — that route is parents only.
  const open = DASHBOARDS.filter((dashboard) => hasDashboard(grants, dashboard));
  if (open.length === 0) return "/choose-dashboard";
  if (open.length === 1) return landingPath(grants, open[0]) ?? "/choose-dashboard";
  return "/choose-dashboard";
}

export function destinationForGrants(grants: Grant[], next?: string | null) {
  const wanted = safeNext(next, "");
  // Parent portal is not a staff destination.
  if (wanted && wanted !== "/account" && !wanted.startsWith("/account/") && wanted !== "/") {
    if (wanted === "/choose-dashboard" && grants.length > 1) return wanted;
    const dashboard = dashboardForPath(wanted);
    if (dashboard && pathAllowed(grants, dashboard, wanted)) return wanted;
  }
  return homeForGrants(grants);
}

export function grantSummary(grant: Grant) {
  const meta = DASHBOARD_META[grant.dashboard];
  if (grant.pages.length === 0) return `${meta.label} · all pages`;
  const count = grant.pages.length;
  return `${meta.label} · ${count} page${count === 1 ? "" : "s"}`;
}

export function shellPages(grants: Grant[], dashboard: DashboardId) {
  const grant = grants.find((row) => row.dashboard === dashboard);
  return {
    pages: !grant || grant.pages.length === 0 ? (grant ? null : []) : grant.pages,
    home: landingPath(grants, dashboard) ?? DASHBOARD_META[dashboard].href,
    canSwitch: grants.length > 1,
    fullAdmin: isFullAdmin(grants),
  };
}

export function pageVisible(pages: string[] | null, id: string) {
  return pages === null || pages.includes(id);
}

/** Read grants for the signed-in user. A missing table falls back to the single role they already have. */
export async function loadGrants(supabase: SupabaseClient, userId: string, role: string | null | undefined): Promise<Grant[]> {
  if (role === "admin") return legacyGrants("admin");
  const { data, error } = await supabase.from("dashboard_access").select("dashboard, pages").eq("profile_id", userId);
  if (error || !data?.length) return legacyGrants(role);
  const grants: Grant[] = [];
  for (const row of data) {
    const dashboard = String(row.dashboard || "");
    if (!isDashboardId(dashboard)) continue;
    const pages = Array.isArray(row.pages)
      ? row.pages.map((page) => {
          const id = String(page);
          // Legacy admin "messages" grant → Enquiries page id.
          return id === "messages" ? "enquiries" : id;
        }).filter(Boolean)
      : [];
    grants.push({ dashboard, pages });
  }
  return grants.length ? grants : legacyGrants(role);
}

const PAGE_IDS: Record<DashboardId, Set<string>> = {
  admin: new Set(DASHBOARD_PAGES.admin.map((page) => page.id)),
  admissions: new Set(DASHBOARD_PAGES.admissions.map((page) => page.id)),
  accounts: new Set(DASHBOARD_PAGES.accounts.map((page) => page.id)),
  academics: new Set(DASHBOARD_PAGES.academics.map((page) => page.id)),
};

/** Form fields: `full=1`, or `grant=accounts:*` / `grant=accounts:invoices`. */
export function grantsFromForm(formData: FormData): { error?: string; grants?: Grant[] } {
  if (String(formData.get("full") || "") === "1") {
    return { grants: DASHBOARDS.map((dashboard) => ({ dashboard, pages: [] })) };
  }
  const chosen = new Map<DashboardId, Set<string> | null>();
  for (const raw of formData.getAll("grant")) {
    const value = String(raw);
    const split = value.indexOf(":");
    const dashboard = split < 0 ? value : value.slice(0, split);
    const page = split < 0 ? "*" : value.slice(split + 1);
    if (!isDashboardId(dashboard)) continue;
    if (page === "*") {
      chosen.set(dashboard, null);
      continue;
    }
    if (!PAGE_IDS[dashboard].has(page)) continue;
    if (chosen.get(dashboard) === null) continue;
    const pages = chosen.get(dashboard) ?? new Set<string>();
    pages.add(page);
    chosen.set(dashboard, pages);
  }
  const grants: Grant[] = [];
  for (const [dashboard, pages] of chosen) {
    if (pages === null) {
      grants.push({ dashboard, pages: [] });
      continue;
    }
    const known = DASHBOARD_PAGES[dashboard];
    const list = [...pages];
    grants.push({ dashboard, pages: list.length >= known.length ? [] : list });
  }
  if (!grants.length) return { error: "Choose at least one dashboard or page." };
  return { grants };
}
