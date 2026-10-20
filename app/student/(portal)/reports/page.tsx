import Link from "next/link";
import { getStudentPortal } from "@/lib/student-portal";

export const metadata = { title: "Reports" };

export default async function StudentReportsPage() {
  const portal = await getStudentPortal();

  return (
    <div className="st-section">
      <p className="account-kicker">School</p>
      <h1>Reports</h1>
      <p className="lead">Published report cards for you.</p>

      {portal.reports.length ? (
        <div className="hw-list" style={{ marginTop: "1rem" }}>
          {portal.reports.map((card) => (
            <article key={card.id} className="hw-card">
              <div>
                <h2>{card.term}</h2>
                <p className="hw-meta">
                  {card.class_label}
                  {card.published_at
                    ? ` · ${new Date(card.published_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Kampala" })}`
                    : ""}
                </p>
              </div>
              <div className="hw-actions">
                <Link className="account-btn" href={`/r/${card.id}`}>
                  Open
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="hw-empty">
          <i className="fa-solid fa-file-lines" aria-hidden="true" />
          <p>No published reports yet.</p>
        </div>
      )}
    </div>
  );
}
