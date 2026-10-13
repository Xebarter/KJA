import Link from "next/link";
import type { ChildRow, ClubRow, SignupRow } from "@/lib/account";
import { initials } from "@/lib/applications";
import { ClubJoin, SignupWithdraw } from "@/components/account/ClubActions";

export type ClubMedia = Record<string, { image?: string; href?: string }>;

const ICONS: [RegExp, string][] = [
  [/swim/i, "fa-person-swimming"],
  [/music|choir/i, "fa-music"],
  [/ballet|dance/i, "fa-shoe-prints"],
  [/art|drama|perform/i, "fa-masks-theater"],
  [/badminton|tennis/i, "fa-table-tennis-paddle-ball"],
  [/sport|football|athlet|physical/i, "fa-futbol"],
  [/faith|christian|bible|prayer/i, "fa-hands-praying"],
  [/chess/i, "fa-chess-knight"],
  [/language|speak|debate/i, "fa-language"],
  [/academic|stem|science|reading|enrich/i, "fa-flask"],
  [/leader|character|scout|life skill/i, "fa-award"],
];

function iconFor(title: string) {
  return ICONS.find(([pattern]) => pattern.test(title))?.[1] || "fa-puzzle-piece";
}

function statusOf(value: string) {
  const status = value.toLowerCase();
  if (status === "pending") return { tone: "pending", label: "Awaiting confirmation", short: "Pending" };
  if (["approved", "confirmed", "accepted", "active", "enrolled"].includes(status)) return { tone: "confirmed", label: "Confirmed", short: "Confirmed" };
  if (["waitlist", "waitlisted", "waiting"].includes(status)) return { tone: "waitlist", label: "On the waitlist", short: "Waitlist" };
  if (["declined", "rejected", "cancelled", "full"].includes(status)) return { tone: "declined", label: "Not confirmed", short: "Not confirmed" };
  const label = value ? value[0].toUpperCase() + value.slice(1) : "Pending";
  return { tone: "pending", label, short: label };
}

function schedule(meeting: string | null) {
  if (!meeting || /to be announced|^tba$/i.test(meeting.trim())) return "Schedule to be announced";
  return meeting;
}

const firstName = (name: string) => name.split(/\s+/)[0];

