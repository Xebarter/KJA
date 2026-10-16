"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DeskForm } from "@/components/academics/Form";
import type { AttendanceStatus } from "@/lib/academics";
import { displayPhone, telHref } from "@/lib/students";

type SaveAction = (formData: FormData) => Promise<{ error?: string; ok?: string; href?: string }>;

export type PupilFace = {
  id: string;
  admissionsHref: string | null;
};

export type AttendanceDay = {
  date: string;
  status: AttendanceStatus;
  note: string | null;
};

export type AttendancePicture = {
  present: number;
  late: number;
  absent: number;
  excused: number;
  days: AttendanceDay[];
};

export type PaperMark = {
  key: string;
  subject: string;
  paper: string;
  kind: string;
  kindLabel: string;
  score: number | null;
  max: number;
  missed: boolean;
  held: string | null;
};

export type ReportLine = {
  subject: string;
  score: number | null;
  grade: string | null;
  position: number | null;
  comment: string | null;
};

export type ReportView = {
  id: string;
  href: string;
  status: string;
  score: number | null;
  position: number | null;
  conduct: string | null;
  teacher: string | null;
  comment: string | null;
  head: string | null;
  daysPresent: number | null;
  daysOpened: number | null;
  lines: ReportLine[];
};

export type InterventionView = {
  id: string;
  reason: string;
  note: string;
  followUp: string | null;
  status: string;
};

export type ContactView = {
  role: string;
  name: string;
  phone: string | null;
};

const KIND_FILTERS = [
  { value: "", label: "All papers" },
  { value: "bot", label: "Beginning" },
  { value: "midterm", label: "Midterm" },
  { value: "endterm", label: "End of term" },
  { value: "test", label: "Tests" },
] as const;

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  excused: "Excused",
};

function nf(value: number) {
  return value.toLocaleString("en-GB");
}

function shortDay(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year || 0, (month || 1) - 1, day || 1);
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function markText(mark: PaperMark) {
  if (mark.missed) return "Missed";
  if (mark.score == null) return "—";
  const whole = Number.isInteger(mark.score) ? String(mark.score) : mark.score.toFixed(1);
  return mark.max && mark.max !== 100 ? `${whole}/${mark.max}` : whole;
}

function percent(part: number, whole: number) {
  return whole > 0 ? Math.max(0, Math.min(100, Math.round((part / whole) * 100))) : 0;
}

