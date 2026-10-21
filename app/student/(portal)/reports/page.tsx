import Link from "next/link";
import { getStudentPortal } from "@/lib/student-portal";

export const metadata = { title: "Reports" };

const ZONE = "Africa/Kampala";

const CARD_TONES = ["gold", "sky", "mint", "rose", "sun"] as const;

function shortDate(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: ZONE,
  });
}

function cheer(count: number) {
  if (!count) return "When your teachers publish a report card, it will appear here for you to open.";
  if (count === 1) return "You have one report ready. Open it to see how you are doing.";
  return `You have ${count} reports ready. Open one to celebrate your progress.`;
}

export default async function StudentReportsPage() {
  const portal = await getStudentPortal();
  const reports = portal.reports;
  const latest = reports[0];

  return (
    <div className="sr-page">
      <section className="sr-hero">
        <div className="sr-hero-bg" aria-hidden="true">
          <span className="sr-blob sr-blob-a" />
          <span className="sr-blob sr-blob-b" />
          <span className="sr-spark sr-spark-1" />
          <span className="sr-spark sr-spark-2" />
        </div>
        <div className="sr-hero-copy">
          <p className="sr-kicker">
            <i className="fa-solid fa-star" aria-hidden="true" />
            Your progress
          </p>
          <h1>Reports</h1>
          <p className="sr-hero-lead">{cheer(reports.length)}</p>
          <div className="sr-hero-tags">
            {portal.classLabel ? (
              <span className="sr-tag">
                <i className="fa-solid fa-graduation-cap" aria-hidden="true" />
                {portal.classLabel}
              </span>
            ) : null}
            {portal.termLabel ? (
              <span className="sr-tag sr-tag--light">
                <i className="fa-solid fa-calendar" aria-hidden="true" />
                {portal.termLabel}
              </span>
            ) : null}
          </div>
        </div>
        <div className="sr-hero-stats" aria-label="Reports summary">
          <div className="sr-hero-stat">
            <strong>{reports.length}</strong>
            <span>{reports.length === 1 ? "Report" : "Reports"}</span>
          </div>
          <div className="sr-hero-stat sr-hero-stat--latest">
            <strong>{latest ? "Ready" : "—"}</strong>
            <span>{latest ? "Latest" : "Waiting"}</span>
          </div>
        </div>
      </section>

      {reports.length ? (
        <section className="sr-list" aria-label="Published report cards">
          {reports.map((card, index) => {
            const tone = CARD_TONES[index % CARD_TONES.length];
            const isLatest = index === 0;
            return (
              <article
                key={card.id}
                className={`sr-card sr-card--${tone}${isLatest ? " is-latest" : ""}`}
                style={{ animationDelay: `${Math.min(index, 8) * 0.05}s` }}
              >
                <span className="sr-card-icon" aria-hidden="true">
                  <i className={`fa-solid ${isLatest ? "fa-award" : "fa-file-lines"}`} />
                </span>
                <div className="sr-card-body">
                  <div className="sr-card-top">
                    <h2>{card.term}</h2>
                    {isLatest ? <span className="sr-badge">Newest</span> : null}
                  </div>
                  <p className="sr-meta">
                    <span>{card.class_label}</span>
                    {card.published_at ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Published {shortDate(card.published_at)}</span>
                      </>
                    ) : null}
                  </p>
                  <p className="sr-hint">
                    {isLatest
                      ? "Take a look at your newest report card."
                      : "Open this report to review your marks and comments."}
                  </p>
                </div>
                <div className="sr-actions">
                  <Link className="sr-btn" href={`/r/${card.id}`}>
                    <i className="fa-solid fa-book-open" aria-hidden="true" />
                    Open report
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <div className="sr-empty">
          <span aria-hidden="true">
            <i className="fa-solid fa-file-lines" />
          </span>
          <h2>No reports yet</h2>
          <p>
            Your teachers have not published a report card for you. When one is ready, it will show
            up here with a bright Open button.
          </p>
          <Link className="sr-empty-link" href="/student">
            Back to Home <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </Link>
        </div>
      )}

      <p className="sr-footnote">
        <i className="fa-solid fa-lightbulb" aria-hidden="true" />
        Reports celebrate what you have learned. Ask a parent or teacher if you need help reading one.
      </p>
    </div>
  );
}
