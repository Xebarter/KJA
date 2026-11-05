import Link from "next/link";
import { notFound } from "next/navigation";
import { ClubsPageHeader } from "@/components/clubs/PageHeader";
import { AttendanceSheet } from "@/components/clubs/ClubOps";
import { clubsNotReady } from "@/components/clubs/ui";
import { day } from "@/lib/accounts-format";
import { classLabel } from "@/lib/academics";
import { requireClubs } from "@/lib/clubs-access";
import { clubListHref } from "@/lib/clubs";
import { CLUBS_BASE } from "@/lib/clubs-nav";
import { isUuid } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Attendance" };

export default async function ClubMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  if (!supabaseConfigured()) return clubsNotReady("Attendance", "config");
  const auth = await requireClubs("timetable", "sessions");
  if ("error" in auth) return clubsNotReady("Attendance", "auth", auth.error);
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const { data: session, error } = await auth.supabase
    .from("club_sessions")
    .select("id, club_id, held_on, venue, notes")
    .eq("id", id)
    .maybeSingle();
  if (error && /does not exist|schema cache/i.test(error.message)) {
    return clubsNotReady("Attendance", "schema", "Apply supabase/0067_clubs_desk.sql first.");
  }
  if (!session) notFound();

  const [{ data: club }, { data: consents }, { data: marks }] = await Promise.all([
    auth.supabase.from("clubs").select("id, title").eq("id", session.club_id).maybeSingle(),
    auth.supabase.from("club_consents").select("student_id").eq("club_id", session.club_id).is("withdrawn_at", null),
    auth.supabase.from("club_attendance").select("student_id, status, note").eq("session_id", id),
  ]);

  const studentIds = [...new Set((consents || []).map((row) => row.student_id as string))];
  let pupilRows: Record<string, unknown>[] = [];
  if (studentIds.length) {
    const withPhoto = await auth.supabase
      .from("students")
      .select("id, full_name, student_number, class_code, stream, campus, photo_path")
      .in("id", studentIds)
      .order("full_name");
    if (withPhoto.error && /photo_path/.test(withPhoto.error.message)) {
      const plain = await auth.supabase
        .from("students")
        .select("id, full_name, student_number, class_code, stream, campus")
        .in("id", studentIds)
        .order("full_name");
      pupilRows = plain.data || [];
    } else {
      pupilRows = withPhoto.data || [];
    }
  }

  const markMap = new Map((marks || []).map((row) => [row.student_id as string, row]));
  const campusSet = new Set(auth.campuses);
  const learners = pupilRows
    .filter((pupil) => !campusSet.size || !pupil.campus || campusSet.has(pupil.campus as (typeof auth.campuses)[number]))
    .map((pupil) => {
      const mark = markMap.get(pupil.id as string);
      return {
        studentId: pupil.id as string,
        name: pupil.full_name as string,
        detail: [pupil.student_number, pupil.class_code ? classLabel(pupil.class_code as string, pupil.stream as string | null) : null, pupil.campus]
          .filter(Boolean)
          .join(" · "),
        photoPath: (pupil.photo_path as string | null | undefined) || null,
        status: (mark?.status as string) || "present",
        note: (mark?.note as string) || "",
      };
    });

  const saved = marks?.length || 0;
  const present = learners.filter((row) => row.status === "present").length;
  const late = learners.filter((row) => row.status === "late").length;
  const absent = learners.filter((row) => row.status === "absent").length;
  const excused = learners.filter((row) => row.status === "excused").length;
  const clubTitle = club?.title || "Club meeting";

  return (
    <div className="app-page ofc-page clubs-page clubs-session-page">
      <ClubsPageHeader
        kicker="TimeTable"
        icon="fa-user-check"
        title={clubTitle}
        description={[day(session.held_on as string), session.venue, session.notes].filter(Boolean).join(" · ")}
        actions={
          <>
            <Link className="clubs-head-btn is-primary" href={`${CLUBS_BASE}/catalogue/${session.club_id}`}>
              Club page
            </Link>
            <Link className="clubs-head-btn" href={clubListHref({ club: session.club_id as string })}>
              Register
            </Link>
            <Link className="clubs-head-btn" href={`${CLUBS_BASE}/timetable`}>
              TimeTable
            </Link>
          </>
        }
      />

      <div className="clubs-ov-kpis clubs-sess-kpis">
        <div className="clubs-ov-kpi">
          <span>On the roll</span>
          <strong>{learners.length}</strong>
          <small>{saved ? `${saved} marks saved` : "Not saved yet"}</small>
        </div>
        <div className={`clubs-ov-kpi${present ? " is-ok" : ""}`}>
          <span>Present</span>
          <strong>{present}</strong>
          <small>In attendance</small>
        </div>
        <div className={`clubs-ov-kpi${late ? " is-warn" : ""}`}>
          <span>Late</span>
          <strong>{late}</strong>
          <small>Arrived after start</small>
        </div>
        <div className={`clubs-ov-kpi${absent || excused ? " is-warn" : ""}`}>
          <span>Away</span>
          <strong>{absent + excused}</strong>
          <small>
            {absent} absent · {excused} excused
          </small>
        </div>
      </div>

      <section className="clubs-detail-panel clubs-att-board" aria-label="Attendance mark sheet">
        <header>
          <div>
            <h2>Mark sheet</h2>
            <p>Consents for {clubTitle} · defaults to present until you change a row</p>
          </div>
          <Link className="clubs-ov-link" href={`${CLUBS_BASE}/catalogue/${session.club_id}`}>
            Club details <i className="fa-solid fa-chevron-right" aria-hidden="true" />
          </Link>
        </header>

        {learners.length ? (
          <AttendanceSheet sessionId={id} learners={learners} />
        ) : (
          <div className="clubs-reg-empty">
            <span className="clubs-ov-portal-icon" aria-hidden="true">
              <i className="fa-solid fa-handshake" />
            </span>
            <strong>No consented learners</strong>
            <p>Add consents on the register before marking attendance.</p>
            <Link className="admin-btn" href={clubListHref({ club: session.club_id as string })}>
              Open register
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
