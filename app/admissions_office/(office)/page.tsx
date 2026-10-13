import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { BarChart, Kpis, MigrationHint, OfficeNotice, Panel, Sex, type Kpi } from "@/components/office/ui";
import { loadPeople } from "@/lib/admin-applications";
import { APPLICATION_STATUSES, OPEN_STATUSES, formatDateTime, initials, timeAgo } from "@/lib/applications";
import { requireOffice } from "@/lib/office";
import {
  OFFICE,
  SCHOOL_CLASSES,
  currentTermStart,
  daysToBirthday,
  fetchAll,
  studentAge,
} from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Overview" };

type Row = {
  id: string;
  full_name: string;
  sex: string | null;
  class_code: string | null;
  section: string | null;
  stream: string | null;
  date_of_birth: string | null;
  enrolled_on: string | null;
  staff_child: boolean;
  medical_notes: string | null;
  needs_review: boolean;
  house: string | null;
};

type AppRow = {
  id: string;
  child_name: string | null;
  parent_name: string | null;
  grade: string | null;
  campus: string | null;
  status: string;
  created_at: string;
  visit_at: string | null;
  student_id?: string | null;
};

type Activity = { id: string; actor_id: string | null; kind: string; body: string; created_at: string; student_id?: string; application_id?: string };

const ACTIVITY_ICONS: Record<string, string> = {
  note: "fa-regular fa-comment",
  edit: "fa-solid fa-pen",
  class: "fa-solid fa-chalkboard",
  status: "fa-solid fa-arrows-rotate",
  enrol: "fa-solid fa-user-plus",
  promotion: "fa-solid fa-stairs",
  review: "fa-solid fa-clipboard-check",
  assign: "fa-solid fa-user-check",
  visit: "fa-regular fa-calendar",
};

function visitLabel(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kampala" });
}

