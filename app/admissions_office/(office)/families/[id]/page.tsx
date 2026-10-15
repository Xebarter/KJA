import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/office/client";
import { ContactEditor, FamilyDetailsForm, GuardianEditor } from "@/components/office/FamilyEditors";
import { StudentPhoto } from "@/components/office/StudentPhoto";
import { Card, MigrationHint, OfficeNotice } from "@/components/office/ui";
import { loadPeople } from "@/lib/admin-applications";
import { formatDate, formatDateTime, timeAgo } from "@/lib/applications";
import { requireOffice } from "@/lib/office";
import { studentPhotoUrl } from "@/lib/student-photos";
import { createClient } from "@/lib/supabase/server";
import {
  OFFICE,
  className,
  displayPhone,
  studentAge,
  studentStatusInfo,
  telHref,
  type Family,
  type FamilyContact,
  type Guardian,
  type StudentActivity,
} from "@/lib/students";

export const metadata = { title: "Family" };

const CHILD_COLUMNS = "id, full_name, preferred_name, student_number, sex, date_of_birth, class_code, stream, house, status, enrolled_on, left_on, medical_notes";

type Child = {
  id: string;
  full_name: string;
  preferred_name: string | null;
  student_number: string;
  sex: string | null;
  date_of_birth: string | null;
  class_code: string | null;
  stream: string | null;
  house: string | null;
  status: string;
  enrolled_on: string | null;
  left_on: string | null;
  medical_notes: string | null;
  photo_path?: string | null;
};

type FamilyRow = Family & { guardians: Guardian[] | null; family_contacts: FamilyContact[] | null; students: Child[] | null };

