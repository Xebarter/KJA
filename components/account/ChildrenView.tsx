import Link from "next/link";
import { StudentFace } from "@/components/StudentFace";
import type { ChildRow, FeeRow, PublishedReport, ReportRow, SignupRow } from "@/lib/account";

const STATUS: Record<string, string> = {
  graduated: "Graduated",
  transferred: "Transferred",
  withdrawn: "Withdrawn",
  left: "Left",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function kampalaToday() {
  return new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
}

function birthday(value: string | null, today: string) {
  const [y, m, d] = (value || "").slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const [ty, tm, td] = today.split("-").map(Number);
  const age = ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
  return { label: `${d} ${MONTHS[m - 1]} ${y}`, age: age >= 0 ? age : null };
}

function ugx(value: number) {
  return `UGX ${value.toLocaleString("en-US")}`;
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function ChildrenView({
  kids,
  reports,
  cards = [],
  fees,
  signups,
}: {
  kids: ChildRow[];
  reports: ReportRow[];
  cards?: PublishedReport[];
  fees: FeeRow[];
  signups: SignupRow[];
}) {
  const today = kampalaToday();
  const campuses = new Set(kids.map((child) => child.campus).filter(Boolean));

  return (
    <div className="ch">
      <section className="ch-hero">
        <div className="ch-hero-copy">
          <p className="ch-kicker">My family</p>
          <h1>Children</h1>
          <p>
            {kids.length
              ? "The children the admissions office has enrolled on your family."
              : "Children appear here when the admissions office enrols them on your family."}
          </p>
        </div>
        {kids.length ? (
          <dl className="ch-hero-stats">
            <div>
              <dt>Children</dt>
              <dd>{kids.length}</dd>
            </div>
            <div>
              <dt>{campuses.size === 1 ? "Campus" : "Campuses"}</dt>
              <dd>{campuses.size || "–"}</dd>
            </div>
          </dl>
        ) : null}
      </section>

      {kids.length ? (
        <div className="ch-grid">
          {kids.map((child) => {
            const born = birthday(child.date_of_birth, today);
            const childFees = fees.filter((row) => row.child_id === child.id);
            const balance = childFees.reduce((sum, row) => sum + Math.max(0, Number(row.amount_due) - Number(row.amount_paid)), 0);
            const reportCount = reports.filter((row) => row.child_id === child.id).length + cards.filter((card) => card.student_id === child.id).length;
            const clubCount = signups.filter((row) => row.child_id === child.id).length;
            const status = child.status && child.status !== "active" ? STATUS[child.status] || "" : "";
            const subtitle = [child.grade, child.campus ? `${child.campus} campus` : "", status].filter(Boolean).join(" · ");

            return (
              <article className="ch-card" key={child.id}>
                <header className="ch-card-head">
                  <StudentFace id={child.id} name={child.full_name} photoPath={child.photo_path} className="ch-avatar" />
                  <div className="ch-card-name">
                    <h2>{child.full_name}</h2>
                    <p>{subtitle || "On the school register"}</p>
                  </div>
                  {child.student_code ? <span className="ch-code" title="Student number">#{child.student_code}</span> : null}
                </header>

                <dl className="ch-facts">
                  <div>
                    <dt><i className="fa-solid fa-graduation-cap" aria-hidden="true" /> Class</dt>
                    <dd className={child.grade ? "" : "is-empty"}>{child.grade || "Not set"}</dd>
                  </div>
                  <div>
                    <dt><i className="fa-solid fa-school" aria-hidden="true" /> Campus</dt>
                    <dd className={child.campus ? "" : "is-empty"}>{child.campus || "Not set"}</dd>
                  </div>
                  <div>
                    <dt><i className="fa-solid fa-cake-candles" aria-hidden="true" /> Born</dt>
                    <dd className={born ? "" : "is-empty"}>
                      {born ? born.label : "Not set"}
                      {born?.age != null ? <small>{plural(born.age, "year")} old</small> : null}
                    </dd>
                  </div>
                  <div>
                    <dt><i className="fa-solid fa-id-card" aria-hidden="true" /> Student no.</dt>
                    <dd className={child.student_code ? "" : "is-empty"}>{child.student_code || "Not issued yet"}</dd>
                  </div>
                </dl>

                <nav className="ch-links" aria-label={`${child.full_name}'s records`}>
                  <Link href="/account/reports">
                    <i className="fa-solid fa-file-lines" aria-hidden="true" />
                    <strong>{reportCount}</strong>
                    <span>{reportCount === 1 ? "Report" : "Reports"}</span>
                  </Link>
                  <Link href="/account/fees" className={balance ? "is-due" : childFees.length ? "is-clear" : ""}>
                    <i className="fa-solid fa-receipt" aria-hidden="true" />
                    <strong>{balance ? ugx(balance) : childFees.length ? "Paid" : "–"}</strong>
                    <span>{balance ? "Fees due" : "Fees"}</span>
                  </Link>
                  <Link href="/account/clubs">
                    <i className="fa-solid fa-puzzle-piece" aria-hidden="true" />
                    <strong>{clubCount}</strong>
                    <span>{clubCount === 1 ? "Club" : "Clubs"}</span>
                  </Link>
                </nav>

                {child.portal_enabled ? (
                  <p className="st-portal-note">
                    <i className="fa-solid fa-laptop" aria-hidden="true" />
                    <span>Student portal is on — they can view homework and message classmates. Message content is reviewed by school staff, not shown here.</span>
                  </p>
                ) : null}

              </article>
            );
          })}
        </div>
      ) : (
        <section className="ov-panel">
          <div className="ov-empty">
            <i className="fa-solid fa-children" aria-hidden="true" />
            <p>No children are on your account yet. They appear here when the admissions office enrols them on your family.</p>
          </div>
        </section>
      )}
    </div>
  );
}
