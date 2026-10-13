import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { PrintButton } from "@/components/office/client";
import { Empty, Kpis, MigrationHint, OfficeNotice, type Kpi } from "@/components/office/ui";
import { requireOffice } from "@/lib/office";
import { OFFICE, SCHOOL_CLASSES, displayPhone, fetchAll, isClassCode, pick } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Medical" };

type Row = {
  id: string;
  full_name: string;
  student_number: string;
  class_code: string | null;
  stream: string | null;
  age: number | null;
  medical_notes: string | null;
  panadol_allowed: boolean | null;
  father_name: string | null;
  father_phone: string | null;
  mother_name: string | null;
  mother_phone: string | null;
};

const VIEWS = [
  { value: "notes", label: "Medical notes" },
  { value: "no-panadol", label: "No Panadol" },
  { value: "unknown", label: "Panadol not asked" },
] as const;

const ALLERGY = /allerg|anaphyl|epipen|peanut|nut\b|bee sting|penicillin/i;
const CHRONIC = /asthma|epilep|seizure|diabet|sickle|heart|inhaler/i;

export default async function MedicalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!supabaseConfigured()) {
    return <OfficeNotice title="Medical" heading="Connect Supabase"><p>Add your Supabase keys to <code>.env.local</code>.</p></OfficeNotice>;
  }
  const auth = await requireOffice();
  if ("error" in auth) return <OfficeNotice title="Medical" icon="fa-lock" heading="Not available"><p>{auth.error}</p></OfficeNotice>;
  const params = await searchParams;
  const view = VIEWS.find((entry) => entry.value === pick(params, "view"))?.value ?? "notes";
  const cls = isClassCode(pick(params, "class")) ? pick(params, "class") : "";

  let all: Row[];
  try {
    all = await fetchAll<Row>((from, to) =>
      auth.supabase
        .from("student_directory")
        .select("id, full_name, student_number, class_code, stream, age, medical_notes, panadol_allowed, father_name, father_phone, mother_name, mother_phone")
        .eq("status", "active")
        .order("class_order", { nullsFirst: false })
        .order("full_name")
        .range(from, to));
  } catch (error) {
    return <OfficeNotice title="Medical" heading="Medical records could not be loaded"><MigrationHint message={(error as Error).message} /></OfficeNotice>;
  }

  const withNotes = all.filter((row) => row.medical_notes);
  const noPanadol = all.filter((row) => row.panadol_allowed === false);
  const unknown = all.filter((row) => row.panadol_allowed === null);
  let rows = view === "no-panadol" ? noPanadol : view === "unknown" ? unknown : withNotes;
  if (cls) rows = rows.filter((row) => row.class_code === cls);
  const groups = SCHOOL_CLASSES.map((entry) => ({ ...entry, rows: rows.filter((row) => row.class_code === entry.code) })).filter((group) => group.rows.length);
  const unplaced = rows.filter((row) => !row.class_code);
  const href = (changes: { view?: string; class?: string }) => {
    const next = new URLSearchParams();
    const v = changes.view ?? view;
    const c = changes.class ?? cls;
    if (v !== "notes") next.set("view", v);
    if (c) next.set("class", c);
    const query = next.toString();
    return `${OFFICE}/medical${query ? `?${query}` : ""}`;
  };

  const kpis: Kpi[] = [
    { label: "Medical notes", value: withNotes.length, icon: "fa-notes-medical", note: `${Math.round((withNotes.length / Math.max(1, all.length)) * 100)}% of pupils`, href: href({ view: "notes" }) },
    { label: "Allergies", value: withNotes.filter((row) => ALLERGY.test(row.medical_notes ?? "")).length, icon: "fa-triangle-exclamation", note: "Notes mentioning an allergy", href: href({ view: "notes" }) },
    { label: "No Panadol", value: noPanadol.length, icon: "fa-ban", note: "Parents said no", href: href({ view: "no-panadol" }) },
    { label: "Panadol not asked", value: unknown.length, icon: "fa-circle-question", note: "Ask at the next contact", href: href({ view: "unknown" }) },
  ];
  const title = VIEWS.find((entry) => entry.value === view)?.label ?? "Medical";

  const table = (list: Row[]) => (
    <table className="app-table ofc-table ofc-medical-table">
      <thead>
        <tr><th>Pupil</th><th>Class</th><th>{view === "notes" ? "Notes" : "Medical notes"}</th><th>Panadol</th><th>Call</th></tr>
      </thead>
      <tbody>
        {list.map((row) => {
          const phone = row.mother_phone || row.father_phone;
          return (
            <tr key={row.id}>
              <td className="app-col-child">
                <Link href={`${OFFICE}/students/${row.id}?tab=medical`}>{row.full_name}</Link>
                <small>{row.student_number}{row.age !== null ? ` · ${row.age} yrs` : ""}</small>
              </td>
              <td>{row.class_code ?? "–"}{row.stream ? ` ${row.stream}` : ""}</td>
              <td className="ofc-medical-cell">
                {row.medical_notes ? (
                  <>
                    {ALLERGY.test(row.medical_notes) ? <span className="ofc-tag is-danger">Allergy</span> : null}
                    {CHRONIC.test(row.medical_notes) ? <span className="ofc-tag is-med">Condition</span> : null}
                    {row.medical_notes}
                  </>
                ) : <span className="app-muted">–</span>}
              </td>
              <td>{row.panadol_allowed === true ? "Yes" : row.panadol_allowed === false ? <strong className="ofc-no">No</strong> : <span className="app-muted">Not asked</span>}</td>
              <td className="ofc-parents">
                {phone ? <span>{displayPhone(phone)}<small>{row.mother_phone ? row.mother_name ?? "Mother" : row.father_name ?? "Father"}</small></span> : <span className="app-muted">No phone</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <div className="app-page ofc-page">
      <PageHeader
        kicker="Insights"
        icon="fa-notes-medical"
        title="Medical"
        description="Pupils with health notes, allergies and Panadol consent, grouped by class. Print a copy for the sick bay and class teachers."
        actions={<PrintButton label="Print for the sick bay" />}
      />
      <Kpis items={kpis} />
      <div className="ofc-print-head" aria-hidden="true">
        <strong>Kampala Junior Academy · {title}{cls ? ` · ${cls}` : ""}</strong>
        <span>{rows.length} pupils · Printed {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Kampala" })} · Confidential</span>
      </div>
      <div className="ofc-toolbar no-print">
        <nav className="apl-tabs" aria-label="Medical lists">
          {VIEWS.map((entry) => (
            <Link key={entry.value} href={href({ view: entry.value })} className={view === entry.value ? "active" : ""} aria-current={view === entry.value ? "page" : undefined}>
              {entry.label}
              <em>{entry.value === "notes" ? withNotes.length : entry.value === "no-panadol" ? noPanadol.length : unknown.length}</em>
            </Link>
          ))}
        </nav>
        <div className="ofc-chips" aria-label="Class">
          <Link href={href({ class: "" })} className={cls ? "" : "is-on"}>All classes</Link>
          {SCHOOL_CLASSES.map((entry) => <Link key={entry.code} href={href({ class: entry.code })} className={cls === entry.code ? "is-on" : ""}>{entry.code}</Link>)}
        </div>
      </div>

      {groups.length || unplaced.length ? (
        <div className="ofc-medical-groups">
          {groups.map((group) => (
            <section key={group.code} className="admin-card ofc-medical-group">
              <h2 className="app-card-title">{group.name} <span className="app-count">{group.rows.length}</span></h2>
              <div className="ofc-table-scroll">{table(group.rows)}</div>
            </section>
          ))}
          {unplaced.length ? (
            <section className="admin-card ofc-medical-group">
              <h2 className="app-card-title">No class set <span className="app-count">{unplaced.length}</span></h2>
              <div className="ofc-table-scroll">{table(unplaced)}</div>
            </section>
          ) : null}
        </div>
      ) : (
        <section className="admin-card"><Empty icon="fa-heart" title="Nobody on this list">{cls ? "Try another class." : "No pupils match."}</Empty></section>
      )}
    </div>
  );
}
