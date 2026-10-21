import { getStudentPortal } from "@/lib/student-portal";

export const metadata = { title: "Clubs" };

const TONES = ["rose", "sky", "mint", "sun", "gold", "teal"] as const;

function clubIcon(title: string) {
  const key = title.toLowerCase();
  if (/sport|ball|football|netball|athlet|swim|pe/.test(key)) return "fa-futbol";
  if (/music|choir|sing|band|piano/.test(key)) return "fa-music";
  if (/art|craft|draw|paint/.test(key)) return "fa-palette";
  if (/drama|theatre|theater|dance/.test(key)) return "fa-masks-theater";
  if (/science|stem|robot|code|computer/.test(key)) return "fa-flask";
  if (/book|read|library|debate|writer/.test(key)) return "fa-book-open";
  if (/scout|guide|adventure|outdoor/.test(key)) return "fa-compass";
  if (/cook|bake|food|garden/.test(key)) return "fa-seedling";
  return "fa-puzzle-piece";
}

function cheer(count: number, unpaid: number) {
  if (!count) return "Ask your parents to choose clubs in the parent portal — then they will show up here.";
  if (unpaid) {
    return `You are in ${count} club${count === 1 ? "" : "s"}. ${unpaid} still need${unpaid === 1 ? "s" : ""} payment from parents.`;
  }
  return `You are in ${count} club${count === 1 ? "" : "s"} and everything looks paid. Have fun!`;
}

export default async function StudentClubsPage() {
  const portal = await getStudentPortal();
  const clubs = portal.clubs;
  const paid = clubs.filter((club) => club.paid).length;
  const unpaid = clubs.length - paid;

  return (
    <div className="cb-page">
      <section className="cb-hero">
        <div className="cb-hero-bg" aria-hidden="true">
          <span className="cb-blob cb-blob-a" />
          <span className="cb-blob cb-blob-b" />
        </div>
        <div className="cb-hero-copy">
          <p className="cb-kicker">
            <i className="fa-solid fa-puzzle-piece" aria-hidden="true" />
            After school fun
          </p>
          <h1>Clubs</h1>
          <p className="cb-hero-lead">{cheer(clubs.length, unpaid)}</p>
          <p className="cb-hero-note">
            Parents manage signup and payment in the parent portal. You can see your clubs here.
          </p>
        </div>
        <div className="cb-hero-stats" aria-label="Clubs summary">
          <div className="cb-hero-stat">
            <strong>{clubs.length}</strong>
            <span>Clubs</span>
          </div>
          <div className="cb-hero-stat cb-hero-stat--paid">
            <strong>{paid}</strong>
            <span>Paid</span>
          </div>
          <div className={`cb-hero-stat${unpaid ? " cb-hero-stat--wait" : ""}`}>
            <strong>{unpaid}</strong>
            <span>Waiting</span>
          </div>
        </div>
      </section>

      {clubs.length ? (
        <section className="cb-grid" aria-label="Your clubs">
          {clubs.map((club, index) => {
            const tone = TONES[index % TONES.length];
            const icon = clubIcon(club.title);
            const meta = [club.campus ? `${club.campus} campus` : null, club.meeting]
              .filter(Boolean)
              .join(" · ");
            return (
              <article
                key={club.id}
                className={`cb-card cb-card--${tone}${club.paid ? " is-paid" : " is-waiting"}`}
                style={{ animationDelay: `${Math.min(index, 8) * 0.05}s` }}
              >
                <header className="cb-card-head">
                  <span className="cb-card-icon" aria-hidden="true">
                    <i className={`fa-solid ${icon}`} />
                  </span>
                  <div>
                    <h2>{club.title}</h2>
                    <p>{meta || "Meeting time to be announced"}</p>
                  </div>
                </header>
                {club.description ? <p className="cb-card-desc">{club.description}</p> : null}
                <footer className="cb-card-foot">
                  <span className="cb-chip cb-chip--joined">
                    <i className="fa-solid fa-check" aria-hidden="true" />
                    Signed up
                  </span>
                  <span className={`cb-chip ${club.paid ? "cb-chip--paid" : "cb-chip--due"}`}>
                    <i className={`fa-solid ${club.paid ? "fa-circle-check" : "fa-clock"}`} aria-hidden="true" />
                    {club.paid ? "Paid for this term" : "Payment with parents"}
                  </span>
                </footer>
              </article>
            );
          })}
        </section>
      ) : (
        <div className="cb-empty">
          <span aria-hidden="true">
            <i className="fa-solid fa-puzzle-piece" />
          </span>
          <h2>No clubs yet</h2>
          <p>
            You are not in any clubs yet. Ask your parents to choose clubs in the parent portal —
            sports, music, art, and more!
          </p>
        </div>
      )}

      <p className="cb-footnote">
        <i className="fa-solid fa-hands-clapping" aria-hidden="true" />
        Clubs are a great way to make friends and try new things after lessons.
      </p>
    </div>
  );
}
