import Link from "next/link";
import { OFFICE, daysToBirthday } from "@/lib/students";

export type CarePupil = {
  id: string;
  name: string;
  preferred?: string | null;
  sex?: string | null;
  photo?: string | null;
  /** Class or stream shown next to the name, e.g. "P2 · JR". */
  place?: string | null;
};

export type BirthdayPupil = CarePupil & { dob: string | null };
export type MedicalPupil = CarePupil & { notes: string; panadol: boolean | null };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

/** The register stores "Surname Given Names", so the first given name is the second word. */
function firstName(pupil: CarePupil) {
  if (pupil.preferred) return pupil.preferred;
  const words = pupil.name.trim().split(/\s+/);
  return words[1] ?? words[0];
}

function Avatar({ pupil }: { pupil: CarePupil }) {
  const tone = pupil.sex === "M" ? " is-boy" : pupil.sex === "F" ? " is-girl" : "";
  return (
    <span className={`occ-avatar${tone}${pupil.photo ? " has-photo" : ""}`} aria-hidden="true">
      {pupil.photo ? <img src={pupil.photo} alt="" /> : initials(pupil.name)}
    </span>
  );
}

function Head({ icon, title, sub, count }: { icon: string; title: string; sub: string; count?: number }) {
  return (
    <header className="occ-head">
      <span className="occ-icon" aria-hidden="true"><i className={`fa-solid ${icon}`} /></span>
      <div>
        <h2>{title}</h2>
        <p>{sub}</p>
      </div>
      {count ? <span className="occ-count">{count}</span> : null}
    </header>
  );
}

function More({ count, children }: { count: number; children: React.ReactNode }) {
  if (!count) return null;
  return (
    <details className="occ-more">
      <summary>
        <span className="occ-more-show">Show {count} more</span>
        <span className="occ-more-hide">Show fewer</span>
        <i className="fa-solid fa-chevron-down" aria-hidden="true" />
      </summary>
      {children}
    </details>
  );
}

