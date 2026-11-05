import { Suspense } from "react";
import Link from "next/link";
import { remindTeachers } from "@/app/academics_office/(desk)/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import { DeskForm } from "@/components/academics/Form";
import { AcademicsGate, Empty, OfficeOnly } from "@/components/academics/ui";
import { ACADEMICS_BASE, dateKindLabel, kampalaToday, loadCurrentTerm, reasonLabel, type TermRow } from "@/lib/academics";
import { openAcademics } from "@/lib/academics-access";
import { groupMissingMarks, loadAcademicPicture, type AcademicPicture } from "@/lib/academics-insights";
import { emailSetupProblem } from "@/lib/email/send";
import type { SupabaseClient } from "@supabase/supabase-js";

export const metadata = { title: "Insights" };

export default async function InsightsPage() {
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Insights" state={opened} />;
  if (!opened.auth.office) return <OfficeOnly title="Insights" />;
  const { supabase, user, campuses } = opened.auth;
  const termPack = await loadCurrentTerm(supabase);
  if (termPack.error) return <AcademicsGate title="Insights" state={{ notice: "schema", message: termPack.error }} />;
  const term = termPack.term;
  if (!term) {
    return (
      <div className="app-page ofc-page">
        <PageHeader kicker="Office" icon="fa-chart-column" title="Insights" description="Performance for the current term." />
        <Empty title="No current term" />
      </div>
    );
  }

  return (
    <div className="app-page ofc-page ins-page">
      <PageHeader
        kicker="Office"
        icon="fa-chart-column"
        title="Insights"
        description={<>{term.label}</>}
        actions={
          <>
            <a className="admin-hero-btn" href={`${ACADEMICS_BASE}/insights/export?kind=results`}><i className="fa-solid fa-file-csv" aria-hidden="true" /> Results</a>
            <a className="admin-hero-btn" href={`${ACADEMICS_BASE}/insights/export?kind=attendance`}><i className="fa-solid fa-file-csv" aria-hidden="true" /> Attendance</a>
            <a className="admin-hero-btn" href={`${ACADEMICS_BASE}/insights/export?kind=interventions`}><i className="fa-solid fa-file-csv" aria-hidden="true" /> Interventions</a>
          </>
        }
      />
      <Suspense fallback={<InsightsFallback />}>
        <InsightsBody supabase={supabase} term={term} userId={user.id} campuses={campuses} />
      </Suspense>
    </div>
  );
}

