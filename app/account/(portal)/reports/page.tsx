import Link from "next/link";
import type { ReportRow } from "@/lib/account";
import { initials } from "@/lib/applications";
import { getPortal } from "@/lib/portal";

const ZONE = "Africa/Kampala";

function longDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: ZONE });
}

function fileType(url: string | null) {
  const ext = url?.split(/[?#]/)[0].split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") return { label: "PDF", icon: "fa-file-pdf" };
  if (["doc", "docx"].includes(ext)) return { label: "Word", icon: "fa-file-word" };
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) return { label: "Image", icon: "fa-file-image" };
  return { label: url ? "File" : "Paper copy", icon: "fa-file-lines" };
}

function ReportActions({ report }: { report: ReportRow }) {
  if (!report.file_url) {
    return <span className="rp-nofile"><i className="fa-solid fa-school" aria-hidden="true" /> Collect from school</span>;
  }
  return (
    <a className="rp-open" href={report.file_url} target="_blank" rel="noreferrer">
      Open report <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
    </a>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const [{ children, pupils, reports, cards }, { child: childParam }] = await Promise.all([getPortal(), searchParams]);
  const selected = children.find((child) => child.id === childParam);
  const visible = selected ? reports.filter((report) => report.child_id === selected.id) : reports;
  const latest = visible[0];
  const earlier = visible.slice(1);
  const childOf = (id: string) => children.find((child) => child.id === id);
  const groups = (selected ? [selected] : children)
    .map((child) => ({ child, items: earlier.filter((report) => report.child_id === child.id) }))
    .filter((group) => group.items.length);
  const countFor = (id: string) => reports.filter((report) => report.child_id === id).length;
  const latestChild = latest ? childOf(latest.child_id) : undefined;
  const latestType = fileType(latest?.file_url ?? null);
  const visibleCards = childParam ? cards.filter((card) => card.student_id === childParam) : cards;

  return (
    <div className="ov rp">
      <section className="ch-hero rp-hero">
        <div className="ch-hero-copy">
          <p className="ch-kicker">Academic progress</p>
          <h1>Reports</h1>
          <p>Termly and progress reports from your children&apos;s teachers, ready to open or download whenever you need them.</p>
        </div>
        {reports.length ? (
          <dl className="ch-hero-stats">
            <div>
              <dt>Reports</dt>
              <dd>{reports.length}</dd>
            </div>
            {reports[0].issued_on ? (
              <div>
                <dt>Latest</dt>
                <dd>{longDate(reports[0].issued_on).replace(/ \d{4}$/, "")}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </section>

      {children.length > 1 ? (
        <nav className="rp-tabs" aria-label="Filter reports by child">
          <Link href="/account/reports" className={selected ? "" : "is-active"} aria-current={selected ? undefined : "page"}>
            All children <span>{reports.length}</span>
          </Link>
          {children.map((child) => (
            <Link
              key={child.id}
              href={`/account/reports?child=${child.id}`}
              className={selected?.id === child.id ? "is-active" : ""}
              aria-current={selected?.id === child.id ? "page" : undefined}
            >
              {child.full_name.split(/\s+/)[0]} <span>{countFor(child.id)}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      {!children.length && !pupils.length ? (
        <section className="ov-panel">
          <div className="ov-empty">
            <i className="fa-solid fa-children" aria-hidden="true" />
            <p>Add your children to your account and their reports will appear here as soon as the school publishes them.</p>
            <Link className="ov-btn ov-btn-dark" href="/account/children">Add a child</Link>
          </div>
        </section>
      ) : !latest && !visibleCards.length ? (
        <section className="ov-panel">
          <div className="ov-empty">
            <i className="fa-solid fa-file-lines" aria-hidden="true" />
            <p>
              No reports for {selected ? selected.full_name.split(/\s+/)[0] : "your children"} yet. They&apos;ll appear here as soon as
              the school publishes them, and we&apos;ll send you a notice.
            </p>
          </div>
        </section>
      ) : (
        <>
          {visibleCards.length ? (
            <section className="ov-panel rp-group">
              <header className="rp-group-head">
                <div>
                  <h2>Term reports</h2>
                  <p>Published by the school from this term&apos;s marks and attendance.</p>
                </div>
              </header>
              <div className="rp-grid">
                {visibleCards.map((card) => (
                  <article className="rp-card" key={card.id}>
                    <div className="rp-card-top">
                      <span className="rp-card-icon"><i className="fa-solid fa-file-lines" aria-hidden="true" /></span>
                      <span className="rp-term">{card.term}</span>
                    </div>
                    <h3>{card.pupil_name}</h3>
                    <p className="rp-card-summary">{card.class_label}</p>
                    <footer className="rp-card-foot">
                      <time dateTime={card.published_at || undefined}>{card.published_at ? longDate(card.published_at) : card.term}</time>
                      <Link className="rp-open" href={`/account/reports/${card.id}`}>
                        Open report <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
                      </Link>
                    </footer>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
          {latest ? (
          <article className="rp-feature">
            <div className="rp-paper" aria-hidden="true">
              <span className="rp-paper-ribbon">{latestType.label}</span>
              <img src="/images/kja-logo.png" alt="" />
              <strong>Kampala Junior Academy</strong>
              <small>{latest.term || "Progress report"}</small>
              <span className="rp-paper-lines"><i /><i /><i /><i /><i /></span>
            </div>
            <div className="rp-feature-copy">
              <span className="rp-badge"><i className="fa-solid fa-star" aria-hidden="true" /> Latest report</span>
              <h2>{latest.title}</h2>
              <p className="rp-feature-meta">
                {latestChild ? <span><i className="fa-solid fa-user-graduate" aria-hidden="true" /> {latestChild.full_name}</span> : null}
                {latest.term ? <span><i className="fa-solid fa-bookmark" aria-hidden="true" /> {latest.term}</span> : null}
                {latest.issued_on ? <span><i className="fa-regular fa-calendar" aria-hidden="true" /> Issued {longDate(latest.issued_on)}</span> : null}
              </p>
              {latest.summary ? <p className="rp-feature-summary">{latest.summary}</p> : null}
              <div className="rp-feature-actions">
                {latest.file_url ? (
                  <>
                    <a className="ov-btn ov-btn-gold" href={latest.file_url} target="_blank" rel="noreferrer">
                      <i className={`fa-solid ${latestType.icon}`} aria-hidden="true" /> Open report
                    </a>
                    <a className="ov-btn ov-btn-outline" href={latest.file_url} download>
                      <i className="fa-solid fa-download" aria-hidden="true" /> Download
                    </a>
                  </>
                ) : (
                  <span className="rp-nofile rp-nofile-lg">
                    <i className="fa-solid fa-school" aria-hidden="true" /> A printed copy is available from the school office.
                  </span>
                )}
              </div>
            </div>
          </article>
          ) : null}

          {groups.map(({ child, items }) => (
            <section className="ov-panel rp-group" key={child.id}>
              <header className="rp-group-head">
                <span className="ov-child-avatar" aria-hidden="true">{initials(child.full_name)}</span>
                <div>
                  <h2>{selected ? "Earlier reports" : child.full_name}</h2>
                  <p>{[child.grade, child.campus ? `${child.campus} campus` : ""].filter(Boolean).join(" · ") || "Report history"}</p>
                </div>
                <span className="rp-count">{countFor(child.id)} {countFor(child.id) === 1 ? "report" : "reports"}</span>
              </header>
              <div className="rp-grid">
                {items.map((report) => {
                  const type = fileType(report.file_url);
                  return (
                    <article className="rp-card" key={report.id}>
                      <div className="rp-card-top">
                        <span className="rp-card-icon"><i className={`fa-solid ${type.icon}`} aria-hidden="true" /></span>
                        {report.term ? <span className="rp-term">{report.term}</span> : null}
                      </div>
                      <h3>{report.title}</h3>
                      {report.summary ? <p className="rp-card-summary">{report.summary}</p> : null}
                      <footer className="rp-card-foot">
                        <time dateTime={report.issued_on || undefined}>{report.issued_on ? longDate(report.issued_on) : type.label}</time>
                        <ReportActions report={report} />
                      </footer>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}

      <aside className="rp-help">
        <span className="rp-help-icon"><i className="fa-solid fa-comments" aria-hidden="true" /></span>
        <div>
          <strong>Questions about a report?</strong>
          <p>Send a message to the school and the class teacher will get back to you, or book a meeting during visiting hours.</p>
        </div>
        <Link className="ov-btn ov-btn-dark" href="/account/messages">Message the school</Link>
      </aside>
    </div>
  );
}
