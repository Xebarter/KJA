import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { Kpis, MigrationHint, OfficeNotice, type Kpi } from "@/components/office/ui";
import { requireOffice } from "@/lib/office";
import { CLASS_AGE, HOUSES, OFFICE, SCHOOL_CLASSES, SECTIONS, fetchAll, studentAge } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Classes" };

type Row = { class_code: string | null; stream: string | null; sex: string | null; date_of_birth: string | null; house: string | null; medical_notes: string | null; needs_review: boolean };

export default async function ClassesPage() {
  if (!supabaseConfigured()) {
    return <OfficeNotice title="Classes" heading="Connect Supabase"><p>Add your Supabase keys to <code>.env.local</code>.</p></OfficeNotice>;
  }
  const auth = await requireOffice();
  if ("error" in auth) return <OfficeNotice title="Classes" icon="fa-lock" heading="Not available"><p>{auth.error}</p></OfficeNotice>;
  let rows: Row[];
  try {
    rows = await fetchAll<Row>((from, to) =>
      auth.supabase.from("student_directory").select("class_code, stream, sex, date_of_birth, house, medical_notes, needs_review").eq("status", "active").order("id").range(from, to));
  } catch (error) {
    return <OfficeNotice title="Classes" heading="Classes could not be loaded"><MigrationHint message={(error as Error).message} /></OfficeNotice>;
  }

  const total = rows.length;
  const noClass = rows.filter((row) => !row.class_code).length;
  const classes = SCHOOL_CLASSES.map((entry) => {
    const pupils = rows.filter((row) => row.class_code === entry.code);
    const streams = new Map<string, number>();
    for (const pupil of pupils) streams.set(pupil.stream || "–", (streams.get(pupil.stream || "–") ?? 0) + 1);
    const ages = pupils.map((pupil) => studentAge(pupil.date_of_birth)).filter((age): age is number => age !== null);
    return {
      ...entry,
      total: pupils.length,
      boys: pupils.filter((pupil) => pupil.sex === "M").length,
      girls: pupils.filter((pupil) => pupil.sex === "F").length,
      streams: [...streams.entries()].sort(([a], [b]) => a.localeCompare(b)),
      averageAge: ages.length ? ages.reduce((sum, age) => sum + age, 0) / ages.length : null,
      medical: pupils.filter((pupil) => pupil.medical_notes).length,
      noHouse: pupils.filter((pupil) => !pupil.house).length,
      houses: HOUSES.map((house) => pupils.filter((pupil) => pupil.house === house).length),
    };
  });
  const largest = Math.max(1, ...classes.map((entry) => entry.total));
  const streamCount = classes.reduce((sum, entry) => sum + entry.streams.filter(([stream]) => stream !== "–").length, 0);

  const kpis: Kpi[] = [
    { label: "Pupils in class", value: total - noClass, icon: "fa-children", note: `${total} active in total`, href: `${OFFICE}/students` },
    { label: "Classes", value: classes.filter((entry) => entry.total).length, icon: "fa-chalkboard", note: `${streamCount} streams`, href: `${OFFICE}/classes` },
    { label: "Average class", value: Math.round((total - noClass) / Math.max(1, classes.filter((entry) => entry.total).length)), icon: "fa-scale-balanced", note: `Largest is ${largest}`, href: `${OFFICE}/reports` },
    { label: "No class set", value: noClass, icon: "fa-circle-question", note: noClass ? "Assign them a class" : "Everyone is placed", href: `${OFFICE}/data-quality#missing` },
  ];

  return (
    <div className="app-page ofc-page">
      <PageHeader
        kicker="Register"
        icon="fa-chalkboard"
        title="Classes"
        description="Every class with its streams, the balance of boys and girls, and quick links to print a class list."
        actions={<Link className="admin-hero-btn" href={`${OFFICE}/promotions`}><i className="fa-solid fa-stairs" aria-hidden="true" /> Year-end promotion</Link>}
      />
      <Kpis items={kpis} />

      {SECTIONS.map((section) => (
        <section key={section.value} className="ofc-class-section">
          <h2 className="ofc-section-title">
            {section.label}
            <span>{classes.filter((entry) => entry.section === section.value).reduce((sum, entry) => sum + entry.total, 0)} pupils</span>
          </h2>
          <div className="ofc-class-grid">
            {classes.filter((entry) => entry.section === section.value).map((entry) => {
              const outOfAge = entry.averageAge !== null && Math.abs(entry.averageAge - (CLASS_AGE[entry.code] + 0.5)) >= 1.5;
              return (
                <Link key={entry.code} href={`${OFFICE}/classes/${entry.code}`} className={`ofc-class-card${entry.total ? "" : " is-empty"}`}>
                  <header>
                    <span className="ofc-class-code">{entry.code}</span>
                    <div>
                      <strong>{entry.name}</strong>
                      <small>{entry.total ? `${entry.total} pupils` : "No pupils"}</small>
                    </div>
                  </header>
                  <span className="ofc-class-meter" aria-hidden="true"><span style={{ width: `${(entry.total / largest) * 100}%` }} /></span>
                  <div className="ofc-class-sexes">
                    <span className="ofc-sex is-boy">M</span> {entry.boys}
                    <span className="ofc-sex is-girl">F</span> {entry.girls}
                    {entry.averageAge !== null ? <span className={`ofc-class-age${outOfAge ? " is-warn" : ""}`}>avg age {entry.averageAge.toFixed(1)}</span> : null}
                  </div>
                  {entry.streams.length ? (
                    <ul className="ofc-class-streams">
                      {entry.streams.map(([stream, count]) => <li key={stream}><span>{stream === "–" ? "No stream" : stream}</span><strong>{count}</strong></li>)}
                    </ul>
                  ) : null}
                  <footer>
                    {entry.medical ? <span><i className="fa-solid fa-notes-medical" aria-hidden="true" /> {entry.medical}</span> : null}
                    {entry.noHouse ? <span className="is-warn"><i className="fa-solid fa-house-circle-xmark" aria-hidden="true" /> {entry.noHouse} without a house</span> : null}
                    <span className="ofc-class-go">Open <i className="fa-solid fa-arrow-right" aria-hidden="true" /></span>
                  </footer>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
