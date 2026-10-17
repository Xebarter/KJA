import Link from "next/link";
import { ClassQueue } from "@/components/academics/ClassQueue";
import { PageHeader } from "@/components/admin/PageHeader";
import { AcademicsNotice } from "@/components/academics/ui";
import {
  ACADEMICS_BASE,
  classLabel,
  dateKindLabel,
  groupPupils,
  kampalaLong,
  kampalaToday,
  loadCurrentTerm,
  missingAcademicsSchema,
  streamOf,
} from "@/lib/academics";
import { loadAcademicPicture, type AcademicPicture } from "@/lib/academics-insights";
import { loadDayMarks, loadRoll } from "@/lib/academics-roll";
import type { requireAcademics } from "@/lib/academics";
import { className } from "@/lib/students";

type Session = Exclude<Awaited<ReturnType<typeof requireAcademics>>, { error: string }>;

type Pupil = { id: string; full_name: string; sex: string | null; class_code: string | null; stream: string | null };

const nf = (value: number) => value.toLocaleString("en-GB");

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : (parts[0] || "").slice(0, 2);
  return letters.toUpperCase();
}

function Card({ id, icon, tone, title, description, action, children }: {
  id: string;
  icon: string;
  tone: string;
  title: string;
  description?: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className={`acd-card is-${tone}`} aria-labelledby={`${id}-title`}>
      <header className="acd-card-head">
        <span className="acd-card-icon" aria-hidden="true"><i className={`fa-solid ${icon}`} /></span>
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {action ? <Link className="acd-card-link" href={action.href}>{action.label} <i className="fa-solid fa-arrow-right" aria-hidden="true" /></Link> : null}
      </header>
      {children}
    </section>
  );
}

function Quiet({ icon, children }: { icon: string; children: React.ReactNode }) {
  return <p className="acd-quiet"><span aria-hidden="true"><i className={`fa-solid ${icon}`} /></span>{children}</p>;
}

type WorkItem = { label: string; note: string; count: number; href: string; icon: string };
type SnapItem = { label: string; value: string; note: string; href: string };
export type OfficeHomeProps = {
  greeting: string;
  dateLabel: string;
  termLabel: string | null;
  pupils: number;
  primary: { href: string; icon: string; label: string };
  secondary: { href: string; icon: string; label: string };
  notices: React.ReactNode;
  registerRate: number | null;
  registersDone: number;
  registersTotal: number;
  openWork: WorkItem[];
  snapshot: SnapItem[];
  openClasses: { key: string; code: string; name: string; href: string; done: number; pupils: number }[];
  attendanceHref: string;
  calendar: { id: string; title: string; meta: string; month: string; day: string }[];
  calendarHref: string;
  watch: { id: string; name: string; note: string; href: string }[];
  watchHref: string | null;
  teachers: { id: string; name: string; detail: string; rate: number }[];
  teachersHref: string;
  teachersEmpty: string;
  activity: { id: string; body: string; when: string; href?: string }[];
  activityHref: string | null;
};

