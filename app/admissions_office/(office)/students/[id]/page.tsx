import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton, PrintButton } from "@/components/office/client";
import { StudentForm } from "@/components/office/StudentForm";
import { ChangeFamily, DeleteStudentNote, StudentNoteForm, StudentStatusActions } from "@/components/office/StudentProfile";
import { Detail, MigrationHint, OfficeNotice, Sex, StudentStatus } from "@/components/office/ui";
import { loadPeople } from "@/lib/admin-applications";
import { formatDate, formatDateTime, initials, statusInfo, timeAgo, whatsappLink } from "@/lib/applications";
import { requireOffice } from "@/lib/office";
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
  const tab = TABS.find((entry) => entry.value === pick(query, "tab"))?.value ?? "overview";
  const auth = await requireOffice();
  if ("error" in auth) return <OfficeNotice title="Student" icon="fa-lock" heading="Not available"><p>{auth.error}</p></OfficeNotice>;
  const { supabase, user } = auth;

  const { data, error } = await supabase.from("students").select("*").eq("id", id).maybeSingle();
  if (error) return <OfficeNotice title="Student" heading="This student could not be loaded"><MigrationHint message={error.message} /></OfficeNotice>;
  if (!data) notFound();
  const student = data as Student;

  const [familyResult, guardianResult, contactResult, siblingResult, activityResult, appResult, streamResult] = await Promise.all([
    student.family_id ? supabase.from("families").select("*").eq("id", student.family_id).maybeSingle() : Promise.resolve({ data: null }),
    student.family_id ? supabase.from("guardians").select("*").eq("family_id", student.family_id).order("relationship") : Promise.resolve({ data: [] }),
    student.family_id ? supabase.from("family_contacts").select("*").eq("family_id", student.family_id).order("position") : Promise.resolve({ data: [] }),
    student.family_id
      ? supabase.from("students").select("id, full_name, class_code, stream, status, date_of_birth").eq("family_id", student.family_id).neq("id", id).order("date_of_birth")
      : Promise.resolve({ data: [] }),
    supabase.from("student_activity").select("*").eq("student_id", id).order("created_at", { ascending: false }).limit(200),
    supabase.from("applications").select("id, status, created_at, parent_name").or(`student_id.eq.${id}${student.admitted_from_application ? `,id.eq.${student.admitted_from_application}` : ""}`).limit(3),
    tab === "edit" ? supabase.from("students").select("stream").not("stream", "is", null).eq("status", "active").limit(2000) : Promise.resolve({ data: [] }),
  ]);
  const family = familyResult.data as { id: string; family_code: string; mailing_name: string | null; home_area: string | null; home_address: string | null; street: string | null; country: string | null; notes: string | null } | null;
  const guardians = (guardianResult.data || []) as Guardian[];
  const contacts = (contactResult.data || []) as FamilyContact[];
  const siblings = (siblingResult.data || []) as Sibling[];
  const activity = (activityResult.data || []) as StudentActivity[];
  const applications = (appResult.data || []) as { id: string; status: string; created_at: string; parent_name: string | null }[];
  const people = await loadPeople(supabase, activity.map((entry) => entry.actor_id));

  const age = studentAge(student.date_of_birth);
  const outlier = ageOutlier(student.class_code, student.date_of_birth);
  const birthday = daysToBirthday(student.date_of_birth);
  const notes = student.import_notes ?? [];
  const phones = contacts.filter((contact) => contact.kind === "phone");
  const emails = contacts.filter((contact) => contact.kind === "email");
  const tabHref = (value: string) => `${OFFICE}/students/${id}${value === "overview" ? "" : `?tab=${value}`}`;
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
    <ul className="ofc-guardians">
      {guardians.map((guardian) => {
        const whatsapp = whatsappLink(guardian.phone);
        return (
          <li key={guardian.id}>
            <span className="app-avatar app-avatar-md">{initials(guardian.full_name)}</span>
            <div>
              <strong>{[guardian.title, guardian.full_name].filter(Boolean).join(" ")}</strong>
              <small>{cap(guardian.relationship)}{guardian.is_primary ? " · Main contact" : ""}{guardian.occupation ? ` · ${guardian.occupation}` : ""}</small>
              <span className="ofc-agenda-contact">
                {guardian.phone ? <a href={telHref(guardian.phone)}><i className="fa-solid fa-phone" aria-hidden="true" /> {displayPhone(guardian.phone)}</a> : null}
                {whatsapp ? <a href={whatsapp} target="_blank" rel="noreferrer"><i className="fa-brands fa-whatsapp" aria-hidden="true" /> WhatsApp</a> : null}
                {guardian.email ? <a href={`mailto:${guardian.email}`}><i className="fa-regular fa-envelope" aria-hidden="true" /> {guardian.email}</a> : null}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  ) : <p className="app-muted">No parents or guardians on file.</p>;

  return (
    <div className="app-page ofc-page ofc-profile">
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
        <span className={`ofc-avatar is-${student.sex === "M" ? "boy" : student.sex === "F" ? "girl" : "none"}`}>{initials(student.full_name)}</span>
        <div className="ofc-profile-title">
          <p className="ofc-profile-kicker">
            <span className="ofc-num">{student.student_number}</span>
            <StudentStatus status={student.status} />
            {student.staff_child ? <span className="ofc-tag"><i className="fa-solid fa-id-badge" aria-hidden="true" /> Staff child</span> : null}
            {student.medical_notes ? <Link className="ofc-tag is-med" href={tabHref("medical")}><i className="fa-solid fa-notes-medical" aria-hidden="true" /> Medical</Link> : null}
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
          <Link className="admin-hero-btn is-primary" href={tabHref("edit")}><i className="fa-solid fa-pen" aria-hidden="true" /> Edit</Link>
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

      <nav className="ofc-tabs no-print" aria-label="Student record">
        {TABS.map((entry) => (
          <Link key={entry.value} href={tabHref(entry.value)} className={tab === entry.value ? "active" : ""} aria-current={tab === entry.value ? "page" : undefined}>
            <i className={`fa-solid ${entry.icon}`} aria-hidden="true" /> {entry.label}
            {entry.value === "timeline" && activity.length ? <span>{activity.length}</span> : null}
            {entry.value === "family" && siblings.length ? <span>{siblings.length + 1}</span> : null}
          </Link>
        ))}
      </nav>

      <div className="no-print">
        {tab === "overview" ? (
          <div className="app-detail-grid">
            <div className="app-detail-main">
              <section className="admin-card">
                <h2 className="app-card-title">Personal details</h2>
                <dl className="app-details">
                  <Detail label="Surname">{student.surname}</Detail>
                  <Detail label="Given names">{student.given_names}</Detail>
                  <Detail label="Sex"><Sex sex={student.sex} /> {student.sex === "M" ? "Boy" : student.sex === "F" ? "Girl" : null}</Detail>
                  <Detail label="Date of birth">
                    {student.date_of_birth ? (
                      <>
                        {formatDate(student.date_of_birth)}
                        {birthday !== null && birthday <= 14 ? <small className="ofc-inline-note"> · {birthday === 0 ? "Birthday today" : `Birthday in ${birthday} days`}</small> : null}
                      </>
                    ) : null}
                  </Detail>
                  <Detail label="Nationality">{student.nationality}</Detail>
                  <Detail label="Religion">{student.religion}</Detail>
                  <Detail label="Home language">{student.home_language}</Detail>
                  <Detail label="Passport or ID">{student.passport_or_id}</Detail>
                  {student.formal_name ? <Detail label="Formal name" wide>{student.formal_name}</Detail> : null}
                </dl>
              </section>
              <section className="admin-card">
                <h2 className="app-card-title">School</h2>
                <dl className="app-details">
                  <Detail label="Class">
                    <Link href={`${OFFICE}/classes/${student.class_code}`}>{className(student.class_code)}</Link>
                    {outlier ? <small className="ofc-inline-note is-warn"> · {outlier}</small> : null}
                  </Detail>
                  <Detail label="Stream">{student.stream}</Detail>
                  <Detail label="House">{student.house}</Detail>
                  <Detail label="Tutor group">{student.tutor_group}</Detail>
                  <Detail label="Campus">{student.campus}</Detail>
                  <Detail label="Enrolled">{student.enrolled_on ? formatDate(student.enrolled_on) : null}</Detail>
                  <Detail label="Previous school">{student.transferred_from}</Detail>
                  <Detail label="PLE index number">{student.exam_index_number}</Detail>
                  {student.staff_child ? <Detail label="Staff category">{student.staff_category ?? "Staff child"}</Detail> : null}
                  {applications.length ? (
                    <Detail label="Application">
                      {applications.map((app) => (
                        <Link key={app.id} href={`${OFFICE}/applications/${app.id}`}>
                          {formatDate(app.created_at)} · {statusInfo(app.status).label}
                        </Link>
                      ))}
                    </Detail>
                  ) : null}
                </dl>
              </section>
              <section className="admin-card">
                <h2 className="app-card-title">
                  Parents and guardians
                  {family ? <Link className="ofc-title-link" href={`${OFFICE}/families/${family.id}`}>{family.family_code} <i className="fa-solid fa-arrow-right" aria-hidden="true" /></Link> : null}
                </h2>
                {parentCards}
              </section>
            </div>
            <aside className="app-detail-side">
              <section className="admin-card">
                <h2 className="app-card-title">Brothers and sisters</h2>
                {siblings.length ? (
                  <ul className="ofc-list">
                    {siblings.map((sibling) => (
                      <li key={sibling.id}>
                        <span className="ofc-mono">{initials(sibling.full_name)}</span>
                        <div>
                          <Link href={`${OFFICE}/students/${sibling.id}`}>{sibling.full_name}</Link>
                          <small>{sibling.status === "active" ? `${sibling.class_code ?? "No class"}${sibling.stream ? ` ${sibling.stream}` : ""}` : cap(sibling.status)}</small>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <p className="app-muted">No siblings on the register.</p>}
                {family ? (
                  <Link className="app-link-btn" href={`${OFFICE}/students/new?family=${family.id}`}><i className="fa-solid fa-plus" aria-hidden="true" /> Enrol a sibling</Link>
                ) : null}
              </section>
              <section className="admin-card">
                <h2 className="app-card-title">Notes <span className="app-count">{noteCount}</span></h2>
                <StudentNoteForm id={id} />
                {activity.length ? timeline(activity.slice(0, 5)) : null}
                {activity.length > 5 ? <Link className="app-link-btn ofc-more" href={tabHref("timeline")}>See the full timeline</Link> : null}
              </section>
            </aside>
          </div>
        ) : null}

        {tab === "edit" ? (
          <StudentForm
            mode="edit"
            initial={student}
            streams={[...new Set(((streamResult.data || []) as { stream: string }[]).map((row) => row.stream))]}
          />
        ) : null}

        {tab === "family" ? (
          <div className="app-detail-grid">
            <div className="app-detail-main">
              <section className="admin-card">
                <h2 className="app-card-title">
                  {family ? family.mailing_name || family.family_code : "No family"}
                  {family ? <Link className="ofc-title-link" href={`${OFFICE}/families/${family.id}`}>Open family page <i className="fa-solid fa-arrow-right" aria-hidden="true" /></Link> : null}
                </h2>
                {family ? (
                  <dl className="app-details">
                    <Detail label="Family code"><span className="ofc-num">{family.family_code}</span></Detail>
                    <Detail label="Home area">{family.home_area}</Detail>
                    <Detail label="Address" wide>{[family.street, family.home_address, family.country].filter(Boolean).join(", ")}</Detail>
                    {family.notes ? <Detail label="Notes" wide>{family.notes}</Detail> : null}
                  </dl>
                ) : <p className="app-muted">This student isn&apos;t linked to a family yet, so no parents&apos; contacts are on file.</p>}
                <div className="ofc-row-actions"><ChangeFamily id={id} current={student.family_id} /></div>
              </section>
              <section className="admin-card">
                <h2 className="app-card-title">Parents and guardians</h2>
                {parentCards}
              </section>
            </div>
            <aside className="app-detail-side">
              <section className="admin-card">
                <h2 className="app-card-title">All contacts</h2>
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
                ) : <p className="app-muted">No contacts on file.</p>}
                {family ? <Link className="app-link-btn" href={`${OFFICE}/families/${family.id}#contacts`}>Edit contacts</Link> : null}
              </section>
              <section className="admin-card">
                <h2 className="app-card-title">Siblings</h2>
                {siblings.length ? (
                  <ul className="ofc-list">
                    {siblings.map((sibling) => (
                      <li key={sibling.id}>
                        <span className="ofc-mono">{initials(sibling.full_name)}</span>
                        <div>
                          <Link href={`${OFFICE}/students/${sibling.id}`}>{sibling.full_name}</Link>
                          <small>{sibling.status === "active" ? className(sibling.class_code) : cap(sibling.status)}</small>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <p className="app-muted">No siblings on the register.</p>}
              </section>
            </aside>
          </div>
        ) : null}

        {tab === "medical" ? (
          <div className="app-detail-grid">
            <div className="app-detail-main">
              <section className="admin-card">
                <h2 className="app-card-title">Medical notes</h2>
                {student.medical_notes ? <p className="ofc-medical-note">{student.medical_notes}</p> : <p className="app-muted">No medical notes on file.</p>}
                <dl className="app-details">
                  <Detail label="Panadol">
                    {student.panadol_allowed === true ? <span className="ofc-yes"><i className="fa-solid fa-check" aria-hidden="true" /> Allowed</span>
                      : student.panadol_allowed === false ? <span className="ofc-no"><i className="fa-solid fa-ban" aria-hidden="true" /> Not allowed</span>
                      : null}
                  </Detail>
                  <Detail label="Age">{age !== null ? `${age} years` : null}</Detail>
                </dl>
                <Link className="app-link-btn" href={tabHref("edit")}><i className="fa-solid fa-pen" aria-hidden="true" /> Update medical details</Link>
              </section>
            </div>
            <aside className="app-detail-side">
              <section className="admin-card">
                <h2 className="app-card-title">Emergency contacts</h2>
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
                ) : <p className="app-muted">No phone numbers on file.</p>}
              </section>
            </aside>
          </div>
        ) : null}

        {tab === "timeline" ? (
          <div className="app-detail-grid">
            <section className="admin-card">
              <h2 className="app-card-title">Timeline <span className="app-count">{activity.length}</span></h2>
              {activity.length ? timeline(activity) : <p className="app-muted">No changes recorded yet.</p>}
            </section>
            <aside className="app-detail-side">
              <section className="admin-card">
                <h2 className="app-card-title">Add a note</h2>
                <StudentNoteForm id={id} />
              </section>
            </aside>
          </div>
        ) : null}
      </div>

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
