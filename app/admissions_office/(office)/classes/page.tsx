import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { ClassSizeChart, ClassesBoard, ClassesHeroStats, type ClassSummary, type ClassesSection } from "@/components/office/ClassesBoard";
import { ClassFinder, type FinderClass, type FinderPupil } from "@/components/office/ClassFinder";
import { BirthdaysCard, MedicalCard, type CarePupil } from "@/components/office/PupilCareCards";
import { Kpis, MigrationHint, OfficeNotice, type Kpi } from "@/components/office/ui";
import { requireOffice } from "@/lib/office";
import { CLASS_AGE, OFFICE, SCHOOL_CLASSES, fetchAll, pick, studentAge } from "@/lib/students";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Classes" };

type Row = {
  id: string;
  full_name: string;
  preferred_name: string | null;
  student_number: string;
  father_name: string | null;
  mother_name: string | null;
  class_code: string | null;
  stream: string | null;
  sex: string | null;
  date_of_birth: string | null;
  house: string | null;
  medical_notes: string | null;
  panadol_allowed: boolean | null;
  needs_review: boolean;
};

export default async function ClassesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient();
  if (!supabase || !supabaseConfigured()) {
    return <OfficeNotice title="Classes" heading="Connect Supabase"><p>Add your Supabase keys to <code>.env.local</code>.</p></OfficeNotice>;
  }
  const params = await searchParams;
  const view = pick(params, "view") === "table" ? "table" : "cards";
  const sectionParam = pick(params, "section");
  const section: ClassesSection = sectionParam === "nursery" || sectionParam === "primary" ? sectionParam : "all";

  // The register loads alongside the access check; row-level security keeps it to office staff.
  const [auth, loaded] = await Promise.all([
    requireOffice(),
    fetchAll<Row>((from, to) =>
      supabase
        .from("student_directory")
        .select("id, full_name, preferred_name, student_number, father_name, mother_name, class_code, stream, sex, date_of_birth, house, medical_notes, panadol_allowed, needs_review")
        .eq("status", "active")
        .order("id")
        .range(from, to)).then((data) => ({ data } as const), (error: Error) => ({ error } as const)),
  ]);
  if ("error" in auth) return <OfficeNotice title="Classes" icon="fa-lock" heading="Not available"><p>{auth.error}</p></OfficeNotice>;
  if ("error" in loaded) {
    return <OfficeNotice title="Classes" heading="Classes could not be loaded"><MigrationHint message={loaded.error.message} /></OfficeNotice>;
  }
  const rows = loaded.data;

  const total = rows.length;
  const noClass = rows.filter((row) => !row.class_code).length;
  const classes: ClassSummary[] = SCHOOL_CLASSES.map((entry) => {
    const pupils = rows.filter((row) => row.class_code === entry.code);
    const streams = new Map<string, number>();
    for (const pupil of pupils) streams.set(pupil.stream || "", (streams.get(pupil.stream || "") ?? 0) + 1);
    const ages = pupils.map((pupil) => studentAge(pupil.date_of_birth)).filter((age): age is number => age !== null);
    const averageAge = ages.length ? ages.reduce((sum, age) => sum + age, 0) / ages.length : null;
    return {
      code: entry.code,
      name: entry.name,
      section: entry.section,
      total: pupils.length,
      boys: pupils.filter((pupil) => pupil.sex === "M").length,
      girls: pupils.filter((pupil) => pupil.sex === "F").length,
      streams: [...streams.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)),
      averageAge,
      ageWarn: averageAge !== null && Math.abs(averageAge - (CLASS_AGE[entry.code] + 0.5)) >= 1.5,
      medical: pupils.filter((pupil) => pupil.medical_notes).length,
      noHouse: pupils.filter((pupil) => !pupil.house).length,
      review: pupils.filter((pupil) => pupil.needs_review).length,
    };
  });
  const running = classes.filter((entry) => entry.total);
  const placed = total - noClass;
  const largest = running.reduce<ClassSummary | null>((best, entry) => (!best || entry.total > best.total ? entry : best), null);
  const streamCount = classes.reduce((sum, entry) => sum + entry.streams.filter((stream) => stream.name).length, 0);
  const medical = classes.reduce((sum, entry) => sum + entry.medical, 0);

  const kpis: Kpi[] = [
    { label: "Average class", value: Math.round(placed / Math.max(1, running.length)), icon: "fa-scale-balanced", note: largest ? `Largest is ${largest.name} (${largest.total})` : "No classes yet", href: `${OFFICE}/reports` },
    { label: "Streams", value: streamCount, icon: "fa-code-branch", note: `Across ${running.length} classes`, href: `${OFFICE}/classes?view=table` },
    { label: "Medical notes", value: medical, icon: "fa-notes-medical", note: medical ? "Pupils with a health note" : "No health notes recorded", href: `${OFFICE}/medical` },
    { label: "No class set", value: noClass, icon: "fa-circle-question", note: noClass ? "Assign them a class" : "Everyone is placed", href: `${OFFICE}/data-quality#missing` },
  ];

  const pupils: FinderPupil[] = rows.map((row) => ({
    id: row.id,
    n: row.full_name,
    p: row.preferred_name,
    no: row.student_number,
    c: row.class_code,
    s: row.stream,
    h: row.house,
    x: row.sex,
    f: row.father_name,
    m: row.mother_name,
  }));
  const carePupil = (row: Row): CarePupil => ({
    id: row.id,
    name: row.full_name,
    preferred: row.preferred_name,
    sex: row.sex,
    place: row.class_code ? `${row.class_code}${row.stream ? ` · ${row.stream}` : ""}` : "No class",
  });

  const finderClasses: FinderClass[] = classes.map((entry) => ({
    code: entry.code,
    name: entry.name,
    total: entry.total,
    streams: entry.streams.map((stream) => stream.name).filter(Boolean),
  }));

  return (
    <div className="app-page ofc-page ofc-classes">
      <PageHeader
        kicker="Register"
        icon="fa-chalkboard"
        title="Classes"
        description="Every class at a glance: how many pupils, the balance of boys and girls, and how each class is split into streams. Open a class for its full list."
        actions={
          <>
            <Link className="admin-hero-btn is-primary" href={`${OFFICE}/promotions`}><i className="fa-solid fa-stairs" aria-hidden="true" /> Year-end promotion</Link>
            <a className="admin-hero-btn" href={`${OFFICE}/students/export`}><i className="fa-solid fa-file-csv" aria-hidden="true" /> Export register</a>
          </>
        }
      >
        <ClassesHeroStats classes={classes} streams={streamCount} />
      </PageHeader>

      <ClassFinder pupils={pupils} classes={finderClasses} />
      <Kpis items={kpis} />
      <ClassSizeChart classes={classes} />
      <div className="occ-pair no-print">
        <BirthdaysCard
          pupils={rows.map((row) => ({ ...carePupil(row), dob: row.date_of_birth }))}
          within={14}
          scope="the school"
          href={`${OFFICE}/birthdays`}
          showPlace
        />
        <MedicalCard
          pupils={rows.filter((row) => row.medical_notes).map((row) => ({ ...carePupil(row), notes: row.medical_notes ?? "", panadol: row.panadol_allowed }))}
          scope="the school"
          href={`${OFFICE}/medical`}
          showPlace
        />
      </div>
      <ClassesBoard classes={classes} view={view} section={section} />
    </div>
  );
}
