import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { ActionButton } from "@/components/office/client";
import { Clear, DataQualityNav, MissingDetails, PupilCell, type CheckItem, type Gap, type GapPupil, type PupilInfo } from "@/components/office/DataQuality";
import { MigrationHint, OfficeNotice } from "@/components/office/ui";
import { requireOffice } from "@/lib/office";
import { OFFICE, ageOutlier, cap, displayPhone, fetchAll, pick, studentAge, telHref } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";
import { resolveContact } from "../families/actions";
import { dismissDuplicate, resolveStudentReview } from "../students/actions";
import "./data-quality.css";

export const metadata = { title: "Data quality" };

type Row = {
  id: string;
  full_name: string;
  student_number: string;
  class_code: string | null;
  stream: string | null;
  sex: string | null;
  date_of_birth: string | null;
  family_id: string | null;
  family_code: string | null;
  needs_review: boolean;
};

type Contact = { id: string; family_id: string; kind: string; value: string; relationship: string; name: string | null; label: string | null };
type Duplicate = { student_a: string; student_b: string; reason: string };

const COLUMNS = "id, full_name, student_number, class_code, stream, sex, date_of_birth, family_id, family_code, needs_review";

const GAP_TESTS: Record<Gap, (row: Row) => boolean> = {
  dob: (row) => !row.date_of_birth,
  sex: (row) => row.sex !== "M" && row.sex !== "F",
  class: (row) => !row.class_code,
  family: (row) => !row.family_id,
};
const GAP_KEYS = Object.keys(GAP_TESTS) as Gap[];

const LIMIT = 60;
const nf = (value: number) => value.toLocaleString("en-GB");
const stagger = (index: number) => ({ "--i": Math.min(index, 12) }) as React.CSSProperties;

function info(row: Row): PupilInfo {
  return {
    id: row.id,
    name: row.full_name,
    number: row.student_number,
    place: row.class_code ? `${row.class_code}${row.stream ? ` ${row.stream}` : ""}` : "No class",
    family: row.family_code,
    sex: row.sex,
  };
}

