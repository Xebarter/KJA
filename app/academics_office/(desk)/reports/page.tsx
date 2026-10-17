import Link from "next/link";
import { approveReports, prepareReports, publishReports, reopenReports } from "@/app/academics_office/(desk)/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import { DeskForm } from "@/components/academics/Form";
import { AcademicsGate, Empty, OfficeOnly } from "@/components/academics/ui";
import { StudentFace } from "@/components/StudentFace";
import { ACADEMICS_BASE, classLabel, groupPupils, loadCurrentTerm, openAcademics, streamFromQuery, streamQuery } from "@/lib/academics";
import { loadRoll, type RollPupil } from "@/lib/academics-roll";

export const metadata = { title: "Report cards" };

type Card = { id: string; student_id: string; status: string; class_code: string | null; stream: string | null; overall_score: number | null };

const nf = (value: number) => value.toLocaleString("en-GB");

function scoreLabel(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number.toLocaleString("en-GB", { maximumFractionDigits: 1 });
}

function statusLabel(status: string | null) {
  if (status === "published") return "Published";
  if (status === "approved") return "Approved";
  if (status === "draft") return "Draft";
  return "Not prepared";
}

function sexLabel(sex: string | null) {
  if (sex === "M") return "Boy";
  if (sex === "F") return "Girl";
  return "";
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ class?: string; stream?: string }> }) {
  const query = await searchParams;
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Report cards" state={opened} />;
  if (!opened.auth.office) return <OfficeOnly title="Report cards" />;
  const { supabase, user } = opened.auth;
  const termPack = await loadCurrentTerm(supabase);
  if (termPack.error) return <AcademicsGate title="Report cards" state={{ notice: "schema", message: termPack.error }} />;
  const term = termPack.term;
  const stream = streamFromQuery(query.stream);
  const [pupils, cardsQuery] = await Promise.all([
    loadRoll(supabase, user.id),
    term
      ? supabase.from("report_cards").select("id, student_id, status, class_code, stream, overall_score").eq("term_id", term.id)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (cardsQuery.error) return <AcademicsGate title="Report cards" state={{ notice: "schema", message: cardsQuery.error.message }} />;
  const cards = (cardsQuery.data || []) as Card[];
  const byPupil = new Map(cards.map((card) => [card.student_id, card]));
  const groups = groupPupils(pupils);
  const selected = groups.find((group) => group.code === query.class && (stream === null || group.stream === stream)) || null;
  const selectedCards = selected ? selected.pupils.map((pupil) => byPupil.get(pupil.id)).filter((card): card is Card => Boolean(card)) : [];
  const drafts = selectedCards.filter((card) => card.status === "draft").length;
  const approved = selectedCards.filter((card) => card.status === "approved").length;
  const published = selectedCards.filter((card) => card.status === "published").length;
  const sections = (["nursery", "primary"] as const)
    .map((section) => ({ section, label: section === "nursery" ? "Nursery" : "Primary", rows: groups.filter((group) => group.section === section) }))
    .filter((section) => section.rows.length);

  return (
    <div className="app-page ofc-page rpt-page">
      <PageHeader
        kicker="Assessment"
        icon="fa-file-lines"
        title={selected ? classLabel(selected.code, selected.stream) : "Report cards"}
        description={
          term && selected
            ? <>{term.label} · <strong>{nf(selected.pupils.length)}</strong> on this report.</>
            : term
              ? <>{term.label}. Prepare a class, approve it once markbooks are submitted, then publish for parents.</>
              : "Report cards need a current term."
        }
        actions={selected ? <Link className="admin-hero-btn" href={`${ACADEMICS_BASE}/reports`}><i className="fa-solid fa-table-cells" aria-hidden="true" /> All classes</Link> : null}
      />
      {!term ? <Empty title="No current term" /> : (
        <>
          {selected ? (
            <section className="rpt-strip" aria-label={classLabel(selected.code, selected.stream)}>
              <div>
                <span className="rpt-stat-icon" aria-hidden="true"><i className="fa-solid fa-user-group" /></span>
                <span className="rpt-stat-copy"><span>On the roll</span><strong>{nf(selected.pupils.length)}</strong><small>{classLabel(selected.code, selected.stream)}</small></span>
              </div>
              <div className={drafts ? "is-warn" : ""}>
                <span className="rpt-stat-icon" aria-hidden="true"><i className="fa-solid fa-pen" /></span>
                <span className="rpt-stat-copy"><span>Draft</span><strong>{nf(drafts)}</strong><small>Ready to approve</small></span>
              </div>
              <div className={approved ? "is-warn" : ""}>
                <span className="rpt-stat-icon" aria-hidden="true"><i className="fa-solid fa-stamp" /></span>
                <span className="rpt-stat-copy"><span>Approved</span><strong>{nf(approved)}</strong><small>Waiting to publish</small></span>
              </div>
              <div className={selected.pupils.length && published === selected.pupils.length ? "is-ok" : ""}>
                <span className="rpt-stat-icon" aria-hidden="true"><i className="fa-solid fa-circle-check" /></span>
                <span className="rpt-stat-copy"><span>Published</span><strong>{nf(published)}</strong><small>Visible to parents</small></span>
              </div>
            </section>
          ) : null}
          <div className="rpt-layout">
            <section className="rpt-card rpt-classes" aria-label="Classes">
              <header className="rpt-card-head">
                <div className="rpt-card-title">
                  <span className="rpt-card-icon" aria-hidden="true"><i className="fa-solid fa-table-cells" /></span>
                  <div>
                    <h2>Classes</h2>
                    <p>Prepare one stream at a time.</p>
                  </div>
                </div>
              </header>
              <ul className="rpt-directory">
                {sections.map((section) => (
                  <li key={section.section}>
                    <h2 className="rpt-section"><span>{section.label}</span><em>{nf(section.rows.length)}</em></h2>
                    <ul>
                      {section.rows.map((group) => {
                        const mine = group.pupils.map((pupil) => byPupil.get(pupil.id)).filter((card): card is Card => Boolean(card));
                        const live = mine.filter((card) => card.status === "published").length;
                        const on = selected?.code === group.code && selected.stream === group.stream;
                        return (
                          <li key={`${group.code}-${group.stream}`}>
                            <Link className={on ? "is-on" : ""} href={`${ACADEMICS_BASE}/reports?class=${group.code}&stream=${streamQuery(group.stream)}`}>
                              <span className="rpt-mark" aria-hidden="true">{group.code}</span>
                              <span>
                                <strong>{classLabel(group.code, group.stream)}</strong>
                                <small>{nf(group.pupils.length)} pupils</small>
                              </span>
                              <span className="rpt-mini">{nf(live)}/{nf(group.pupils.length)}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rpt-card" aria-label={selected ? classLabel(selected.code, selected.stream) : "Choose a class"}>
              <header className="rpt-card-head">
                <div className="rpt-card-title">
                  <span className="rpt-card-icon" aria-hidden="true"><i className="fa-solid fa-file-lines" /></span>
                  <div>
                    <h2>{selected ? classLabel(selected.code, selected.stream) : "Choose a class"}</h2>
                    <p>{selected ? "Prepare from marks, then approve and publish." : "Pick a stream from the list."}</p>
                  </div>
                </div>
              </header>
              {selected ? (
                <>
                  <div className="rpt-actions">
                    <DeskForm action={prepareReports}>
                      <input type="hidden" name="term_id" value={term.id} />
                      <input type="hidden" name="class_code" value={selected.code} />
                      <input type="hidden" name="stream" value={selected.stream} />
                      <button className="rpt-btn" type="submit">Prepare from marks</button>
                    </DeskForm>
                    <DeskForm action={approveReports}>
                      <input type="hidden" name="term_id" value={term.id} />
                      <input type="hidden" name="class_code" value={selected.code} />
                      <input type="hidden" name="stream" value={selected.stream} />
                      <button className="rpt-btn is-gold" type="submit">Approve</button>
                    </DeskForm>
                    <DeskForm action={publishReports}>
                      <input type="hidden" name="term_id" value={term.id} />
                      <input type="hidden" name="class_code" value={selected.code} />
                      <input type="hidden" name="stream" value={selected.stream} />
                      <button className="rpt-btn" type="submit">Publish approved</button>
                    </DeskForm>
                    <DeskForm action={reopenReports}>
                      <input type="hidden" name="term_id" value={term.id} />
                      <input type="hidden" name="class_code" value={selected.code} />
                      <input type="hidden" name="stream" value={selected.stream} />
                      <button className="rpt-btn is-ghost" type="submit">Return to draft</button>
                    </DeskForm>
                  </div>
                  {selected.pupils.length ? (
                    <ul className="rpt-roll">
                      {selected.pupils.map((pupil, index) => {
                        const card = byPupil.get(pupil.id);
                        const score = scoreLabel(card?.overall_score);
                        const child = pupil as RollPupil;
                        return (
                          <li key={pupil.id} className={card ? `is-${card.status}` : ""}>
                            <StudentFace id={pupil.id} name={pupil.full_name} photoPath={child.photo_path} className="rpt-face" />
                            <span className="rpt-who">
                              {card ? <Link href={`${ACADEMICS_BASE}/reports/${card.id}`}>{pupil.full_name}</Link> : <strong>{pupil.full_name}</strong>}
                              <small>{[String(index + 1).padStart(2, "0"), child.student_number, sexLabel(child.sex)].filter(Boolean).join(" · ")}</small>
                            </span>
                            <strong className={score ? "rpt-score" : "rpt-score is-empty"}>{score ?? "—"}</strong>
                            <em className={`rpt-pill${card ? ` is-${card.status}` : ""}`}>{statusLabel(card?.status ?? null)}</em>
                          </li>
                        );
                      })}
                    </ul>
                  ) : <p className="rpt-quiet">No active pupils in this stream.</p>}
                </>
              ) : <p className="rpt-quiet">Pick a class to prepare its report cards.</p>}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