export function PupilDesk({
  pupil,
  term,
  attendance,
  marks,
  report,
  interventions,
  contacts,
  home,
  office,
  termId,
  reasons,
  save,
}: {
  pupil: PupilFace;
  term: string | null;
  attendance: AttendancePicture;
  marks: PaperMark[];
  report: ReportView | null;
  interventions: InterventionView[];
  contacts: ContactView[];
  home: string | null;
  office: boolean;
  termId: string | null;
  reasons: { value: string; label: string }[];
  save: SaveAction;
}) {
  const marked = attendance.present + attendance.late + attendance.absent + attendance.excused;
  const attended = attendance.present + attendance.late;
  const rate = percent(attended, marked);
  const open = interventions.filter((row) => row.status === "open").length;
  const tone = rate >= 90 ? "is-ok" : rate >= 75 ? "" : "is-warn";

  return (
    <div className="pup-desk">
      <section className="pup-strip" aria-label="This term">
        <div className={tone}>
          <span>Attendance</span>
          <strong>{marked ? `${rate}%` : "—"}</strong>
          <small>{marked ? `${nf(attended)} of ${nf(marked)} days in` : "No register marks yet"}</small>
        </div>
        <div className={attendance.absent ? "is-warn" : ""}>
          <span>Absent</span>
          <strong>{nf(attendance.absent)}</strong>
          <small>{attendance.excused ? `${nf(attendance.excused)} excused` : attendance.late ? `${nf(attendance.late)} late` : term ?? "This term"}</small>
        </div>
        <div>
          <span>Report</span>
          <strong className={report?.score == null ? "is-name" : ""}>{report?.score != null ? nf(report.score) : report ? titleCase(report.status) : "None"}</strong>
          <small>{report?.position ? `Position ${nf(report.position)}` : report?.conduct || (term ?? "No current term")}</small>
        </div>
        <div className={open ? "is-warn" : "is-ok"}>
          <span>Follow-up</span>
          <strong>{nf(open)}</strong>
          <small>{open ? "Open interventions" : "Nothing open"}</small>
        </div>
        <div className="pup-mix">
          <div className="pup-mix-bar" aria-hidden="true">
            {attendance.present ? <span className="is-present" style={{ flexGrow: attendance.present }} /> : null}
            {attendance.late ? <span className="is-late" style={{ flexGrow: attendance.late }} /> : null}
            {attendance.excused ? <span className="is-excused" style={{ flexGrow: attendance.excused }} /> : null}
            {attendance.absent ? <span className="is-absent" style={{ flexGrow: attendance.absent }} /> : null}
            {!marked ? <span className="is-none" style={{ flexGrow: 1 }} /> : null}
          </div>
          <ul>
            <li><i className="is-present" /> Present <em>{nf(attendance.present)}</em></li>
            <li><i className="is-late" /> Late <em>{nf(attendance.late)}</em></li>
            <li><i className="is-excused" /> Excused <em>{nf(attendance.excused)}</em></li>
            <li><i className="is-absent" /> Absent <em>{nf(attendance.absent)}</em></li>
          </ul>
        </div>
      </section>

      <div className="pup-layout">
        <div className="pup-main">
          <MarksBook marks={marks} />
          <section className="pup-card" aria-label="Recent attendance">
            <CardHead icon="fa-clipboard-user" title="Recent attendance" text={marked ? `${nf(marked)} marks this term` : "The register has no marks for this pupil yet."} />
            {attendance.days.length ? (
              <ol className="pup-days">
                {attendance.days.map((day) => (
                  <li key={day.date} className={`is-${day.status}`}>
                    <time dateTime={day.date}>{shortDay(day.date)}</time>
                    <em className={`pup-pill is-${day.status}`}>{STATUS_LABEL[day.status]}</em>
                    {day.note ? <small>{day.note}</small> : <small />}
                  </li>
                ))}
              </ol>
            ) : <p className="pup-quiet">Nothing to show until a register is marked.</p>}
          </section>
        </div>

        <div className="pup-side">
          <ReportCard report={report} />
          <section className="pup-card" aria-label="Home">
            <CardHead
              icon="fa-house"
              title="Home"
              text={home || "For a follow-up call. The full family file stays in admissions."}
              action={pupil.admissionsHref ? <Link href={pupil.admissionsHref}>Full record</Link> : undefined}
            />
            {contacts.length ? (
              <ul className="pup-people">
                {contacts.map((person) => (
                  <li key={person.role}>
                    <em aria-hidden="true">{initials(person.name)}</em>
                    <span>
                      <small>{person.role}</small>
                      <strong>{person.name}</strong>
                    </span>
                    {person.phone && telHref(person.phone) ? <a href={telHref(person.phone)}>{displayPhone(person.phone)}</a> : <small className="is-quiet">No phone</small>}
                  </li>
                ))}
              </ul>
            ) : <p className="pup-quiet">No parent contacts on this record.</p>}
          </section>
          <Support interventions={interventions} office={office} termId={termId} pupilId={pupil.id} term={term} reasons={reasons} save={save} />
        </div>
      </div>
    </div>
  );
}

