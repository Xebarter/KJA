import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton, CopyButton, PrintButton } from "@/components/office/client";
import { ProfileTabs, TabLink, TabNav, TabPanel } from "@/components/office/ProfileTabs";
import { StudentForm } from "@/components/office/StudentForm";
import { ChangeFamily, DeleteStudentNote, StudentNoteForm, StudentStatusActions } from "@/components/office/StudentProfile";
import { StudentLoginPanel } from "@/components/office/StudentLoginPanel";
import { Card, Detail, MigrationHint, OfficeNotice, Sex, StudentStatus } from "@/components/office/ui";
import { loadPeople } from "@/lib/admin-applications";
import { formatDate, formatDateTime, initials, statusInfo, timeAgo, whatsappLink } from "@/lib/applications";
import { requireOffice } from "@/lib/office";
import { studentPhotoUrl } from "@/lib/student-photos";
import { createClient } from "@/lib/supabase/server";
import { StudentPhoto } from "@/components/office/StudentPhoto";
import {
  OFFICE,
  ageOutlier,
  cap,
  className,
  daysToBirthday,
  displayPhone,
  pick,
  studentAge,
  studentStatusInfo,
  telHref,
  type FamilyContact,
  type Guardian,
  type Student,
  type StudentActivity,
} from "@/lib/students";
import { resolveStudentReview } from "../actions";

export const metadata = { title: "Student" };

const TABS = [
  { value: "overview", label: "Overview", icon: "fa-id-card" },
  { value: "edit", label: "Edit details", icon: "fa-pen" },
  { value: "family", label: "Family", icon: "fa-people-roof" },
  { value: "medical", label: "Medical", icon: "fa-notes-medical" },
  { value: "timeline", label: "Timeline", icon: "fa-clock-rotate-left" },
] as const;

const KIND_ICONS: Record<string, string> = {
  note: "fa-regular fa-comment",
  edit: "fa-solid fa-pen",
  class: "fa-solid fa-chalkboard",
  status: "fa-solid fa-arrows-rotate",
  enrol: "fa-solid fa-user-plus",
  promotion: "fa-solid fa-stairs",
  review: "fa-solid fa-clipboard-check",
};

type Sibling = { id: string; full_name: string; class_code: string | null; stream: string | null; status: string; date_of_birth: string | null };

type FamilyRow = {
  id: string;
  family_code: string;
  mailing_name: string | null;
  home_area: string | null;
  home_address: string | null;
  street: string | null;
  country: string | null;
  notes: string | null;
  guardians: Guardian[] | null;
  family_contacts: FamilyContact[] | null;
  students: Sibling[] | null;
};