export function ClubsView({
  kids,
  clubs,
  signups,
  media,
}: {
  kids: ChildRow[];
  clubs: ClubRow[];
  signups: SignupRow[];
  media: ClubMedia;
}) {
  const clubById = new Map(clubs.map((club) => [club.id, club]));
  const kidById = new Map(kids.map((child) => [child.id, child]));
  const confirmed = signups.filter((row) => statusOf(row.status).tone === "confirmed").length;

  return (
    <div className="ov cl">
      <section className="ch-hero cl-hero">
        <div className="ch-hero-copy">
          <p className="ch-kicker">Co-curricular</p>
          <h1>Clubs &amp; activities</h1>
          <p>Music, sport, faith, leadership and more. Request a place for your child and the school will confirm it.</p>
        </div>
        {clubs.length ? (
          <dl className="ch-hero-stats">
            <div>
              <dt>Clubs</dt>
              <dd>{clubs.length}</dd>
            </div>
            {kids.length ? (
              <div>
                <dt>{confirmed ? "Confirmed" : "Sign-ups"}</dt>
                <dd>{confirmed ? `${confirmed}/${signups.length}` : signups.length}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </section>

      {kids.length ? (
        <section className="ov-panel cl-family">
          <div className="ov-panel-head">
            <h2>Your children&apos;s clubs</h2>
            {signups.length ? <span className="cl-count">{signups.length} {signups.length === 1 ? "sign-up" : "sign-ups"}</span> : null}
          </div>
          <div className="cl-kids">
            {kids.map((child) => {
              const rows = signups.filter((row) => row.child_id === child.id);
              return (
                <div className="cl-kid" key={child.id}>
                  <div className="cl-kid-who">
                    <span className="ov-child-avatar" aria-hidden="true">{initials(child.full_name)}</span>
                    <div>
                      <strong>{child.full_name}</strong>
                      <span>{[child.grade, child.campus ? `${child.campus} campus` : ""].filter(Boolean).join(" · ") || "Student"}</span>
                    </div>
                  </div>
                  {rows.length ? (
                    <ul className="cl-chips">
                      {rows.map((row) => {
                        const title = clubById.get(row.club_id)?.title || "Club";
                        const status = statusOf(row.status);
                        return (
                          <li className={`cl-chip is-${status.tone}`} key={row.id}>
                            <span className="cl-chip-icon" aria-hidden="true"><i className={`fa-solid ${iconFor(title)}`} /></span>
                            <span className="cl-chip-text">
                              <strong>{title}</strong>
                              <span className={`cl-status cl-status--${status.tone}`}>{status.label}</span>
                            </span>
                            <SignupWithdraw id={row.id} label={title} />
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="cl-kid-empty">
                      <i className="fa-regular fa-compass" aria-hidden="true" /> Not in a club yet. Explore the options below.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="cl-explore">
        <div className="cl-section-head">
          <div>
            <h2>Explore clubs</h2>
            <p>{clubs.length ? `${clubs.length} ${clubs.length === 1 ? "club" : "clubs"} open for sign-up` : "Nothing published yet"}</p>
          </div>
        </div>

        {clubs.length ? (
          <div className="cl-grid">
            {clubs.map((club) => {
              const icon = iconFor(club.title);
              const { image, href } = media[club.id] || {};
              const rows = signups.filter((row) => row.club_id === club.id && kidById.has(row.child_id));
              const taken = new Set(rows.map((row) => row.child_id));
              const available = kids.filter((child) => !taken.has(child.id)).map((child) => ({ id: child.id, name: firstName(child.full_name) }));
              return (
                <article className={`cl-card${rows.length ? " is-joined" : ""}`} key={club.id}>
                  <div className="cl-media">
                    <span className="cl-media-frame">
                      {image ? (
                        <img src={image} alt="" loading="lazy" decoding="async" />
                      ) : (
                        <span className="cl-media-fallback" aria-hidden="true"><i className={`fa-solid ${icon}`} /></span>
                      )}
                    </span>
                    {club.campus ? (
                      <span className="cl-campus"><i className="fa-solid fa-location-dot" aria-hidden="true" /> {club.campus}</span>
                    ) : null}
                    {rows.length ? (
                      <span className="cl-joined-badge"><i className="fa-solid fa-star" aria-hidden="true" /> Your family</span>
                    ) : null}
                    <span className="cl-icon" aria-hidden="true"><i className={`fa-solid ${icon}`} /></span>
                  </div>
                  <div className="cl-body">
                    <h3>{club.title}</h3>
                    <p className="cl-meta"><i className="fa-regular fa-clock" aria-hidden="true" /> {schedule(club.meeting)}</p>
                    {club.description ? <p className="cl-desc">{club.description}</p> : null}
                    {rows.length ? (
                      <ul className="cl-members" aria-label="Your children in this club">
                        {rows.map((row) => {
                          const child = kidById.get(row.child_id)!;
                          const status = statusOf(row.status);
                          return (
                            <li key={row.id} className={`is-${status.tone}`} title={`${child.full_name}: ${status.label}`}>
                              <span className="cl-member-avatar" aria-hidden="true">{initials(child.full_name)}</span>
                              {firstName(child.full_name)}
                              <span className="cl-member-status">{status.short}</span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                    {href ? (
                      <Link className="cl-more" href={href}>
                        About this club <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                      </Link>
                    ) : null}
                  </div>
                  <ClubJoin clubId={club.id} available={available} hasKids={kids.length > 0} />
                </article>
              );
            })}
          </div>
        ) : (
          <section className="ov-panel">
            <div className="ov-empty">
              <i className="fa-solid fa-puzzle-piece" aria-hidden="true" />
              <p>Clubs will appear here once the school publishes this term&apos;s co-curricular programme.</p>
            </div>
          </section>
        )}
      </section>

      <aside className="rp-help">
        <span className="rp-help-icon"><i className="fa-solid fa-people-group" aria-hidden="true" /></span>
        <div>
          <strong>How club places work</strong>
          <p>Each request is reviewed by the co-curricular team. The status here changes once a place is confirmed, and you can withdraw a request at any time.</p>
        </div>
        <Link className="ov-btn ov-btn-dark" href="/account/messages">Message the school</Link>
      </aside>
    </div>
  );
}