export function OfficeHome({
  greeting, dateLabel, termLabel, pupils, primary, secondary, notices,
  registerRate, registersDone, registersTotal, openWork, snapshot,
  openClasses, attendanceHref, calendar, calendarHref,
  watch, watchHref, teachers, teachersHref, teachersEmpty, activity, activityHref,
}: OfficeHomeProps) {
  const rate = registerRate ?? 0;
  const openCount = registersTotal - registersDone;
  return (
    <div className="app-page ofc-page acd-page ov-page">
      <PageHeader
        kicker="Academics office"
        icon="fa-graduation-cap"
        title={greeting}
        description={
          <>
            <span className="acd-today"><i className="fa-regular fa-calendar" aria-hidden="true" /> {dateLabel}</span>
            <strong>{nf(pupils)}</strong> pupils on roll
            {termLabel ? <> in <strong>{termLabel}</strong>.</> : <>.</>}
          </>
        }
        actions={
          <>
            <Link className="admin-hero-btn is-primary" href={primary.href}><i className={`fa-solid ${primary.icon}`} aria-hidden="true" /> {primary.label}</Link>
            <Link className="admin-hero-btn" href={secondary.href}><i className={`fa-solid ${secondary.icon}`} aria-hidden="true" /> {secondary.label}</Link>
          </>
        }
      />

      {notices}

      <section className="ov-board" aria-label="Today">
        <header className="ov-cap">
          <p>Today</p>
          <p>{openWork.length || openCount ? `${nf(openWork.length + (openCount ? 1 : 0))} to do` : "All caught up"}</p>
        </header>
        <div className="ov-main">
          <Link className="ov-hero" href={attendanceHref}>
            <span className={`ov-ring${rate === 100 ? " is-done" : ""}`} style={{ "--ov-rate": rate } as React.CSSProperties}>
              <svg viewBox="0 0 36 36" aria-hidden="true">
                <circle cx="18" cy="18" r="15.5" pathLength={100} />
                <circle className="is-value" cx="18" cy="18" r="15.5" pathLength={100} strokeDasharray={`${rate} 100`} />
              </svg>
              <em>{registerRate === null ? "—" : `${rate}%`}</em>
            </span>
            <div>
              <span>Registers</span>
              <strong>{openCount ? nf(openCount) : registersTotal ? "Done" : "—"}</strong>
              <p>
                {registersTotal
                  ? openCount
                    ? `${nf(openCount)} ${openCount === 1 ? "class" : "classes"} still to mark`
                    : "Every class is marked"
                  : "No classes on the register"}
              </p>
            </div>
          </Link>
          {openWork.length ? (
            <ul className="ov-work">
              {openWork.map((item) => (
                <li key={item.label}>
                  <Link href={item.href}>
                    <span className="ov-work-icon" aria-hidden="true"><i className={`fa-solid ${item.icon}`} /></span>
                    <span className="ov-work-text">
                      <strong>{item.label}</strong>
                      <small>{item.note}</small>
                    </span>
                    <em>{nf(item.count)}</em>
                    <i className="fa-solid fa-chevron-right" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ov-clear">
              <span aria-hidden="true"><i className={`fa-solid ${openCount ? "fa-clipboard-user" : "fa-circle-check"}`} /></span>
              {openCount ? "Registers are the only thing still open. Mark them from the list below." : "Nothing is waiting. Registers, markbooks and schemes are clear."}
            </p>
          )}
        </div>
        <ul className="ov-snap">
          {snapshot.map((item) => (
            <li key={item.label}>
              <Link href={item.href}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
                <small>{item.note}</small>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="ov-layout">
        <div className="ov-col">
          {openClasses.length ? (
            <Card id="registers" icon="fa-clipboard-user" tone="green" title="Still to mark" description="Open a class to finish today's register." action={{ href: attendanceHref, label: "All registers" }}>
              <ClassQueue classes={openClasses} />
            </Card>
          ) : null}

          <Card id="calendar" icon="fa-calendar-days" tone="blue" title="Coming up" description={termLabel ? `Dates in ${termLabel}.` : "Waiting for a current term."} action={{ href: calendarHref, label: "Calendar" }}>
            {calendar.length ? (
              <ul className="acd-list">
                {calendar.map((row) => (
                  <li key={row.id}>
                    <span className="acd-date"><small>{row.month}</small><strong>{row.day}</strong></span>
                    <div>
                      <strong>{row.title}</strong>
                      <small>{row.meta}</small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <Quiet icon="fa-calendar">No examinations, deadlines or meetings ahead.</Quiet>}
          </Card>
        </div>

        <div className="ov-col">
          <Card id="watch" icon="fa-user-clock" tone="violet" title="Needs a conversation" description="Decline, repeated absence and open follow-up." action={watchHref ? { href: watchHref, label: "Interventions" } : undefined}>
            {watch.length ? (
              <ul className="acd-list">
                {watch.map((pupil) => (
                  <li key={pupil.id}>
                    <span className="acd-initials" aria-hidden="true"><i className="fa-solid fa-user" /></span>
                    <div><Link href={pupil.href}>{pupil.name}</Link><small>{pupil.note}</small></div>
                  </li>
                ))}
              </ul>
            ) : <Quiet icon="fa-circle-check">No pupils are flagged this term.</Quiet>}
          </Card>

          <Card id="teachers" icon="fa-chalkboard-user" tone="gold" title="Teaching progress" description="Markbooks submitted against those assigned." action={{ href: teachersHref, label: teachersHref.endsWith("/staff") ? "Staff" : "Schemes" }}>
            {teachers.length ? (
              <ul className="ov-teachers">
                {teachers.map((member) => (
                  <li key={member.id}>
                    <span className="acd-initials" aria-hidden="true">{initials(member.name)}</span>
                    <div>
                      <strong>{member.name}</strong>
                      <small>{member.detail}</small>
                      <span className="ov-track" aria-hidden="true"><span style={{ width: `${member.rate}%` }} /></span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <Quiet icon="fa-chalkboard-user">{teachersEmpty}</Quiet>}
          </Card>

          <Card id="activity" icon="fa-clock-rotate-left" tone="navy" title="Recent activity" description="Approvals, submissions and published reports." action={activityHref ? { href: activityHref, label: "Activity" } : undefined}>
            {activity.length ? (
              <ul className="acd-list">
                {activity.map((row) => (
                  <li key={row.id}>
                    <span className="acd-initials" aria-hidden="true"><i className={`fa-solid ${row.href ? "fa-file-lines" : "fa-clock"}`} /></span>
                    <div>
                      {row.href ? <Link href={row.href}>{row.body}</Link> : <strong>{row.body}</strong>}
                      <small>{row.when}</small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <Quiet icon="fa-clock">No academic changes recorded yet.</Quiet>}
          </Card>
        </div>
      </div>
    </div>
  );
}

export async function Overview({ supabase, profile, office }: Session) {
  const today = kampalaToday();
  const termPack = await loadCurrentTerm(supabase);
  if (termPack.error) {
    return <AcademicsNotice title="Overview" heading="Could not load the term"><p>{termPack.error}</p></AcademicsNotice>;
  }
  const term = termPack.term;

  const [roll, marks, pictureResult, presentCount, markedCount, cardsResult, teachersResult] = await Promise.all([
    loadRoll(supabase, profile.id).catch((error: unknown) => error),
    loadDayMarks(supabase, profile.id, today).catch(() => [] as { student_id: string }[]),
    term
      ? loadAcademicPicture(supabase, term, today, profile.id).then(
          (value) => ({ picture: value as AcademicPicture | null, error: "" }),
          (error: unknown) => ({ picture: null as AcademicPicture | null, error: error instanceof Error ? error.message : "The academic picture could not be loaded." }),
        )
      : Promise.resolve({ picture: null as AcademicPicture | null, error: "" }),
    term
      ? supabase.from("attendance").select("student_id", { count: "exact", head: true }).eq("term_id", term.id).in("status", ["present", "late"])
      : Promise.resolve({ count: 0, error: null }),
    term
      ? supabase.from("attendance").select("student_id", { count: "exact", head: true }).eq("term_id", term.id)
      : Promise.resolve({ count: 0, error: null }),
    term
      ? supabase.from("report_cards").select("id, student_id, status, published_at, class_code, stream").eq("term_id", term.id)
      : Promise.resolve({ data: [], error: null }),
    term
      ? supabase.from("class_teachers").select("class_code, stream").eq("term_id", term.id)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (!Array.isArray(roll)) {
    const message = roll instanceof Error ? roll.message : "The register could not be loaded.";
    return <AcademicsNotice title="Overview" heading="Could not load pupils"><p>{message}</p></AcademicsNotice>;
  }
  const pupils: Pupil[] = roll;
  const markedToday = marks;
  const picture = pictureResult.picture;
  const pictureError = pictureResult.error;
  if (pictureError && missingAcademicsSchema(pictureError)) {
    return <AcademicsNotice title="Overview" heading="Academics office needs an update"><p>{pictureError}</p><p>Run <code>supabase/0016_academics_work.sql</code> in the Supabase SQL editor.</p></AcademicsNotice>;
  }

  const groups = groupPupils(pupils);

  const failed = [cardsResult.error, teachersResult.error, presentCount.error, markedCount.error].find(Boolean);
  if (failed) return <AcademicsNotice title="Overview" heading="Could not load the office"><p>{failed.message}</p></AcademicsNotice>;

  const markedIds = new Set(markedToday.map((row) => row.student_id));
  const registerState = groups.map((group) => {
    const done = group.pupils.filter((pupil) => markedIds.has(pupil.id)).length;
    return { ...group, done, complete: done === group.pupils.length };
  });
  const unmarked = registerState.filter((group) => !group.complete);
  const cards = (cardsResult.data || []) as { id: string; student_id: string; status: string; published_at: string | null; class_code: string | null; stream: string | null }[];
  const drafts = cards.filter((card) => card.status === "draft");
  const published = cards.filter((card) => card.status === "published");
  const taught = new Set((teachersResult.data || []).map((row) => `${row.class_code}|${streamOf(row.stream as string | null)}`));
  const untaught = term ? groups.filter((group) => !taught.has(`${group.code}|${group.stream}`)) : [];
  const attendanceRate = markedCount.count ? Math.round(((presentCount.count ?? 0) / markedCount.count) * 100) : null;
  const names = new Map(pupils.map((pupil) => [pupil.id, pupil.full_name]));
  const recent = published.slice().sort((a, b) => String(b.published_at).localeCompare(String(a.published_at))).slice(0, 5);
  const firstName = profile.full_name?.trim().split(/\s+/)[0] || "";
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Africa/Kampala" }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const admin = profile.role === "admin";
  const openMarks = picture?.openMarkbooks.length ?? 0;
  const waitingSchemes = picture?.schemesWaiting.length ?? 0;
  const overdue = picture?.overdueLessons ?? 0;

  const todo = [
    { label: "Registers still open", note: unmarked.length ? "Mark today's attendance" : "Every class is marked", count: unmarked.length, href: `${ACADEMICS_BASE}/attendance?date=${today}`, icon: "fa-clipboard-user" },
    { label: "Markbooks not submitted", note: openMarks ? "Submit once every pupil has a mark" : "No open markbooks", count: openMarks, href: `${ACADEMICS_BASE}/assessments`, icon: "fa-pen-to-square" },
    { label: "Schemes awaiting approval", note: waitingSchemes ? "Review submitted schemes" : "Nothing waiting", count: waitingSchemes, href: `${ACADEMICS_BASE}/schemes`, icon: "fa-list-check" },
    { label: "Overdue lesson plans", note: overdue ? "Due date passed, not taught" : "No overdue lessons", count: overdue, href: `${ACADEMICS_BASE}/schemes`, icon: "fa-calendar-xmark" },
    { label: "Classes without a teacher", note: term ? "Assign a class teacher" : "Set the current term first", count: untaught.length, href: `${ACADEMICS_BASE}/classes`, icon: "fa-chalkboard-user" },
    ...(office ? [{ label: "Reports ready to publish", note: drafts.length ? "Approve before parents can see them" : "No drafts waiting", count: drafts.length, href: `${ACADEMICS_BASE}/reports`, icon: "fa-file-lines" }] : []),
  ];
  const attendanceHref = `${ACADEMICS_BASE}/attendance?date=${today}`;
  const registersDone = registerState.filter((group) => group.complete).length;

  function dayChip(iso: string) {
    const [year, month, day] = iso.split("-").map(Number);
    if (!year || !month || !day) return { month: "", day: iso };
    const date = new Date(year, month - 1, day);
    return { month: date.toLocaleDateString("en-GB", { month: "short" }), day: String(day) };
  }

  const activity = picture?.activity.length
    ? picture.activity.slice(0, 6).map((row) => ({
        id: row.id,
        body: row.body,
        when: new Date(row.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kampala" }),
        href: undefined,
      }))
    : recent.map((card) => ({
        id: card.id,
        body: names.get(card.student_id) || "Pupil",
        when: `Published · ${className(card.class_code)}${streamOf(card.stream) ? ` ${streamOf(card.stream)}` : ""}`,
        href: `${ACADEMICS_BASE}/reports/${card.id}`,
      }));

  return (
    <OfficeHome
      greeting={`${greeting}${firstName ? `, ${firstName}` : ""}`}
      dateLabel={kampalaLong()}
      termLabel={term?.label ?? null}
      pupils={pupils.length}
      primary={unmarked.length
        ? { href: attendanceHref, icon: "fa-clipboard-user", label: "Today's registers" }
        : { href: `${ACADEMICS_BASE}/assessments`, icon: "fa-pen-to-square", label: "Enter marks" }}
      secondary={office
        ? { href: `${ACADEMICS_BASE}/insights`, icon: "fa-chart-column", label: "Insights" }
        : { href: `${ACADEMICS_BASE}/schemes`, icon: "fa-list-check", label: "Schemes" }}
      notices={
        <>
          {!term ? (
            <p className="acd-note">
              <i className="fa-solid fa-circle-info" aria-hidden="true" />
              No term is marked current, so assessments and report cards wait.
              {admin ? <> <Link href="/accounts/settings">Set the current term in Accounts</Link>.</> : " Ask the accounts office to set the current term."}
            </p>
          ) : null}
          {pictureError ? <p className="acd-note"><i className="fa-solid fa-circle-info" aria-hidden="true" /> {pictureError}</p> : null}
        </>
      }
      registerRate={registerState.length ? Math.round((registersDone / registerState.length) * 100) : null}
      registersDone={registersDone}
      registersTotal={registerState.length}
      openWork={todo.filter((item) => item.count > 0 && item.label !== "Registers still open")}
      snapshot={[
        { label: "Pupils", value: nf(pupils.length), note: `${nf(groups.length)} classes`, href: `${ACADEMICS_BASE}/classes` },
        { label: "In school", value: attendanceRate === null ? "—" : `${attendanceRate}%`, note: "This term", href: attendanceHref },
        { label: "Mean score", value: picture?.mean === null || picture?.mean === undefined ? "—" : String(picture.mean), note: "Report lines", href: office ? `${ACADEMICS_BASE}/insights` : `${ACADEMICS_BASE}/reports` },
        { label: "Reports", value: nf(published.length), note: drafts.length ? `${nf(drafts.length)} to publish` : "Published", href: `${ACADEMICS_BASE}/reports` },
      ]}
      openClasses={unmarked.map((group) => ({
        key: `${group.code}-${group.stream}`,
        code: group.code,
        name: classLabel(group.code, group.stream),
        href: `${attendanceHref}&class=${group.code}&stream=${group.stream || "-"}`,
        done: group.done,
        pupils: group.pupils.length,
      }))}
      attendanceHref={attendanceHref}
      calendar={(picture?.calendar || []).slice(0, 5).map((row) => {
        const chip = dayChip(row.starts_on);
        return { id: row.id, title: row.title, meta: `${dateKindLabel(row.kind)}${row.campus ? ` · ${row.campus}` : ""}`, month: chip.month, day: chip.day };
      })}
      calendarHref={`${ACADEMICS_BASE}/calendar`}
      watch={(picture?.watch || []).slice(0, 6)}
      watchHref={office ? `${ACADEMICS_BASE}/interventions` : null}
      teachers={(picture?.teachers || []).slice(0, 6).map((member) => ({
        id: member.id,
        name: member.name,
        detail: `${member.papersSubmitted}/${member.papersAssigned} markbooks · ${member.lessonsTaught}/${member.lessonsPlanned} lessons`,
        rate: member.papersAssigned ? Math.round((member.papersSubmitted / member.papersAssigned) * 100) : 0,
      }))}
      teachersHref={office ? `${ACADEMICS_BASE}/staff` : `${ACADEMICS_BASE}/schemes`}
      teachersEmpty={untaught.length ? "Assign teachers to see their progress." : "No teaching assignments this term."}
      activity={activity}
      activityHref={office ? `${ACADEMICS_BASE}/activity` : activity.some((row) => row.href) ? `${ACADEMICS_BASE}/reports` : null}
    />
  );
}
