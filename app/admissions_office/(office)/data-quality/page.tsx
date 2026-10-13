import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { ActionButton } from "@/components/office/client";
import { Kpis, MigrationHint, OfficeNotice, Panel, type Kpi } from "@/components/office/ui";
import { requireOffice } from "@/lib/office";
import { OFFICE, ageOutlier, cap, displayPhone, fetchAll, pick } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";
import { resolveContact } from "../families/actions";
import { dismissDuplicate, resolveStudentReview } from "../students/actions";

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

const MISSING = [
  { value: "dob", label: "No date of birth", test: (row: Row) => !row.date_of_birth },
  { value: "sex", label: "Sex not recorded", test: (row: Row) => row.sex !== "M" && row.sex !== "F" },
  { value: "class", label: "No class", test: (row: Row) => !row.class_code },
  { value: "family", label: "No family", test: (row: Row) => !row.family_id },
] as const;

const LIMIT = 60;

export default async function DataQualityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!supabaseConfigured()) {
    return <OfficeNotice title="Data quality" heading="Connect Supabase"><p>Add your Supabase keys to <code>.env.local</code>.</p></OfficeNotice>;
  }
  const auth = await requireOffice();
  if ("error" in auth) return <OfficeNotice title="Data quality" icon="fa-lock" heading="Not available"><p>{auth.error}</p></OfficeNotice>;
  const { supabase } = auth;
  const params = await searchParams;
  const missingView = MISSING.find((entry) => entry.value === pick(params, "missing"))?.value ?? "dob";
  const showAll = pick(params, "all");

  let rows: Row[];
  let phones: { family_id: string }[];
  try {
    [rows, phones] = await Promise.all([
      fetchAll<Row>((from, to) =>
        supabase.from("student_directory")
          .select("id, full_name, student_number, class_code, stream, sex, date_of_birth, family_id, family_code, needs_review")
          .eq("status", "active").order("class_order", { nullsFirst: false }).order("full_name").range(from, to)),
      fetchAll<{ family_id: string }>((from, to) => supabase.from("family_contacts").select("family_id").eq("kind", "phone").order("id").range(from, to), 50000),
    ]);
  } catch (error) {
    return <OfficeNotice title="Data quality" heading="The register could not be loaded"><MigrationHint message={(error as Error).message} /></OfficeNotice>;
  }

  const reviewRows = rows.filter((row) => row.needs_review);
  const [notesResult, contactResult, duplicateResult] = await Promise.all([
    reviewRows.length
      ? supabase.from("students").select("id, import_notes").in("id", reviewRows.slice(0, showAll === "review" ? 300 : LIMIT).map((row) => row.id))
      : Promise.resolve({ data: [] }),
    supabase.from("family_contacts").select("id, family_id, kind, value, relationship, name, label", { count: "exact" }).eq("needs_check", true).order("family_id").limit(showAll === "contacts" ? 500 : LIMIT),
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
    const { data } = await supabase.from("student_directory").select("id, full_name, student_number, class_code, stream, sex, date_of_birth, family_id, family_code, needs_review").in("id", [...new Set(missingIds)].slice(0, 300));
    for (const row of (data || []) as Row[]) byId.set(row.id, row);
  }

  const withPhone = new Set(phones.map((row) => row.family_id));
  const noPhone = rows.filter((row) => row.family_id && !withPhone.has(row.family_id));
  const outliers = rows.map((row) => ({ ...row, outlier: ageOutlier(row.class_code, row.date_of_birth) })).filter((row) => row.outlier);
  const missingCounts = Object.fromEntries(MISSING.map((entry) => [entry.value, rows.filter(entry.test).length]));
  const missingEntry = MISSING.find((entry) => entry.value === missingView)!;
  const missingRows = rows.filter(missingEntry.test);
  const missingTotal = Object.values(missingCounts).reduce((sum, count) => sum + count, 0);

  const kpis: Kpi[] = [
    { label: "Import warnings", value: reviewRows.length, icon: "fa-triangle-exclamation", note: reviewRows.length ? "Records to check" : "All checked", href: "#review" },
    { label: "Contacts to check", value: contactTotal, icon: "fa-phone-slash", note: contactTotal ? "Numbers the import doubted" : "All confirmed", href: "#contacts" },
    { label: "Possible duplicates", value: duplicates.length, icon: "fa-clone", note: duplicateResult.error ? "Run the 0011 migration" : duplicates.length ? "Same child twice?" : "None found", href: "#duplicates" },
    { label: "Missing details", value: missingTotal + noPhone.length, icon: "fa-circle-question", note: `${noPhone.length} with no phone number`, href: "#missing" },
  ];

  const studentCell = (row: Row | undefined, extra?: React.ReactNode) => row ? (
    <div className="ofc-dq-who">
      <Link href={`${OFFICE}/students/${row.id}`}>{row.full_name}</Link>
      <small>{row.student_number} · {row.class_code ?? "No class"}{row.stream ? ` ${row.stream}` : ""}{row.family_code ? ` · ${row.family_code}` : ""}</small>
      {extra}
    </div>
  ) : <span className="app-muted">Student not found</span>;

  return (
    <div className="app-page ofc-page">
      <PageHeader
        kicker="Insights"
        icon="fa-clipboard-check"
        title="Data quality"
        description="Work through these lists to keep the register accurate: warnings from the spreadsheet import, phone numbers to confirm, children entered twice and missing details."
      />
      <Kpis items={kpis} />

      <div className="ofc-dq">
        <Panel
          id="review"
          title="Import warnings"
          description="The import from the old spreadsheet flagged something on these records. Open the record, fix anything wrong, then mark it as checked."
        >
          {reviewRows.length ? (
            <ul className="ofc-dq-list">
              {reviewRows.slice(0, showAll === "review" ? 300 : LIMIT).map((row) => (
                <li key={row.id}>
                  {studentCell(row, <ul className="ofc-dq-notes">{(notes.get(row.id) ?? []).map((note) => <li key={note}>{note}</li>)}</ul>)}
                  <div className="ofc-item-actions">
                    <Link className="app-link-btn" href={`${OFFICE}/students/${row.id}?tab=edit`}>Fix</Link>
                    <ActionButton action={resolveStudentReview.bind(null, row.id)} label="Checked" busyLabel="Saving…" icon="fa-check" />
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="ofc-health-ok"><i className="fa-solid fa-circle-check" aria-hidden="true" /> No import warnings left.</p>}
          {reviewRows.length > LIMIT && showAll !== "review" ? <Link className="app-link-btn ofc-more" href={`${OFFICE}/data-quality?all=review#review`}>Show {Math.min(300, reviewRows.length)} of {reviewRows.length}</Link> : null}
        </Panel>

        <Panel
          id="contacts"
          title="Contacts to check"
          description="Phone numbers and emails the import couldn't confirm: often a number in the wrong column or with a digit missing. Call or message to check."
        >
          {contacts.length ? (
            <ul className="ofc-dq-list">
              {contacts.map((contact) => {
                const family = families.get(contact.family_id);
                return (
                  <li key={contact.id}>
                    <div className="ofc-dq-who">
                      <span className="ofc-dq-value">
                        <i className={contact.kind === "phone" ? "fa-solid fa-phone" : "fa-regular fa-envelope"} aria-hidden="true" />{" "}
                        {contact.kind === "phone" ? displayPhone(contact.value) : contact.value}
                      </span>
                      <small>
                        {[contact.name, cap(contact.relationship), contact.label].filter(Boolean).join(" · ")} ·{" "}
                        <Link href={`${OFFICE}/families/${contact.family_id}#contacts`}>{family?.name || family?.code || "Family"}</Link>
                      </small>
                    </div>
                    <div className="ofc-item-actions">
                      <Link className="app-link-btn" href={`${OFFICE}/families/${contact.family_id}#contacts`}>Edit</Link>
                      <ActionButton action={resolveContact.bind(null, contact.id, contact.family_id)} label="Checked" busyLabel="Saving…" icon="fa-check" />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : <p className="ofc-health-ok"><i className="fa-solid fa-circle-check" aria-hidden="true" /> Every contact is confirmed.</p>}
          {contactTotal > contacts.length ? <Link className="app-link-btn ofc-more" href={`${OFFICE}/data-quality?all=contacts#contacts`}>Show more ({contactTotal} in total)</Link> : null}
        </Panel>

        <Panel
          id="duplicates"
          title="Possible duplicates"
          description="Pupils with the same name and either the same date of birth or the same family. Merge by editing one record and marking the other as left, or confirm they're different children."
        >
          {duplicateResult.error ? (
            <p className="app-muted">Run <code>supabase/0011_admissions_office.sql</code> to check for duplicates. ({duplicateResult.error.message})</p>
          ) : duplicates.length ? (
            <ul className="ofc-dq-list is-pairs">
              {duplicates.slice(0, LIMIT).map((pair) => (
                <li key={`${pair.student_a}-${pair.student_b}`}>
                  <div className="ofc-dq-pair">
                    {studentCell(byId.get(pair.student_a))}
                    <span className="ofc-dq-vs" aria-hidden="true"><i className="fa-solid fa-equals" /></span>
                    {studentCell(byId.get(pair.student_b))}
                  </div>
                  <small className="ofc-dq-reason">{pair.reason}</small>
                  <div className="ofc-item-actions">
                    <ActionButton action={dismissDuplicate.bind(null, pair.student_a, pair.student_b)} label="Different children" busyLabel="Saving…" icon="fa-check" />
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="ofc-health-ok"><i className="fa-solid fa-circle-check" aria-hidden="true" /> No likely duplicates.</p>}
        </Panel>

        <Panel id="missing" title="Missing details" description="Active pupils with gaps in their record.">
          <div className="ofc-chips">
            {MISSING.map((entry) => (
              <Link key={entry.value} href={`${OFFICE}/data-quality?missing=${entry.value}#missing`} className={missingView === entry.value ? "is-on" : ""}>
                {entry.label} <span>{missingCounts[entry.value]}</span>
              </Link>
            ))}
          </div>
          {missingRows.length ? (
            <ul className="ofc-dq-list is-compact">
              {missingRows.slice(0, showAll === "missing" ? 500 : LIMIT).map((row) => (
                <li key={row.id}>
                  {studentCell(row)}
                  <Link className="app-link-btn" href={`${OFFICE}/students/${row.id}?tab=${missingView === "family" ? "family" : "edit"}`}>{missingView === "family" ? "Link family" : "Add"}</Link>
                </li>
              ))}
            </ul>
          ) : <p className="ofc-health-ok"><i className="fa-solid fa-circle-check" aria-hidden="true" /> Nobody is missing this.</p>}
          {missingRows.length > LIMIT && showAll !== "missing" ? (
            <Link className="app-link-btn ofc-more" href={`${OFFICE}/data-quality?missing=${missingView}&all=missing#missing`}>Show all {missingRows.length}</Link>
          ) : null}
        </Panel>

        <div className="dash-grid">
          <Panel title="No phone number" description="The family has no phone number on file, so the school can't reach them in an emergency.">
            {noPhone.length ? (
              <ul className="ofc-dq-list is-compact">
                {noPhone.slice(0, LIMIT).map((row) => (
                  <li key={row.id}>
                    {studentCell(row)}
                    <Link className="app-link-btn" href={`${OFFICE}/families/${row.family_id}#contacts`}>Add a number</Link>
                  </li>
                ))}
              </ul>
            ) : <p className="ofc-health-ok"><i className="fa-solid fa-circle-check" aria-hidden="true" /> Every family has a phone number.</p>}
            {noPhone.length > LIMIT ? <p className="app-muted ofc-tiny">Showing {LIMIT} of {noPhone.length}.</p> : null}
          </Panel>
          <Panel title="Unusual age for class" description="Two or more years from the usual age. Often a wrong date of birth or class.">
            {outliers.length ? (
              <ul className="ofc-dq-list is-compact">
                {outliers.slice(0, LIMIT).map((row) => (
                  <li key={row.id}>
                    {studentCell(row, <small className="ofc-flag-text">{row.outlier}</small>)}
                    <Link className="app-link-btn" href={`${OFFICE}/students/${row.id}?tab=edit`}>Check</Link>
                  </li>
                ))}
              </ul>
            ) : <p className="ofc-health-ok"><i className="fa-solid fa-circle-check" aria-hidden="true" /> Every pupil is near the usual age.</p>}
            {outliers.length > LIMIT ? <p className="app-muted ofc-tiny">Showing {LIMIT} of {outliers.length}.</p> : null}
          </Panel>
        </div>
      </div>
    </div>
  );
}
