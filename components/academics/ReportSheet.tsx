import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { StudentFace } from "@/components/StudentFace";
import { ReportQr } from "@/components/academics/ReportQr";
import { classLabel, DEFAULT_GRADE_SCALE, formatShare, num, type ReportPart, type ReportSet, type ScaleBand } from "@/lib/academics";
import { normaliseReportTitle } from "@/lib/report-title";
import type { ReportFeeLine } from "@/lib/report-closing";
import { formatReportDate, formatReportMoney } from "@/lib/report-format";
import "./report-sheet.css";

export type SheetLine = {
  subject_id: string;
  subject_name: string;
  score: number | null;
  grade: string | null;
  position: number | null;
  teacher_comment: string | null;
  teacher_initials?: string | null;
  parts?: ReportPart[];
};

export type SheetActivitySkill = { label: string; acquired: boolean };

export type SheetActivity = {
  slot: number;
  activity_name: string | null;
  level: string | null;
  score?: number | null;
  max_score?: number | null;
  skills?: SheetActivitySkill[];
  comment?: string | null;
};

export type SheetCard = {
  id: string;
  pupil_name: string;
  student_number: string | null;
  term_label: string;
  report_title?: string | null;
  class_code: string | null;
  stream: string;
  class_teacher_name: string | null;
  class_teacher_comment: string | null;
  head_comment: string | null;
  cocurricular_comment?: string | null;
  conduct: string | null;
  days_present: number | null;
  days_opened: number | null;
  overall_score: number | null;
  overall_aggregate?: number | null;
  overall_grade?: string | null;
  overall_position: number | null;
  status: string;
  student_id?: string | null;
  photo_path?: string | null;
  lines: SheetLine[];
  activities?: SheetActivity[];
  sets?: ReportSet[];
  scale?: ScaleBand[];
  href?: string;
  fees?: ReportFeeLine[];
  next_starts_on?: string | null;
};

const ACTIVITY_SLOTS = [1, 2, 3, 4];

function activityFor(card: SheetCard, slot: number): SheetActivity | undefined {
  return (card.activities || []).find((row) => row.slot === slot);
}

/** Widen assessment columns (and shrink Subject) so titles fit in at most two lines. */
function setColumnVars(sets: ReportSet[]): CSSProperties | undefined {
  if (!sets.length) return undefined;
  const labels = sets.map((set) => set.label.trim()).filter(Boolean);
  if (!labels.length) return undefined;

  let titleSize = 0.68;
  let setCol = 3.6;
  let subjectCol = 18;
  const minTitle = 0.48;
  const maxSet = 7.5;
  const minSubject = 9;

  const linesFor = (label: string, widthRem: number, fontRem: number) => {
    const charsPerLine = Math.max(1, Math.floor(widthRem / (fontRem * 0.72)));
    const words = label.split(/\s+/).filter(Boolean);
    let lines = 1;
    let used = 0;
    for (const word of words) {
      const chunks = Math.max(1, Math.ceil(word.length / charsPerLine));
      for (let chunk = 0; chunk < chunks; chunk += 1) {
        const piece = Math.min(charsPerLine, word.length - chunk * charsPerLine);
        if (used === 0) {
          used = piece;
          continue;
        }
        if (used + 1 + piece <= charsPerLine) {
          used += 1 + piece;
        } else {
          lines += 1;
          used = piece;
        }
      }
    }
    return lines;
  };

  const needsRoom = (widthRem: number, fontRem: number) =>
    labels.some((label) => linesFor(label, widthRem, fontRem) > 2);

  while (needsRoom(setCol, titleSize) && titleSize > minTitle + 0.01) {
    titleSize = Math.round((titleSize - 0.02) * 100) / 100;
  }
  while (needsRoom(setCol, titleSize) && setCol < maxSet) {
    setCol = Math.round((setCol + 0.35) * 100) / 100;
    subjectCol = Math.max(minSubject, Math.round((subjectCol - 0.7) * 10) / 10);
  }
  while (needsRoom(setCol, titleSize) && titleSize > minTitle) {
    titleSize = Math.round((titleSize - 0.02) * 100) / 100;
  }

  return {
    "--set-col": `${setCol}rem`,
    "--set-title-size": `calc(${titleSize}rem + 1pt)`,
    "--subject-col": `${subjectCol}%`,
  } as CSSProperties;
}

