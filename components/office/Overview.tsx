import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { MigrationHint, OfficeNotice } from "@/components/office/ui";
import { loadPeople } from "@/lib/admin-applications";
import { APPLICATION_STATUSES, OPEN_STATUSES, PIPELINE, formatDateTime, initials, timeAgo } from "@/lib/applications";
import type { requireOffice } from "@/lib/office";
import { OFFICE, SCHOOL_CLASSES, currentTermStart, daysToBirthday, fetchAll, studentAge } from "@/lib/students";

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

const ACTIVITY: Record<string, { icon: string; tone: string }> = {
  note: { icon: "fa-regular fa-comment", tone: "blue" },
  edit: { icon: "fa-solid fa-pen", tone: "slate" },
  class: { icon: "fa-solid fa-chalkboard", tone: "teal" },
  status: { icon: "fa-solid fa-arrows-rotate", tone: "violet" },
  enrol: { icon: "fa-solid fa-user-plus", tone: "green" },
  promotion: { icon: "fa-solid fa-stairs", tone: "gold" },
  review: { icon: "fa-solid fa-clipboard-check", tone: "gold" },
  assign: { icon: "fa-solid fa-user-check", tone: "teal" },
  visit: { icon: "fa-regular fa-calendar", tone: "violet" },
};

const TZ = "Africa/Kampala";
const nf = (value: number) => value.toLocaleString("en-GB");
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
const dayKey = (value: Date | string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(value));
const clock = (value: string) => new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const stagger = (index: number) => ({ "--i": Math.min(index, 12) }) as React.CSSProperties;