async function InsightsBody({
  supabase,
  term,
  userId,
  campuses,
}: {
  supabase: SupabaseClient;
  term: TermRow;
  userId: string;
  campuses: readonly string[];
}) {
  let picture: AcademicPicture;
  try {
    picture = await loadAcademicPicture(supabase, term, kampalaToday(), userId, campuses);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Insights could not be loaded.";
    return <AcademicsGate title="Insights" state={{ notice: "schema", message }} />;
  }
  const mail = emailSetupProblem();
  const openFollow = picture.interventions.filter((row) => row.status === "open");
  const nf = (value: number) => value.toLocaleString("en-GB");
  const missingTotal = picture.gaps.reduce((sum, paper) => sum + paper.missing, 0);
  const gapSittings = groupMissingMarks(picture.gaps);

  return (
    <>
      <p className="ins-term-meta" aria-live="polite">
        <strong>{nf(picture.pupils)}</strong> pupils in <strong>{nf(picture.classes)}</strong> classes
      </p>
      <section className="ins-strip" aria-label="This term">
        <article className="ins-kpi is-navy">
          <header>
            <span>Mean score</span>
            <i className="fa-solid fa-chart-simple" aria-hidden="true" />
          </header>
          <strong>{picture.mean ?? "-"}</strong>
          <small>Across report lines</small>
        </article>
        <article className={`ins-kpi${picture.openMarkbooks.length ? " is-warn" : " is-ok"}`}>
          <header>
            <span>Open markbooks</span>
            <i className="fa-solid fa-pen-to-square" aria-hidden="true" />
          </header>
          <strong>{nf(picture.openMarkbooks.length)}</strong>
          <small>Still being filled</small>
        </article>
        <article className={`ins-kpi${picture.schemesWaiting.length ? " is-warn" : " is-ok"}`}>
          <header>
            <span>Schemes waiting</span>
            <i className="fa-solid fa-list-check" aria-hidden="true" />
          </header>
          <strong>{nf(picture.schemesWaiting.length)}</strong>
          <small>Not yet approved</small>
        </article>
        <article className={`ins-kpi${picture.overdueLessons ? " is-warn" : " is-ok"}`}>
          <header>
            <span>Overdue lessons</span>
            <i className="fa-solid fa-clock" aria-hidden="true" />
          </header>
          <strong>{nf(picture.overdueLessons)}</strong>
          <small>Past the due date</small>
        </article>
      </section>

      <div className="ins-layout">
        <div className="ins-main">
          <section className="ins-card ins-perf-card" aria-label="Performance">
            <CardHead icon="fa-chart-column" title="Performance" text="Average scores for this term." />
            <div className="ins-perf-hero">
              <div className="ins-perf-hero-figure">
                <strong>{picture.mean ?? "-"}</strong>
                <span>Term mean</span>
              </div>
              <p>
                Averages by campus, class, and subject from report lines this term.
                {picture.bySubject[0]?.value != null ? (
                  <> Leading subject: <strong>{picture.bySubject[0].label}</strong> at {picture.bySubject[0].value}.</>
                ) : null}
              </p>
            </div>
            <div className="ins-perf">
              <Bars icon="fa-school" title="Campus" rows={picture.byCampus} />
              <Bars icon="fa-chalkboard" title="Class" rows={picture.byClass} />
              <Bars icon="fa-book-open" title="Subject" rows={picture.bySubject} />
            </div>
          </section>

          <section className={`ins-card ins-gaps${picture.gaps.length ? " has-gaps" : " is-clear"}`} aria-label="Missing marks">
            <CardHead
              icon="fa-pen-to-square"
              title="Missing marks"
              text="Papers that still have an empty row."
              action={<Remind termId={term.id} topic="marks" label="Remind teachers" disabled={Boolean(mail)} />}
            />
            {mail ? <p className="ins-note">{mail}</p> : null}
            {picture.gaps.length ? (
              <>
                <div className="ins-gaps-summary">
                  <div className="ins-gaps-summary-figure">
                    <strong>{nf(missingTotal)}</strong>
                    <span>empty rows</span>
                  </div>
                  <p>
                    Across <strong>{nf(gapSittings.length)}</strong> {gapSittings.length === 1 ? "assessment" : "assessments"} ·{" "}
                    <strong>{nf(picture.gaps.length)}</strong> {picture.gaps.length === 1 ? "subject" : "subjects"}.
                    Expand an assessment, then a class, to open the markbook.
                  </p>
                </div>
                <div className="ins-gaps-groups">
                  {gapSittings.map((sitting, sittingIndex) => (
                    <details key={sitting.key} className="ins-gaps-group ins-gaps-sitting" open={sittingIndex === 0}>
                      <summary>
                        <span className="ins-gaps-group-title">
                          <i className="fa-solid fa-chevron-right" aria-hidden="true" />
                          <span className="ins-gaps-sitting-copy">
                            <strong>{sitting.name}</strong>
                            <small>
                              {sitting.kindLabel}
                              {sitting.heldOn ? ` · ${shortDay(sitting.heldOn)}` : ""}
                              {` · ${nf(sitting.classCount)} ${sitting.classCount === 1 ? "class" : "classes"}`}
                            </small>
                          </span>
                        </span>
                        <span className="ins-gaps-group-meta">
                          <em>{nf(sitting.missing)}</em>
                          <small>
                            missing · {nf(sitting.subjectCount)} {sitting.subjectCount === 1 ? "subject" : "subjects"}
                          </small>
                        </span>
                      </summary>
                      <div className="ins-gaps-classes">
                        {sitting.classes.map((group, classIndex) => (
                          <details key={group.label} className="ins-gaps-class" open={sittingIndex === 0 && classIndex === 0}>
                            <summary>
                              <span className="ins-gaps-group-title">
                                <i className="fa-solid fa-chevron-right" aria-hidden="true" />
                                <strong>{group.label}</strong>
                              </span>
                              <span className="ins-gaps-group-meta">
                                <em>{nf(group.missing)}</em>
                                <small>
                                  missing · {nf(group.subjects.length)} {group.subjects.length === 1 ? "subject" : "subjects"}
                                </small>
                              </span>
                            </summary>
                            <ul className="ins-gaps-list">
                              {group.subjects.map((paper) => (
                                <li key={paper.id}>
                                  <Link href={`${ACADEMICS_BASE}/assessments/${paper.id}`}>
                                    <span className="ins-gaps-mark" aria-hidden="true" />
                                    <span className="ins-gaps-body">
                                      <strong>{paper.subject}</strong>
                                    </span>
                                    <span className="ins-gaps-count">
                                      <em>{nf(paper.missing)}</em>
                                      <small>missing</small>
                                    </span>
                                    <i className="fa-solid fa-chevron-right ins-gaps-go" aria-hidden="true" />
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </details>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </>
            ) : (
              <div className="ins-gaps-done">
                <span className="ins-gaps-done-icon" aria-hidden="true"><i className="fa-solid fa-check" /></span>
                <div>
                  <strong>Every markbook is filled in</strong>
                  <p>No empty rows for this term.</p>
                </div>
              </div>
            )}
          </section>

          <section className="ins-card" aria-label="Schemes and coverage">
            <CardHead
              icon="fa-list-check"
              title="Schemes and coverage"
              text="What has been taught against the plan."
              action={<Remind termId={term.id} topic="lessons" label="Remind about lessons" disabled={Boolean(mail)} />}
            />
            {picture.schemes.length ? (
              <ul className="ins-rows">
                {picture.schemes.map((scheme) => (
                  <li key={scheme.id}>
                    <Link href={`${ACADEMICS_BASE}/schemes/${scheme.id}`}>
                      <strong>{scheme.title}</strong>
                      <small>{scheme.classLabel} · {scheme.subject} · {scheme.staffName} · {scheme.taught}/{scheme.planned}{scheme.overdue ? ` · ${scheme.overdue} late` : ""}</small>
                      <em><span className={`ins-pill is-${scheme.status}`}>{scheme.status}</span></em>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="ins-quiet">No schemes for this term yet.</p>}
          </section>

          <section className="ins-card" aria-label="Teacher completion">
            <CardHead icon="fa-chalkboard-user" title="Teacher completion" text="Markbooks filled and lessons taught." />
            {picture.teachers.length ? (
              <ul className="ins-teachers">
                {picture.teachers.map((member) => (
                  <li key={member.id}>
                    <header>
                      <strong>{member.name}</strong>
                    </header>
                    <div className="ins-pair">
                      <div>
                        <span>Markbooks</span>
                        <em>{member.papersSubmitted}/{member.papersAssigned}</em>
                        <Track value={member.papersSubmitted} total={member.papersAssigned} />
                      </div>
                      <div>
                        <span>Lessons</span>
                        <em>{member.lessonsTaught}/{member.lessonsPlanned}</em>
                        <Track value={member.lessonsTaught} total={member.lessonsPlanned} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="ins-quiet">No teaching assignments this term.</p>}
          </section>
        </div>

        <div className="ins-side">
          <section className="ins-card" aria-label="Learners requiring attention">
            <CardHead icon="fa-user-graduate" title="Needs attention" text="Decline, absence, or an open follow-up." />
            {picture.watch.length ? (
              <ul className="ins-rows">
                {picture.watch.map((pupil) => (
                  <li key={pupil.id}>
                    <Link href={pupil.href}>
                      <strong>{pupil.name}</strong>
                      <small>{pupil.note}</small>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="ins-quiet">No one is flagged this term.</p>}
          </section>

          <section className="ins-card" aria-label="Coming up">
            <CardHead icon="fa-calendar-days" title="Coming up" text="Dates on the academic calendar." />
            {picture.calendar.length ? (
              <ul className="ins-rows">
                {picture.calendar.map((row) => (
                  <li key={row.id}>
                    <div className="ins-row">
                      <strong>{row.title}</strong>
                      <small>{dateKindLabel(row.kind)}{row.campus ? ` · ${row.campus}` : ""}</small>
                      <em>{shortDay(row.starts_on)}</em>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="ins-quiet">Nothing ahead on the calendar.</p>}
          </section>

          <section className="ins-card" aria-label="Open interventions">
            <CardHead icon="fa-hand-holding-heart" title="Open interventions" text={openFollow.length ? `${nf(openFollow.length)} still open` : "Nothing waiting."} />
            {openFollow.length ? (
              <ul className="ins-rows">
                {openFollow.map((row) => (
                  <li key={row.id}>
                    <Link href={`${ACADEMICS_BASE}/students/${row.student_id}`}>
                      <strong>{row.name}</strong>
                      <small>{reasonLabel(row.reason)} · {row.note}</small>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="ins-quiet">No open interventions.</p>}
          </section>
        </div>
      </div>
    </>
  );
}

function InsightsFallback() {
  return (
    <section className="ins-strip is-loading" aria-busy="true" aria-label="Loading insights">
      <article className="ins-kpi is-navy"><header><span>Mean score</span></header><strong>…</strong><small>Loading</small></article>
      <article className="ins-kpi"><header><span>Open markbooks</span></header><strong>…</strong><small>Loading</small></article>
      <article className="ins-kpi"><header><span>Schemes waiting</span></header><strong>…</strong><small>Loading</small></article>
      <article className="ins-kpi"><header><span>Overdue lessons</span></header><strong>…</strong><small>Loading</small></article>
    </section>
  );
}

function CardHead({ icon, title, text, action }: { icon: string; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <header className="ins-card-head">
      <div className="ins-card-title">
        <span className="ins-card-icon" aria-hidden="true"><i className={`fa-solid ${icon}`} /></span>
        <div>
          <h2>{title}</h2>
          {text ? <p>{text}</p> : null}
        </div>
      </div>
      {action}
    </header>
  );
}

function Remind({ termId, topic, label, disabled }: { termId: string; topic: string; label: string; disabled: boolean }) {
  return (
    <DeskForm action={remindTeachers} className="ins-remind">
      <input type="hidden" name="term_id" value={termId} />
      <input type="hidden" name="topic" value={topic} />
      <button type="submit" disabled={disabled}>{label}</button>
    </DeskForm>
  );
}

function Bars({ icon, title, rows }: { icon: string; title: string; rows: { label: string; value: number | null }[] }) {
  const peak = rows.reduce((max, row) => Math.max(max, row.value ?? 0), 0);
  return (
    <div className="ins-bars">
      <h3>
        <i className={`fa-solid ${icon}`} aria-hidden="true" />
        {title}
      </h3>
      {rows.length ? (
        <ul className="ins-bars-list">
          {rows.map((row, index) => {
            const value = row.value ?? 0;
            const width = peak > 0 ? Math.max(0, Math.min(100, Math.round((value / peak) * 100))) : Math.max(0, Math.min(100, value));
            return (
              <li className={`ins-bar${row.value !== null && row.value === peak && peak > 0 ? " is-lead" : ""}`} key={row.label} style={{ animationDelay: `${index * 40}ms` }}>
                <span className="ins-bar-label">{row.label}</span>
                <strong>{row.value ?? "-"}</strong>
                <span className="ins-track" aria-hidden="true"><i style={{ width: `${width}%` }} /></span>
              </li>
            );
          })}
        </ul>
      ) : <p className="ins-quiet">No averages yet.</p>}
    </div>
  );
}

function Track({ value, total }: { value: number; total: number }) {
  const width = total > 0 ? Math.max(0, Math.min(100, Math.round((value / total) * 100))) : 0;
  return <span className="ins-track" aria-hidden="true"><i style={{ width: `${width}%` }} /></span>;
}

function shortDay(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
