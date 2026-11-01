import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { leaveDashboard } from "@/app/choose-dashboard/actions";
import { DeskButtons } from "@/app/choose-dashboard/DeskButtons";
import { DesktopChrome } from "@/components/DesktopChrome";
import { DASHBOARD_META, DASHBOARDS, homeForGrants, landingPath, loadGrants } from "@/lib/dashboard-access";
import { createClient } from "@/lib/supabase/server";
import "./choose.css";

export const metadata = { title: "Desks" };

function firstName(full: string) {
  const part = full.trim().split(/\s+/)[0];
  return part || full;
}

export default async function ChooseDashboardPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/admin/login");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
  if (profile?.role === "student") redirect("/student");
  if (profile?.role === "staff") redirect("/teacher");
  const grants = await loadGrants(supabase, user.id, profile?.role);
  if (grants.length === 0) redirect("/account");
  if (grants.length === 1) redirect(homeForGrants(grants));

  const greeting = profile?.full_name?.trim() ? firstName(profile.full_name) : null;
  const ordered = DASHBOARDS.map((id) => grants.find((g) => g.dashboard === id)).filter(Boolean) as typeof grants;
  const desktop = (await cookies()).get("kja-desktop")?.value === "1";
  const desks = ordered.map((grant) => {
    const meta = DASHBOARD_META[grant.dashboard];
    return {
      id: grant.dashboard,
      label: meta.label,
      href: landingPath(grants, grant.dashboard) ?? meta.href,
      icon: meta.icon,
    };
  });

  return (
    <>
      {desktop ? <DesktopChrome desk="Desks" /> : null}
      <main className={`cd${desktop ? " is-desktop" : ""}`}>
        <div className="cd-stage" aria-hidden="true">
          <div className="cd-photo" />
          <div className="cd-veil" />
          <div className="cd-glow" />
        </div>

        <div className="cd-panel">
          <div className="cd-brand">
            <img src="/web-app-manifest-512x512.png" alt="" width={56} height={56} />
            {greeting ? <p className="cd-hello">Hi, {greeting}</p> : null}
          </div>

          <DeskButtons desks={desks} />

          <form action={leaveDashboard} className="cd-out">
            <button type="submit">Sign out</button>
          </form>
        </div>
      </main>
    </>
  );
}
