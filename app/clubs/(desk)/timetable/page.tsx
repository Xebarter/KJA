import Link from "next/link";
import { ClubsPageHeader } from "@/components/clubs/PageHeader";
import { AddScheduleForm, CreateSessionForm, RemoveScheduleButton } from "@/components/clubs/ClubOps";
import { TimetablePrint } from "@/components/clubs/TimetablePrint";
import { clubsNotReady } from "@/components/clubs/ui";
import { addDays, day, kampalaToday } from "@/lib/accounts-format";
import { clubServesBranch } from "@/lib/club-funds-scope";
import { requireClubs } from "@/lib/clubs-access";
import { loadGuideClubs } from "@/lib/clubs-desk";
import { CLUBS_BASE, WEEKDAY_LABELS } from "@/lib/clubs-nav";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "TimeTable" };

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

type ScheduleRow = {
  id: string;
  club_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  venue: string | null;
  campus: string | null;
};

function scheduleOnCampus(row: ScheduleRow, campus: string) {
  if (!campus) return true;
  const site = String(row.campus || "").trim();
  return !site || site === campus;
}

export default async function ClubsTimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ club?: string; campus?: string }>;
}) {
  if (!supabaseConfigured()) return clubsNotReady("TimeTable", "config");
  const auth = await requireClubs("timetable", "sessions");
  if ("error" in auth) return clubsNotReady("TimeTable", "auth", auth.error);
  if (!auth.activeCampus) return null;

  const { clubs: allClubs, error } = await loadGuideClubs(auth.supabase);
  if (error) return clubsNotReady("TimeTable", "schema", error);
  const clubs = allClubs.filter((club) => clubServesBranch(club.campus, auth.activeCampus!));

  const params = await searchParams;
  const clubFilter = String(params.club || "").trim();
  const campusFilter = auth.activeCampus;
  const today = kampalaToday();
  const weekStart = addDays(today, -6);

  const [{ data: sessions, error: sessionsError }, { data: schedules }] = await Promise.all([
    auth.supabase
      .from("club_sessions")
      .select("id, club_id, held_on, venue, notes")
      .order("held_on", { ascending: false })
      .limit(120),
    auth.supabase.from("club_schedules").select("id, club_id, weekday, start_time, end_time, venue, campus, active").eq("active", true),
  ]);

  if (sessionsError && /club_sessions|does not exist|schema cache/i.test(sessionsError.message)) {
    return (
      <div className="app-page ofc-page clubs-page">
        <ClubsPageHeader
          kicker="Operations"
          icon="fa-calendar-week"
          title="TimeTable"
          description="Prepare weekly club schedules by campus. They appear on class timetables as club time."
        />
        <div className="clubs-notice">
          <i className="fa-solid fa-database" aria-hidden="true" />
          <div>
            <h2>Migration needed</h2>
            <p>
              Apply <code>supabase/0067_clubs_desk.sql</code> to enable schedules, meetings, and attendance.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const allSessions = sessions || [];
  const allSchedules = (schedules || []) as ScheduleRow[];
  const clubTitle = new Map(clubs.map((club) => [club.id, club.title]));
  const openClubs = clubs.filter((club) => club.active);

  const campusSchedules = allSchedules.filter((row) => scheduleOnCampus(row, campusFilter));
  const visibleSchedules = clubFilter ? campusSchedules.filter((row) => row.club_id === clubFilter) : campusSchedules;
  const visibleSessions = allSessions.filter((row) => {
    if (clubFilter && row.club_id !== clubFilter) return false;
    if (!campusFilter) return true;
    const clubSlots = allSchedules.filter((slot) => slot.club_id === row.club_id);
    if (!clubSlots.length) return true;
    return clubSlots.some((slot) => scheduleOnCampus(slot, campusFilter));
  });

  const sessionIds = visibleSessions.map((row) => row.id as string);
  const { data: marks } = sessionIds.length
    ? await auth.supabase.from("club_attendance").select("session_id, status").in("session_id", sessionIds)
    : { data: [] as { session_id: string; status: string }[] };

  const markStats = new Map<string, { total: number; present: number; absent: number; late: number; excused: number }>();
  for (const mark of marks || []) {
    const current = markStats.get(mark.session_id as string) || { total: 0, present: 0, absent: 0, late: 0, excused: 0 };
    current.total += 1;
    if (mark.status === "present") current.present += 1;
    else if (mark.status === "absent") current.absent += 1;
    else if (mark.status === "late") current.late += 1;
    else if (mark.status === "excused") current.excused += 1;
    markStats.set(mark.session_id as string, current);
  }

  const thisWeek = visibleSessions.filter((row) => String(row.held_on) >= weekStart && String(row.held_on) <= today).length;
  const unmarked = visibleSessions.filter((row) => !(markStats.get(row.id as string)?.total)).length;
  const clubsOnBoard = new Set(visibleSchedules.map((row) => row.club_id)).size;

  const printClubsMap = new Map<string, { id: string; title: string; count: number }>();
  for (const row of visibleSchedules) {
    const id = row.club_id;
    const current = printClubsMap.get(id);
    if (current) current.count += 1;
    else printClubsMap.set(id, { id, title: clubTitle.get(id) || "Club", count: 1 });
  }
  const printClubs = [...printClubsMap.values()].sort((a, b) => a.title.localeCompare(b.title));

  const byDay = WEEK_ORDER.map((weekday) => ({
    weekday,
    label: WEEKDAY_LABELS[weekday],
    short: WEEKDAY_LABELS[weekday].slice(0, 3),
    slots: visibleSchedules
      .filter((row) => Number(row.weekday) === weekday)
      .sort(
        (a, b) =>
          String(a.start_time).localeCompare(String(b.start_time)) ||
          String(clubTitle.get(a.club_id) || "").localeCompare(String(clubTitle.get(b.club_id) || "")),
      ),
  }));

  function hrefFor(next: { club?: string }) {
    const query = new URLSearchParams();
    const club = next.club === undefined ? clubFilter : next.club;
    if (club) query.set("club", club);
    const text = query.toString();
    return text ? `${CLUBS_BASE}/timetable?${text}` : `${CLUBS_BASE}/timetable`;
  }

  return (
    <div className="app-page ofc-page clubs-page clubs-sessions-page clubs-tt-page">
      <ClubsPageHeader
        kicker="Operations"
        icon="fa-calendar-week"
        title="TimeTable"
        description={`Prepare the ${campusFilter} weekly club schedule. Class timetables in Academics show them as Club time.`}
        meta={
          <>
            <span className="clubs-head-chip">
              <i className="fa-solid fa-school" aria-hidden="true" />
              {campusFilter}
            </span>
            <span className="clubs-head-chip">
              <i className="fa-solid fa-clock" aria-hidden="true" />
              {visibleSchedules.length} weekly slots
            </span>
            <span className="clubs-head-chip">
              <i className="fa-solid fa-puzzle-piece" aria-hidden="true" />
              {clubsOnBoard} clubs
            </span>
          </>
        }
        actions={
          <>
            <TimetablePrint clubs={printClubs} campus={campusFilter} />
            <Link className="clubs-head-btn" href={`${CLUBS_BASE}/catalogue`}>
              Open clubs
            </Link>
          </>
        }
      />

      <div className="clubs-ov-kpis clubs-sess-kpis">
        <div className={`clubs-ov-kpi${visibleSchedules.length ? " is-ok" : ""}`}>
          <span>Weekly slots</span>
          <strong>{visibleSchedules.length}</strong>
          <small>{campusFilter}</small>
        </div>
        <div className="clubs-ov-kpi">
          <span>Clubs scheduled</span>
          <strong>{clubsOnBoard}</strong>
          <small>On this branch</small>
        </div>
        <div className={`clubs-ov-kpi${thisWeek ? " is-ok" : ""}`}>
          <span>Meetings this week</span>
          <strong>{thisWeek}</strong>
          <small>Attendance sheets</small>
        </div>
        <div className={`clubs-ov-kpi${unmarked ? " is-warn" : ""}`}>
          <span>Unmarked</span>
          <strong>{unmarked}</strong>
          <small>Need attendance</small>
        </div>
      </div>

      <div className="clubs-sess-layout clubs-tt-layout">
        <div className="clubs-sess-side clubs-tt-main">
          <section className="clubs-detail-panel clubs-tt-week" aria-label="Weekly timetable">
            <header>
              <div>
                <h2>{campusFilter} week</h2>
                <p>
                  {visibleSchedules.length} {visibleSchedules.length === 1 ? "slot" : "slots"}
                  {clubFilter ? ` · ${clubTitle.get(clubFilter) || "Club"}` : ""}
                  {" · "}shown on Academics as Club time
                </p>
              </div>
              <a
                className="clubs-reg-tool"
                href={`${CLUBS_BASE}/timetable/pdf?campus=${encodeURIComponent(campusFilter)}${clubFilter ? `&clubs=${clubFilter}` : ""}`}
                target="_blank"
                rel="noreferrer"
              >
                <i className="fa-solid fa-print" aria-hidden="true" /> Print {campusFilter}
              </a>
            </header>

            {openClubs.length > 1 ? (
              <div className="clubs-sess-club-chips" aria-label="Filter by club">
                <Link href={hrefFor({ club: "" })} className={!clubFilter ? "is-on" : undefined}>
                  All clubs
                </Link>
                {openClubs.slice(0, 16).map((club) => (
                  <Link
                    key={club.id}
                    href={hrefFor({ club: club.id })}
                    className={clubFilter === club.id ? "is-on" : undefined}
                  >
                    {club.title}
                  </Link>
                ))}
              </div>
            ) : null}

            {visibleSchedules.length ? (
              <div className="clubs-tt-grid" role="grid" aria-label="Week by day">
                {byDay.map((column) => (
                  <div key={column.weekday} className="clubs-tt-day" role="gridcell">
                    <header>
                      <strong>{column.short}</strong>
                      <small>{column.slots.length ? `${column.slots.length}` : "-"}</small>
                    </header>
                    {column.slots.length ? (
                      <ul>
                        {column.slots.map((row) => (
                          <li key={row.id}>
                            <div>
                              <strong>{clubTitle.get(row.club_id) || "Club"}</strong>
                              <small>
                                {String(row.start_time).slice(0, 5)}–{String(row.end_time).slice(0, 5)}
                                {row.venue ? ` · ${row.venue}` : ""}
                                {row.campus && row.campus !== campusFilter ? ` · ${row.campus}` : ""}
                              </small>
                            </div>
                            <div className="clubs-tt-day-actions">
                              <Link href={`${CLUBS_BASE}/catalogue/${row.club_id}`} title="Open club">
                                <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
                                <span className="visually-hidden">Open club</span>
                              </Link>
                              <RemoveScheduleButton id={row.id} />
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="clubs-tt-day-empty">Free</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="clubs-reg-empty">
                <span className="clubs-ov-portal-icon" aria-hidden="true">
                  <i className="fa-solid fa-calendar-week" />
                </span>
                <strong>{`No slots for ${campusFilter}`}</strong>
                <p>Add a club slot with the prepare form. It will appear here and on class timetables.</p>
              </div>
            )}
          </section>

          <section className="clubs-detail-panel clubs-sess-list" aria-label="Recent meetings">
            <header>
              <div>
                <h2>Recent meetings</h2>
                <p>
                  {visibleSessions.length} {visibleSessions.length === 1 ? "meeting" : "meetings"} for attendance
                </p>
              </div>
            </header>

            {visibleSessions.length ? (
              <ul className="clubs-sess-items">
                {visibleSessions.slice(0, 40).map((row) => {
                  const stats = markStats.get(row.id as string);
                  const title = clubTitle.get(row.club_id as string) || "Club";
                  return (
                    <li key={row.id as string}>
                      <Link href={`${CLUBS_BASE}/timetable/${row.id}`}>
                        <span className="clubs-sess-date">
                          <strong>{day(row.held_on as string, false)}</strong>
                          <small>{String(row.held_on).slice(0, 4)}</small>
                        </span>
                        <span className="clubs-sess-copy">
                          <strong>{title}</strong>
                          <small>{[row.venue || null, row.notes || null].filter(Boolean).join(" · ") || "Mark attendance"}</small>
                          {stats?.total ? (
                            <em>
                              {stats.present} present
                              {stats.late ? ` · ${stats.late} late` : ""}
                              {stats.absent ? ` · ${stats.absent} absent` : ""}
                              {stats.excused ? ` · ${stats.excused} excused` : ""}
                            </em>
                          ) : (
                            <em className="is-warn">Attendance not saved</em>
                          )}
                        </span>
                        <i className="fa-solid fa-chevron-right" aria-hidden="true" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="clubs-reg-empty">
                <span className="clubs-ov-portal-icon" aria-hidden="true">
                  <i className="fa-solid fa-calendar" />
                </span>
                <strong>No meetings yet</strong>
                <p>Create a meeting once the weekly slot is set, then mark who attended.</p>
              </div>
            )}
          </section>
        </div>

        <aside className="clubs-sess-side">
          <section className="clubs-detail-panel" aria-label="Prepare weekly slot">
            <header>
              <div>
                <h2>Prepare a slot</h2>
                <p>Campus schedules feed Academics as Club time</p>
              </div>
            </header>
            <div className="clubs-detail-form-block">
              {openClubs.length ? (
                <AddScheduleForm
                  key={`${campusFilter}-${clubFilter}`}
                  clubs={openClubs.map((club) => ({ id: club.id, title: club.title }))}
                  defaultClubId={clubFilter || undefined}
                  defaultCampus={campusFilter}
                  defaultWeekday={1}
                  submitLabel="Add to timetable"
                />
              ) : (
                <div className="clubs-reg-empty">
                  <strong>No open clubs</strong>
                  <p>Open a club on the catalogue before scheduling.</p>
                  <Link className="admin-btn" href={`${CLUBS_BASE}/catalogue`}>
                    Open clubs
                  </Link>
                </div>
              )}
            </div>
          </section>

          <section className="clubs-detail-panel" aria-label="New meeting">
            <header>
              <div>
                <h2>New meeting</h2>
                <p>Log a held session for attendance</p>
              </div>
            </header>
            <div className="clubs-detail-form-block">
              <CreateSessionForm
                key={`meet-${clubFilter || "all"}`}
                clubs={openClubs.map((club) => ({ id: club.id, title: club.title }))}
                schedules={allSchedules.map((row) => ({
                  id: row.id,
                  club_id: row.club_id,
                  label: `${WEEKDAY_LABELS[row.weekday] || "Day"} ${String(row.start_time).slice(0, 5)}${row.venue ? ` · ${row.venue}` : ""}${row.campus ? ` · ${row.campus}` : ""}`,
                }))}
                defaultClubId={clubFilter || openClubs[0]?.id}
              />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