export function ReportSheet({ card, nursery, portrait, qr }: { card: SheetCard; nursery: boolean; portrait?: ReactNode; qr?: ReactNode }) {
  const place = classLabel(card.class_code, card.stream);
  const sheetTitle = normaliseReportTitle(card.report_title);
  const sets = (card.sets ?? []).length > 1 ? card.sets ?? [] : [];
  const scored = card.lines.some((line) => line.score !== null);
  const columns = 1 + (sets.length || 1) + (nursery ? 0 : 1) + 2;
  const scale = card.scale?.length ? card.scale : DEFAULT_GRADE_SCALE[nursery ? "nursery" : "primary"];
  const setVars = setColumnVars(sets);

  return (
    <article className="acd-sheet" aria-label={`${card.pupil_name}, ${sheetTitle}`}>
      <div className="acd-sheet-edge">
        <div className="acd-sheet-watermark" aria-hidden="true">
          <img src="/images/icon.png" alt="" />
        </div>
        <header className="acd-sheet-mast">
          <div className="acd-sheet-banner">
            <img className="acd-sheet-crest" src="/images/icon.png" alt="" />
            <div className="acd-sheet-brand">
              <p className="acd-sheet-established">Established 1993</p>
              <p className="acd-sheet-school">
                <span className="acd-sheet-kampala">Kampala</span>
                <span className="acd-sheet-academy">Junior Academy</span>
              </p>
              <p className="acd-sheet-contact">
                <span>P.O. Box 6202</span>
                <span>info@kja.com</span>
                <span>+256 392 700 370</span>
              </p>
            </div>
            <div className="acd-sheet-portrait">
              {portrait ?? (
                card.student_id ? (
                  <StudentFace id={card.student_id} name={card.pupil_name} photoPath={card.photo_path} className="acd-sheet-face" />
                ) : (
                  <span className="acd-sheet-seal" aria-hidden="true">{monogram(card.pupil_name)}</span>
                )
              )}
            </div>
          </div>
          <div className="acd-sheet-rules" aria-hidden="true" />
          <div className="acd-sheet-title">
            <h2><span>{sheetTitle}</span></h2>
            <p className="acd-sheet-term">{card.term_label}</p>
          </div>
        </header>

        <section className="acd-sheet-identity">
          <div className="acd-sheet-pupil">
            <p className="acd-sheet-kicker">Pupil</p>
            <h3>{card.href ? <Link href={card.href}>{card.pupil_name}</Link> : card.pupil_name}</h3>
            <p className="acd-sheet-place">{[place, card.student_number].filter(Boolean).join("  ·  ")}</p>
          </div>
          <dl className="acd-sheet-figures">
            <div className={figureTone(card.overall_grade, card.overall_score)}>
              <dt>{nursery ? "Overall" : "Average"}</dt>
              <dd>{formatScore(card.overall_score, nursery)}</dd>
            </div>
            <div>
              <dt>AGG</dt>
              <dd>{card.overall_aggregate != null ? String(card.overall_aggregate) : "—"}</dd>
            </div>
            <div className={figureTone(card.overall_grade, card.overall_score)}>
              <dt>Grade</dt>
              <dd>{card.overall_grade || "—"}</dd>
            </div>
            <div className="is-attendance">
              <dt>Attendance</dt>
              <dd className="acd-sheet-tick" aria-label="Attendance recorded">
                <svg viewBox="0 0 24 24" width="1.1em" height="1.1em" aria-hidden="true" focusable="false">
                  <path fill="currentColor" d="M9.2 16.6 4.8 12.2l1.4-1.4 3 3 8-8 1.4 1.4z" />
                </svg>
              </dd>
            </div>
          </dl>
        </section>

        <section className="acd-sheet-record" aria-label="Academic record">
          <p className="acd-sheet-kicker">Academic record</p>
          <div className="acd-sheet-table-wrap">
            <table className={sets.length ? "acd-sheet-table has-sets" : "acd-sheet-table"} style={setVars}>
              <thead>
                <tr>
                  <th>Subject</th>
                  {sets.map((set) => (
                    <th key={set.key} className="is-num is-set">
                      <span>{set.label}</span>
                      <small>{formatShare(set.share)}</small>
                    </th>
                  ))}
                  <th className="is-num is-score">{sets.length ? "Total" : nursery ? "Progress" : "Score"}</th>
                  {!nursery ? <th className="is-num is-grade">Grade</th> : null}
                  <th className="is-note">Teacher's comment</th>
                  <th className="is-sign">Initials</th>
                </tr>
              </thead>
              <tbody>
                {card.lines.length ? card.lines.map((line) => {
                  const tone = gradeTone(line.grade) || scoreTone(line.score);
                  const toneClass = tone ? ` is-${tone}` : "";
                  return (
                    <tr key={line.subject_id} className={tone ? `is-tone-${tone}` : undefined}>
                      <td className="acd-sheet-subject">
                        <strong>{line.subject_name}</strong>
                      </td>
                      {sets.map((set) => {
                        const part = line.parts?.find((entry) => entry.key === set.key);
                        return <td key={set.key} className={`is-num is-set${toneClass}`}>{formatScore(part?.score ?? null, nursery)}</td>;
                      })}
                      <td className={`is-num is-score${toneClass}`}>
                        <span className={`acd-sheet-figure${toneClass}`}>{nursery ? (line.grade || "—") : formatScore(line.score, false)}</span>
                      </td>
                      {!nursery ? <td className="is-num is-grade">{line.grade ? <span className={`acd-grade is-${tone}`}>{line.grade}</span> : <span className="acd-sheet-empty">—</span>}</td> : null}
                      <td className="is-note" title={line.teacher_comment || undefined}>{line.teacher_comment || ""}</td>
                      <td className="is-sign">{line.teacher_initials || ""}</td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td className="acd-sheet-empty" colSpan={columns}>No subjects on this card yet.</td>
                  </tr>
                )}
              </tbody>
              {scored && card.overall_score !== null ? (
                <tfoot>
                  <tr>
                    <th>{nursery ? "Overall" : "Average"}</th>
                    {sets.map((set) => <td key={set.key} />)}
                    <td className="is-num is-score">{formatScore(card.overall_score, nursery)}</td>
                    {!nursery ? <td className="is-num is-grade" /> : null}
                    <td className="is-note" />
                    <td className="is-sign" />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </section>

        <div className="acd-sheet-lower">
          <section className="acd-sheet-scale" aria-label="Grading scale">
            <p className="acd-sheet-kicker">Grading scale</p>
            <ol>
              {scale.map((band) => {
                const tone = gradeTone(band.label) || scoreTone((band.min + band.max) / 2);
                return (
                  <li key={band.label} className={tone ? `is-${tone}` : undefined}>
                    <strong>{band.label}</strong>
                    <span>{markRange(band.min)}–{markRange(band.max)}</span>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="acd-sheet-activities" aria-label="Co-curricular activities">
            <p className="acd-sheet-kicker">Co-curricular</p>
            <table className="acd-sheet-coco-table">
              <thead>
                <tr>
                  <th scope="col">Activity</th>
                  <th scope="col">Comment</th>
                </tr>
              </thead>
              <tbody>
                {ACTIVITY_SLOTS.map((slot) => activityFor(card, slot))
                  .filter((row): row is SheetActivity => Boolean(row?.activity_name?.trim()))
                  .map((row) => (
                    <tr key={row.slot}>
                      <td className="is-activity">{row.activity_name}</td>
                      <td className="is-coco-note">{row.comment || ""}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>

          <section className="acd-sheet-report">
            <h3>
              <span>Class teacher's report</span>
              {card.class_teacher_name ? <em>{card.class_teacher_name}</em> : null}
            </h3>
            <p className={card.class_teacher_comment ? "has-copy" : "is-blank"}>{card.class_teacher_comment || ""}</p>
          </section>

          <section className="acd-sheet-closing" aria-label="Headteacher comment and next-term fees">
            <div className="acd-sheet-principal">
              <h3><span>Headteacher's comment</span></h3>
              <p className={card.head_comment ? "has-copy" : "is-blank"}>{card.head_comment || ""}</p>
            </div>
            {qr ?? <ReportQr id={card.id} />}
            <section className="acd-sheet-fees" aria-label="Fees and the next term">
              <div>
                <h3>School fees for next term</h3>
                <FeeLines lines={card.fees ?? []} />
              </div>
              <div>
                <h3>Next term starts on</h3>
                <p className="acd-sheet-next">{formatReportDate(card.next_starts_on) || "—"}</p>
              </div>
            </section>
          </section>
        </div>

      </div>
    </article>
  );
}

function FeeLines({ lines }: { lines: ReportFeeLine[] }) {
  if (!lines.length) return <p className="acd-sheet-next">—</p>;
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  return (
    <dl className="acd-sheet-fee-list">
      {lines.map((line) => (
        <div key={line.name}>
          <dt>{line.name}</dt>
          <dd>{formatReportMoney(line.amount)}</dd>
        </div>
      ))}
      {lines.length > 1 ? (
        <div className="is-total">
          <dt>Total</dt>
          <dd>{formatReportMoney(total)}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function markRange(value: number) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

function monogram(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "K";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function formatScore(score: number | null, nursery: boolean) {
  if (score === null || Number.isNaN(score)) return "—";
  if (nursery) return score >= 75 ? "Exceeding" : score >= 50 ? "Secure" : score >= 25 ? "Developing" : "Beginning";
  return `${num(score) ?? score}%`;
}

export function ordinal(value: number) {
  const mod = value % 100;
  const suffix = mod >= 11 && mod <= 13 ? "th" : value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th";
  return `${value}${suffix}`;
}

export function gradeTone(grade: string | null | undefined) {
  if (!grade) return "";
  const value = grade.trim().toLowerCase();
  if (value === "exceeding" || value === "a" || value === "a+") return "high";
  if (value === "secure" || value === "b" || value === "developing") return "mid";
  if (value === "beginning" || value === "c" || value === "d" || value === "e" || value === "f") return "low";
  const code = value.match(/^([dcpf])(\d)$/);
  if (!code) return "";
  const rank = Number(code[2]);
  if (code[1] === "d" && rank <= 2) return "high";
  if (code[1] === "d" || code[1] === "c") return "mid";
  return "low";
}

function scoreTone(score: number | null) {
  if (score === null) return "";
  if (score >= 75) return "high";
  if (score >= 50) return "mid";
  return "low";
}

function figureTone(grade: string | null | undefined, score: number | null | undefined) {
  const tone = gradeTone(grade) || scoreTone(score ?? null);
  return tone ? `is-${tone}` : undefined;
}
