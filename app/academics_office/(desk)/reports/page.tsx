import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { StreamReportBar } from "@/components/academics/StreamReportBar";
import { AcademicsGate, Empty, OfficeOnly } from "@/components/academics/ui";
import { StudentFace } from "@/components/StudentFace";
import { ACADEMICS_BASE, classLabel, groupPupils, loadCurrentTerm, openAcademics, streamFromQuery, streamQuery } from "@/lib/academics";
import { loadReportSittings, type ReportSitting } from "@/lib/academics-reports";
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
  let sittings: ReportSitting[] = [];
  if (term && selected) {
    try {
      sittings = await loadReportSittings(supabase, { termId: term.id, classCode: selected.code, stream: selected.stream });
    } catch (error) {
      return <AcademicsGate title="Report cards" state={{ notice: "schema", message: error instanceof Error ? error.message : "Assessments could not be loaded." }} />;
    }
  }
  const selectedCards = selected ? selected.pupils.map((pupil) => byPupil.get(pupil.id)).filter((card): card is Card => Boolean(card)) : [];
  const drafts = selectedCards.filter((card) => card.status === "draft").length;
  const approved = selectedCards.filter((card) => card.status === "approved").length;
  const published = selectedCards.filter((card) => card.status === "published").length;
  const onRoll = new Set(pupils.map((pupil) => pupil.id));
  const waiting = groups
    .map((group) => ({
      group,
      drafts: group.pupils.filter((pupil) => byPupil.get(pupil.id)?.status === "draft").length,
    }))
    .filter((row) => row.drafts > 0);
  const draftTotal = cards.filter((card) => card.status === "draft").length;
  const unmatchedDrafts = cards.filter((card) => card.status === "draft" && !onRoll.has(card.student_id)).length;
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
            : term && draftTotal
              ? <>{term.label}. <strong>{nf(draftTotal)}</strong> {draftTotal === 1 ? "report card is" : "report cards are"} still in draft.</>
              : term
                ? <>{term.label}. Generate a class, preview every card, then post it for parents.</>
                : "Report cards need a current term."
        }
        actions={selected ? <Link className="admin-hero-btn" href={`${ACADEMICS_BASE}/reports`}><i className="fa-solid fa-table-cells" aria-hidden="true" /> All classes</Link> : null}
      />
      {!term ? <Empty title="No current term" /> : (
        <>
          {!selected && draftTotal ? (
            <section className="rpt-alert" aria-label="Draft report cards">
              <div className="rpt-alert-head">
                <span aria-hidden="true"><i className="fa-solid fa-file-lines" /></span>
                <div>
                  <strong>{nf(draftTotal)} {draftTotal === 1 ? "draft" : "drafts"}</strong>
                  <p>Open a class to preview and post its report cards.</p>
                </div>
              </div>
              {waiting.length ? (
                <ul className="rpt-alert-list">
                  {waiting.map(({ group, drafts: count }) => (
                    <li key={`${group.code}-${group.stream}`}>
                      <Link href={`${ACADEMICS_BASE}/reports?class=${group.code}&stream=${streamQuery(group.stream)}`}>
                        {classLabel(group.code, group.stream)}
                        <em>{nf(count)}</em>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
              {unmatchedDrafts ? <p className="rpt-alert-note">{nf(unmatchedDrafts)} {unmatchedDrafts === 1 ? "draft is" : "drafts are"} for learners no longer on the roll.</p> : null}
            </section>
          ) : null}
          {selected ? (
            <section className="rpt-strip" aria-label={classLabel(selected.code, selected.stream)}>
              <div>
                <span className="rpt-stat-icon" aria-hidden="true"><i className="fa-solid fa-user-group" /></span>
                <span className="rpt-stat-copy"><span>On the roll</span><strong>{nf(selected.pupils.length)}</strong><small>{classLabel(selected.code, selected.stream)}</small></span>
              </div>
              <div className={drafts ? "is-warn" : ""}>
                <span className="rpt-stat-icon" aria-hidden="true"><i className="fa-solid fa-pen" /></span>
                <span className="rpt-stat-copy"><span>Draft</span><strong>{nf(drafts)}</strong><small>Still with the office</small></span>
              </div>
              <div className={approved ? "is-warn" : ""}>
                <span className="rpt-stat-icon" aria-hidden="true"><i className="fa-solid fa-stamp" /></span>
                <span className="rpt-stat-copy"><span>Approved</span><strong>{nf(approved)}</strong><small>Ready to post</small></span>
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
                    <p>Open one stream at a time.</p>
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
                        const open = mine.filter((card) => card.status === "draft").length;
                        const on = selected?.code === group.code && selected.stream === group.stream;
                        return (
                          <li key={`${group.code}-${group.stream}`}>
                            <Link className={`${on ? "is-on" : ""}${open ? " is-draft" : ""}`} href={`${ACADEMICS_BASE}/reports?class=${group.code}&stream=${streamQuery(group.stream)}`}>
                              <span className="rpt-mark" aria-hidden="true">{group.code}</span>
                              <span>
                                <strong>{classLabel(group.code, group.stream)}</strong>
                                <small>{open ? `${nf(open)} draft${open === 1 ? "" : "s"}` : `${nf(group.pupils.length)} pupils`}</small>
                              </span>
                              {open ? <span className="rpt-drafts" aria-label={`${open} drafts`}>{nf(open)}</span> : <span className="rpt-mini">{nf(live)}/{nf(group.pupils.length)}</span>}
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
                    <p>{selected ? "Generate the cards, preview them, then post." : "Pick a stream from the list."}</p>
                  </div>
                </div>
              </header>
              {selected ? (
                <>
                  <StreamReportBar termId={term.id} classCode={selected.code} stream={selected.stream} drafts={drafts} cards={selectedCards.length} sittings={sittings} />
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
              ) : <p className="rpt-quiet">Pick a class to generate its report cards.</p>}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
