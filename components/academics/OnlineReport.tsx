import type { ReactNode } from "react";
import {
  formatScore,
  gradeTone,
  type SheetActivity,
  type SheetCard,
  type SheetSkillLine,
} from "@/components/academics/ReportSheet";
import { classLabel, DEFAULT_GRADE_SCALE, formatShare } from "@/lib/academics";
import {
  nurseryAgeLabel,
  nurseryDomainImagePath,
  nurseryReportClassLabel,
} from "@/lib/nursery-dsba";
import { formatReportDate, formatReportMoney } from "@/lib/report-format";
import { normaliseReportTitle, nurseryReportTitle } from "@/lib/report-title";
import "./online-report.css";

const ACTIVITY_SLOTS = [1, 2, 3, 4];

function monogram(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "K";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function toneClass(grade: string | null | undefined, score: number | null | undefined) {
  const tone = gradeTone(grade) || (score == null ? "" : score >= 75 ? "high" : score >= 50 ? "mid" : "low");
  return tone ? `is-${tone}` : "";
}

function attendanceLabel(present: number | null, opened: number | null) {
  if (present != null && opened != null && opened > 0) return `${present}/${opened}`;
  if (present != null) return String(present);
  return "Recorded";
}

function activityPercent(row: SheetActivity) {
  if (row.score == null) return null;
  const max = row.max_score && row.max_score > 0 ? row.max_score : 100;
  return Math.round((row.score / max) * 1000) / 10;
}

function groupSkillLines(lines: SheetSkillLine[]) {
  const groups: { domain: string; domainSort: number; image: string | null; skills: SheetSkillLine[] }[] = [];
  for (const line of [...lines].sort((a, b) => a.domain_sort - b.domain_sort || a.skill_sort - b.skill_sort)) {
    const last = groups[groups.length - 1];
    if (last && last.domain === line.domain_name) {
      last.skills.push(line);
      continue;
    }
    groups.push({
      domain: line.domain_name,
      domainSort: line.domain_sort,
      image: nurseryDomainImagePath({
        domain_name: line.domain_name,
        domain_sort: line.domain_sort,
      }),
      skills: [line],
    });
  }
  return groups;
}

/** Mobile-first report body for QR `/r/[id]`. Use `embedded` inside OnlineReportShell. */
export function OnlineReport({
  card,
  nursery,
  portrait,
  embedded = false,
}: {
  card: SheetCard;
  nursery: boolean;
  portrait?: ReactNode;
  embedded?: boolean;
}) {
  const sheetTitle = nursery ? nurseryReportTitle() : normaliseReportTitle(card.report_title);
  const sets = (card.sets ?? []).length > 1 ? card.sets ?? [] : [];
  const skillGroups = groupSkillLines(card.skillLines || []);
  const dsba = nursery && skillGroups.length > 0;
  const place = dsba
    ? nurseryReportClassLabel(card.class_code, card.stream)
    : classLabel(card.class_code, card.stream);
  const scale = card.scale?.length ? card.scale : DEFAULT_GRADE_SCALE[nursery ? "nursery" : "primary"];
  const legend = card.progressLegend?.length ? card.progressLegend : null;
  const activities = ACTIVITY_SLOTS.map((slot) => (card.activities || []).find((row) => row.slot === slot))
    .filter((row): row is SheetActivity => Boolean(row?.activity_name?.trim()));
  const fees = card.fees ?? [];
  const feeTotal = fees.reduce((sum, line) => sum + line.amount, 0);
  const overallTone = toneClass(card.overall_grade, card.overall_score);
  const age = nurseryAgeLabel(card.date_of_birth);
  const year = card.term_year != null ? String(card.term_year) : null;

  const body = (
    <>
      {!embedded ? (
        <header className="kor-top">
          <img className="kor-crest" src="/images/icon.png" alt="" />
          <div className="kor-brand">
            <p className="kor-school">Kampala Junior Academy</p>
            <p className="kor-tag">Official term report</p>
          </div>
        </header>
      ) : null}

      <section className="kor-hero" aria-label="Pupil">
        <div className="kor-portrait">
          {portrait ?? <span className="kor-mono" aria-hidden="true">{monogram(card.pupil_name)}</span>}
          <span className="kor-portrait-ring" aria-hidden="true" />
        </div>
        <div className="kor-hero-copy">
          <p className="kor-kicker">{sheetTitle}</p>
          <h1>{card.pupil_name}</h1>
          <p className="kor-meta">
            <span>{card.term_label}</span>
            {place ? <span>{place}</span> : null}
            {card.student_number ? <span>{card.student_number}</span> : null}
            {dsba && age ? <span>{age}</span> : null}
            {dsba && year ? <span>{year}</span> : null}
          </p>
          {dsba && card.class_teacher_name ? (
            <p className="kor-teacher-line">Class teacher · {card.class_teacher_name}</p>
          ) : null}
        </div>
      </section>

      <section className="kor-snapshot" aria-label="Summary">
        {dsba ? (
          <>
            <div className="kor-stat kor-stat-avg">
              <i className="fa-solid fa-seedling" aria-hidden="true" />
              <span>Assessment</span>
              <strong>Skills</strong>
            </div>
            <div className="kor-stat kor-stat-grade">
              <i className="fa-solid fa-layer-group" aria-hidden="true" />
              <span>Domains</span>
              <strong>{skillGroups.length}</strong>
            </div>
            <div className="kor-stat kor-stat-agg">
              <i className="fa-solid fa-list-check" aria-hidden="true" />
              <span>Skills</span>
              <strong>{card.skillLines?.length || 0}</strong>
            </div>
          </>
        ) : (
          <>
            <div className={`kor-stat kor-stat-avg ${overallTone}`}>
              <i className="fa-solid fa-chart-simple" aria-hidden="true" />
              <span>{nursery ? "Overall" : "Average"}</span>
              <strong>{formatScore(card.overall_score, nursery)}</strong>
            </div>
            <div className={`kor-stat kor-stat-grade ${overallTone}`}>
              <i className="fa-solid fa-medal" aria-hidden="true" />
              <span>Grade</span>
              <strong>{card.overall_grade || "—"}</strong>
            </div>
            <div className="kor-stat kor-stat-agg">
              <i className="fa-solid fa-hashtag" aria-hidden="true" />
              <span>Aggregate</span>
              <strong>{card.overall_aggregate != null ? String(card.overall_aggregate) : "—"}</strong>
            </div>
          </>
        )}
        <div className="kor-stat kor-stat-att">
          <i className="fa-solid fa-calendar-check" aria-hidden="true" />
          <span>Attendance</span>
          <strong>{attendanceLabel(card.days_present, card.days_opened)}</strong>
        </div>
      </section>

      {dsba ? (
        <section className="kor-block kor-nur-skills-block" aria-labelledby="kor-skills-title">
          <div className="kor-block-head">
            <h2 id="kor-skills-title"><i className="fa-solid fa-seedling" aria-hidden="true" /> Developmental skills</h2>
            <p>
              {skillGroups.length} domain{skillGroups.length === 1 ? "" : "s"} · {card.skillLines?.length || 0} skills
            </p>
          </div>
          <ul className="kor-skills kor-nur-skills">
            {skillGroups.map((group, index) => (
              <li key={group.domain} className={`kor-skill-domain is-tone-${index % 8}`}>
                <div className="kor-skill-domain-head">
                  {group.image ? <img src={group.image} alt="" /> : <span className="kor-skill-domain-fallback" aria-hidden="true" />}
                  <h3>{group.domain}</h3>
                </div>
                <ul>
                  {group.skills.map((line) => (
                    <li key={line.skill_id}>
                      <span className="kor-skill-copy">{line.skill_description}</span>
                      <span className="kor-skill-code">
                        <strong>{line.progress_code || "—"}</strong>
                        {line.progress_label ? <small>{line.progress_label}</small> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="kor-block" aria-labelledby="kor-subjects-title">
          <div className="kor-block-head">
            <h2 id="kor-subjects-title"><i className="fa-solid fa-book-open" aria-hidden="true" /> Academic record</h2>
            <p>{card.lines.length ? `${card.lines.length} subjects` : "No subjects yet"}</p>
          </div>

          {card.lines.length ? (
            <ul className="kor-subjects">
              {card.lines.map((line) => {
                const tone = toneClass(line.grade, line.score);
                return (
                  <li key={line.subject_id} className={`kor-subject ${tone}`}>
                    <div className="kor-subject-top">
                      <h3>{line.subject_name}</h3>
                      <div className="kor-marks">
                        {!nursery ? <em className={`kor-score ${tone}`}>{formatScore(line.score, false)}</em> : null}
                        <span className={`kor-grade ${tone}`}>
                          {line.grade || (nursery ? formatScore(line.score, true) : "—")}
                        </span>
                      </div>
                    </div>

                    {sets.length ? (
                      <dl className="kor-parts">
                        {sets.map((set) => {
                          const part = line.parts?.find((entry) => entry.key === set.key);
                          return (
                            <div key={set.key}>
                              <dt>
                                {set.label}
                                <small>{formatShare(set.share)}</small>
                              </dt>
                              <dd>{formatScore(part?.score ?? null, nursery)}</dd>
                            </div>
                          );
                        })}
                      </dl>
                    ) : null}

                    {line.teacher_comment ? <p className="kor-note">{line.teacher_comment}</p> : null}
                    {line.teacher_initials ? <p className="kor-initials">{line.teacher_initials}</p> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="kor-empty">Subjects will appear here once the report is complete.</p>
          )}
        </section>
      )}

      {!dsba && activities.length ? (
        <section className="kor-block" aria-labelledby="kor-coco-title">
          <div className="kor-block-head">
            <h2 id="kor-coco-title"><i className="fa-solid fa-futbol" aria-hidden="true" /> Co-curricular</h2>
            <p>Activities this term</p>
          </div>
          <ul className="kor-coco">
            {activities.map((row) => {
              const pct = activityPercent(row);
              return (
                <li key={row.slot}>
                  <strong>{row.activity_name}</strong>
                  <em>{[row.level, pct != null ? `${pct}%` : null].filter(Boolean).join(" · ") || null}</em>
                  {row.comment ? <p>{row.comment}</p> : null}
                </li>
              );
            })}
          </ul>
          {card.cocurricular_comment ? <p className="kor-note kor-note-block">{card.cocurricular_comment}</p> : null}
        </section>
      ) : null}

      <section className="kor-block" aria-labelledby="kor-teacher-title">
        <div className="kor-block-head">
          <h2 id="kor-teacher-title"><i className="fa-solid fa-chalkboard-user" aria-hidden="true" /> Class teacher</h2>
          {card.class_teacher_name ? <p>{card.class_teacher_name}</p> : <p>Comment</p>}
        </div>
        <blockquote className={card.class_teacher_comment ? "kor-quote" : "kor-quote is-empty"}>
          {card.class_teacher_comment || "No class teacher comment on this report."}
        </blockquote>
        {card.conduct ? (
          <p className="kor-conduct">
            Conduct <strong>{card.conduct}</strong>
          </p>
        ) : null}
      </section>

      {dsba ? (
        <section className="kor-block kor-nur-signs" aria-labelledby="kor-sign-title">
          <div className="kor-block-head">
            <h2 id="kor-sign-title"><i className="fa-solid fa-pen-fancy" aria-hidden="true" /> Signatures</h2>
            <p>Head of section · Principal</p>
          </div>
          <div className="kor-nur-sign-grid">
            <div>
              <strong>Head of section</strong>
              <span className="kor-nur-sign-line" aria-hidden="true" />
            </div>
            <div>
              <strong>Principal</strong>
              <span className="kor-nur-sign-line" aria-hidden="true" />
            </div>
          </div>
        </section>
      ) : (
        <section className="kor-block" aria-labelledby="kor-head-title">
          <div className="kor-block-head">
            <h2 id="kor-head-title"><i className="fa-solid fa-landmark" aria-hidden="true" /> Headteacher</h2>
            <p>Closing remark</p>
          </div>
          <blockquote className={card.head_comment ? "kor-quote is-head" : "kor-quote is-empty"}>
            {card.head_comment || "No headteacher comment on this report."}
          </blockquote>
        </section>
      )}

      <section className="kor-block kor-fees" aria-labelledby="kor-fees-title">
        <div className="kor-block-head">
          <h2 id="kor-fees-title"><i className="fa-solid fa-calendar-day" aria-hidden="true" /> Next term</h2>
          <p>
            {formatReportDate(card.next_starts_on) || "Start date to be confirmed"}
            {dsba ? (
              <>
                {" · ends "}
                {formatReportDate(card.next_ends_on) || "to be confirmed"}
              </>
            ) : null}
          </p>
        </div>
        {fees.length ? (
          <dl className="kor-fee-list">
            {fees.map((line) => (
              <div key={line.name}>
                <dt>{line.name}</dt>
                <dd>{formatReportMoney(line.amount)}</dd>
              </div>
            ))}
            {fees.length > 1 ? (
              <div className="is-total">
                <dt>Total</dt>
                <dd>{formatReportMoney(feeTotal)}</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <p className="kor-empty">Fee details will be shared before the next term.</p>
        )}
      </section>

      <section className="kor-scale" aria-label={dsba ? "Progress codes" : "Grading scale"}>
        <p className="kor-kicker">{dsba ? "Progress codes" : "Grading scale"}</p>
        <ol>
          {dsba && legend
            ? legend.map((entry) => (
                <li key={entry.code}>
                  <strong>{entry.code}</strong>
                  <span>{entry.label}</span>
                </li>
              ))
            : scale.map((band) => {
                const tone = toneClass(band.label, (band.min + band.max) / 2);
                const lo = Number.isInteger(band.min) ? String(band.min) : String(Math.round(band.min * 10) / 10);
                const hi = Number.isInteger(band.max) ? String(band.max) : String(Math.round(band.max * 10) / 10);
                return (
                  <li key={band.label} className={tone}>
                    <strong>{band.label}</strong>
                    <span>
                      {lo}–{hi}
                    </span>
                  </li>
                );
              })}
        </ol>
      </section>

      <footer className="kor-foot">
        <img src="/images/icon.png" alt="" />
        <div>
          <strong>Kampala Junior Academy</strong>
          <p>Established 1993 · P.O. Box 6202 · +256 392 700 370</p>
          <p>info@kja.com</p>
        </div>
      </footer>
    </>
  );

  if (embedded) return <article className="kor-panel kor-report-panel">{body}</article>;

  return (
    <main className="kor">
      <div className="kor-atmosphere" aria-hidden="true" />
      {body}
    </main>
  );
}