export function BirthdaysCard({ pupils, within = 30, limit = 6, scope, showPlace = false }: {
  pupils: BirthdayPupil[];
  within?: number;
  limit?: number;
  scope: string;
  showPlace?: boolean;
}) {
  const now = new Date();
  const list = pupils
    .map((pupil) => {
      const days = daysToBirthday(pupil.dob, now);
      if (days === null || days > within || !pupil.dob) return null;
      const [year, month, day] = pupil.dob.split("-").map(Number);
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
      return {
        ...pupil,
        days,
        month,
        day,
        turns: year > 1900 ? next.getFullYear() - year : null,
        weekday: next.toLocaleDateString("en-GB", { weekday: "long" }),
      };
    })
    .filter((pupil): pupil is NonNullable<typeof pupil> => pupil !== null)
    .sort((a, b) => a.days - b.days || a.name.localeCompare(b.name));
  type Entry = (typeof list)[number];

  const today = list.filter((pupil) => pupil.days === 0);
  const upcoming = list.filter((pupil) => pupil.days > 0);
  const shown = upcoming.slice(0, limit);
  const hidden = upcoming.slice(limit);

  const row = (pupil: Entry, order: number) => (
    <li key={pupil.id} style={{ "--i": order } as React.CSSProperties}>
      <span className="occ-date" aria-hidden="true">
        <small>{MONTHS[pupil.month - 1]}</small>
        <strong>{pupil.day}</strong>
      </span>
      <div className="occ-main">
        <Link href={`${OFFICE}/students/${pupil.id}`}>{pupil.name}</Link>
        <small>
          {pupil.turns ? `Turns ${pupil.turns}` : "Birthday"} on {pupil.weekday}
          {showPlace && pupil.place ? ` · ${pupil.place}` : ""}
        </small>
      </div>
      <span className={`occ-when${pupil.days <= 2 ? " is-soon" : ""}`}>
        {pupil.days === 1 ? "Tomorrow" : `In ${pupil.days} days`}
      </span>
    </li>
  );

  const groups = [
    { label: "This week", items: shown.filter((pupil) => pupil.days <= 7) },
    { label: "Coming up", items: shown.filter((pupil) => pupil.days > 7) },
  ].filter((group) => group.items.length);

  return (
    <section className="admin-card occ-card is-bday" aria-label="Birthdays">
      <Head icon="fa-cake-candles" title="Birthdays" sub={`Next ${within} days in ${scope}`} count={list.length} />
      <div className="occ-body">
        {today.length ? (
          <div className="occ-today">
            <span className="occ-today-kicker"><i className="fa-solid fa-gift" aria-hidden="true" /> Birthday today</span>
            <ul>
              {today.map((pupil) => (
                <li key={pupil.id}>
                  <Avatar pupil={pupil} />
                  <div>
                    <Link href={`${OFFICE}/students/${pupil.id}`}>Happy birthday, {firstName(pupil)}</Link>
                    <small>
                      {pupil.name}
                      {pupil.turns ? ` turns ${pupil.turns} today` : ""}
                      {showPlace && pupil.place ? ` · ${pupil.place}` : ""}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {groups.map((group) => (
          <div key={group.label}>
            {groups.length > 1 || today.length ? <p className="occ-group">{group.label}</p> : null}
            <ul className="occ-list">
              {group.items.map((pupil) => row(pupil, shown.indexOf(pupil)))}
            </ul>
          </div>
        ))}

        <More count={hidden.length}>
          <ul className="occ-list">{hidden.map((pupil) => row(pupil, 0))}</ul>
        </More>

        {!list.length ? (
          <div className="occ-empty">
            <span><i className="fa-regular fa-calendar" aria-hidden="true" /></span>
            <p>No birthdays in the next {within} days.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function MedicalCard({ pupils, limit = 5, scope, href, showPlace = false }: {
  pupils: MedicalPupil[];
  limit?: number;
  scope: string;
  href: string;
  showPlace?: boolean;
}) {
  const list = [...pupils].sort(
    (a, b) => Number(b.panadol === false) - Number(a.panadol === false) || a.name.localeCompare(b.name),
  );
  const noPanadol = list.filter((pupil) => pupil.panadol === false).length;
  const shown = list.slice(0, limit);
  const hidden = list.slice(limit);

  const row = (pupil: MedicalPupil, order: number) => (
    <li key={pupil.id} className="occ-med" style={{ "--i": order } as React.CSSProperties}>
      <Avatar pupil={pupil} />
      <div className="occ-main">
        <div className="occ-med-top">
          <Link href={`${OFFICE}/students/${pupil.id}?tab=medical`}>{pupil.name}</Link>
          {showPlace && pupil.place ? <span className="occ-place">{pupil.place}</span> : null}
        </div>
        <p className="occ-note" title={pupil.notes}>{pupil.notes}</p>
        {pupil.panadol === false ? (
          <span className="occ-badge is-danger"><i className="fa-solid fa-ban" aria-hidden="true" /> No Panadol</span>
        ) : null}
      </div>
    </li>
  );

  return (
    <section className="admin-card occ-card is-med" aria-label="Medical notes">
      <Head icon="fa-notes-medical" title="Medical" sub={`Health notes in ${scope}`} count={list.length} />
      <div className="occ-body">
        {noPanadol ? (
          <p className="occ-alert">
            <i className="fa-solid fa-pills" aria-hidden="true" />
            <span><strong>{noPanadol}</strong> {noPanadol === 1 ? "pupil is" : "pupils are"} not allowed Panadol</span>
          </p>
        ) : null}

        {list.length ? (
          <>
            <ul className="occ-list">{shown.map((pupil, index) => row(pupil, index))}</ul>
            <More count={hidden.length}>
              <ul className="occ-list">{hidden.map((pupil) => row(pupil, 0))}</ul>
            </More>
          </>
        ) : (
          <div className="occ-empty is-ok">
            <span><i className="fa-solid fa-check" aria-hidden="true" /></span>
            <p>No medical notes in {scope}.</p>
          </div>
        )}
      </div>
      <Link className="occ-foot" href={href}>
        Open the medical register <i className="fa-solid fa-arrow-right" aria-hidden="true" />
      </Link>
    </section>
  );
}
