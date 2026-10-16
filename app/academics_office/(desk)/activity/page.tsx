import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { AcademicsGate, OfficeOnly } from "@/components/academics/ui";
import { ACADEMICS_BASE, kampalaToday, mapTerm, openAcademics } from "@/lib/academics";

export const metadata = { title: "Activity" };

const TZ = "Africa/Kampala";
const PAGE_SIZE = 24;

const SPANS = [
  { value: "week", label: "7 days" },
  { value: "month", label: "30 days" },
  { value: "term", label: "This term" },
  { value: "all", label: "All" },
] as const;

const KINDS = [
  { value: "marks", label: "Marks", icon: "fa-pen-to-square", href: `${ACADEMICS_BASE}/assessments` },
  { value: "scheme", label: "Schemes", icon: "fa-list-check", href: `${ACADEMICS_BASE}/schemes` },
  { value: "report", label: "Reports", icon: "fa-file-lines", href: `${ACADEMICS_BASE}/reports` },
  { value: "calendar", label: "Calendar", icon: "fa-calendar-days", href: `${ACADEMICS_BASE}/calendar` },
  { value: "intervention", label: "Interventions", icon: "fa-hand-holding-heart", href: `${ACADEMICS_BASE}/interventions` },
  { value: "reminder", label: "Reminders", icon: "fa-bell", href: `${ACADEMICS_BASE}/insights` },
  { value: "timetable", label: "Timetable", icon: "fa-table-cells", href: `${ACADEMICS_BASE}/timetable` },
  { value: "setup", label: "Setup", icon: "fa-sliders", href: `${ACADEMICS_BASE}/settings` },
] as const;

