import Link from "next/link";
import { redirect } from "next/navigation";
import { leaveDashboard } from "@/app/choose-dashboard/actions";
import { DASHBOARD_META, DASHBOARDS, homeForGrants, landingPath, loadGrants } from "@/lib/dashboard-access";
import { createClient } from "@/lib/supabase/server";
import "./choose.css";

export const metadata = { title: "Choose a desk" };

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

  const name = profile?.full_name?.trim() || user.email || "there";
  const greeting = profile?.full_name?.trim() ? firstName(profile.full_name) : name;
  const ordered = DASHBOARDS.map((id) => grants.find((g) => g.dashboard === id)).filter(Boolean) as typeof grants;

  return (
    <main className="cd">
      <div className="cd-stage" aria-hidden="true">
        <div className="cd-photo" />
        <div className="cd-veil" />
        <div className="cd-glow" />
      </div>

      <div className="cd-panel">
        <div className="cd-brand">
          <img src="/web-app-manifest-512x512.png" alt="" width={72} height={72} />
          <p className="cd-kicker">Staff desks</p>
        </div>

        <h1>Choose a desk</h1>
        <p className="cd-lede">Hi {greeting}.</p>

        <ul className="cd-list">
          {ordered.map((grant, index) => {
            const meta = DASHBOARD_META[grant.dashboard];
            const href = landingPath(grants, grant.dashboard) ?? meta.href;
            const limited = grant.pages.length > 0;
            return (
              <li key={grant.dashboard} style={{ ["--i" as string]: index }}>
                <Link href={href} className={`cd-tile is-${grant.dashboard}`}>
                  <span className="cd-tile-icon" aria-hidden="true">
                    <i className={`fa-solid ${meta.icon}`} />
                  </span>
                  <span className="cd-tile-copy">
                    <strong>{meta.label}</strong>
                    <small>{limited ? `${grant.pages.length} page${grant.pages.length === 1 ? "" : "s"}` : meta.description}</small>
                  </span>
                  <span className="cd-tile-go" aria-hidden="true">
                    <i className="fa-solid fa-arrow-right" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        <form action={leaveDashboard} className="cd-out">
          <button type="submit">Sign out</button>
        </form>
      </div>
    </main>
  );
}
