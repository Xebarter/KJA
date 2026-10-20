import { getStudentPortal } from "@/lib/student-portal";

export const metadata = { title: "Clubs" };

export default async function StudentClubsPage() {
  const portal = await getStudentPortal();

  return (
    <div className="st-section">
      <p className="account-kicker">Life</p>
      <h1>Clubs</h1>
      <p className="lead">
        Clubs your parents signed you up for. Parents manage signup and payment in the parent portal.
      </p>

      {portal.clubs.length ? (
        <div className="st-club-grid">
          {portal.clubs.map((club) => (
            <article key={club.id} className="st-club-card">
              <header>
                <span className="st-club-icon" aria-hidden="true">
                  <i className="fa-solid fa-puzzle-piece" />
                </span>
                <div>
                  <h2>{club.title}</h2>
                  <p>
                    {[club.campus ? `${club.campus} campus` : null, club.meeting].filter(Boolean).join(" · ") || "Meeting time to be announced"}
                  </p>
                </div>
              </header>
              {club.description ? <p className="st-club-desc">{club.description}</p> : null}
              <footer>
                <span className="hw-chip is-done">Signed up</span>
                <span className={`hw-chip${club.paid ? " is-done" : " is-due"}`}>
                  {club.paid ? "Paid for this term" : "Payment with parents"}
                </span>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <div className="hw-empty">
          <i className="fa-solid fa-puzzle-piece" aria-hidden="true" />
          <p>You are not in any clubs yet. Ask your parents to choose clubs in the parent portal.</p>
        </div>
      )}
    </div>
  );
}