type Kind = (typeof KINDS)[number]["value"];
type Row = { id: string; kind: string; body: string; created_at: string; actor_id: string | null };
type Reminder = { id: string; staff_id: string | null; sent_to: string; topic: string; status: string; error: string | null; sent_at: string };

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ span?: string; kind?: string; page?: string }> }) {
  const query = await searchParams;
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Activity" state={opened} />;
  if (!opened.auth.office) return <OfficeOnly title="Activity" />;
  const { supabase } = opened.auth;

  const span = SPANS.some((item) => item.value === query.span) ? query.span! : "term";
  const kind = KINDS.some((item) => item.value === query.kind) ? query.kind as Kind : "";
  const page = Math.max(1, Number.parseInt(query.page || "1", 10) || 1);
  const today = kampalaToday();
  const termQuery = await supabase.from("fee_terms").select("id, year, term, label, starts_on, ends_on, is_current").eq("is_current", true).maybeSingle();
  const term = termQuery.data ? mapTerm(termQuery.data as Record<string, unknown>) : null;
  const since = sinceIso(span, term?.starts_on ?? null, today);
  const showReminders = !kind || kind === "reminder";

  let list = supabase.from("academic_activity").select("id, kind, body, created_at, actor_id", { count: "exact" }).order("created_at", { ascending: false });
  let summary = supabase.from("academic_activity").select("kind, actor_id, created_at").order("created_at", { ascending: false }).limit(1000);
  let reminders = supabase.from("academic_reminders").select("id, staff_id, sent_to, topic, status, error, sent_at").order("sent_at", { ascending: false }).limit(40);
  if (since) {
    list = list.gte("created_at", since);
    summary = summary.gte("created_at", since);
    reminders = reminders.gte("sent_at", since);
  }
  if (kind) list = list.eq("kind", kind);

  const [listResult, summaryResult, reminderResult] = await Promise.all([
    list.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    summary,
    showReminders ? reminders : Promise.resolve({ data: [], error: null }),
  ]);
  if (listResult.error) return <AcademicsGate title="Activity" state={{ notice: "schema", message: listResult.error.message }} />;

  const rows = (listResult.data || []) as Row[];
  const scanned = (summaryResult.data || []) as { kind: string; actor_id: string | null; created_at: string }[];
  const matched = kind ? scanned.filter((row) => row.kind === kind) : scanned;
  const total = listResult.count ?? rows.length;
  const actorIds = [...new Set(rows.map((row) => row.actor_id).filter((id): id is string => Boolean(id)))];
  const deliveries = (reminderResult.error ? [] : reminderResult.data || []) as Reminder[];
  const staffIds = [...new Set(deliveries.map((row) => row.staff_id).filter((id): id is string => Boolean(id)))];
  const [peopleQuery, staffQuery] = await Promise.all([
    actorIds.length ? supabase.from("profiles").select("id, full_name").in("id", actorIds) : Promise.resolve({ data: [] }),
    staffIds.length ? supabase.from("teaching_staff").select("id, full_name").in("id", staffIds) : Promise.resolve({ data: [] }),
  ]);
  const names = new Map((peopleQuery.data || []).map((person) => [person.id as string, (person.full_name as string | null)?.trim() || ""]));
  const staffNames = new Map((staffQuery.data || []).map((person) => [person.id as string, (person.full_name as string | null)?.trim() || ""]));
  const counts = new Map<string, number>();
  for (const row of scanned) counts.set(row.kind, (counts.get(row.kind) || 0) + 1);
  const todayCount = matched.filter((row) => dayKey(row.created_at) === today).length;
  const people = new Set(matched.map((row) => row.actor_id).filter(Boolean)).size;
  const groups = groupByDay(rows, today);
  const start = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const end = (page - 1) * PAGE_SIZE + rows.length;
  const kindMeta = KINDS.find((item) => item.value === kind);

  return (
    <div className="app-page ofc-page acd-act">
      <PageHeader
        kicker="Office"
        icon="fa-clock-rotate-left"
        title="Activity"
        description={windowCopy(span, term?.label ?? null)}
      />

      <section className="acd-act-stats" aria-label="This period">
        <article className="acd-act-stat">
          <span>Recorded</span>
          <strong>{total}</strong>
          <small>{kindMeta ? kindMeta.label : "Entries"} in this period</small>
        </article>
        <article className="acd-act-stat">
          <span>Today</span>
          <strong>{todayCount}</strong>
          <small>Since midnight in Kampala</small>
        </article>
        <article className="acd-act-stat">
          <span>People</span>
          <strong>{people}</strong>
          <small>Who made a change</small>
        </article>
      </section>

      <div className="acd-act-bar">
        <nav className="acd-act-chips" aria-label="Period">
          {SPANS.map((item) => (
            <Link key={item.value} href={activityHref(item.value, kind)} className={span === item.value ? "is-on" : ""} aria-current={span === item.value ? "page" : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
        <nav className="acd-act-chips" aria-label="Kind of change">
          <Link href={activityHref(span, "")} className={kind ? "" : "is-on"} aria-current={kind ? undefined : "page"}>
            All <span>{scanned.length}</span>
          </Link>
          {KINDS.map((item) => (
            <Link key={item.value} href={activityHref(span, item.value)} className={kind === item.value ? "is-on" : ""} aria-current={kind === item.value ? "page" : undefined}>
              {item.label} <span>{counts.get(item.value) || 0}</span>
            </Link>
          ))}
        </nav>
      </div>

      <section className="dash-panel ofc-panel">
        <header className="dash-panel-head">
          <div>
            <h2>{kindMeta ? kindMeta.label : "What changed"}</h2>
            <p>Newest first. Each line is something the office recorded.</p>
          </div>
        </header>
        {groups.length ? (
          <div className="acd-act-days">
            {groups.map((group) => (
              <section key={group.key} className="acd-act-day" aria-label={group.label}>
                <h3>{group.label}</h3>
                <ol className="acd-act-list">
                  {group.rows.map((row) => {
                    const meta = KINDS.find((item) => item.value === row.kind);
                    const actor = (row.actor_id && names.get(row.actor_id)) || "Academics office";
                    return (
                      <li key={row.id} className={`acd-act-item is-${row.kind}`}>
                        <span className={`acd-act-icon is-${row.kind}`} aria-hidden="true"><i className={`fa-solid ${meta?.icon || "fa-clock"}`} /></span>
                        <div>
                          <p className="acd-act-body">{row.body}</p>
                          <p className="acd-act-meta">
                            {meta ? <Link className={`acd-act-kind is-${row.kind}`} href={meta.href}>{meta.label}</Link> : <span className="acd-act-kind">{row.kind}</span>}
                            <span>{actor}</span>
                            <time dateTime={row.created_at}>{timeFormat.format(new Date(row.created_at))}</time>
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        ) : (
          <div className="acd-act-empty">
            <i className="fa-regular fa-clock" aria-hidden="true" />
            <p>{kindMeta ? `No ${kindMeta.label.toLowerCase()} in this period.` : "Nothing recorded in this period."}</p>
            <small>{kind ? "Try another kind, or widen the period." : "Changes appear here as the office submits marks, approves schemes, publishes reports and sends reminders."}</small>
          </div>
        )}
        {total > PAGE_SIZE ? (
          <div className="acd-act-pager">
            <p>Showing {start}–{end} of {total}</p>
            <div>
              {page > 1 ? <Link className="admin-btn admin-btn-ghost" href={activityHref(span, kind, page - 1)}>Newer</Link> : <span className="admin-btn admin-btn-ghost is-off">Newer</span>}
              {end < total ? <Link className="admin-btn admin-btn-ghost" href={activityHref(span, kind, page + 1)}>Older</Link> : <span className="admin-btn admin-btn-ghost is-off">Older</span>}
            </div>
          </div>
        ) : null}
      </section>

      {showReminders ? (
        <section className="dash-panel ofc-panel">
          <header className="dash-panel-head">
            <div>
              <h2>Reminder deliveries</h2>
              <p>Each email sent to a teacher in this period, including any that did not go out.</p>
            </div>
          </header>
          {deliveries.length ? (
            <ol className="acd-act-list">
              {deliveries.map((row) => (
                <li key={row.id} className="acd-act-item is-reminder">
                  <span className={`acd-act-status is-${row.status}`}>{row.status === "failed" ? "Failed" : "Sent"}</span>
                  <div>
                    <p className="acd-act-body">{(row.staff_id && staffNames.get(row.staff_id)) || row.sent_to}</p>
                    <p className="acd-act-meta">
                      <span className="acd-act-kind is-reminder">{row.topic === "lessons" ? "Lesson plans" : row.topic === "marks" ? "Markbooks" : row.topic}</span>
                      <span>{row.sent_to}</span>
                      <time dateTime={row.sent_at}>{dayHeading(dayKey(row.sent_at), today)} · {timeFormat.format(new Date(row.sent_at))}</time>
                    </p>
                    {row.error ? <p className="acd-act-error">{row.error}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : <div className="acd-act-empty"><i className="fa-regular fa-bell" aria-hidden="true" /><p>No reminder emails in this period.</p><small>Reminders sent from Insights are listed here, one line for each teacher.</small></div>}
        </section>
      ) : null}
    </div>
  );
}

function activityHref(span: string, kind: string, page = 1) {
  const params = new URLSearchParams();
  if (span !== "term") params.set("span", span);
  if (kind) params.set("kind", kind);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${ACADEMICS_BASE}/activity?${query}` : `${ACADEMICS_BASE}/activity`;
}

function windowCopy(span: string, termLabel: string | null) {
  if (span === "week") return "Marks, schemes, report cards, the calendar, interventions, reminders and timetable changes from the last 7 days.";
  if (span === "month") return "Marks, schemes, report cards, the calendar, interventions, reminders and timetable changes from the last 30 days.";
  if (span === "all") return "The full record of marks, schemes, report cards, the calendar, interventions, reminders, the timetable and setup.";
  return `Marks, schemes, report cards, the calendar, interventions, reminders and timetable changes${termLabel ? ` during ${termLabel}` : " this term"}.`;
}

function sinceIso(span: string, termStart: string | null, today: string) {
  if (span === "all") return null;
  if (span === "term") return `${termStart || shiftDay(today, -120)}T00:00:00+03:00`;
  return `${shiftDay(today, span === "week" ? -6 : -29)}T00:00:00+03:00`;
}

function shiftDay(value: string, by: number) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + by)).toISOString().slice(0, 10);
}

function dayKey(iso: string) {
  return dayFormat.format(new Date(iso));
}

function dayHeading(key: string, today: string) {
  if (key === today) return "Today";
  if (key === shiftDay(today, -1)) return "Yesterday";
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: key.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
    timeZone: "UTC",
  });
}

function groupByDay(rows: Row[], today: string) {
  const groups: { key: string; label: string; rows: Row[] }[] = [];
  for (const row of rows) {
    const key = dayKey(row.created_at);
    const last = groups[groups.length - 1];
    if (!last || last.key !== key) groups.push({ key, label: dayHeading(key, today), rows: [row] });
    else last.rows.push(row);
  }
  return groups;
}