export default async function FamilyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  if (!supabase) return <OfficeNotice title="Family" heading="Connect Supabase"><p>Add your Supabase keys to <code>.env.local</code>.</p></OfficeNotice>;

  // The family, parents, contacts and children come back in one request, alongside the access check.
  const load = (children: string) =>
    supabase.from("families").select(`*, guardians(*), family_contacts(*), students(${children})`).eq("id", id).maybeSingle();
  const [auth, first] = await Promise.all([requireOffice(), load(`${CHILD_COLUMNS}, photo_path`)]);
  if ("error" in auth) return <OfficeNotice title="Family" icon="fa-lock" heading="Not available"><p>{auth.error}</p></OfficeNotice>;
  const result = first.error?.message.includes("photo_path") ? await load(CHILD_COLUMNS) : first;
  if (result.error) return <OfficeNotice title="Family" heading="This family could not be loaded"><MigrationHint message={result.error.message} /></OfficeNotice>;
  if (!result.data) notFound();

  const { guardians: guardianRows, family_contacts: contactRows, students: childRows, ...familyRow } = result.data as unknown as FamilyRow;
  const family = familyRow as Family;
  const guardians = [...(guardianRows ?? [])].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.relationship.localeCompare(b.relationship));
  const contacts = [...(contactRows ?? [])].sort((a, b) => a.position - b.position);
  const children = [...(childRows ?? [])].sort((a, b) => (a.date_of_birth ?? "9999").localeCompare(b.date_of_birth ?? "9999"));
  const current = children.filter((child) => child.status === "active");
  const former = children.filter((child) => child.status !== "active");

  const activityResult = children.length
    ? await supabase.from("student_activity").select("*").in("student_id", children.map((child) => child.id)).order("created_at", { ascending: false }).limit(60)
    : { data: [] };

  // Family changes are logged on every current child's record, so show each change once.
  const names = new Map(children.map((child) => [child.id, child.preferred_name || child.full_name.split(/\s+/)[0]]));
  const recent: { entry: StudentActivity; who: string[] }[] = [];
  const seen = new Map<string, { entry: StudentActivity; who: string[] }>();
  for (const entry of (activityResult.data || []) as StudentActivity[]) {
    const key = `${entry.actor_id}|${entry.body}|${entry.created_at.slice(0, 16)}`;
    const found = seen.get(key);
    if (found) {
      found.who.push(names.get(entry.student_id) ?? "");
      continue;
    }
    if (recent.length >= 6) continue;
    const item = { entry, who: [names.get(entry.student_id) ?? ""] };
    seen.set(key, item);
    recent.push(item);
  }
  const people = await loadPeople(supabase, recent.map((item) => item.entry.actor_id));

  const title = family.mailing_name || guardians.map((guardian) => guardian.full_name).join(" & ") || `Family ${family.family_code}`;
  const phones = contacts.filter((contact) => contact.kind === "phone");
  const emails = contacts.filter((contact) => contact.kind === "email");
  const checks = contacts.filter((contact) => contact.needs_check).length;
  const main = guardians.find((guardian) => guardian.is_primary && guardian.phone) ?? null;
  const callFirst = main ? { name: main.full_name.split(/\s+/)[0], phone: main.phone as string } : phones[0] ? { name: phones[0].name, phone: phones[0].value } : null;
  const since = children.map((child) => child.enrolled_on).filter((date): date is string => Boolean(date)).sort()[0] ?? null;
  const years = studentAge(since);
  const classes = [...new Set(current.map((child) => child.class_code).filter(Boolean))] as string[];

  const glance: { key: string; label: string; icon: string; value: React.ReactNode; sub?: React.ReactNode; warn?: boolean }[] = [
    {
      key: "children",
      label: "At KJA now",
      icon: "fa-children",
      value: current.length ? `${current.length} child${current.length === 1 ? "" : "ren"}` : "None",
      sub: classes.length ? classes.join(" · ") : "No children on the register",
    },
    {
      key: "former",
      label: "Former pupils",
      icon: "fa-user-graduate",
      value: former.length || "None",
      sub: former.length ? former.map((child) => names.get(child.id)).join(", ") : undefined,
    },
    {
      key: "parents",
      label: "Parents",
      icon: "fa-people-roof",
      value: guardians.length ? `${guardians.length} on file` : "None on file",
      sub: main ? `Call ${main.full_name.split(/\s+/)[0]} first` : guardians.length ? "No main contact set" : undefined,
    },
    {
      key: "contacts",
      label: "Contacts",
      icon: "fa-address-book",
      value: `${phones.length} phone${phones.length === 1 ? "" : "s"}${emails.length ? `, ${emails.length} email${emails.length === 1 ? "" : "s"}` : ""}`,
      sub: checks ? `${checks} to check` : contacts.length ? "All confirmed" : "Add a phone number",
      warn: checks > 0 || !phones.length,
    },
    { key: "home", label: "Home", icon: "fa-location-dot", value: family.home_area ?? "Not recorded", sub: family.street ?? family.country ?? undefined },
    {
      key: "since",
      label: "With KJA since",
      icon: "fa-calendar-check",
      value: since ? new Date(`${since}T00:00:00`).getFullYear() : "Not recorded",
      sub: years !== null ? (years < 1 ? "Joined this year" : `${years} year${years === 1 ? "" : "s"}`) : undefined,
    },
  ];

  const childRow = (child: Child) => {
    const age = studentAge(child.date_of_birth);
    const active = child.status === "active";
    return (
      <li key={child.id} className={active ? "" : "is-gone"}>
        <StudentPhoto id={child.id} name={child.full_name} url={studentPhotoUrl(child.id, child.photo_path ?? null)} sex={child.sex} />
        <div className="ofc-fam-child-main">
          <Link href={`${OFFICE}/students/${child.id}`} className="ofc-fam-child-name">{child.full_name}</Link>
          <span className="ofc-fam-child-meta">
            <span className="ofc-num">{child.student_number}</span>
            {child.preferred_name ? <span>Known as {child.preferred_name}</span> : null}
            {age !== null ? <span>{age} years</span> : null}
            {active && child.house ? <span>{child.house} house</span> : null}
            {!active ? <span>{studentStatusInfo(child.status).label}{child.left_on ? ` ${formatDate(child.left_on)}` : ""}</span> : null}
          </span>
        </div>
        <div className="ofc-fam-child-side">
          {child.medical_notes ? <span className="ofc-row-flag is-med" title={child.medical_notes}><i className="fa-solid fa-notes-medical" aria-hidden="true" /> Medical</span> : null}
          {active ? (
            child.class_code ? (
              <Link href={`${OFFICE}/classes/${child.class_code}`} className="ofc-fam-class">
                {className(child.class_code)}{child.stream ? ` ${child.stream}` : ""}
              </Link>
            ) : <span className="ofc-fam-class is-none">No class</span>
          ) : null}
        </div>
        <Link href={`${OFFICE}/students/${child.id}`} className="ofc-fam-child-go" aria-label={`Open ${child.full_name}`}>
          <i className="fa-solid fa-chevron-right" aria-hidden="true" />
        </Link>
      </li>
    );
  };

  return (
    <div className="app-page ofc-page ofc-family-page">
      <Link href={`${OFFICE}/families`} className="app-back"><i className="fa-solid fa-arrow-left" /> Families</Link>

      <header className="ofc-profile-head">
        <span className="ofc-avatar is-family" aria-hidden="true"><i className="fa-solid fa-house-chimney-user" /></span>
        <div className="ofc-profile-title">
          <p className="ofc-profile-kicker">
            <span className="ofc-num">Family {family.family_code}</span>
            {checks ? (
              <a href="#contacts" className="ofc-tag is-warn"><i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> {checks} contact{checks === 1 ? "" : "s"} to check</a>
            ) : null}
          </p>
          <h1>{title}</h1>
          <p className="ofc-profile-sub">
            {current.length ? `${current.length} child${current.length === 1 ? "" : "ren"} at KJA` : "No children at KJA now"}
            {former.length ? ` · ${former.length} former pupil${former.length === 1 ? "" : "s"}` : ""}
            {family.home_area ? ` · ${family.home_area}` : ""}
          </p>
        </div>
        <div className="ofc-profile-actions">
          <Link className="admin-hero-btn is-primary" href={`${OFFICE}/students/new?family=${family.id}`}>
            <i className="fa-solid fa-user-plus" aria-hidden="true" /> Enrol a sibling
          </Link>
          {callFirst ? (
            <a className="admin-hero-btn" href={telHref(callFirst.phone)} title={displayPhone(callFirst.phone)}>
              <i className="fa-solid fa-phone" aria-hidden="true" /> Call {callFirst.name || "first contact"}
            </a>
          ) : null}
        </div>
      </header>

      {checks ? (
        <div className="ofc-banner is-warn">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <p>
            <strong>{checks} contact{checks === 1 ? "" : "s"} could not be confirmed</strong> when the register was imported.
            Call to check, then mark {checks === 1 ? "it" : "each one"} checked. <a href="#contacts">Go to the contact list</a>
          </p>
        </div>
      ) : null}

      <dl className="ofc-glance" aria-label="At a glance">
        {glance.map((item) => (
          <div key={item.key} className={item.warn ? "is-warn" : ""}>
            <span className="ofc-glance-icon" aria-hidden="true"><i className={`fa-solid ${item.icon}`} /></span>
            <dt>{item.label}</dt>
            <dd>
              <strong>{item.value}</strong>
              {item.sub ? <small>{item.sub}</small> : null}
            </dd>
          </div>
        ))}
      </dl>

      <div className="app-detail-grid ofc-profile-grid">
        <div className="app-detail-main">
          <Card
            title="Children"
            icon="fa-children"
            count={children.length}
            footer={<Link className="ofc-card-foot-link" href={`${OFFICE}/students/new?family=${family.id}`}><i className="fa-solid fa-plus" aria-hidden="true" /> Enrol a brother or sister</Link>}
          >
            {children.length ? (
              <>
                {current.length ? <ul className="ofc-fam-children">{current.map(childRow)}</ul> : <p className="ofc-empty-line">No children at KJA right now.</p>}
                {former.length ? (
                  <>
                    <h3 className="ofc-fam-sub">Former pupils</h3>
                    <ul className="ofc-fam-children">{former.map(childRow)}</ul>
                  </>
                ) : null}
              </>
            ) : <p className="ofc-empty-line">No children linked to this family yet.</p>}
          </Card>

          <Card title="Parents and guardians" icon="fa-people-roof" count={guardians.length}>
            <GuardianEditor familyId={family.id} guardians={guardians} />
          </Card>

          <Card id="contacts" title="Contact list" icon="fa-address-book" tone={checks ? "warn" : undefined} count={contacts.length}>
            <p className="ofc-fam-hint">In the order the school should call. The first phone number is used in an emergency.</p>
            <ContactEditor familyId={family.id} contacts={contacts} />
          </Card>
        </div>

        <aside className="app-detail-side">
          <Card
            title="Home"
            icon="fa-house"
            action={(
              <span className="ofc-fam-code">
                <span className="ofc-num">{family.family_code}</span>
                <CopyButton value={family.family_code} label="the family code" />
              </span>
            )}
          >
            <FamilyDetailsForm family={family} />
          </Card>

          <Card title="Recent changes" icon="fa-clock-rotate-left">
            {recent.length ? (
              <ol className="ofc-fam-recent">
                {recent.map(({ entry, who }) => {
                  const named = [...new Set(who.filter(Boolean))];
                  return (
                    <li key={entry.id}>
                      <p>{entry.body}</p>
                      <small>
                        <span title={formatDateTime(entry.created_at)}>{timeAgo(entry.created_at)}</span>
                        {" · "}{entry.actor_id ? people.get(entry.actor_id) ?? "Former staff" : "System"}
                        {named.length === 1 && current.length > 1 ? <> · <Link href={`${OFFICE}/students/${entry.student_id}`}>{named[0]}</Link></> : null}
                      </small>
                    </li>
                  );
                })}
              </ol>
            ) : <p className="ofc-empty-line">No changes recorded yet.</p>}
          </Card>
        </aside>
      </div>
    </div>
  );
}
