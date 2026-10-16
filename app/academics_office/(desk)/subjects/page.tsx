import { saveSubject } from "@/app/academics_office/(desk)/actions";
import { SubjectsDesk } from "@/components/academics/SubjectsDesk";
import { PageHeader } from "@/components/admin/PageHeader";
import { AcademicsGate, OfficeOnly } from "@/components/academics/ui";
import { mapSubject, openAcademics } from "@/lib/academics";
import { SCHOOL_CLASSES } from "@/lib/students";

export const metadata = { title: "Subjects" };

export default async function SubjectsPage() {
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Subjects" state={opened} />;
  if (!opened.auth.office) return <OfficeOnly title="Subjects" />;
  const { data, error } = await opened.auth.supabase.from("subjects").select("*").order("sort_order");
  if (error) return <AcademicsGate title="Subjects" state={{ notice: "schema", message: error.message }} />;
  const subjects = ((data || []) as Record<string, unknown>[]).map(mapSubject);

  return (
    <div className="app-page ofc-page asb-page">
      <PageHeader
        kicker="Teaching"
        icon="fa-book-open"
        title="Subjects"
        description="Choose a subject to rename it, change where it applies, or hide it. Core subjects print on every report. Optional subjects print only when a pupil has a mark."
      />
      <SubjectsDesk
        subjects={subjects}
        classes={SCHOOL_CLASSES.map((entry) => ({ code: entry.code, name: entry.name, order: entry.order, section: entry.section }))}
        save={saveSubject}
      />
    </div>
  );
}
