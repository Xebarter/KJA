import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { PrintButton } from "@/components/office/client";
import { OfficeNotice } from "@/components/office/ui";
import { VisitPlanner, type VisitRow, type VisitView, type WaitingRow } from "@/components/office/VisitPlanner";
import { loadPeople } from "@/lib/admin-applications";
import { CAMPUS_OPTIONS, ageFrom } from "@/lib/applications";
import { requireOffice } from "@/lib/office";
import { OFFICE, pick } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";
import "./visits.css";

export const metadata = { title: "School visits" };

const VIEWS: VisitView[] = ["upcoming", "today", "past"];

export default async function VisitsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!supabaseConfigured()) {
    return <OfficeNotice title="School visits" heading="Connect Supabase"><p>Add your Supabase keys to <code>.env.local</code>.</p></OfficeNotice>;
  }
  const [auth, params] = await Promise.all([requireOffice(), searchParams]);
  if ("error" in auth) return <OfficeNotice title="School visits" icon="fa-lock" heading="Not available"><p>{auth.error}</p></OfficeNotice>;
  const { supabase } = auth;

  const view = VIEWS.find((entry) => entry === pick(params, "range")) ?? "upcoming";
  const campus = CAMPUS_OPTIONS.includes(pick(params, "campus")) ? pick(params, "campus") : "";

  const [{ data, error }, { data: waitingData }] = await Promise.all([
    supabase
      .from("applications")
      .select("id, child_name, child_dob, parent_name, phone, email, grade, campus, visit_at, assigned_to")
      .eq("status", "visit_scheduled")
      .not("visit_at", "is", null)
      .order("visit_at", { ascending: true })
      .limit(500),
    supabase
      .from("applications")
      .select("id, child_name, parent_name, email, grade, campus, created_at")
      .eq("status", "reviewing")
      .is("visit_at", null)
      .order("created_at", { ascending: true })
      .limit(20),
  ]);
  if (error) return <OfficeNotice title="School visits" heading="Visits could not be loaded"><p>{error.message}</p></OfficeNotice>;

  const people = await loadPeople(supabase, (data || []).map((visit) => visit.assigned_to));
  const visits: VisitRow[] = (data || []).map((visit) => ({
    id: visit.id,
    child: visit.child_name?.trim() || "Unnamed child",
    age: ageFrom(visit.child_dob) || null,
    parent: visit.parent_name?.trim() || null,
    phone: visit.phone?.trim() || null,
    email: visit.email?.trim() || null,
    grade: visit.grade,
    campus: visit.campus,
    at: new Date(visit.visit_at as string).toISOString(),
    host: visit.assigned_to ? people.get(visit.assigned_to) ?? null : null,
  }));
  const waiting: WaitingRow[] = (waitingData || []).map((app) => ({
    id: app.id,
    child: app.child_name?.trim() || "Unnamed child",
    parent: app.parent_name?.trim() || null,
    email: app.email?.trim() || null,
    grade: app.grade,
    campus: app.campus,
    applied: app.created_at,
  }));

  return (
    <div className="app-page ofc-page vst-page">
      <PageHeader
        kicker="Admissions"
        icon="fa-calendar-check"
        title="School visits"
        description="Families booked to tour the school and meet the team. Remind them before the day, then record how the visit went."
        actions={
          <>
            <PrintButton label="Print agenda" />
            <Link className="admin-hero-btn" href={`${OFFICE}/applications?status=visit_scheduled&view=list`}>
              <i className="fa-solid fa-list" aria-hidden="true" /> As a list
            </Link>
          </>
        }
      />
      <VisitPlanner
        visits={visits}
        waiting={waiting}
        campuses={CAMPUS_OPTIONS}
        initialView={view}
        initialCampus={campus}
        serverNow={Date.now()}
        printedBy={auth.profile.full_name || auth.profile.email || "Admissions office"}
      />
    </div>
  );
}