function MarksBook({ marks }: { marks: PaperMark[] }) {
  const [kind, setKind] = useState("");
  const available = new Set(marks.map((mark) => mark.kind));
  const filters = KIND_FILTERS.filter((entry) => !entry.value || available.has(entry.value));
  const visible = kind ? marks.filter((mark) => mark.kind === kind) : marks;
  const groups = useMemo(() => {
    const map = new Map<string, PaperMark[]>();
    for (const mark of visible) {
      const list = map.get(mark.subject) ?? [];
      list.push(mark);
      map.set(mark.subject, list);
    }
    return [...map.entries()].map(([subject, papers]) => {
      const scored = papers.filter((paper) => !paper.missed && paper.score != null && paper.max > 0);
      const average = scored.length
        ? Math.round(scored.reduce((sum, paper) => sum + ((paper.score ?? 0) / paper.max) * 100, 0) / scored.length)
        : null;
      return { subject, average, papers };
    }).sort((a, b) => a.subject.localeCompare(b.subject));
  }, [visible]);

  return (
    <section className="pup-card" aria-label="Marks">
      <CardHead icon="fa-pen-to-square" title="Marks" text={marks.length ? `${nf(visible.length)} ${visible.length === 1 ? "paper" : "papers"}${kind ? "" : " this term"}` : "No papers entered for this pupil yet."} />
      {filters.length > 1 ? (
        <div className="pup-chips" role="group" aria-label="Paper kind">
          {filters.map((entry) => (
            <button key={entry.value || "all"} type="button" aria-pressed={kind === entry.value} className={kind === entry.value ? "is-on" : ""} onClick={() => setKind(entry.value)}>
              {entry.label}
            </button>
          ))}
        </div>
      ) : null}
      {groups.length ? (
        <ul className="pup-subjects">
          {groups.map((group) => (
            <li key={group.subject}>
              <header>
                <strong>{group.subject}</strong>
                <em>{group.average == null ? "—" : `${group.average}%`}</em>
              </header>
              {group.average != null ? <span className="pup-bar" aria-hidden="true"><i style={{ width: `${group.average}%` }} /></span> : null}
              <ul>
                {group.papers.map((paper) => (
                  <li key={paper.key}>
                    <span>{paper.paper}<small>{[paper.paper.toLowerCase() === paper.kindLabel.toLowerCase() ? "" : paper.kindLabel, paper.held ? shortDay(paper.held) : ""].filter(Boolean).join(" · ")}</small></span>
                    <strong className={paper.missed ? "is-missed" : ""}>{markText(paper)}</strong>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : <p className="pup-quiet">{marks.length ? "No papers of that kind." : "Marks appear here once a teacher enters them."}</p>}
    </section>
  );
}

function ReportCard({ report }: { report: ReportView | null }) {
  return (
    <section className="pup-card" aria-label="Report card">
      <CardHead icon="fa-file-lines" title="Report card" text={report ? titleCase(report.status) : "Not started for this term."} action={report ? <Link href={report.href}>Open</Link> : undefined} />
      {report ? (
        <>
          <dl className="pup-facts">
            <div><dt>Score</dt><dd>{report.score != null ? nf(report.score) : "—"}</dd></div>
            <div><dt>Position</dt><dd>{report.position ? nf(report.position) : "—"}</dd></div>
            <div><dt>Conduct</dt><dd>{report.conduct || "—"}</dd></div>
            <div><dt>Days</dt><dd>{report.daysPresent != null && report.daysOpened != null ? `${nf(report.daysPresent)}/${nf(report.daysOpened)}` : "—"}</dd></div>
          </dl>
          {report.comment ? <p className="pup-comment"><span>Class teacher{report.teacher ? `, ${report.teacher}` : ""}</span>{report.comment}</p> : null}
          {report.head ? <p className="pup-comment"><span>Head teacher</span>{report.head}</p> : null}
          {report.lines.length ? (
            <ul className="pup-lines">
              {report.lines.map((line) => (
                <li key={line.subject}>
                  <span>{line.subject}{line.comment ? <small>{line.comment}</small> : null}</span>
                  <strong><b>{line.grade || (line.score != null ? nf(line.score) : "—")}</b>{line.position ? <small>{ordinal(line.position)}</small> : null}</strong>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : <p className="pup-quiet">A report card is created when the class results are prepared.</p>}
    </section>
  );
}

function Support({
  interventions,
  office,
  termId,
  pupilId,
  term,
  reasons,
  save,
}: {
  interventions: InterventionView[];
  office: boolean;
  termId: string | null;
  pupilId: string;
  term: string | null;
  reasons: { value: string; label: string }[];
  save: SaveAction;
}) {
  return (
    <section className="pup-card" aria-label="Interventions">
      <CardHead icon="fa-hand-holding-heart" title="Interventions" text={term ? `Follow-up for ${term}.` : "Set a current term before opening a follow-up."} />
      {interventions.length ? (
        <ul className="pup-notes">
          {interventions.map((row) => (
            <li key={row.id} className={row.status === "done" ? "is-done" : ""}>
              <div>
                <strong>{row.reason}</strong>
                <span className={`pup-pill${row.status === "open" ? " is-open" : ""}`}>{titleCase(row.status)}</span>
              </div>
              <p>{row.note}</p>
              {row.followUp ? <small>Follow up {shortDay(row.followUp)}</small> : null}
              {office && row.status === "open" ? (
                <DeskForm action={save} className="pup-done">
                  <input type="hidden" name="id" value={row.id} />
                  <button type="submit" name="intent" value="done">Mark done</button>
                </DeskForm>
              ) : null}
            </li>
          ))}
        </ul>
      ) : <p className="pup-quiet">No interventions this term.</p>}
      {office && termId ? (
        <DeskForm action={save} className="pup-form">
          <p className="pup-form-label">New follow-up</p>
          <input type="hidden" name="term_id" value={termId} />
          <input type="hidden" name="student_id" value={pupilId} />
          <label className="pup-field">
            <span>Reason</span>
            <select name="reason" defaultValue={reasons[0]?.value ?? "decline"}>
              {reasons.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
            </select>
          </label>
          <label className="pup-field">
            <span>What the school will do</span>
            <textarea name="note" rows={3} required placeholder="The support, and who will follow it" />
          </label>
          <label className="pup-field">
            <span>Follow-up date</span>
            <input name="follow_up_on" type="date" />
          </label>
          <button className="pup-commit" type="submit">Open intervention</button>
        </DeskForm>
      ) : null}
    </section>
  );
}

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function CardHead({ icon, title, text, action }: { icon: string; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <header className="pup-card-head">
      <span className="pup-card-icon" aria-hidden="true"><i className={`fa-solid ${icon}`} /></span>
      <div>
        <h2>{title}</h2>
        {text ? <p>{text}</p> : null}
      </div>
      {action}
    </header>
  );
}

function titleCase(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function ordinal(value: number) {
  const mod = value % 100;
  const suffix = mod >= 11 && mod <= 13 ? "th" : (["th", "st", "nd", "rd"][value % 10] ?? "th");
  return `${value}${suffix}`;
}