function bornOn(dob: string) {
  return new Date(`${dob}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function Section({ id, icon, tone, title, description, count, unit, footer, children }: {
  id: string;
  icon: string;
  tone: string;
  title: string;
  description: React.ReactNode;
  count: number | null;
  unit: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={`odq-sec is-${tone}`} id={id} aria-labelledby={`${id}-title`}>
      <header className="odq-sec-head">
        <span className="odq-sec-icon" aria-hidden="true"><i className={`fa-solid ${icon}`} /></span>
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          <p>{description}</p>
        </div>
        {count === null ? null : count ? (
          <span className="odq-count">{nf(count)} <small>{unit}</small></span>
        ) : (
          <span className="odq-count is-clear"><i className="fa-solid fa-check" aria-hidden="true" /> All clear</span>
        )}
      </header>
      {children}
      {footer ? <footer className="odq-sec-foot">{footer}</footer> : null}
    </section>
  );
}

function More({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link className="odq-more" href={href}>{children} <i className="fa-solid fa-chevron-down" aria-hidden="true" /></Link>;
}

export default async function DataQualityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!supabaseConfigured()) {
    return <OfficeNotice title="Data quality" heading="Connect Supabase"><p>Add your Supabase keys to <code>.env.local</code>.</p></OfficeNotice>;
  }
  const auth = await requireOffice();
  if ("error" in auth) return <OfficeNotice title="Data quality" icon="fa-lock" heading="Not available"><p>{auth.error}</p></OfficeNotice>;
  const { supabase } = auth;
  const params = await searchParams;
  const missingView = GAP_KEYS.find((key) => key === pick(params, "missing")) ?? "dob";
  const showAll = pick(params, "all");
  const upTo = (key: string, max: number) => (showAll === key ? max : LIMIT);

  let rows: Row[];
  let phones: { family_id: string }[];
  try {
    [rows, phones] = await Promise.all([
      fetchAll<Row>((from, to) =>
        supabase.from("student_directory")
          .select(COLUMNS)
          .eq("status", "active").order("class_order", { nullsFirst: false }).order("full_name").range(from, to)),
      fetchAll<{ family_id: string }>((from, to) => supabase.from("family_contacts").select("family_id").eq("kind", "phone").order("id").range(from, to), 50000),
    ]);
  } catch (error) {
    return <OfficeNotice title="Data quality" heading="The register could not be loaded"><MigrationHint message={(error as Error).message} /></OfficeNotice>;
  }

  const reviewRows = rows.filter((row) => row.needs_review);
  const reviewShown = reviewRows.slice(0, upTo("review", 300));
  const [notesResult, contactResult, duplicateResult] = await Promise.all([
    reviewShown.length
      ? supabase.from("students").select("id, import_notes").in("id", reviewShown.map((row) => row.id))
      : Promise.resolve({ data: [] }),
    supabase.from("family_contacts").select("id, family_id, kind, value, relationship, name, label", { count: "exact" }).eq("needs_check", true).order("family_id").limit(upTo("contacts", 500)),
    supabase.rpc("find_duplicate_students"),
  ]);
  const notes = new Map(((notesResult.data || []) as { id: string; import_notes: string[] | null }[]).map((row) => [row.id, row.import_notes ?? []]));
  const contacts = (contactResult.data || []) as Contact[];
  const contactTotal = contactResult.count ?? contacts.length;
  const duplicates = (duplicateResult.data || []) as Duplicate[];

  const families = new Map<string, { code: string; name: string | null }>();
  const familyIds = [...new Set(contacts.map((contact) => contact.family_id))];
  if (familyIds.length) {
    const { data } = await supabase.from("families").select("id, family_code, mailing_name").in("id", familyIds);
    for (const family of data || []) families.set(family.id, { code: family.family_code, name: family.mailing_name });
  }
  const byId = new Map(rows.map((row) => [row.id, row]));
  const missingIds = duplicates.flatMap((pair) => [pair.student_a, pair.student_b]).filter((id) => !byId.has(id));
  if (missingIds.length) {
    const { data } = await supabase.from("student_directory").select(COLUMNS).in("id", [...new Set(missingIds)].slice(0, 300));
    for (const row of (data || []) as Row[]) byId.set(row.id, row);
  }

  const withPhone = new Set(phones.map((row) => row.family_id));
  const noPhone = rows.filter((row) => row.family_id && !withPhone.has(row.family_id));
  const phoneless = [...noPhone.reduce((map, row) => map.set(row.family_id!, [...(map.get(row.family_id!) ?? []), row]), new Map<string, Row[]>())]
    .map(([id, children]) => ({ id, code: children[0].family_code, children }));
  const outliers = rows.map((row) => ({ ...row, outlier: ageOutlier(row.class_code, row.date_of_birth) })).filter((row) => row.outlier);

  const gapPupils: GapPupil[] = rows
    .map((row) => ({ ...info(row), gaps: GAP_KEYS.filter((key) => GAP_TESTS[key](row)) }))
    .filter((pupil) => pupil.gaps.length);
  const missingTotal = gapPupils.reduce((sum, pupil) => sum + pupil.gaps.length, 0);

  // A record is complete when nothing on this page points at it.
  const flagged = new Set<string>([
    ...reviewRows.map((row) => row.id),
    ...gapPupils.map((pupil) => pupil.id),
    ...noPhone.map((row) => row.id),
    ...outliers.map((row) => row.id),
    ...duplicates.flatMap((pair) => [pair.student_a, pair.student_b]),
  ]);
  const flaggedActive = rows.filter((row) => flagged.has(row.id)).length;
  const complete = rows.length - flaggedActive;
  const score = rows.length ? Math.floor((complete / rows.length) * 100) : 100;

  const checks: CheckItem[] = [
    { id: "review", label: "Import warnings", icon: "fa-triangle-exclamation", tone: "gold", count: reviewRows.length },
    { id: "contacts", label: "Contacts to check", icon: "fa-phone-slash", tone: "blue", count: contactTotal },
    { id: "duplicates", label: "Possible duplicates", icon: "fa-clone", tone: "violet", count: duplicateResult.error ? null : duplicates.length },
    { id: "missing", label: "Missing details", icon: "fa-circle-question", tone: "red", count: missingTotal },
    { id: "phone", label: "No phone number", icon: "fa-phone", tone: "teal", count: phoneless.length },
    { id: "age", label: "Unusual age for class", icon: "fa-cake-candles", tone: "slate", count: outliers.length },
  ];
  const open = checks.reduce((sum, check) => sum + (check.count ?? 0), 0);
  const clearChecks = checks.filter((check) => check.count === 0).length;

  return (
    <div className="app-page ofc-page odq-page">
      <PageHeader
        kicker="Insights"
        icon="fa-clipboard-check"
        title="Data quality"
        description="Work through each check to keep the register accurate. Fix a record, mark it as checked, and it drops off the list."
        actions={
          <>
            <Link className="admin-hero-btn" href={`${OFFICE}/students`}><i className="fa-solid fa-users" aria-hidden="true" /> Student register</Link>
            <Link className="admin-hero-btn" href={`${OFFICE}/reports`}><i className="fa-solid fa-chart-column" aria-hidden="true" /> Reports</Link>
          </>
        }
      >
        <div className="odq-score">
          <div className={`odq-ring${score >= 90 ? " is-good" : score < 60 ? " is-low" : ""}`} style={{ "--odq-p": score } as React.CSSProperties} role="img" aria-label={`${score}% of records are complete`}>
            <strong>{score}<small>%</small></strong>
          </div>
          <div>
            <p className="odq-score-label">Complete records</p>
            <p className="odq-score-sub"><strong>{nf(complete)}</strong> of {nf(rows.length)} active pupils have nothing left to fix.</p>
          </div>
          <dl className="odq-score-figures">
            <div><dt>Items to check</dt><dd>{nf(open)}</dd></div>
            <div><dt>Checks clear</dt><dd>{clearChecks}<small> / {checks.length}</small></dd></div>
          </dl>
        </div>
      </PageHeader>

      <div className="odq-layout">
        <DataQualityNav items={checks} />

        <div className="odq-main">
          <Section
            id="review"
            icon="fa-triangle-exclamation"
            tone="gold"
            title="Import warnings"
            description="Some records have data inconsistencies. Please review them and make the necessary corrections."
            count={reviewRows.length}
            unit={reviewRows.length === 1 ? "record" : "records"}
            footer={reviewRows.length > reviewShown.length ? <More href={`${OFFICE}/data-quality?all=review#review`}>Show {nf(Math.min(300, reviewRows.length))} of {nf(reviewRows.length)}</More> : null}
          >
            {reviewShown.length ? (
              <ul className="odq-list">
                {reviewShown.map((row, index) => {
                  const list = notes.get(row.id) ?? [];
                  return (
                    <li key={row.id} className="odq-row" style={stagger(index)}>
                      <PupilCell pupil={info(row)}>
                        {list.length ? <ul className="odq-notes">{list.map((note) => <li key={note}>{note}</li>)}</ul> : null}
                      </PupilCell>
                      <div className="odq-acts">
                        <Link className="odq-btn" href={`${OFFICE}/students/${row.id}?tab=edit`}><i className="fa-solid fa-pen" aria-hidden="true" /> Fix</Link>
                        <ActionButton className="odq-btn is-ok" action={resolveStudentReview.bind(null, row.id)} label="Checked" busyLabel="Saving…" icon="fa-check" />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : <Clear title="No import warnings left">Every record from the spreadsheet import has been checked.</Clear>}
          </Section>

          <Section
            id="contacts"
            icon="fa-phone-slash"
            tone="blue"
            title="Contacts to check"
            description="Phone numbers and emails the import couldn't confirm, often a number in the wrong column or with a digit missing. Call or message to check."
            count={contactTotal}
            unit={contactTotal === 1 ? "contact" : "contacts"}
            footer={contactTotal > contacts.length ? <More href={`${OFFICE}/data-quality?all=contacts#contacts`}>Show more ({nf(contactTotal)} in total)</More> : null}
          >
            {contacts.length ? (
              <ul className="odq-list">
                {contacts.map((contact, index) => {
                  const family = families.get(contact.family_id);
                  const phone = contact.kind === "phone";
                  const href = phone ? telHref(contact.value) : `mailto:${contact.value}`;
                  return (
                    <li key={contact.id} className="odq-row" style={stagger(index)}>
                      <div className="odq-who">
                        <span className="odq-avatar is-icon" aria-hidden="true"><i className={phone ? "fa-solid fa-phone" : "fa-regular fa-envelope"} /></span>
                        <div>
                          <span className="odq-value">{phone ? displayPhone(contact.value) : contact.value}</span>
                          <small>
                            {[contact.name, contact.relationship ? cap(contact.relationship) : null, contact.label].filter(Boolean).join(" · ")}
                            {contact.name || contact.relationship || contact.label ? " · " : ""}
                            <Link href={`${OFFICE}/families/${contact.family_id}#contacts`}>{family?.name || family?.code || "Family"}</Link>
                          </small>
                        </div>
                      </div>
                      <div className="odq-acts">
                        {href ? <a className="odq-btn" href={href}><i className={`fa-solid ${phone ? "fa-phone" : "fa-paper-plane"}`} aria-hidden="true" /> {phone ? "Call" : "Email"}</a> : null}
                        <Link className="odq-btn" href={`${OFFICE}/families/${contact.family_id}#contacts`}><i className="fa-solid fa-pen" aria-hidden="true" /> Edit</Link>
                        <ActionButton className="odq-btn is-ok" action={resolveContact.bind(null, contact.id, contact.family_id)} label="Checked" busyLabel="Saving…" icon="fa-check" />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : <Clear title="Every contact is confirmed">No phone numbers or emails are waiting to be checked.</Clear>}
          </Section>

          <Section
            id="duplicates"
            icon="fa-clone"
            tone="violet"
            title="Possible duplicates"
            description="Pupils with the same name and either the same date of birth or the same family. Merge by editing one record and marking the other as left, or confirm they're different children."
            count={duplicateResult.error ? null : duplicates.length}
            unit={duplicates.length === 1 ? "pair" : "pairs"}
            footer={duplicates.length > LIMIT ? <p>Showing {LIMIT} of {nf(duplicates.length)}. Resolve these to see the rest.</p> : null}
          >
            {duplicateResult.error ? (
              <div className="odq-clear is-warn">
                <span aria-hidden="true"><i className="fa-solid fa-database" /></span>
                <div>
                  <strong>Duplicate check isn&apos;t set up</strong>
                  <p>Run <code>supabase/0011_admissions_office.sql</code> in the Supabase SQL editor. ({duplicateResult.error.message})</p>
                </div>
              </div>
            ) : duplicates.length ? (
              <ul className="odq-list">
                {duplicates.slice(0, LIMIT).map((pair, index) => {
                  const a = byId.get(pair.student_a);
                  const b = byId.get(pair.student_b);
                  return (
                    <li key={`${pair.student_a}-${pair.student_b}`} className="odq-pair" style={stagger(index)}>
                      <p className="odq-pair-reason"><i className="fa-solid fa-link" aria-hidden="true" /> {pair.reason}</p>
                      <div className="odq-pair-body">
                        <PupilCell pupil={a ? info(a) : undefined} />
                        <span className="odq-pair-vs" aria-label="may be the same as"><i className="fa-solid fa-equals" aria-hidden="true" /></span>
                        <PupilCell pupil={b ? info(b) : undefined} />
                        <div className="odq-acts">
                          <ActionButton className="odq-btn is-ok" action={dismissDuplicate.bind(null, pair.student_a, pair.student_b)} label="Different children" busyLabel="Saving…" icon="fa-check" />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : <Clear title="No likely duplicates">No two active pupils look like the same child.</Clear>}
          </Section>

          <Section
            id="missing"
            icon="fa-circle-question"
            tone="red"
            title="Missing details"
            description="Active pupils with gaps in their record. Choose a gap to see who is missing it."
            count={missingTotal}
            unit={missingTotal === 1 ? "gap" : "gaps"}
          >
            <MissingDetails pupils={gapPupils} initial={missingView} />
          </Section>

          <Section
            id="phone"
            icon="fa-phone"
            tone="teal"
            title="No phone number"
            description={<>These families have no phone number on file, so the school can&apos;t reach them in an emergency. {noPhone.length ? `${nf(noPhone.length)} ${noPhone.length === 1 ? "pupil is" : "pupils are"} affected.` : ""}</>}
            count={phoneless.length}
            unit={phoneless.length === 1 ? "family" : "families"}
            footer={phoneless.length > LIMIT && showAll !== "phone" ? <More href={`${OFFICE}/data-quality?all=phone#phone`}>Show all {nf(phoneless.length)}</More> : null}
          >
            {phoneless.length ? (
              <ul className="odq-list">
                {phoneless.slice(0, upTo("phone", 500)).map((family, index) => (
                  <li key={family.id} className="odq-row" style={stagger(index)}>
                    <div className="odq-who">
                      <span className="odq-avatar is-icon" aria-hidden="true"><i className="fa-solid fa-house-chimney-user" /></span>
                      <div>
                        <Link href={`${OFFICE}/families/${family.id}`}>{family.code ? `Family ${family.code}` : "Family"}</Link>
                        <small>
                          {family.children.map((child, childIndex) => (
                            <span key={child.id}>
                              {childIndex ? ", " : ""}
                              <Link href={`${OFFICE}/students/${child.id}`}>{child.full_name}</Link>
                              {child.class_code ? ` (${child.class_code})` : ""}
                            </span>
                          ))}
                        </small>
                      </div>
                    </div>
                    <div className="odq-acts">
                      <Link className="odq-btn is-ok" href={`${OFFICE}/families/${family.id}#contacts`}><i className="fa-solid fa-plus" aria-hidden="true" /> Add a number</Link>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <Clear title="Every family has a phone number">The school can reach every family on the register.</Clear>}
          </Section>

          <Section
            id="age"
            icon="fa-cake-candles"
            tone="slate"
            title="Unusual age for class"
            description="Two or more years from the usual age for the class. Usually a wrong date of birth or class."
            count={outliers.length}
            unit={outliers.length === 1 ? "pupil" : "pupils"}
            footer={outliers.length > LIMIT && showAll !== "age" ? <More href={`${OFFICE}/data-quality?all=age#age`}>Show all {nf(outliers.length)}</More> : null}
          >
            {outliers.length ? (
              <ul className="odq-list">
                {outliers.slice(0, upTo("age", 500)).map((row, index) => (
                  <li key={row.id} className="odq-row" style={stagger(index)}>
                    <PupilCell pupil={info(row)}>
                      <span className="odq-flag">
                        <i className="fa-solid fa-cake-candles" aria-hidden="true" /> {row.outlier}
                        {row.date_of_birth ? <span> · born {bornOn(row.date_of_birth)}, age {studentAge(row.date_of_birth)}</span> : null}
                      </span>
                    </PupilCell>
                    <div className="odq-acts">
                      <Link className="odq-btn" href={`${OFFICE}/students/${row.id}?tab=edit`}><i className="fa-solid fa-pen" aria-hidden="true" /> Check details</Link>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <Clear title="Every pupil is near the usual age">No dates of birth look out of place for the class.</Clear>}
          </Section>
        </div>
      </div>
    </div>
  );
}