function Card({ id, icon, tone, title, description, action, badge, children }: {
  id: string;
  icon: string;
  tone: string;
  title: string;
  description?: React.ReactNode;
  action?: { href: string; label: string };
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={`oov-card is-${tone}`} aria-labelledby={`${id}-title`}>
      <header className="oov-card-head">
        <span className="oov-card-icon" aria-hidden="true"><i className={`fa-solid ${icon}`} /></span>
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {badge}
        {action ? (
          <Link className="oov-card-link" href={action.href}>
            {action.label} <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </Link>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function Quiet({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <p className="oov-quiet">
      <span aria-hidden="true"><i className={`fa-solid ${icon}`} /></span>
      {children}
    </p>
  );
}

export type OfficeSession = Exclude<Awaited<ReturnType<typeof requireOffice>>, { error: string }>;

/** The office home page for a signed-in member of staff. */
export async function Overview({ supabase, user, profile }: OfficeSession) {
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
  const noSex = total - boys - girls;
  const termStart = currentTermStart(now);
  const newThisTerm = students.filter((row) => row.enrolled_on && row.enrolled_on >= termStart).length;
  const newThisYear = students.filter((row) => row.enrolled_on && row.enrolled_on >= yearStart).length;
  const review = students.filter((row) => row.needs_review).length;
  const missingDob = students.filter((row) => !row.date_of_birth).length;
  const missingHouse = students.filter((row) => !row.house).length;
  const medical = students.filter((row) => row.medical_notes).length;
  const staffChildren = students.filter((row) => row.staff_child).length;
  const contactsCount = contactsToCheck.count ?? 0;
  const familyCount = families.count ?? 0;

  const classes = SCHOOL_CLASSES.map((entry) => {
    const rows = students.filter((row) => row.class_code === entry.code);
    const streams = [...new Set(rows.map((row) => row.stream).filter(Boolean))].sort();
    const classBoys = rows.filter((row) => row.sex === "M").length;
    const classGirls = rows.filter((row) => row.sex === "F").length;
    return { ...entry, streams, total: rows.length, boys: classBoys, girls: classGirls, other: rows.length - classBoys - classGirls };
  });
  const classMax = Math.max(1, ...classes.map((entry) => entry.total));
  const sections = [
    { key: "nursery", label: "Nursery", rows: classes.filter((entry) => entry.section === "nursery") },
    { key: "primary", label: "Primary", rows: classes.filter((entry) => entry.section === "primary") },
  ].map((section) => ({ ...section, total: section.rows.reduce((sum, entry) => sum + entry.total, 0) }));
  const unplaced = total - sections.reduce((sum, section) => sum + section.total, 0);

  // Applications
  const counts = new Map<string, number>();
  for (const app of apps) counts.set(app.status, (counts.get(app.status) ?? 0) + 1);
  const open = apps.filter((app) => OPEN_STATUSES.includes(app.status as (typeof OPEN_STATUSES)[number])).length;
  const received = counts.get("received") ?? 0;
  const receivedThisWeek = apps.filter((app) => new Date(app.created_at).getTime() >= now.getTime() - 7 * 86_400_000).length;
  const toEnrol = apps.filter((app) => app.status === "offered" || (app.status === "enrolled" && "student_id" in app && !app.student_id));
  const weekAhead = now.getTime() + 7 * 86_400_000;
  const visits = apps
    .filter((app) => app.status === "visit_scheduled" && app.visit_at && new Date(app.visit_at).getTime() >= now.getTime() - 3600_000 && new Date(app.visit_at).getTime() <= weekAhead)
    .sort((a, b) => String(a.visit_at).localeCompare(String(b.visit_at)));
  const todayKey = dayKey(now);
  const yesterdayKey = dayKey(new Date(now.getTime() - 86_400_000));
  const visitsToday = visits.filter((app) => dayKey(app.visit_at!) === todayKey);
  const oldestWaiting = apps.filter((app) => app.status === "received").map((app) => app.created_at).sort()[0];
  const stages = PIPELINE.map((value) => {
    const status = APPLICATION_STATUSES.find((entry) => entry.value === value)!;
    return { ...status, count: counts.get(value) ?? 0 };
  });
  const stageMax = Math.max(1, ...stages.map((stage) => stage.count));
  const sideStages = APPLICATION_STATUSES.filter((status) => !PIPELINE.includes(status.value)).map((status) => ({ ...status, count: counts.get(status.value) ?? 0 }));

  // Birthdays
  const birthdays = students
    .map((row) => ({ ...row, days: daysToBirthday(row.date_of_birth, now) }))
    .filter((row) => row.days !== null && row.days <= 7)
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
    .slice(0, 8);

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
  const days: { label: string; items: Activity[] }[] = [];
  for (const entry of feed) {
    const key = dayKey(entry.created_at);
    const label = key === todayKey
      ? "Today"
      : key === yesterdayKey ? "Yesterday" : new Date(entry.created_at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
    const last = days[days.length - 1];
    if (last?.label === label) last.items.push(entry);
    else days.push({ label, items: [entry] });
  }

  // Header
  const firstName = (profile.full_name || user.email || "").split(/[\s@]/)[0];
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: TZ }).format(now));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ });
  const qualityTotal = review + contactsCount;
  const waitingFor = (since: string | undefined) => {
    const waited = since ? Math.floor((now.getTime() - new Date(since).getTime()) / 86_400_000) : 0;
    return waited < 1 ? "Arrived today" : `Oldest has waited ${waited} ${waited === 1 ? "day" : "days"}`;
  };

  const todo = [
    {
      label: "New applications",
      note: received ? waitingFor(oldestWaiting) : "Nothing new to review",
      count: received,
      icon: "fa-envelope-open-text",
      href: `${OFFICE}/applications?status=received`,
    },
    {
      label: "Visits today",
      note: visitsToday.length
        ? `Next at ${clock(visitsToday[0].visit_at!)}`
        : visits.length ? `${visits.length} more booked this week` : "None booked this week",
      count: visitsToday.length,
      icon: "fa-calendar-check",
      href: `${OFFICE}/visits`,
    },
    {
      label: "Ready to enrol",
      note: toEnrol.length ? "Offers to add to the register" : "Every offer is on the register",
      count: toEnrol.length,
      icon: "fa-graduation-cap",
      href: `${OFFICE}/applications?status=offered`,
    },
    {
      label: "Records to fix",
      note: qualityTotal ? "Import warnings and contacts to check" : "The register is in good shape",
      count: qualityTotal,
      icon: "fa-clipboard-check",
      href: `${OFFICE}/data-quality`,
    },
  ];
  const waiting = todo.reduce((sum, item) => sum + item.count, 0);

  const checks = [
    { label: "Import warnings", count: review, icon: "fa-triangle-exclamation", href: `${OFFICE}/data-quality#review` },
    { label: "Contacts to check", count: contactsCount, icon: "fa-address-book", href: `${OFFICE}/data-quality#contacts` },
    { label: "No date of birth", count: missingDob, icon: "fa-cake-candles", href: `${OFFICE}/data-quality?missing=dob#missing` },
    { label: "Sex not recorded", count: noSex, icon: "fa-venus-mars", href: `${OFFICE}/data-quality?missing=sex#missing` },
    { label: "No house", count: missingHouse, icon: "fa-house-flag", href: `${OFFICE}/students?house=none` },
  ];
  const gaps = checks.filter((check) => check.count).length;

  return (
    <div className="app-page ofc-page oov-page">
      <PageHeader
        kicker="Admissions office"
        icon="fa-building-user"
        title={`${greeting}${firstName ? `, ${firstName}` : ""}`}
        description={
          <>
            <span className="oov-today"><i className="fa-regular fa-calendar" aria-hidden="true" /> {today}</span>
            <strong>{nf(total)}</strong> pupils on the register from <strong>{nf(familyCount)}</strong> families, and <strong>{nf(open)}</strong> applications in progress.
          </>
        }
        actions={
          <>
            <Link className="admin-hero-btn is-primary" href={`${OFFICE}/students/new`}><i className="fa-solid fa-user-plus" aria-hidden="true" /> Enrol a student</Link>
            <Link className="admin-hero-btn" href={`${OFFICE}/applications`}><i className="fa-solid fa-file-signature" aria-hidden="true" /> Applications</Link>
            <Link className="admin-hero-btn" href={`${OFFICE}/reports`}><i className="fa-solid fa-chart-column" aria-hidden="true" /> Reports</Link>
          </>
        }
      >
        <nav className="oov-todo" aria-label="Needs you today">
          <p className="oov-todo-head">
            <span>Needs you today</span>
            {waiting ? <em>{nf(waiting)} to do</em> : <em className="is-clear"><i className="fa-solid fa-check" aria-hidden="true" /> All caught up</em>}
          </p>
          <ul>
            {todo.map((item) => (
              <li key={item.label}>
                <Link href={item.href} className={item.count ? "" : "is-done"}>
                  <span className="oov-todo-icon" aria-hidden="true"><i className={`fa-solid ${item.count ? item.icon : "fa-check"}`} /></span>
                  <span className="oov-todo-text">
                    <strong>{item.label}</strong>
                    <small>{item.note}</small>
                  </span>
                  <em>{nf(item.count)}</em>
                  <i className="fa-solid fa-chevron-right oov-todo-go" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </PageHeader>

      <section className="oov-stats" aria-label="The register at a glance">
        <Link className="oov-stat is-navy" href={`${OFFICE}/students`}>
          <span className="oov-stat-top"><span>Pupils on the register</span><i className="fa-solid fa-children" aria-hidden="true" /></span>
          <strong>{nf(total)}</strong>
          <span className="oov-mix" role="img" aria-label={`${boys} boys, ${girls} girls${noSex ? `, ${noSex} not recorded` : ""}`}>
            <span className="is-boy" style={{ flexGrow: boys }} />
            <span className="is-girl" style={{ flexGrow: girls }} />
            {noSex ? <span className="is-none" style={{ flexGrow: noSex }} /> : null}
          </span>
          <small><i className="oov-key is-boy" aria-hidden="true" /> {nf(boys)} boys <i className="oov-key is-girl" aria-hidden="true" /> {nf(girls)} girls</small>
        </Link>
        <Link className="oov-stat is-green" href={`${OFFICE}/students?sort=newest`}>
          <span className="oov-stat-top"><span>New this term</span><i className="fa-solid fa-user-plus" aria-hidden="true" /></span>
          <strong>{nf(newThisTerm)}</strong>
          <small>{newThisTerm ? <span className="oov-up"><i className="fa-solid fa-arrow-trend-up" aria-hidden="true" /> {nf(newThisYear)}</span> : nf(newThisYear)} joined so far this year</small>
        </Link>
        <Link className="oov-stat is-red" href={`${OFFICE}/applications`}>
          <span className="oov-stat-top"><span>Open applications</span><i className="fa-solid fa-file-signature" aria-hidden="true" /></span>
          <strong>{nf(open)}</strong>
          <small>{nf(receivedThisWeek)} received in the last 7 days</small>
        </Link>
        <Link className="oov-stat is-gold" href={`${OFFICE}/families`}>
          <span className="oov-stat-top"><span>Families</span><i className="fa-solid fa-people-roof" aria-hidden="true" /></span>
          <strong>{nf(familyCount)}</strong>
          <small>{familyCount ? `About ${(total / familyCount).toFixed(1)} pupils per family` : "No families on file yet"}</small>
        </Link>
      </section>

      <div className="oov-grid">
        <div className="oov-col">
          <Card
            id="pipeline"
            icon="fa-filter"
            tone="red"
            title="Admissions pipeline"
            description={`${nf(apps.length)} applications so far. Pick a stage to see who is in it.`}
            action={{ href: `${OFFICE}/applications`, label: "Applications" }}
          >
            <ol className="oov-funnel">
              {stages.map((stage, index) => (
                <li key={stage.value} style={stagger(index)}>
                  <Link href={`${OFFICE}/applications?status=${stage.value}`} className={`is-${stage.tone}${stage.count ? "" : " is-zero"}`}>
                    <span className="oov-funnel-label"><i className="oov-dot" aria-hidden="true" /> {stage.label}</span>
                    <strong>{nf(stage.count)}</strong>
                    <span className="oov-funnel-bar" aria-hidden="true"><span style={{ width: `${(stage.count / stageMax) * 100}%` }} /></span>
                    <small>{pct(stage.count, apps.length)}% of all</small>
                  </Link>
                </li>
              ))}
            </ol>
            <p className="oov-funnel-side">
              <span>Off the main path</span>
              {sideStages.map((stage) => (
                <Link key={stage.value} href={`${OFFICE}/applications?status=${stage.value}`} className={`is-${stage.tone}`}>
                  <i className="oov-dot" aria-hidden="true" /> {stage.label} <strong>{nf(stage.count)}</strong>
                </Link>
              ))}
            </p>
          </Card>

          <Card
            id="classes"
            icon="fa-chalkboard-user"
            tone="navy"
            title="Enrolment by class"
            description="Active pupils in each class, split into boys and girls."
            action={{ href: `${OFFICE}/classes`, label: "All classes" }}
          >
            <div className="oov-sections">
              {sections.map((section) => (
                <div key={section.key} className={`oov-section is-${section.key}`}>
                  <span>{section.label}</span>
                  <strong>{nf(section.total)}</strong>
                  <small>{pct(section.total, total)}%</small>
                </div>
              ))}
              <p className="oov-legend">
                <span><i className="oov-key is-boy" aria-hidden="true" /> Boys</span>
                <span><i className="oov-key is-girl" aria-hidden="true" /> Girls</span>
                {noSex ? <span><i className="oov-key is-none" aria-hidden="true" /> Not recorded</span> : null}
              </p>
            </div>
            {sections.map((section) => (
              <div key={section.key} className="oov-classes">
                <p className="oov-classes-head">{section.label}</p>
                <ul>
                  {section.rows.map((entry, index) => (
                    <li key={entry.code} style={stagger(index)}>
                      <Link
                        href={`${OFFICE}/classes/${entry.code}`}
                        title={`${entry.name}: ${entry.boys} boys, ${entry.girls} girls${entry.other ? `, ${entry.other} not recorded` : ""}`}
                      >
                        <span className="oov-class-name">
                          <strong>{entry.code}</strong>
                          <small>{entry.name}{entry.streams.length ? ` · ${entry.streams.join(", ")}` : ""}</small>
                        </span>
                        <span className="oov-class-track" aria-hidden="true">
                          <span className="oov-class-fill" style={{ width: `${(entry.total / classMax) * 100}%` }}>
                            {entry.boys ? <span className="is-boy" style={{ flexGrow: entry.boys }} /> : null}
                            {entry.girls ? <span className="is-girl" style={{ flexGrow: entry.girls }} /> : null}
                            {entry.other ? <span className="is-none" style={{ flexGrow: entry.other }} /> : null}
                          </span>
                        </span>
                        <span className="oov-class-total">{nf(entry.total)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {unplaced > 0 ? (
              <p className="oov-note">
                <i className="fa-solid fa-circle-info" aria-hidden="true" /> {nf(unplaced)} {unplaced === 1 ? "pupil has" : "pupils have"} no class yet.{" "}
                <Link href={`${OFFICE}/data-quality?missing=class#missing`}>Assign a class</Link>
              </p>
            ) : null}
          </Card>

          <Card id="activity" icon="fa-clock-rotate-left" tone="slate" title="Recent activity" description="The latest changes to students and applications across the office.">
            {days.length ? (
              <div className="oov-feed">
                {days.map((day) => (
                  <section key={day.label} className="oov-feed-day" aria-label={day.label}>
                    <h3>{day.label}</h3>
                    <ol>
                      {day.items.map((entry, index) => {
                        const actor = entry.actor_id ? people.get(entry.actor_id) ?? "Former staff" : "System";
                        const subject = entry.student_id
                          ? { name: studentNames.get(entry.student_id) ?? "A student", href: `${OFFICE}/students/${entry.student_id}` }
                          : { name: appNames.get(entry.application_id ?? "") ?? "An application", href: `${OFFICE}/applications/${entry.application_id}` };
                        const kind = ACTIVITY[entry.kind] ?? { icon: "fa-solid fa-circle", tone: "slate" };
                        return (
                          <li key={`${entry.student_id ? "s" : "a"}-${entry.id}`} style={stagger(index)}>
                            <span className={`oov-feed-icon is-${kind.tone}`} aria-hidden="true"><i className={kind.icon} /></span>
                            <div>
                              <p className="oov-feed-who"><Link href={subject.href}>{subject.name}</Link> <span>by {actor}</span></p>
                              <p className="oov-feed-body">{entry.body}</p>
                            </div>
                            <time dateTime={entry.created_at} title={formatDateTime(entry.created_at)}>
                              {day.label === "Today" ? timeAgo(entry.created_at, now.getTime()) : clock(entry.created_at)}
                            </time>
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                ))}
              </div>
            ) : (
              <Quiet icon="fa-clock-rotate-left">Nothing yet. Changes to students and applications will show up here.</Quiet>
            )}
          </Card>
        </div>

        <div className="oov-col">
          <Card
            id="visits"
            icon="fa-calendar-check"
            tone="violet"
            title="School visits"
            description="Booked for the next 7 days."
            action={{ href: `${OFFICE}/visits`, label: "All visits" }}
          >
            {visits.length ? (
              <ul className="oov-list">
                {visits.slice(0, 5).map((app, index) => {
                  const isToday = dayKey(app.visit_at!) === todayKey;
                  const date = new Date(app.visit_at!);
                  return (
                    <li key={app.id} className={isToday ? "is-today" : ""} style={stagger(index)}>
                      <span className="oov-date" aria-hidden="true">
                        <small>{date.toLocaleDateString("en-GB", { month: "short", timeZone: TZ })}</small>
                        <strong>{date.toLocaleDateString("en-GB", { day: "numeric", timeZone: TZ })}</strong>
                      </span>
                      <div>
                        <Link href={`${OFFICE}/applications/${app.id}`}>{app.child_name || "Unnamed child"}</Link>
                        <small>{[app.grade, app.campus, app.parent_name].filter(Boolean).join(" · ") || "No details yet"}</small>
                      </div>
                      <span className="oov-when">
                        <strong>{isToday ? "Today" : date.toLocaleDateString("en-GB", { weekday: "short", timeZone: TZ })}</strong>
                        {clock(app.visit_at!)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Quiet icon="fa-calendar">No visits booked this week.</Quiet>
            )}
            {visits.length > 5 ? <Link className="oov-more" href={`${OFFICE}/visits`}>{nf(visits.length - 5)} more this week <i className="fa-solid fa-arrow-right" aria-hidden="true" /></Link> : null}
          </Card>

          <Card
            id="enrol"
            icon="fa-graduation-cap"
            tone="green"
            title="Ready to enrol"
            description="Offers not yet on the register."
            action={toEnrol.length ? { href: `${OFFICE}/applications?status=offered`, label: "Offers" } : undefined}
          >
            {toEnrol.length ? (
              <ul className="oov-list">
                {toEnrol.slice(0, 5).map((app, index) => (
                  <li key={app.id} style={stagger(index)}>
                    <span className="oov-initials" aria-hidden="true">{initials(app.child_name || "?")}</span>
                    <div>
                      <Link href={`${OFFICE}/applications/${app.id}#enrol`}>{app.child_name || "Unnamed child"}</Link>
                      <small>{[app.grade, app.campus, app.parent_name].filter(Boolean).join(" · ") || "No details yet"}</small>
                    </div>
                    <Link className="oov-btn" href={`${OFFICE}/students/new?application=${app.id}`}>
                      <i className="fa-solid fa-user-plus" aria-hidden="true" /> Enrol
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Quiet icon="fa-circle-check">Every offer has been added to the register.</Quiet>
            )}
            {toEnrol.length > 5 ? <Link className="oov-more" href={`${OFFICE}/applications?status=offered`}>{nf(toEnrol.length - 5)} more to enrol <i className="fa-solid fa-arrow-right" aria-hidden="true" /></Link> : null}
          </Card>

          <Card
            id="birthdays"
            icon="fa-cake-candles"
            tone="gold"
            title="Birthdays this week"
            description="Pupils celebrating in the next 7 days."
            action={{ href: `${OFFICE}/birthdays`, label: "Calendar" }}
          >
            {birthdays.length ? (
              <ul className="oov-list">
                {birthdays.map((row, index) => (
                  <li key={row.id} className={row.days === 0 ? "is-today" : ""} style={stagger(index)}>
                    <span className="oov-cake" aria-hidden="true"><i className="fa-solid fa-cake-candles" /></span>
                    <div>
                      <Link href={`${OFFICE}/students/${row.id}`}>{row.full_name}</Link>
                      <small>
                        {row.class_code ?? "No class"}{row.stream ? ` ${row.stream}` : ""} · turns {(studentAge(row.date_of_birth, now) ?? 0) + (row.days === 0 ? 0 : 1)}
                      </small>
                    </div>
                    <span className="oov-pill">{row.days === 0 ? "Today" : row.days === 1 ? "Tomorrow" : `In ${row.days} days`}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Quiet icon="fa-cake-candles">No birthdays in the next week.</Quiet>
            )}
          </Card>

          <Card
            id="health"
            icon="fa-heart-pulse"
            tone="teal"
            title="Register health"
            description="Records that need a second look."
            badge={gaps ? null : <span className="oov-badge is-clear"><i className="fa-solid fa-check" aria-hidden="true" /> All clear</span>}
            action={{ href: `${OFFICE}/data-quality`, label: "Review" }}
          >
            <ul className="oov-checks">
              {checks.map((check) => (
                <li key={check.label}>
                  <Link href={check.href} className={check.count ? "is-open" : "is-done"}>
                    <span className="oov-check-icon" aria-hidden="true"><i className={`fa-solid ${check.count ? check.icon : "fa-check"}`} /></span>
                    <span className="oov-check-label">{check.label}</span>
                    <em>{check.count ? nf(check.count) : "None"}</em>
                  </Link>
                </li>
              ))}
            </ul>
            <ul className="oov-facts">
              <li><Link href={`${OFFICE}/medical`}><strong>{nf(medical)}</strong><span>Medical notes</span></Link></li>
              <li><Link href={`${OFFICE}/students?staff=1`}><strong>{nf(staffChildren)}</strong><span>Staff children</span></Link></li>
              <li><Link href={`${OFFICE}/reports#leavers`}><strong>{nf(leavers.count ?? 0)}</strong><span>Left this year</span></Link></li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
