import { classLabel, num } from "@/lib/academics";
import "./report-sheet.css";

export type SheetLine = {
  subject_id: string;
  subject_name: string;
  score: number | null;
  grade: string | null;
  position: number | null;
  teacher_comment: string | null;
};

export type SheetCard = {
  id: string;
  pupil_name: string;
  student_number: string | null;
  term_label: string;
  class_code: string | null;
  stream: string;
  class_teacher_name: string | null;
  class_teacher_comment: string | null;
  head_comment: string | null;
  conduct: string | null;
  days_present: number | null;
  days_opened: number | null;
  overall_score: number | null;
  overall_position: number | null;
  status: string;
  lines: SheetLine[];
};

export function ReportSheet({ card, nursery }: { card: SheetCard; nursery: boolean }) {
  const place = classLabel(card.class_code, card.stream);
  return (
    <article className="acd-sheet">
      <header className="acd-sheet-head">
        <img src="/images/kja-logo.png" alt="" />
        <div>
          <p>Kampala Junior Academy</p>
          <h2>End of term report</h2>
          <p>{card.term_label}</p>
        </div>
      </header>
      <dl className="acd-sheet-meta">
        <div><dt>Pupil</dt><dd>{card.pupil_name}</dd></div>
        <div><dt>Class</dt><dd>{place}</dd></div>
        {card.student_number ? <div><dt>Number</dt><dd>{card.student_number}</dd></div> : null}
        <div><dt>Attendance</dt><dd>{card.days_present ?? 0} of {card.days_opened ?? 0} days</dd></div>
        {card.conduct ? <div><dt>Conduct</dt><dd>{card.conduct}</dd></div> : null}
        {card.overall_score !== null ? <div><dt>{nursery ? "Overall" : "Average"}</dt><dd>{formatScore(card.overall_score, nursery)}{card.overall_position ? ` · ${ordinal(card.overall_position)}` : ""}</dd></div> : null}
      </dl>
      <table className="admin-table acd-sheet-table">
        <thead>
          <tr>
            <th>Subject</th>
            <th>{nursery ? "Progress" : "Score"}</th>
            {!nursery ? <th>Grade</th> : null}
            <th>Position</th>
            <th>Comment</th>
          </tr>
        </thead>
        <tbody>
          {card.lines.map((line) => (
            <tr key={line.subject_id}>
              <td>{line.subject_name}</td>
              <td>{nursery ? (line.grade || "—") : formatScore(line.score, false)}</td>
              {!nursery ? <td>{line.grade || "—"}</td> : null}
              <td>{line.position ? ordinal(line.position) : "—"}</td>
              <td>{line.teacher_comment || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {card.class_teacher_comment ? (
        <section className="acd-sheet-note">
          <h3>Class teacher{card.class_teacher_name ? ` · ${card.class_teacher_name}` : ""}</h3>
          <p>{card.class_teacher_comment}</p>
        </section>
      ) : null}
      {card.head_comment ? (
        <section className="acd-sheet-note">
          <h3>Head teacher</h3>
          <p>{card.head_comment}</p>
        </section>
      ) : null}
      {card.status !== "published" ? (
        <p className="acd-sheet-draft">
          {card.status === "approved" ? "Approved — parents see it after it is published." : "Draft — not yet visible to parents."}
        </p>
      ) : null}
    </article>
  );
}

function formatScore(score: number | null, nursery: boolean) {
  if (score === null || Number.isNaN(score)) return "—";
  if (nursery) return score >= 75 ? "Exceeding" : score >= 50 ? "Secure" : score >= 25 ? "Developing" : "Beginning";
  return `${num(score) ?? score}%`;
}

function ordinal(value: number) {
  const mod = value % 100;
  const suffix = mod >= 11 && mod <= 13 ? "th" : value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th";
  return `${value}${suffix}`;
}
