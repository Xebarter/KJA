import { notFound, redirect } from "next/navigation";
import { AlumniEventEditor } from "@/components/admin/AlumniEventEditor";
import { AlumniProfileEditor } from "@/components/admin/AlumniProfileEditor";
import { CampusEditor } from "@/components/admin/CampusEditor";
import { CampusSectionEditor } from "@/components/admin/CampusSectionEditor";
import { PageEditor } from "@/components/admin/PageEditor";
import { campusOptions, toCampusRow, toSectionRow } from "@/lib/campus-admin";
import { campusInsight } from "@/lib/campus-profile";
import { toAlumniEventRow, toAlumniProfileRow } from "@/lib/alumni-admin";
import "../../../../alumni.css";
import { RecordForm } from "@/components/admin/RecordForm";
import { TeacherEditor } from "@/components/admin/TeacherEditor";
import { VacancyEditor } from "@/components/admin/VacancyEditor";
import { kampalaClock } from "@/lib/events-calendar";
import { applicantCounts, loadJobApplications } from "@/lib/job-applications-server";
import { blankVacancy, toVacancyRow } from "@/lib/vacancy-admin";
import { careersEmail, loadAdminVacancies, vacancyLocations } from "@/lib/vacancy-admin-server";
import "../../../../vacancies.css";
import { tableKey } from "@/lib/admin";
import { getAdminContent } from "@/lib/content";
import { isStoryTable } from "@/lib/newsroom";
import { toPageRow } from "@/lib/page-admin";
import { resources } from "@/lib/resources";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";
import { featuredSlugs, toTeacherRow } from "@/lib/teacher-admin";
import "../../../../teachers.css";

export default async function EditPage({ params }: { params: Promise<{ table: string; id: string }> }) {
  const { table, id } = await params;
  if (isStoryTable(table)) redirect(`/admin/stories/${table}/${id}`);
  if (table === "alumni_photos") redirect("/admin/content/alumni_photos");
  const resource = resources[table];
  if (!resource || !tableKey[table]) notFound();
  if (!supabaseConfigured()) {
    return (
      <div className="admin-card">
        <h1>Connect Supabase to edit</h1>
        <p>The public site can still read the imported content file. Add your Supabase keys, then return here to create or edit records.</p>
      </div>
    );
  }
  let record: Record<string, unknown> | null = null;
  if (id !== "new") {
    const supabase = await createClient();
    const { data } = await supabase!.from(table).select("*").eq("id", id).maybeSingle();
    if (!data) notFound();
    record = data;
  }
  if (table === "pages") return <PageEditor key={id} record={toPageRow(record ?? { published: false })} />;
  if (table === "campuses") {
    const content = record ? await getAdminContent() : null;
    const campus = content?.campuses.find((item) => String(item.id) === id);
    return <CampusEditor key={id} record={toCampusRow(record ?? { published: false })} insight={content && campus ? campusInsight(campus, content) : null} />;
  }
  if (table === "campus_sections") {
    const content = await getAdminContent();
    return <CampusSectionEditor key={id} record={toSectionRow(record ?? { kind: "facility", sort_order: 0 })} campuses={campusOptions(content.campuses)} />;
  }
  if (table === "alumni_events") return <AlumniEventEditor key={id} record={toAlumniEventRow(record ?? { published: false })} />;
  if (table === "alumni_profiles") return <AlumniProfileEditor key={id} record={toAlumniProfileRow(record ?? { published: false })} />;
  if (table === "vacancies") {
    const [{ mode, rows }, jobs] = await Promise.all([loadAdminVacancies(), loadJobApplications()]);
    return (
      <VacancyEditor
        key={id}
        record={record ? toVacancyRow(record) : blankVacancy()}
        mode={mode}
        today={kampalaClock().today}
        locations={await vacancyLocations(rows)}
        careersEmail={await careersEmail()}
        applicants={jobs.mode === "live" ? applicantCounts(jobs.rows)[id] ?? { total: 0, fresh: 0, active: 0 } : null}
      />
    );
  }
  if (table === "teachers") {
    const teacher = toTeacherRow(record ?? { published: false });
    const everyone = ((await getAdminContent()).teachers as Record<string, unknown>[]).map(toTeacherRow);
    const roles = [...new Set(everyone.map((row) => row.role.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const featuredSpot = teacher.slug ? featuredSlugs(everyone).indexOf(teacher.slug) : -1;
    return <TeacherEditor key={id} record={teacher} roles={roles} featuredSpot={featuredSpot} />;
  }
  return (
    <div>
      <div className="admin-page-title">
        <div>
          <h1>{id === "new" ? "Add" : "Edit"} {resource.label.toLowerCase()}</h1>
          <p>Changes appear on the website as soon as you save.</p>
        </div>
      </div>
      <div className="admin-card">
        <RecordForm table={table} fields={resource.fields} record={record} />
      </div>
    </div>
  );
}