export default async function OverviewPage() {
  if (!supabaseConfigured()) {
    return <OfficeNotice title="Overview" heading="Connect Supabase"><p>Add your Supabase keys to <code>.env.local</code> to use the admissions office.</p></OfficeNotice>;
  }
  const auth = await requireOffice();
  if ("error" in auth) return <OfficeNotice title="Overview" icon="fa-lock" heading="Not available"><p>{auth.error}</p></OfficeNotice>;
  const { supabase, user, profile } = auth;
  const now = new Date();
  const yearStart = `${now.getFullYear()}-01-01`;

  let students: Row[];
  try {
    students = await fetchAll<Row>((from, to) =>
      supabase.from("student_directory")
        .select("id, full_name, sex, class_code, section, stream, date_of_birth, enrolled_on, staff_child, medical_notes, needs_review, house")
        .eq("status", "active").order("id").range(from, to));
  } catch (error) {
    return <OfficeNotice title="Overview" heading="The student register could not be loaded"><MigrationHint message={(error as Error).message} /></OfficeNotice>;
  }

  const [appsResult, leavers, contactsToCheck, studentActivity, appActivity, families] = await Promise.all([
    supabase.from("applications").select("id, child_name, parent_name, grade, campus, status, created_at, visit_at, student_id"),
    supabase.from("students").select("id", { count: "exact", head: true }).neq("status", "active").gte("left_on", yearStart),
    supabase.from("family_contacts").select("id", { count: "exact", head: true }).eq("needs_check", true),
    supabase.from("student_activity").select("id, actor_id, kind, body, created_at, student_id").order("created_at", { ascending: false }).limit(12),
    supabase.from("application_activity").select("id, actor_id, kind, body, created_at, application_id").order("created_at", { ascending: false }).limit(8),
    supabase.from("families").select("id", { count: "exact", head: true }),
  ]);
  let apps = (appsResult.data || []) as AppRow[];
  if (appsResult.error) {
    const fallback = await supabase.from("applications").select("id, child_name, parent_name, grade, campus, status, created_at, visit_at");
    apps = (fallback.data || []) as AppRow[];
  }

  // Register figures
  const total = students.length;
  const boys = students.filter((row) => row.sex === "M").length;
  const girls = students.filter((row) => row.sex === "F").length;
  const termStart = currentTermStart(now);
  const newThisTerm = students.filter((row) => row.enrolled_on && row.enrolled_on >= termStart).length;
  const newThisYear = students.filter((row) => row.enrolled_on && row.enrolled_on >= yearStart).length;
  const nursery = students.filter((row) => row.section === "nursery").length;
  const primary = students.filter((row) => row.section === "primary").length;
  const review = students.filter((row) => row.needs_review).length;
  const missingDob = students.filter((row) => !row.date_of_birth).length;
  const missingHouse = students.filter((row) => !row.house).length;
  const medical = students.filter((row) => row.medical_notes).length;

  const byClass = SCHOOL_CLASSES.map((entry) => {
    const rows = students.filter((row) => row.class_code === entry.code);
    const streams = [...new Set(rows.map((row) => row.stream).filter(Boolean))].sort();
    return {
      label: entry.code,
      sub: `${entry.name}${streams.length ? ` · ${streams.join(", ")}` : ""}`,
      href: `${OFFICE}/classes/${entry.code}`,
      segments: [
        { value: rows.filter((row) => row.sex === "M").length, tone: "boy", label: "boys" },
        { value: rows.filter((row) => row.sex === "F").length, tone: "girl", label: "girls" },
        { value: rows.filter((row) => row.sex !== "M" && row.sex !== "F").length, tone: "none", label: "not recorded" },
      ],
    };
  });

  // Applications
  const counts = new Map<string, number>();
  for (const app of apps) counts.set(app.status, (counts.get(app.status) ?? 0) + 1);
  const open = apps.filter((app) => OPEN_STATUSES.includes(app.status as (typeof OPEN_STATUSES)[number])).length;
  const toEnrol = apps.filter((app) => app.status === "offered" || (app.status === "enrolled" && "student_id" in app && !app.student_id));
  const weekAhead = now.getTime() + 7 * 86_400_000;
  const visits = apps
    .filter((app) => app.status === "visit_scheduled" && app.visit_at && new Date(app.visit_at).getTime() >= now.getTime() - 3600_000 && new Date(app.visit_at).getTime() <= weekAhead)
    .sort((a, b) => String(a.visit_at).localeCompare(String(b.visit_at)));
  const oldestWaiting = apps.filter((app) => app.status === "received").map((app) => app.created_at).sort()[0];
  const pipeline = APPLICATION_STATUSES.map((status) => ({ ...status, count: counts.get(status.value) ?? 0 })).filter((status) => status.count);

  // Birthdays
  const birthdays = students
    .map((row) => ({ ...row, days: daysToBirthday(row.date_of_birth, now) }))
    .filter((row) => row.days !== null && row.days <= 7)
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
    .slice(0, 10);

  // Activity feed
  const studentNames = new Map(students.map((row) => [row.id, row.full_name]));
  const missing = ((studentActivity.data || []) as Activity[]).map((entry) => entry.student_id!).filter((id) => !studentNames.has(id));
  if (missing.length) {
    const { data } = await supabase.from("students").select("id, full_name").in("id", [...new Set(missing)]);
    for (const row of data || []) studentNames.set(row.id, row.full_name);
  }
  const appNames = new Map(apps.map((app) => [app.id, app.child_name || "Unnamed child"]));
  const feed = [
    ...((studentActivity.data || []) as Activity[]),
    ...((appActivity.data || []) as Activity[]),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 12);
  const people = await loadPeople(supabase, feed.map((entry) => entry.actor_id));

  const firstName = (profile.full_name || user.email || "").split(/[\s@]/)[0];
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Kampala" }).format(now));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const qualityTotal = review + (contactsToCheck.count ?? 0);

  const kpis: Kpi[] = [
    { label: "Active students", value: total, icon: "fa-children", note: `${boys} boys · ${girls} girls`, href: `${OFFICE}/students` },
    { label: "New this term", value: newThisTerm, icon: "fa-user-plus", note: `${newThisYear} so far this year`, href: `${OFFICE}/students?sort=newest`, up: newThisTerm > 0 },
    {
      label: "Awaiting review", value: counts.get("received") ?? 0, icon: "fa-envelope-open-text",
      note: oldestWaiting ? `Oldest waiting ${timeAgo(oldestWaiting, now.getTime()).replace(" ago", "")}` : "No new applications",
      href: `${OFFICE}/applications?status=received`,
    },
    { label: "Ready to enrol", value: toEnrol.length, icon: "fa-graduation-cap", note: toEnrol.length ? "Offers to add to the register" : "Nothing waiting", href: `${OFFICE}/applications?status=offered` },
  ];

  return (
    <div className="app-page ofc-page">
      <PageHeader
        kicker="Admissions office"
        icon="fa-building-user"
        title={`${greeting}${firstName ? `, ${firstName}` : ""}`}
        description={<>Here&apos;s the admissions picture today: <strong>{total.toLocaleString("en-GB")}</strong> pupils on the register in <strong>{(families.count ?? 0).toLocaleString("en-GB")}</strong> families, and <strong>{open}</strong> open applications.</>}
        actions={
          <>
            <Link className="admin-hero-btn is-primary" href={`${OFFICE}/students/new`}><i className="fa-solid fa-user-plus" aria-hidden="true" /> Enrol a student</Link>
            <Link className="admin-hero-btn" href={`${OFFICE}/applications`}><i className="fa-solid fa-file-signature" aria-hidden="true" /> Applications</Link>
            <Link className="admin-hero-btn" href={`${OFFICE}/reports`}><i className="fa-solid fa-chart-column" aria-hidden="true" /> Reports</Link>
          </>
        }
      >
        <div className="apl-pipeline">
          <p className="apl-pipeline-head">
            <span>Admissions pipeline</span>
            <strong>{apps.length.toLocaleString("en-GB")} applications</strong>
          </p>
          <div className="admin-pipeline is-dark" role="img" aria-label={pipeline.map((status) => `${status.label}: ${status.count}`).join(", ") || "No applications yet"}>
            {pipeline.map((status) => <span key={status.value} className={`admin-seg admin-seg-${status.tone}`} style={{ flexGrow: status.count }} />)}
          </div>
          <dl className="apl-pipeline-figures">
            <div><dt>Open</dt><dd>{open}</dd></div>
            <div><dt>Visits</dt><dd>{counts.get("visit_scheduled") ?? 0}</dd></div>
            <div><dt>Offered</dt><dd>{counts.get("offered") ?? 0}</dd></div>
          </dl>
        </div>
      </PageHeader>

      <Kpis items={kpis} />

      <div className="dash-grid">
        <div className="dash-col">
          <Panel
            title="Enrolment by class"
            description={`${nursery} in nursery · ${primary} in primary`}
            action={{ href: `${OFFICE}/classes`, label: "All classes" }}
          >
            <div className="ofc-split" role="img" aria-label={`Nursery ${nursery}, primary ${primary}`}>
              <span className="is-nursery" style={{ flexGrow: nursery || 1 }}>Nursery {total ? Math.round((nursery / total) * 100) : 0}%</span>
              <span className="is-primary" style={{ flexGrow: primary || 1 }}>Primary {total ? Math.round((primary / total) * 100) : 0}%</span>
            </div>
            <BarChart
              label="Active students in each class, split by sex"
              rows={byClass}
              legend={[{ tone: "boy", label: "Boys" }, { tone: "girl", label: "Girls" }, { tone: "none", label: "Not recorded" }]}
            />
          </Panel>

          <Panel title="Recent activity" description="Changes to students and applications across the office.">
            {feed.length ? (
              <ol className="ofc-feed">
                {feed.map((entry) => {
                  const actor = entry.actor_id ? people.get(entry.actor_id) ?? "Former staff" : "System";
                  const subject = entry.student_id
                    ? { name: studentNames.get(entry.student_id) ?? "A student", href: `${OFFICE}/students/${entry.student_id}` }
                    : { name: appNames.get(entry.application_id ?? "") ?? "An application", href: `${OFFICE}/applications/${entry.application_id}` };
                  return (
                    <li key={`${entry.student_id ? "s" : "a"}-${entry.id}`}>
                      <span className="ofc-feed-icon"><i className={ACTIVITY_ICONS[entry.kind] ?? "fa-solid fa-circle"} aria-hidden="true" /></span>
                      <div>
                        <p><strong>{actor}</strong> · <Link href={subject.href}>{subject.name}</Link></p>
                        <p className="ofc-feed-body">{entry.body}</p>
                      </div>
                      <time dateTime={entry.created_at} title={formatDateTime(entry.created_at)}>{timeAgo(entry.created_at, now.getTime())}</time>
                    </li>
                  );
                })}
              </ol>
            ) : <p className="app-muted">Nothing yet. Changes to students and applications will show up here.</p>}
          </Panel>
        </div>

        <div className="dash-col">
          <Panel title="School visits" description="Booked for the next 7 days." action={{ href: `${OFFICE}/visits`, label: "All visits" }}>
            {visits.length ? (
              <ul className="ofc-list">
                {visits.slice(0, 6).map((app) => (
                  <li key={app.id}>
                    <span className="ofc-date"><strong>{new Date(app.visit_at!).toLocaleDateString("en-GB", { day: "numeric", timeZone: "Africa/Kampala" })}</strong>{new Date(app.visit_at!).toLocaleDateString("en-GB", { month: "short", timeZone: "Africa/Kampala" })}</span>
                    <div>
                      <Link href={`${OFFICE}/applications/${app.id}`}>{app.child_name || "Unnamed child"}</Link>
                      <small>{visitLabel(app.visit_at!)}{app.campus ? ` · ${app.campus}` : ""}{app.grade ? ` · ${app.grade}` : ""}</small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="app-muted">No visits booked this week.</p>}
          </Panel>

          <Panel title="Ready to enrol" description="Offers and enrolled applications not yet on the register." action={{ href: `${OFFICE}/applications?status=offered`, label: "Offers" }}>
            {toEnrol.length ? (
              <ul className="ofc-list">
                {toEnrol.slice(0, 6).map((app) => (
                  <li key={app.id}>
                    <span className="ofc-mono">{initials(app.child_name || "?")}</span>
                    <div>
                      <Link href={`${OFFICE}/applications/${app.id}#enrol`}>{app.child_name || "Unnamed child"}</Link>
                      <small>{[app.grade, app.campus, app.parent_name].filter(Boolean).join(" · ")}</small>
                    </div>
                    <Link className="app-link-btn" href={`${OFFICE}/students/new?application=${app.id}`}>Enrol</Link>
                  </li>
                ))}
              </ul>
            ) : <p className="app-muted">Every offer has been added to the register.</p>}
          </Panel>

          <Panel title="Birthdays this week" description="Active pupils celebrating in the next 7 days.">
            {birthdays.length ? (
              <ul className="ofc-list">
                {birthdays.map((row) => (
                  <li key={row.id}>
                    <span className={`ofc-cake${row.days === 0 ? " is-today" : ""}`}><i className="fa-solid fa-cake-candles" aria-hidden="true" /></span>
                    <div>
                      <Link href={`${OFFICE}/students/${row.id}`}>{row.full_name}</Link>
                      <small>
                        {row.class_code}{row.stream ? ` ${row.stream}` : ""} · turns {(studentAge(row.date_of_birth, now) ?? 0) + (row.days === 0 ? 0 : 1)}
                      </small>
                    </div>
                    <span className="ofc-when">{row.days === 0 ? "Today" : row.days === 1 ? "Tomorrow" : `In ${row.days} days`}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="app-muted">No birthdays in the next week.</p>}
          </Panel>

          <Panel title="Register health" description="Records that need a second look." action={{ href: `${OFFICE}/data-quality`, label: "Review" }}>
            <ul className="ofc-health">
              <li><Link href={`${OFFICE}/data-quality#review`}><span>Import warnings</span><strong className={review ? "is-warn" : ""}>{review}</strong></Link></li>
              <li><Link href={`${OFFICE}/data-quality#contacts`}><span>Contacts to check</span><strong className={contactsToCheck.count ? "is-warn" : ""}>{contactsToCheck.count ?? 0}</strong></Link></li>
              <li><Link href={`${OFFICE}/data-quality#missing`}><span>No date of birth</span><strong className={missingDob ? "is-warn" : ""}>{missingDob}</strong></Link></li>
              <li><Link href={`${OFFICE}/students?house=none`}><span>No house</span><strong className={missingHouse ? "is-warn" : ""}>{missingHouse}</strong></Link></li>
              <li><Link href={`${OFFICE}/medical`}><span>Medical notes on file</span><strong>{medical}</strong></Link></li>
              <li><Link href={`${OFFICE}/reports#leavers`}><span>Left this year</span><strong>{leavers.count ?? 0}</strong></Link></li>
            </ul>
            {qualityTotal ? null : <p className="ofc-health-ok"><i className="fa-solid fa-circle-check" aria-hidden="true" /> The register is in good shape.</p>}
          </Panel>

          <Panel title="Staff children" description="Pupils whose parent works at KJA.">
            <p className="ofc-big">
              <strong>{students.filter((row) => row.staff_child).length}</strong>
              <Link href={`${OFFICE}/students?staff=1`}>See the list <i className="fa-solid fa-arrow-right" aria-hidden="true" /></Link>
            </p>
            <p className="app-muted ofc-tiny">
              Sex not recorded for {students.filter((row) => row.sex !== "M" && row.sex !== "F").length} pupils. <Sex sex="M" /> boys <Sex sex="F" /> girls.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