export default async function StudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const query = await searchParams;
  const supabase = await createClient();
  if (!supabase) return <OfficeNotice title="Student" heading="Connect Supabase"><p>Add your Supabase keys to <code>.env.local</code>.</p></OfficeNotice>;

  // The student, family, parents, contacts and siblings come back in one request. The access check
  // runs alongside it; row-level security already limits the register to office staff.
  const [auth, { data, error }, activityResult, streamResult] = await Promise.all([
    requireOffice(),
    supabase
      .from("students")
      .select("*, profile_id, family:families(*, guardians(*), family_contacts(*), students(id, full_name, class_code, stream, status, date_of_birth))")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("student_activity").select("*").eq("student_id", id).order("created_at", { ascending: false }).limit(200),
    supabase.from("students").select("stream").not("stream", "is", null).eq("status", "active").limit(2000),
  ]);
  if ("error" in auth) return <OfficeNotice title="Student" icon="fa-lock" heading="Not available"><p>{auth.error}</p></OfficeNotice>;
  const { user } = auth;
  if (error) return <OfficeNotice title="Student" heading="This student could not be loaded"><MigrationHint message={error.message} /></OfficeNotice>;
  if (!data) notFound();

  const { family: familyRow, ...studentRow } = data as Student & { profile_id?: string | null; family: FamilyRow | null };
  const student = studentRow as Student & { profile_id?: string | null };
  const loginProfile = student.profile_id
    ? await supabase.from("profiles").select("email").eq("id", student.profile_id).maybeSingle()
    : null;
  const loginEmail = loginProfile?.data?.email ?? null;
  const family = familyRow;
  const guardians = [...(familyRow?.guardians ?? [])].sort((a, b) => a.relationship.localeCompare(b.relationship));
  const contacts = [...(familyRow?.family_contacts ?? [])].sort((a, b) => a.position - b.position);
  const siblings = (familyRow?.students ?? [])
    .filter((sibling) => sibling.id !== id)
    .sort((a, b) => (a.date_of_birth ?? "9999").localeCompare(b.date_of_birth ?? "9999"));
  const activity = (activityResult.data || []) as StudentActivity[];
  const streams = [...new Set(((streamResult.data || []) as { stream: string }[]).map((row) => row.stream))];

  const photoPath = (student as Student & { photo_path?: string | null }).photo_path ?? null;
  const photoUrl = studentPhotoUrl(id, photoPath);
  const [appResult, people] = await Promise.all([
    supabase
      .from("applications")
      .select("id, status, created_at, parent_name")
      .or(`student_id.eq.${id}${student.admitted_from_application ? `,id.eq.${student.admitted_from_application}` : ""}`)
      .limit(3),
    loadPeople(supabase, activity.map((entry) => entry.actor_id)),
  ]);
  const applications = (appResult.data || []) as { id: string; status: string; created_at: string; parent_name: string | null }[];

  const age = studentAge(student.date_of_birth);
  const outlier = ageOutlier(student.class_code, student.date_of_birth);
  const birthday = daysToBirthday(student.date_of_birth);
  const notes = student.import_notes ?? [];
  const phones = contacts.filter((contact) => contact.kind === "phone");
  const emails = contacts.filter((contact) => contact.kind === "email");
  const noteCount = activity.filter((entry) => entry.kind === "note").length;
  const active = student.status === "active";

  const timeline = (entries: StudentActivity[]) => (
    <ol className="app-timeline">
      {entries.map((entry) => {
        const actor = entry.actor_id ? people.get(entry.actor_id) ?? "Former staff" : "System";
        return (
          <li key={entry.id} className={entry.kind === "note" ? "is-note" : ""}>
            <span className="app-timeline-icon"><i className={KIND_ICONS[entry.kind] ?? "fa-solid fa-circle"} aria-hidden="true" /></span>
            <div>
              <p className="app-timeline-meta">
                <strong>{actor}</strong>
                <span title={formatDateTime(entry.created_at)}>{timeAgo(entry.created_at)}</span>
                {entry.kind === "note" && entry.actor_id === user.id ? <DeleteStudentNote noteId={entry.id} studentId={id} /> : null}
              </p>
              <p className={entry.kind === "note" ? "app-note" : ""}>{entry.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );

  const parentCards = guardians.length ? (
    <ul className="ofc-people">
      {guardians.map((guardian) => {
        const whatsapp = whatsappLink(guardian.phone);
        const otherPhones = [
          guardian.phone_alt ? { label: "Other", value: guardian.phone_alt } : null,
          guardian.work_phone ? { label: "Work", value: guardian.work_phone } : null,
        ].filter((entry): entry is { label: string; value: string } => Boolean(entry));
        const work = [guardian.occupation, guardian.employer].filter(Boolean).join(" at ");
        return (
          <li key={guardian.id} className={guardian.is_primary ? "is-primary" : ""}>
            <div className="ofc-person-head">
              <span className={`ofc-person-avatar is-${guardian.relationship}`} aria-hidden="true">{initials(guardian.full_name)}</span>
              <div>
                <strong>{[guardian.title, guardian.full_name].filter(Boolean).join(" ")}</strong>
                <span>{cap(guardian.relationship)}{work ? ` · ${work}` : ""}</span>
              </div>
              {guardian.is_primary ? <span className="ofc-person-badge">Main contact</span> : null}
            </div>
            {guardian.phone || guardian.email || whatsapp ? (
              <div className="ofc-person-actions">
                {guardian.phone ? (
                  <span className="ofc-chip-group">
                    <a className="ofc-chip-btn" href={telHref(guardian.phone)}><i className="fa-solid fa-phone" aria-hidden="true" /> {displayPhone(guardian.phone)}</a>
                    <CopyButton value={displayPhone(guardian.phone)} label={`${guardian.full_name}'s phone number`} />
                  </span>
                ) : null}
                {whatsapp ? (
                  <a className="ofc-chip-btn is-whatsapp" href={whatsapp} target="_blank" rel="noreferrer"><i className="fa-brands fa-whatsapp" aria-hidden="true" /> WhatsApp</a>
                ) : null}
                {guardian.email ? (
                  <span className="ofc-chip-group">
                    <a className="ofc-chip-btn" href={`mailto:${guardian.email}`}><i className="fa-regular fa-envelope" aria-hidden="true" /> {guardian.email}</a>
                    <CopyButton value={guardian.email} label={`${guardian.full_name}'s email`} />
                  </span>
                ) : null}
              </div>
            ) : <p className="ofc-person-none">No phone or email on file</p>}
            {otherPhones.length ? (
              <p className="ofc-person-more">
                {otherPhones.map((entry) => (
                  <a key={entry.label} href={telHref(entry.value)}>{entry.label}: {displayPhone(entry.value)}</a>
                ))}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  ) : <p className="ofc-empty-line">No parents or guardians on file.</p>;

  const siblingList = siblings.length ? (
    <ul className="ofc-kin">
      {siblings.map((sibling) => (
        <li key={sibling.id}>
          <span className="ofc-kin-avatar" aria-hidden="true">{initials(sibling.full_name)}</span>
          <Link href={`${OFFICE}/students/${sibling.id}`}>{sibling.full_name}</Link>
          {sibling.status === "active" ? (
            <span className="ofc-kin-class">{sibling.class_code ?? "No class"}{sibling.stream ? ` ${sibling.stream}` : ""}</span>
          ) : (
            <span className="ofc-kin-class is-gone">{cap(sibling.status)}</span>
          )}
        </li>
      ))}
    </ul>
  ) : <p className="ofc-empty-line">No brothers or sisters on the register.</p>;

  const yearsAtSchool = studentAge(student.enrolled_on);
  const glance: { key: string; label: string; icon: string; value: React.ReactNode; sub?: React.ReactNode; warn?: boolean }[] = [
    {
      key: "class",
      label: "Class",
      icon: "fa-chalkboard",
      value: student.class_code ? className(student.class_code) : "No class",
      sub: outlier ?? (student.stream ? `Stream ${student.stream}` : "No stream"),
      warn: Boolean(outlier),
    },
    {
      key: "age",
      label: "Age",
      icon: "fa-cake-candles",
      value: age !== null ? `${age} years` : "Not recorded",
      sub: birthday !== null && birthday <= 14
        ? birthday === 0 ? "Birthday today" : `Birthday in ${birthday} day${birthday === 1 ? "" : "s"}`
        : student.date_of_birth ? `Born ${formatDate(student.date_of_birth)}` : "Date of birth missing",
    },
    { key: "house", label: "House", icon: "fa-flag", value: student.house ?? "No house", sub: student.tutor_group ? `Tutor group ${student.tutor_group}` : undefined },
    { key: "campus", label: "Campus", icon: "fa-school", value: student.campus ?? "Not recorded" },
    {
      key: "enrolled",
      label: "At KJA since",
      icon: "fa-calendar-check",
      value: student.enrolled_on ? formatDate(student.enrolled_on) : "Not recorded",
      sub: yearsAtSchool !== null ? (yearsAtSchool < 1 ? "Joined this year" : `${yearsAtSchool} year${yearsAtSchool === 1 ? "" : "s"} at the school`) : undefined,
    },
    {
      key: "family",
      label: "Family",
      icon: "fa-people-roof",
      value: family ? <Link href={`${OFFICE}/families/${family.id}`} className="ofc-num">{family.family_code}</Link> : "Not linked",
      sub: siblings.length ? `${siblings.length} sibling${siblings.length === 1 ? "" : "s"} on the register` : family ? "Only child at KJA" : undefined,
    },
  ];

  const panadol = student.panadol_allowed === true
    ? <span className="ofc-yes"><i className="fa-solid fa-check" aria-hidden="true" /> Allowed</span>
    : student.panadol_allowed === false
      ? <span className="ofc-no"><i className="fa-solid fa-ban" aria-hidden="true" /> Not allowed</span>
      : null;

  return (
    <div className="app-page ofc-page ofc-profile">
      <ProfileTabs tabs={TABS.map((entry) => entry.value)}>
      <Link href={`${OFFICE}/students`} className="app-back no-print"><i className="fa-solid fa-arrow-left" /> Students</Link>

      {pick(query, "enrolled") ? (
        <div className="ofc-banner is-ok no-print">
          <i className="fa-solid fa-circle-check" aria-hidden="true" />
          <p>
            <strong>{student.full_name}</strong> is on the register as student <strong>{student.student_number}</strong>.{" "}
            {family ? <Link href={`${OFFICE}/families/${family.id}`}>Add more contacts on the family page</Link> : null}
          </p>
        </div>
      ) : null}

      <header className="ofc-profile-head no-print">
        <StudentPhoto id={id} name={student.full_name} url={photoUrl} sex={student.sex} size="lg" />
        <div className="ofc-profile-title">
          <p className="ofc-profile-kicker">
            <span className="ofc-num">{student.student_number}</span>
            <StudentStatus status={student.status} />
            {student.staff_child ? <span className="ofc-tag"><i className="fa-solid fa-id-badge" aria-hidden="true" /> Staff child</span> : null}
            {student.medical_notes ? <TabLink tab="medical" className="ofc-tag is-med"><i className="fa-solid fa-notes-medical" aria-hidden="true" /> Medical</TabLink> : null}
          </p>
          <h1>{student.full_name}</h1>
          <p className="ofc-profile-sub">
            {student.preferred_name ? <>Known as <strong>{student.preferred_name}</strong> · </> : null}
            {className(student.class_code)}{student.stream ? ` ${student.stream}` : ""}
            {student.house ? ` · ${student.house} house` : ""}
            {age !== null ? ` · ${age} years old` : ""}
            {student.campus ? ` · ${student.campus}` : ""}
          </p>
        </div>
        <div className="ofc-profile-actions">
          <TabLink tab="edit" className="admin-hero-btn is-primary"><i className="fa-solid fa-pen" aria-hidden="true" /> Edit</TabLink>
          <PrintButton label="Print record" />
          <StudentStatusActions id={id} name={student.full_name} status={student.status} classCode={student.class_code} />
        </div>
      </header>

      {notes.length ? (
        <div className="ofc-banner is-warn no-print">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <div>
            <p><strong>Check this record.</strong> The import flagged:</p>
            <ul>{notes.map((note) => <li key={note}>{note}</li>)}</ul>
          </div>
          <ActionButton action={resolveStudentReview.bind(null, id)} label="Mark as checked" busyLabel="Saving…" icon="fa-check" className="admin-btn admin-btn-ghost" />
        </div>
      ) : null}
      {!active ? (
        <div className="ofc-banner no-print">
          <i className="fa-solid fa-box-archive" aria-hidden="true" />
          <p>
            {studentStatusInfo(student.status).label}. Left the school{student.left_on ? ` on ${formatDate(student.left_on)}` : ""}{student.left_reason ? `: ${student.left_reason}` : "."}
            {student.transferred_to && student.transferred_to !== student.left_reason ? ` Moved to ${student.transferred_to}.` : ""}
          </p>
        </div>
      ) : null}

      <TabNav
        label="Student record"
        tabs={TABS.map((entry) => ({
          ...entry,
          count: entry.value === "timeline" ? activity.length : entry.value === "family" && siblings.length ? siblings.length + 1 : undefined,
        }))}
      />

      <div className="no-print">
        <TabPanel tab="overview">
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
                <Card title="Personal details" icon="fa-user" action={<TabLink tab="edit" className="ofc-card-link">Edit <i className="fa-solid fa-pen" aria-hidden="true" /></TabLink>}>
                  <dl className="ofc-facts">
                    <Detail label="Surname">{student.surname}</Detail>
                    <Detail label="Given names">{student.given_names}</Detail>
                    <Detail label="Preferred name">{student.preferred_name}</Detail>
                    <Detail label="Sex">{student.sex ? <><Sex sex={student.sex} /> {student.sex === "M" ? "Boy" : "Girl"}</> : null}</Detail>
                    <Detail label="Date of birth">{student.date_of_birth ? formatDate(student.date_of_birth) : null}</Detail>
                    <Detail label="Nationality">{student.nationality}</Detail>
                    <Detail label="Religion">{student.religion}</Detail>
                    <Detail label="Home language">{student.home_language}</Detail>
                    <Detail label="Passport or ID">{student.passport_or_id}</Detail>
                    {student.formal_name ? <Detail label="Formal name">{student.formal_name}</Detail> : null}
                  </dl>
                </Card>

                <Card title="School" icon="fa-graduation-cap">
                  <dl className="ofc-facts">
                    <Detail label="Class">
                      {student.class_code ? <Link href={`${OFFICE}/classes/${student.class_code}`}>{className(student.class_code)}</Link> : null}
                    </Detail>
                    <Detail label="Stream">{student.stream}</Detail>
                    <Detail label="House">{student.house ? <span className={`ofc-house is-${student.house.toLowerCase()}`}>{student.house}</span> : null}</Detail>
                    <Detail label="Tutor group">{student.tutor_group}</Detail>
                    <Detail label="Campus">{student.campus}</Detail>
                    <Detail label="Enrolled">{student.enrolled_on ? formatDate(student.enrolled_on) : null}</Detail>
                    <Detail label="Previous school">{student.transferred_from}</Detail>
                    <Detail label="PLE index number">{student.exam_index_number ? <span className="ofc-num">{student.exam_index_number}</span> : null}</Detail>
                    {student.staff_child ? <Detail label="Staff category">{student.staff_category ?? "Staff child"}</Detail> : null}
                    {applications.length ? (
                      <Detail label="Application">
                        {applications.map((app) => (
                          <Link key={app.id} href={`${OFFICE}/applications/${app.id}`} className="ofc-block-link">
                            {formatDate(app.created_at)} · {statusInfo(app.status).label}
                          </Link>
                        ))}
                      </Detail>
                    ) : null}
                  </dl>
                </Card>

                <Card
                  title="Parents and guardians"
                  icon="fa-people-roof"
                  action={family ? <Link className="ofc-card-link" href={`${OFFICE}/families/${family.id}`}>Family {family.family_code} <i className="fa-solid fa-arrow-right" aria-hidden="true" /></Link> : null}
                >
                  {parentCards}
                </Card>
              </div>

              <aside className="app-detail-side">
                <Card title="Student portal" icon="fa-laptop-code">
                  <StudentLoginPanel
                    studentId={id}
                    studentName={student.full_name}
                    hasLogin={Boolean(student.profile_id)}
                    loginEmail={loginEmail}
                  />
                </Card>

                <Card
                  title="Health"
                  icon="fa-notes-medical"
                  tone="med"
                  action={<TabLink tab="medical" className="ofc-card-link">Details <i className="fa-solid fa-arrow-right" aria-hidden="true" /></TabLink>}
                >
                  {student.medical_notes ? (
                    <p className="ofc-health-note">{student.medical_notes}</p>
                  ) : (
                    <p className="ofc-empty-line"><i className="fa-regular fa-circle-check" aria-hidden="true" /> No medical notes on file.</p>
                  )}
                  <p className="ofc-health-line"><span>Panadol</span>{panadol ?? <span className="app-muted">Not asked</span>}</p>
                </Card>

                <Card
                  title="Brothers and sisters"
                  icon="fa-children"
                  count={siblings.length}
                  footer={family ? <Link className="ofc-card-foot-link" href={`${OFFICE}/students/new?family=${family.id}`}><i className="fa-solid fa-plus" aria-hidden="true" /> Enrol a sibling</Link> : null}
                >
                  {siblingList}
                </Card>

                <Card
                  title="Notes"
                  icon="fa-pen-to-square"
                  count={noteCount}
                  footer={activity.length > 5 ? <TabLink tab="timeline" className="ofc-card-foot-link">Full timeline <i className="fa-solid fa-arrow-right" aria-hidden="true" /></TabLink> : null}
                >
                  <StudentNoteForm id={id} />
                  {activity.length ? timeline(activity.slice(0, 5)) : null}
                </Card>
              </aside>
            </div>
        </TabPanel>

        <TabPanel tab="edit">
          <StudentForm mode="edit" initial={student} streams={streams} />
        </TabPanel>

        <TabPanel tab="family">
          <div className="app-detail-grid ofc-profile-grid">
            <div className="app-detail-main">
              <Card
                title={family ? family.mailing_name || `Family ${family.family_code}` : "No family linked"}
                icon="fa-house-chimney-user"
                action={family ? <Link className="ofc-card-link" href={`${OFFICE}/families/${family.id}`}>Open family page <i className="fa-solid fa-arrow-right" aria-hidden="true" /></Link> : null}
                footer={<ChangeFamily id={id} current={student.family_id} />}
              >
                {family ? (
                  <dl className="ofc-facts">
                    <Detail label="Family code"><span className="ofc-num">{family.family_code}</span></Detail>
                    <Detail label="Home area">{family.home_area}</Detail>
                    <Detail label="Address" wide>{[family.street, family.home_address, family.country].filter(Boolean).join(", ")}</Detail>
                    {family.notes ? <Detail label="Notes" wide>{family.notes}</Detail> : null}
                  </dl>
                ) : <p className="ofc-empty-line">This student isn&apos;t linked to a family yet, so no parents&apos; contacts are on file.</p>}
              </Card>
              <Card title="Parents and guardians" icon="fa-people-roof">
                {parentCards}
              </Card>
            </div>
            <aside className="app-detail-side">
              <Card
                title="All contacts"
                icon="fa-address-book"
                count={contacts.length}
                footer={family ? <Link className="ofc-card-foot-link" href={`${OFFICE}/families/${family.id}#contacts`}><i className="fa-solid fa-pen" aria-hidden="true" /> Edit contacts</Link> : null}
              >
                {contacts.length ? (
                  <ul className="ofc-contacts">
                    {[...phones, ...emails].map((contact) => (
                      <li key={contact.id} className={contact.needs_check ? "is-check" : ""}>
                        <i className={contact.kind === "phone" ? "fa-solid fa-phone" : "fa-regular fa-envelope"} aria-hidden="true" />
                        <div>
                          <a href={contact.kind === "phone" ? telHref(contact.value) : `mailto:${contact.value}`}>{contact.kind === "phone" ? displayPhone(contact.value) : contact.value}</a>
                          <small>{[contact.name, cap(contact.relationship), contact.label].filter(Boolean).join(" · ")}{contact.needs_check ? " · Needs checking" : ""}</small>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <p className="ofc-empty-line">No contacts on file.</p>}
              </Card>
              <Card title="Brothers and sisters" icon="fa-children" count={siblings.length}>
                {siblingList}
              </Card>
            </aside>
          </div>
        </TabPanel>

        <TabPanel tab="medical">
          <div className="app-detail-grid ofc-profile-grid">
            <div className="app-detail-main">
              <Card
                title="Medical notes"
                icon="fa-notes-medical"
                tone="med"
                action={<TabLink tab="edit" className="ofc-card-link">Update <i className="fa-solid fa-pen" aria-hidden="true" /></TabLink>}
              >
                {student.medical_notes ? (
                  <p className="ofc-medical-note">{student.medical_notes}</p>
                ) : (
                  <p className="ofc-empty-line"><i className="fa-regular fa-circle-check" aria-hidden="true" /> No allergies, conditions or medication on file.</p>
                )}
                <dl className="ofc-facts">
                  <Detail label="Panadol">{panadol}</Detail>
                  <Detail label="Age">{age !== null ? `${age} years` : null}</Detail>
                  <Detail label="Date of birth">{student.date_of_birth ? formatDate(student.date_of_birth) : null}</Detail>
                  <Detail label="Sex">{student.sex === "M" ? "Boy" : student.sex === "F" ? "Girl" : null}</Detail>
                </dl>
              </Card>
            </div>
            <aside className="app-detail-side">
              <Card title="Emergency contacts" icon="fa-phone-volume" tone="danger">
                {phones.length ? (
                  <ol className="ofc-contacts is-numbered">
                    {phones.slice(0, 5).map((contact) => (
                      <li key={contact.id}>
                        <i className="fa-solid fa-phone" aria-hidden="true" />
                        <div>
                          <a href={telHref(contact.value)}>{displayPhone(contact.value)}</a>
                          <small>{[contact.name, cap(contact.relationship)].filter(Boolean).join(" · ")}</small>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : <p className="ofc-empty-line">No phone numbers on file.</p>}
              </Card>
            </aside>
          </div>
        </TabPanel>

        <TabPanel tab="timeline">
          <div className="app-detail-grid ofc-profile-grid">
            <Card title="Timeline" icon="fa-clock-rotate-left" count={activity.length}>
              {activity.length ? timeline(activity) : <p className="ofc-empty-line">No changes recorded yet.</p>}
            </Card>
            <aside className="app-detail-side">
              <Card title="Add a note" icon="fa-comment">
                <StudentNoteForm id={id} />
              </Card>
            </aside>
          </div>
        </TabPanel>
      </div>
      </ProfileTabs>

      <article className="ofc-print-sheet" aria-hidden="true">
        <header>
          <div>
            <p>Kampala Junior Academy · Student record</p>
            <h1>{student.full_name}</h1>
            <p>Student {student.student_number} · {className(student.class_code)}{student.stream ? ` ${student.stream}` : ""} · {studentStatusInfo(student.status).label}</p>
          </div>
          <p>Printed {formatDate(new Date().toISOString())}</p>
        </header>
        <h2>Child</h2>
        <dl>
          <div><dt>Surname</dt><dd>{student.surname ?? ""}</dd></div>
          <div><dt>Given names</dt><dd>{student.given_names ?? ""}</dd></div>
          <div><dt>Preferred name</dt><dd>{student.preferred_name ?? ""}</dd></div>
          <div><dt>Sex</dt><dd>{student.sex === "M" ? "Male" : student.sex === "F" ? "Female" : ""}</dd></div>
          <div><dt>Date of birth</dt><dd>{student.date_of_birth ? formatDate(student.date_of_birth) : ""}{age !== null ? ` (${age})` : ""}</dd></div>
          <div><dt>Nationality</dt><dd>{student.nationality ?? ""}</dd></div>
          <div><dt>Religion</dt><dd>{student.religion ?? ""}</dd></div>
          <div><dt>Home language</dt><dd>{student.home_language ?? ""}</dd></div>
        </dl>
        <h2>School</h2>
        <dl>
          <div><dt>Class</dt><dd>{className(student.class_code)}</dd></div>
          <div><dt>Stream</dt><dd>{student.stream ?? ""}</dd></div>
          <div><dt>House</dt><dd>{student.house ?? ""}</dd></div>
          <div><dt>Campus</dt><dd>{student.campus ?? ""}</dd></div>
          <div><dt>Enrolled</dt><dd>{student.enrolled_on ? formatDate(student.enrolled_on) : ""}</dd></div>
          <div><dt>Previous school</dt><dd>{student.transferred_from ?? ""}</dd></div>
        </dl>
        <h2>Family {family ? `· ${family.family_code}` : ""}</h2>
        <table>
          <thead><tr><th>Name</th><th>Relationship</th><th>Phone</th><th>Email</th></tr></thead>
          <tbody>
            {guardians.map((guardian) => (
              <tr key={guardian.id}>
                <td>{guardian.full_name}</td>
                <td>{cap(guardian.relationship)}</td>
                <td>{displayPhone(guardian.phone)}</td>
                <td>{guardian.email ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {family?.home_area || family?.home_address ? <p>Home: {[family.home_area, family.home_address].filter(Boolean).join(", ")}</p> : null}
        {siblings.length ? <p>Siblings: {siblings.map((sibling) => `${sibling.full_name} (${sibling.status === "active" ? sibling.class_code ?? "no class" : sibling.status})`).join(", ")}</p> : null}
        <h2>Health</h2>
        <p>{student.medical_notes ?? "No medical notes."}</p>
        <p>Panadol: {student.panadol_allowed === true ? "Allowed" : student.panadol_allowed === false ? "Not allowed" : "Not asked"}</p>
      </article>
    </div>
  );
}