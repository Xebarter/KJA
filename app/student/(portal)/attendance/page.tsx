import { getStudentPortal } from "@/lib/student-portal";

export const metadata = { title: "Attendance" };

const STATUS: Record<
  string,
  { label: string; icon: string; tone: string; tip: string }
> = {
  present: { label: "Present", icon: "fa-circle-check", tone: "present", tip: "You were in school" },
  late: { label: "Late", icon: "fa-clock", tone: "late", tip: "You arrived a little late" },
  absent: { label: "Absent", icon: "fa-circle-xmark", tone: "absent", tip: "You were away" },
  excused: { label: "Excused", icon: "fa-file-circle-check", tone: "excused", tip: "Absence was explained" },
};

function shortDay(ymd: string) {
  return new Date(ymd + "T12:00:00").toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

function cheer(percent: number, total: number) {
  if (!total) return "Your days will appear here after teachers take the register.";
  if (percent >= 95) return "Fantastic attendance — keep shining every school day!";
  if (percent >= 85) return "Great job coming to school. Every day helps you learn.";
  if (percent >= 70) return "You're doing alright. Try to be here as often as you can.";
  return "Coming to school more often will help you catch up and feel confident.";
}

export default async function StudentAttendancePage() {
  const portal = await getStudentPortal();
  const { attendance } = portal;
  const inSchool = attendance.present + attendance.late;
  const ring = Math.max(0, Math.min(100, attendance.percent));
  const message = cheer(attendance.percent, attendance.total);

  const stats = [
    { key: "present", value: attendance.present, ...STATUS.present },
    { key: "late", value: attendance.late, ...STATUS.late },
    { key: "absent", value: attendance.absent, ...STATUS.absent },
    { key: "excused", value: attendance.excused, ...STATUS.excused },
  ];

  return (
    <div className="at-page">
      <section className="at-hero">
        <div className="at-hero-bg" aria-hidden="true">
          <span className="at-blob at-blob-a" />
          <span className="at-blob at-blob-b" />
        </div>
        <div className="at-hero-copy">
          <p className="at-kicker">
            <i className="fa-solid fa-clipboard-check" aria-hidden="true" />
            School days
          </p>
          <h1>Attendance</h1>
          <p className="at-hero-lead">{message}</p>
          <div className="at-hero-tags">
            {portal.classLabel ? (
              <span className="at-tag">
                <i className="fa-solid fa-graduation-cap" aria-hidden="true" />
                {portal.classLabel}
              </span>
            ) : null}
            {portal.termLabel ? (
              <span className="at-tag at-tag--gold">
                <i className="fa-solid fa-calendar" aria-hidden="true" />
                {portal.termLabel}
              </span>
            ) : (
              <span className="at-tag at-tag--gold">
                <i className="fa-solid fa-calendar" aria-hidden="true" />
                This term
              </span>
            )}
          </div>
        </div>

        {attendance.total ? (
          <div
            className="at-ring"
            style={{ ["--at-pct" as string]: `${ring}` }}
            aria-label={`${attendance.percent} percent present or late`}
          >
            <div className="at-ring-inner">
              <strong>{attendance.percent}%</strong>
              <span>in school</span>
            </div>
          </div>
        ) : (
          <div className="at-ring at-ring--empty" aria-hidden="true">
            <div className="at-ring-inner">
              <i className="fa-solid fa-clipboard-user" />
              <span>No register</span>
            </div>
          </div>
        )}
      </section>

      {attendance.total ? (
        <>
          <section className="at-stats" aria-label="Attendance breakdown">
            {stats.map((stat) => (
              <div key={stat.key} className={`at-stat at-stat--${stat.tone}`}>
                <span className="at-stat-icon" aria-hidden="true">
                  <i className={`fa-solid ${stat.icon}`} />
                </span>
                <strong>{stat.value}</strong>
                <span className="at-stat-label">{stat.label}</span>
                <small>{stat.tip}</small>
              </div>
            ))}
          </section>

          <section className="at-panel">
            <header className="at-panel-head">
              <div>
                <p className="at-panel-kicker">Recent register</p>
                <h2>Your latest days</h2>
              </div>
              <span className="at-panel-count">
                {inSchool} of {attendance.total} days in
              </span>
            </header>

            <ul className="at-list">
              {attendance.recent.map((day, index) => {
                const meta = STATUS[day.status] || STATUS.present;
                return (
                  <li
                    key={day.attended_on}
                    className={`at-row at-row--${meta.tone}`}
                    style={{ animationDelay: `${Math.min(index, 10) * 0.04}s` }}
                  >
                    <span className="at-row-icon" aria-hidden="true">
                      <i className={`fa-solid ${meta.icon}`} />
                    </span>
                    <div className="at-row-text">
                      <strong>
                        <time dateTime={day.attended_on}>{shortDay(day.attended_on)}</time>
                      </strong>
                      <small>{meta.tip}</small>
                    </div>
                    <span className={`at-chip at-chip--${meta.tone}`}>{meta.label}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <p className="at-footnote">
            <i className="fa-solid fa-heart" aria-hidden="true" />
            Being at school helps you learn with friends and teachers every day.
          </p>
        </>
      ) : (
        <div className="at-empty">
          <span aria-hidden="true">
            <i className="fa-solid fa-clipboard-user" />
          </span>
          <h2>No register yet</h2>
          <p>
            Teachers have not marked attendance for this term. Your days will show up here once the
            register starts.
          </p>
        </div>
      )}
    </div>
  );
}
