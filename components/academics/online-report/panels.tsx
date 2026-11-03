import { KorBarChart, KorLineChart, KorStackBar } from "@/components/academics/online-report/charts";
import type {
  OnlineAttendanceBundle,
  OnlineClub,
  OnlineLibraryBook,
  OnlineOtherSubject,
  OnlinePointsBundle,
  OnlineProgressSet,
  OnlineProgressSubject,
  OnlineTermRow,
} from "@/lib/online-report";
import { pointsTitle } from "@/lib/points";

function Empty({ copy }: { copy: string }) {
  return <p className="kor-empty">{copy}</p>;
}

function PanelHead({ title, note }: { title: string; note: string }) {
  return (
    <div className="kor-block-head">
      <h2>{title}</h2>
      <p>{note}</p>
    </div>
  );
}

export function ProgressPanel({
  sets,
  subjects,
}: {
  sets: OnlineProgressSet[];
  subjects: OnlineProgressSubject[];
}) {
  const setBars = sets.filter((set) => set.count > 0);
  const subjectTotals = subjects.filter((subject) => subject.total != null);
  const multiPart = subjects.filter((subject) => subject.parts.filter((part) => part.score != null).length > 1);

  return (
    <section className="kor-panel">
      <PanelHead title="Exam progress" note="This term" />
      {setBars.length > 1 ? (
        <>
          <p className="kor-empty" style={{ marginBottom: "0.75rem" }}>
            Average across subjects for each assessment set.
          </p>
          <KorBarChart items={setBars.map((set) => ({ label: set.label, value: set.average }))} />
        </>
      ) : subjectTotals.length ? (
        <KorBarChart items={subjectTotals.map((subject) => ({ label: subject.name, value: subject.total }))} />
      ) : (
        <Empty copy="Subject scores will appear here once the academic record is on the card." />
      )}

      {multiPart.length ? (
        <div className="kor-panel-block">
          <PanelHead title="By subject" note="Set comparison" />
          <ul className="kor-subject-charts">
            {multiPart.map((subject) => (
              <li key={subject.subjectId}>
                <h3>{subject.name}</h3>
                <KorBarChart
                  items={subject.parts.map((part) => ({ label: part.label, value: part.score }))}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function TermsPanel({ terms }: { terms: OnlineTermRow[] }) {
  return (
    <section className="kor-panel">
      <PanelHead title="Across terms" note="Overall average" />
      {terms.length ? (
        <>
          <KorLineChart
            items={terms.map((term) => ({
              label: term.label,
              value: term.overallScore,
              current: term.current,
            }))}
          />
          <ul className="kor-term-list">
            {terms.map((term) => (
              <li key={term.id} className={term.current ? "is-current" : undefined}>
                <div>
                  <strong>{term.label}</strong>
                  <small>
                    {[term.overallGrade, term.overallAggregate != null ? `AGG ${term.overallAggregate}` : null]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </small>
                </div>
                <em>{term.overallScore == null ? "—" : `${term.overallScore}%`}</em>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <Empty copy="Earlier published reports will show here for comparison." />
      )}
    </section>
  );
}

export function PointsPanel({ points }: { points: OnlinePointsBundle }) {
  if (points.missing) {
    return (
      <section className="kor-panel">
        <PanelHead title="Term points" note="Behaviour & effort" />
        <Empty copy="Points will appear here after the school turns them on." />
      </section>
    );
  }

  return (
    <section className="kor-panel">
      <PanelHead title="Term points" note={`${points.count} awards`} />
      <div className={`kor-points-hero ${points.total < 0 ? "is-down" : "is-up"}`}>
        <span>Balance</span>
        <strong>{points.total > 0 ? `+${points.total}` : String(points.total)}</strong>
        <small>
          {points.given} given · {points.taken} taken
        </small>
      </div>

      {points.reasons.length ? (
        <div className="kor-panel-block">
          <PanelHead title="Breakdown" note="By reason" />
          <KorBarChart
            items={points.reasons.slice(0, 8).map((reason) => ({
              label: reason.label,
              value: Math.abs(reason.points),
              tone: reason.points < 0 ? "low" : "high",
            }))}
            max={Math.max(10, ...points.reasons.map((reason) => Math.abs(reason.points)))}
            unit=""
          />
        </div>
      ) : null}

      {points.awards.length ? (
        <ol className="kor-points-list">
          {points.awards.map((award) => (
            <li key={award.id} className={award.points < 0 ? "is-down" : "is-up"}>
              <b>{award.label}</b>
              <span>
                <strong>{pointsTitle(award.points)}</strong>
                <small>
                  {award.reason} · {award.teacher} ·{" "}
                  {new Date(award.at).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Africa/Kampala",
                  })}
                </small>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <Empty copy="No points recorded for this term yet." />
      )}
    </section>
  );
}

export function OtherSubjectsPanel({ subjects }: { subjects: OnlineOtherSubject[] }) {
  return (
    <section className="kor-panel">
      <PanelHead title="Other subjects" note="Percentage" />
      {subjects.length ? (
        <>
          <KorBarChart items={subjects.map((subject) => ({ label: subject.name, value: subject.percent }))} />
          <ul className="kor-other-list">
            {subjects.map((subject) => (
              <li key={subject.id}>
                <div className="kor-other-top">
                  <strong>{subject.name}</strong>
                  <em>{subject.percent == null ? "—" : `${subject.percent}%`}</em>
                </div>
                {subject.level ? <span className="kor-other-level">{subject.level}</span> : null}
                {subject.sittings.length > 1 ? (
                  <ul className="kor-other-sittings">
                    {subject.sittings.map((sitting, index) => (
                      <li key={`${subject.id}-${index}`}>
                        <span>{sitting.label}</span>
                        <b>{sitting.percent == null ? "—" : `${sitting.percent}%`}</b>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <Empty copy="Other subject percentages will appear once co-curricular marks are recorded." />
      )}
    </section>
  );
}

export function LibraryPanel({ books }: { books: OnlineLibraryBook[] }) {
  return (
    <section className="kor-panel">
      <PanelHead title="Library" note="Books this term" />
      {books.length ? (
        <ul className="kor-book-list">
          {books.map((book) => (
            <li key={book.id}>
              <strong>{book.title}</strong>
              {book.authors ? <em>{book.authors}</em> : null}
              <small>
                Issued {book.issuedOn}
                {book.returnedOn ? ` · Returned ${book.returnedOn}` : ` · Due ${book.dueOn} · Still out`}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <Empty copy="No library books were issued to this pupil in the term window." />
      )}
    </section>
  );
}

export function AttendancePanel({ attendance }: { attendance: OnlineAttendanceBundle }) {
  return (
    <section className="kor-panel">
      <PanelHead title="Attendance" note={attendance.total ? `${attendance.percent}% present` : "This term"} />
      <div className="kor-snapshot kor-snapshot-tight">
        <div className="kor-stat">
          <span>Present</span>
          <strong>{attendance.present}</strong>
        </div>
        <div className="kor-stat">
          <span>Late</span>
          <strong>{attendance.late}</strong>
        </div>
        <div className="kor-stat">
          <span>Absent</span>
          <strong>{attendance.absent}</strong>
        </div>
        <div className="kor-stat">
          <span>Excused</span>
          <strong>{attendance.excused}</strong>
        </div>
      </div>

      {attendance.daysPresent != null || attendance.daysOpened != null ? (
        <p className="kor-attendance-line">
          Report snapshot{" "}
          <strong>
            {attendance.daysPresent ?? "—"}/{attendance.daysOpened ?? "—"}
          </strong>
        </p>
      ) : null}

      <KorStackBar
        segments={[
          { label: "Present", value: attendance.present, tone: "present" },
          { label: "Late", value: attendance.late, tone: "late" },
          { label: "Excused", value: attendance.excused, tone: "excused" },
          { label: "Absent", value: attendance.absent, tone: "absent" },
        ]}
      />

      {attendance.byMonth.length ? (
        <div className="kor-panel-block">
          <PanelHead title="By month" note="Marked days" />
          <KorBarChart
            items={attendance.byMonth.map((month) => ({
              label: month.label,
              value: month.marked ? Math.round((month.present / month.marked) * 100) : null,
            }))}
          />
        </div>
      ) : (
        <Empty copy="Day-by-day attendance will appear once the register is marked." />
      )}
    </section>
  );
}

export function ClubsPanel({ clubs }: { clubs: OnlineClub[] }) {
  return (
    <section className="kor-panel">
      <PanelHead title="Clubs" note="This term" />
      {clubs.length ? (
        <ul className="kor-club-list">
          {clubs.map((club) => (
            <li key={club.id}>
              <div className="kor-club-top">
                <strong>{club.title}</strong>
                <span className={club.paid ? "is-paid" : "is-open"}>{club.paid ? "Paid" : "Enrolled"}</span>
              </div>
              <small>{[club.meeting, club.campus].filter(Boolean).join(" · ") || "Club activity"}</small>
            </li>
          ))}
        </ul>
      ) : (
        <Empty copy="No club enrolments are linked to this pupil for the term." />
      )}
    </section>
  );
}
