import { getStudentPortal } from "@/lib/student-portal";

export const metadata = { title: "Attendance" };

const STATUS_LABEL: Record<string, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  excused: "Excused",
};

function shortDay(ymd: string) {
  return new Date(ymd + "T12:00:00").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default async function StudentAttendancePage() {
  const portal = await getStudentPortal();
  const { attendance } = portal;

  return (
    <div className="st-section">
      <p className="account-kicker">School</p>
      <h1>Attendance</h1>
      <p className="lead">
        How often you have been in school{portal.termLabel ? ` this term (${portal.termLabel})` : " this term"}.
      </p>

      {attendance.total ? (
        <>
          <div className="st-att-hero">
            <div className="st-att-pct">
              <strong>{attendance.percent}%</strong>
              <span>days present or late</span>
            </div>
            <dl className="st-att-stats">
              <div>
                <dt>Present</dt>
                <dd>{attendance.present}</dd>
              </div>
              <div>
                <dt>Late</dt>
                <dd>{attendance.late}</dd>
              </div>
              <div>
                <dt>Absent</dt>
                <dd>{attendance.absent}</dd>
              </div>
              <div>
                <dt>Excused</dt>
                <dd>{attendance.excused}</dd>
              </div>
            </dl>
          </div>

          <h2 style={{ margin: "1.4rem 0 .65rem", fontSize: "1.1rem" }}>Recent days</h2>
          <ul className="st-att-list">
            {attendance.recent.map((day) => (
              <li key={day.attended_on}>
                <time dateTime={day.attended_on}>{shortDay(day.attended_on)}</time>
                <span className={`st-att-chip is-${day.status}`}>{STATUS_LABEL[day.status] || day.status}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="hw-empty">
          <i className="fa-solid fa-clipboard-user" aria-hidden="true" />
          <p>No register yet this term. Your days will appear here after teachers take attendance.</p>
        </div>
      )}
    </div>
  );
}
