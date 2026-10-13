import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { PrintButton } from "@/components/office/client";
import { Empty, Kpis, OfficeNotice, Panel, type Kpi } from "@/components/office/ui";
import { VisitActions } from "@/components/office/VisitActions";
import { loadPeople } from "@/lib/admin-applications";
import { CAMPUS_OPTIONS, ageFrom, toKampalaInput, whatsappLink } from "@/lib/applications";
import { requireOffice } from "@/lib/office";
import { OFFICE, pick } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "School visits" };

type Visit = {
  id: string;
  child_name: string | null;
  child_dob: string | null;
  parent_name: string | null;
  phone: string | null;
  email: string | null;
  grade: string | null;
  campus: string | null;
  status: string;
  visit_at: string;
  assigned_to: string | null;
};

const RANGES = [
  { value: "upcoming", label: "Upcoming" },
  { value: "today", label: "Today" },
  { value: "past", label: "Awaiting outcome" },
] as const;

const ZONE = "Africa/Kampala";
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(new Date(iso));
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: ZONE });

function dayHeading(key: string, today: string, tomorrow: string) {
  const label = new Date(`${key}T12:00:00+03:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: ZONE });
  if (key === today) return `Today · ${label}`;
  if (key === tomorrow) return `Tomorrow · ${label}`;
  return label;
}

export default async function VisitsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!supabaseConfigured()) {
    return <OfficeNotice title="School visits" heading="Connect Supabase"><p>Add your Supabase keys to <code>.env.local</code>.</p></OfficeNotice>;
  }
  const auth = await requireOffice();
  if ("error" in auth) return <OfficeNotice title="School visits" icon="fa-lock" heading="Not available"><p>{auth.error}</p></OfficeNotice>;
  const { supabase } = auth;
  const params = await searchParams;
  const range = RANGES.find((entry) => entry.value === pick(params, "range"))?.value ?? "upcoming";
  const campus = CAMPUS_OPTIONS.includes(pick(params, "campus")) ? pick(params, "campus") : "";

  const [{ data, error }, { data: unbookedData }] = await Promise.all([
    supabase
      .from("applications")
      .select("id, child_name, child_dob, parent_name, phone, email, grade, campus, status, visit_at, assigned_to")
      .eq("status", "visit_scheduled")
      .not("visit_at", "is", null)
      .order("visit_at", { ascending: true })
      .limit(500),
    supabase
      .from("applications")
      .select("id, child_name, grade, campus, created_at")
      .eq("status", "reviewing")
      .is("visit_at", null)
      .order("created_at", { ascending: true })
      .limit(12),
  ]);
  if (error) return <OfficeNotice title="School visits" heading="Visits could not be loaded"><p>{error.message}</p></OfficeNotice>;

  const now = Date.now();
  const today = dayKey(new Date(now).toISOString());
  const tomorrow = dayKey(new Date(now + 86_400_000).toISOString());
  const weekEnd = now + 7 * 86_400_000;
  const all = (data || []) as Visit[];
  const upcoming = all.filter((visit) => new Date(visit.visit_at).getTime() >= now - 2 * 3600_000);
  const past = all.filter((visit) => new Date(visit.visit_at).getTime() < now - 2 * 3600_000);
  const todays = all.filter((visit) => dayKey(visit.visit_at) === today);

  let rows = range === "past" ? [...past].reverse() : range === "today" ? todays : upcoming;
  if (campus) rows = rows.filter((visit) => visit.campus === campus);
  const people = await loadPeople(supabase, rows.map((visit) => visit.assigned_to));

  const days = new Map<string, Visit[]>();
  for (const visit of rows) {
    const key = dayKey(visit.visit_at);
    days.set(key, [...(days.get(key) ?? []), visit]);
  }

  const href = (changes: { range?: string; campus?: string }) => {
    const next = new URLSearchParams();
    const r = changes.range ?? range;
    const c = changes.campus ?? campus;
    if (r !== "upcoming") next.set("range", r);
    if (c) next.set("campus", c);
    const query = next.toString();
    return `${OFFICE}/visits${query ? `?${query}` : ""}`;
  };

  const kpis: Kpi[] = [
    { label: "Today", value: todays.length, icon: "fa-calendar-day", note: todays.length ? `First at ${timeLabel(todays[0].visit_at)}` : "No visits today", href: href({ range: "today" }) },
    { label: "Next 7 days", value: upcoming.filter((visit) => new Date(visit.visit_at).getTime() <= weekEnd).length, icon: "fa-calendar-week", note: `${upcoming.length} booked in total`, href: href({ range: "upcoming" }) },
    { label: "Awaiting outcome", value: past.length, icon: "fa-clipboard-question", note: past.length ? "Visit done, decision needed" : "All visits followed up", href: href({ range: "past" }) },
    { label: "Need a visit", value: (unbookedData || []).length, icon: "fa-calendar-plus", note: "In review without a visit", href: `${OFFICE}/applications?status=reviewing` },
  ];

  return (
    <div className="app-page ofc-page">
      <PageHeader
        kicker="Admissions"
        icon="fa-calendar-check"
        title="School visits"
        description="Families booked to tour the school and meet the team. Record the outcome once the visit has happened."
        actions={
          <>
            <PrintButton label="Print agenda" />
            <Link className="admin-hero-btn" href={`${OFFICE}/applications?status=visit_scheduled&view=list`}><i className="fa-solid fa-list" aria-hidden="true" /> As a list</Link>
          </>
        }
      />

      <Kpis items={kpis} />

      <div className="ofc-toolbar no-print">
        <nav className="apl-tabs" aria-label="Which visits">
          {RANGES.map((entry) => (
            <Link key={entry.value} href={href({ range: entry.value })} className={range === entry.value ? "active" : ""} aria-current={range === entry.value ? "page" : undefined}>
              {entry.label}
              <em>{entry.value === "past" ? past.length : entry.value === "today" ? todays.length : upcoming.length}</em>
            </Link>
          ))}
        </nav>
        <div className="ofc-chips" aria-label="Campus">
          <Link href={href({ campus: "" })} className={campus ? "" : "is-on"}>All campuses</Link>
          {CAMPUS_OPTIONS.map((option) => (
            <Link key={option} href={href({ campus: option })} className={campus === option ? "is-on" : ""}>{option}</Link>
          ))}
        </div>
      </div>

      <div className="dash-grid ofc-grid-wide">
        <div className="dash-col">
          {days.size ? (
            [...days.entries()].map(([key, visits]) => (
              <Panel key={key} title={dayHeading(key, today, tomorrow)} description={`${visits.length} visit${visits.length === 1 ? "" : "s"}`} className="ofc-day">
                <ul className="ofc-agenda">
                  {visits.map((visit) => {
                    const whatsapp = whatsappLink(visit.phone);
                    const age = ageFrom(visit.child_dob);
                    const owner = visit.assigned_to ? people.get(visit.assigned_to) : null;
                    const isPast = new Date(visit.visit_at).getTime() < now - 2 * 3600_000;
                    return (
                      <li key={visit.id}>
                        <time className="ofc-agenda-time" dateTime={visit.visit_at}>{timeLabel(visit.visit_at)}</time>
                        <div className="ofc-agenda-main">
                          <p>
                            <Link href={`${OFFICE}/applications/${visit.id}`}><strong>{visit.child_name || "Unnamed child"}</strong></Link>
                            {visit.campus ? <span className="ofc-tag">{visit.campus}</span> : null}
                          </p>
                          <small>
                            {[visit.grade, age, visit.parent_name, owner ? `Hosted by ${owner}` : null].filter(Boolean).join(" · ")}
                          </small>
                          <span className="ofc-agenda-contact">
                            {visit.phone ? <a href={`tel:${visit.phone.replace(/\s/g, "")}`}><i className="fa-solid fa-phone" aria-hidden="true" /> {visit.phone}</a> : null}
                            {whatsapp ? <a href={whatsapp} target="_blank" rel="noreferrer"><i className="fa-brands fa-whatsapp" aria-hidden="true" /> WhatsApp</a> : null}
                            {visit.email ? <a href={`mailto:${visit.email}`}><i className="fa-regular fa-envelope" aria-hidden="true" /> Email</a> : null}
                          </span>
                        </div>
                        <div className="no-print">
                          <VisitActions id={visit.id} visitAt={toKampalaInput(visit.visit_at)} past={isPast} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            ))
          ) : (
            <section className="dash-panel ofc-panel">
              <Empty icon="fa-calendar" title={range === "past" ? "Every visit has an outcome" : "No visits booked"}>
                {range === "past"
                  ? "Nothing is waiting for a decision after a visit."
                  : "Book a visit from an application by moving it to Visit booked."}
              </Empty>
            </section>
          )}
        </div>

        <div className="dash-col no-print">
          <Panel title="Waiting for a visit" description="Applications in review with no visit booked yet." action={{ href: `${OFFICE}/applications?status=reviewing`, label: "In review" }}>
            {(unbookedData || []).length ? (
              <ul className="ofc-list">
                {(unbookedData || []).map((app) => (
                  <li key={app.id}>
                    <span className="ofc-mono"><i className="fa-regular fa-calendar-plus" aria-hidden="true" /></span>
                    <div>
                      <Link href={`${OFFICE}/applications/${app.id}`}>{app.child_name || "Unnamed child"}</Link>
                      <small>{[app.grade, app.campus].filter(Boolean).join(" · ") || "No class given"}</small>
                    </div>
                    <Link className="app-link-btn" href={`${OFFICE}/applications/${app.id}`}>Book</Link>
                  </li>
                ))}
              </ul>
            ) : <p className="app-muted">Every application in review has a visit booked.</p>}
          </Panel>
          <Panel title="By campus" description="Upcoming visits at each campus.">
            <ul className="ofc-health">
              {CAMPUS_OPTIONS.map((option) => (
                <li key={option}>
                  <Link href={href({ campus: option, range: "upcoming" })}>
                    <span>{option}</span>
                    <strong>{upcoming.filter((visit) => visit.campus === option).length}</strong>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
