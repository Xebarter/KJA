import { getStudentPortal, getStudentSession } from "@/lib/student-portal";
import { formatPoints, loadPupilAwards, pointsTitle, schemaMissing, tallyAwards } from "@/lib/points";

export const metadata = { title: "Points" };

function when(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Kampala",
  });
}

export default async function StudentPointsPage() {
  const [portal, session] = await Promise.all([getStudentPortal(), getStudentSession()]);
  const studentId = portal.student?.id;
  const awardsPack = studentId && session.supabase
    ? await loadPupilAwards(session.supabase, [studentId])
    : { awards: [], error: null as string | null };
  const awards = awardsPack.awards.filter((award) => !award.voidedAt);
  const tally = tallyAwards(awards);
  const missing = schemaMissing(awardsPack.error);

  return (
    <div className="sp-points">
      <section className="sp-points-hero">
        <p className="sp-points-kicker"><i className="fa-solid fa-star" aria-hidden="true" /> {portal.termLabel || "This term"}</p>
        <h1>Your points</h1>
        <p>{tally.total === 0 ? "Points from your teachers will show up here." : tally.total > 0 ? "Well done. Here is what you have earned this term." : "Here is how your points changed this term."}</p>
        <strong className={tally.total < 0 ? "is-down" : "is-up"}>{formatPoints(tally.total)}</strong>
        <small>{tally.given} given · {tally.taken} taken</small>
      </section>
      {missing ? <p className="sp-points-quiet">Points will appear here after the school turns them on.</p> : null}
      {!missing && awards.length ? (
        <ol className="sp-points-list">
          {awards.map((award) => (
            <li key={award.id} className={award.points < 0 ? "is-down" : "is-up"}>
              <b>{formatPoints(award.points)}</b>
              <span>
                <strong>{pointsTitle(award.points)}</strong>
                <small>{award.reasonLabel} · {award.teacherName} · {when(award.createdAt)}</small>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      {!missing && !awards.length ? <p className="sp-points-quiet">No points this term yet.</p> : null}
    </div>
  );
}
