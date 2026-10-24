import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { ClassesDesk, type ClassRow, type ClassesTotals } from "@/components/academics/ClassesDesk";
import { AcademicsGate } from "@/components/academics/ui";
import { ACADEMICS_BASE, groupPupils, kampalaToday, loadCurrentTerm, streamQuery } from "@/lib/academics";
import { openAcademics } from "@/lib/academics-access";
import { loadRoll } from "@/lib/academics-roll";
import { pick } from "@/lib/students";

export const metadata = { title: "Classes" };

type Pupil = { id: string; class_code: string | null; stream: string | null; sex: string | null };

export default async function ClassesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Classes" state={opened} />;
  const { supabase, user } = opened.auth;
  const params = await searchParams;
  const sectionParam = pick(params, "section");
  const section = sectionParam === "nursery" || sectionParam === "primary" ? sectionParam : "";
  const need = pick(params, "need") === "teacher" ? "teacher" : "";

  const [pupils, termPack, teachers] = await Promise.all([
    loadRoll(supabase, user.id),
    loadCurrentTerm(supabase),
    supabase.from("class_teachers").select("term_id, class_code, stream, teaching_staff(full_name)"),
  ]);
  if (teachers.error) return <AcademicsGate title="Classes" state={{ notice: "schema", message: teachers.error.message }} />;
  if (termPack.error) return <AcademicsGate title="Classes" state={{ notice: "schema", message: termPack.error }} />;
  const term = termPack.term;
  const teacherName = new Map<string, string>();
  for (const row of teachers.data || []) {
    if (term && row.term_id !== term.id) continue;
    const staff = row.teaching_staff as { full_name?: string } | { full_name?: string }[] | null;
    const name = Array.isArray(staff) ? staff[0]?.full_name : staff?.full_name;
    if (name) teacherName.set(`${row.class_code}|${row.stream || ""}`, name);
  }

  const rows: ClassRow[] = groupPupils(pupils).map((group) => {
    const boys = group.pupils.filter((pupil) => pupil.sex === "M").length;
    const girls = group.pupils.filter((pupil) => pupil.sex === "F").length;
    return {
      code: group.code,
      name: group.name,
      stream: group.stream,
      section: group.section,
      pupils: group.pupils.length,
      boys,
      girls,
      teacher: teacherName.get(`${group.code}|${group.stream}`) ?? null,
      href: `${ACADEMICS_BASE}/classes/${group.code}?stream=${streamQuery(group.stream)}`,
    };
  });

  const nursery = rows.filter((row) => row.section === "nursery");
  const primary = rows.filter((row) => row.section === "primary");
  const untaught = rows.filter((row) => !row.teacher);
  const totals: ClassesTotals = {
    pupils: rows.reduce((sum, row) => sum + row.pupils, 0),
    boys: rows.reduce((sum, row) => sum + row.boys, 0),
    girls: rows.reduce((sum, row) => sum + row.girls, 0),
    classes: rows.length,
    nurseryPupils: nursery.reduce((sum, row) => sum + row.pupils, 0),
    nurseryClasses: nursery.length,
    primaryPupils: primary.reduce((sum, row) => sum + row.pupils, 0),
    primaryClasses: primary.length,
    taught: rows.length - untaught.length,
    untaught: untaught.length,
  };

  return (
    <div className="app-page ofc-page acl-page">
      <PageHeader
        kicker="Teaching"
        icon="fa-chalkboard"
        title="Classes"
        description={term ? <>Class teachers and enrolment for <strong>{term.label}</strong>. Pupil moves stay in the admissions office.</> : "Enrolment stays in the admissions office. Set a current term before assigning class teachers."}
        actions={
          <>
            <Link className="admin-hero-btn is-primary" href={`${ACADEMICS_BASE}/attendance?date=${kampalaToday()}`}><i className="fa-solid fa-clipboard-user" aria-hidden="true" /> Today&apos;s registers</Link>
            <Link className="admin-hero-btn" href={`${ACADEMICS_BASE}/staff`}><i className="fa-solid fa-chalkboard-user" aria-hidden="true" /> Staff</Link>
          </>
        }
      />
      <ClassesDesk rows={rows} totals={totals} term={term?.label ?? null} section={section} need={need} />
    </div>
  );
}
