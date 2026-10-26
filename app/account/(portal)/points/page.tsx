import Link from "next/link";
import { getPortal, getSessionUser } from "@/lib/portal";
import { formatPoints, loadPupilAwards, pointsTitle, schemaMissing, tallyAwards } from "@/lib/points";

export const metadata = { title: "Points" };

function when(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Kampala",
  });
}

export default async function AccountPointsPage({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const params = await searchParams;
  const [portal, session] = await Promise.all([getPortal(), getSessionUser()]);
  const children = portal.pupils;
  const selected = children.find((child) => child.id === params.child) || children[0];
  const awardsPack = selected && session.supabase
    ? await loadPupilAwards(session.supabase, [selected.id])
    : { awards: [], error: null as string | null };
  const awards = awardsPack.awards.filter((award) => !award.voidedAt);
  const tally = tallyAwards(awards);
  const missing = schemaMissing(awardsPack.error);

  return (
    <div className="ov pts">
      <section className="ch-hero pts-hero">
        <div className="ch-hero-copy">
          <p className="ch-kicker">This term</p>
          <h1>Points</h1>
          <p>Points a teacher gives your child this term, and the reason for each one.</p>
        </div>
        {selected ? (
          <dl className="ch-hero-stats">
            <div className={tally.total < 0 ? "pts-down" : "pts-up"}>
              <dt>Available</dt>
              <dd>{formatPoints(tally.total)}</dd>
            </div>
            <div>
              <dt>Given</dt>
              <dd>{tally.given}</dd>
            </div>
            <div>
              <dt>Taken</dt>
              <dd>{tally.taken}</dd>
            </div>
          </dl>
        ) : null}
      </section>

      {children.length > 1 ? (
        <div className="pts-kids" role="tablist" aria-label="Choose a child">
          {children.map((child) => (
            <Link key={child.id} href={`/account/points?child=${child.id}`} className={child.id === selected?.id ? "is-on" : ""}>
              {child.full_name}
            </Link>
          ))}
        </div>
      ) : null}

      {missing ? <p className="admin-empty">Points will appear here after the school turns them on.</p> : null}
      {!selected ? <p className="pts-quiet">No child is linked to this account yet.</p> : null}
      {selected && !missing ? (
        <section className="pts-card" aria-label={`${selected.full_name} points`}>
          <header>
            <h2>{selected.full_name}</h2>
            <p>{[selected.grade, selected.campus ? `${selected.campus} campus` : ""].filter(Boolean).join(" · ") || "On the school register"}</p>
          </header>
          {awards.length ? (
            <ol className="pts-list">
              {awards.map((award) => (
                <li key={award.id} className={award.points < 0 ? "is-down" : "is-up"}>
                  <b>{formatPoints(award.points)}</b>
                  <span>
                    <strong>{pointsTitle(award.points)} · {award.reasonLabel}</strong>
                    <small>{award.teacherName} · {when(award.createdAt)}</small>
                  </span>
                </li>
              ))}
            </ol>
          ) : <p className="pts-quiet">No points this term yet.</p>}
        </section>
      ) : null}
    </div>
  );
}
