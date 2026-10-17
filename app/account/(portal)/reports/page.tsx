import Link from "next/link";
import { getPortal } from "@/lib/portal";

const ZONE = "Africa/Kampala";

function longDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: ZONE });
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const [{ pupils, cards }, { child: childParam }] = await Promise.all([getPortal(), searchParams]);
  const selected = pupils.find((child) => child.id === childParam);
  const visible = selected ? cards.filter((card) => card.student_id === selected.id) : cards;
  const countFor = (id: string) => cards.filter((card) => card.student_id === id).length;
  const latest = cards[0];
  const who = selected ? selected.full_name.split(/\s+/)[0] : "your children";

  return (
    <div className="ov rp">
      <section className="ch-hero rp-hero">
        <div className="ch-hero-copy">
          <p className="ch-kicker">Academic progress</p>
          <h1>Reports</h1>
          <p>Published report cards for the children the admissions office has enrolled on your family.</p>
        </div>
        {cards.length ? (
          <dl className="ch-hero-stats">
            <div>
              <dt>Reports</dt>
              <dd>{cards.length}</dd>
            </div>
            {latest?.published_at ? (
              <div>
                <dt>Latest</dt>
                <dd>{longDate(latest.published_at).replace(/ \d{4}$/, "")}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </section>

      {pupils.length > 1 ? (
        <nav className="rp-tabs" aria-label="Filter reports by child">
          <Link href="/account/reports" className={selected ? "" : "is-active"} aria-current={selected ? undefined : "page"}>
            All children <span>{cards.length}</span>
          </Link>
          {pupils.map((child) => (
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

      {!pupils.length ? (
        <section className="ov-panel">
          <div className="ov-empty">
            <i className="fa-solid fa-children" aria-hidden="true" />
            <p>Reports appear here once the admissions office enrols your children and the school publishes them.</p>
          </div>
        </section>
      ) : !visible.length ? (
        <section className="ov-panel">
          <div className="ov-empty">
            <i className="fa-solid fa-file-lines" aria-hidden="true" />
            <p>No report cards for {who} yet. They&apos;ll appear here as soon as the school publishes them.</p>
          </div>
        </section>
      ) : (
        <section className="ov-panel rp-group">
          <header className="rp-group-head">
            <div>
              <h2>{selected ? selected.full_name : "Term reports"}</h2>
              <p>{selected ? [selected.grade, selected.campus ? `${selected.campus} campus` : ""].filter(Boolean).join(" · ") || "Published by the school" : "Published by the school from this term's marks and attendance."}</p>
            </div>
          </header>
          <div className="rp-grid">
            {visible.map((card) => (
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
