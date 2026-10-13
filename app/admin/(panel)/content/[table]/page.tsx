import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlumniEventsManager } from "@/components/admin/AlumniEventsManager";
import { AlumniPhotosManager } from "@/components/admin/AlumniPhotosManager";
import { AlumniProfilesManager } from "@/components/admin/AlumniProfilesManager";
import { CampusesManager } from "@/components/admin/CampusesManager";
import { CampusSectionsManager } from "@/components/admin/CampusSectionsManager";
import { CollectionTable } from "@/components/admin/CollectionTable";
import { EventsManager } from "@/components/admin/EventsManager";
import { GalleryManager } from "@/components/admin/GalleryManager";
import type { Article, GalleryItem } from "@/lib/types";
import { campusOptions, toCampusRow, toSectionRow } from "@/lib/campus-admin";
import { campusInsight } from "@/lib/campus-profile";
import { toAlumniEventRow, toAlumniPhotoRow, toAlumniProfileRow } from "@/lib/alumni-admin";
import "../../../alumni.css";
import { PagesManager } from "@/components/admin/PagesManager";
import { TeachersManager } from "@/components/admin/TeachersManager";
import { JobApplicationsBoard } from "@/components/admin/JobApplicationsBoard";
import { VacanciesManager } from "@/components/admin/VacanciesManager";
import { loadPeople, loadTeam, requireAdmin } from "@/lib/admin-applications";
import { kampalaClock } from "@/lib/events-calendar";
import { applicantCounts, loadJobApplications, toBoardApplicants } from "@/lib/job-applications-server";
import { vacancyStatus } from "@/lib/vacancy-admin";
import { careersEmail, loadAdminVacancies } from "@/lib/vacancy-admin-server";
import "../../../vacancies.css";
import { tableKey } from "@/lib/admin";
import { getAdminContent } from "@/lib/content";
import { sourceForTable } from "@/lib/newsroom";
import { toPageRow } from "@/lib/page-admin";
import { resources } from "@/lib/resources";
import { supabaseConfigured } from "@/lib/supabase/server";
import { toTeacherRow } from "@/lib/teacher-admin";
import "../../../teachers.css";

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ table: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { table } = await params;
  const story = sourceForTable(table);
  if (story) redirect(`/admin/stories?type=${story}`);
  const resource = resources[table];
  const key = tableKey[table];
  if (!resource || !key) notFound();
  const content = await getAdminContent();
  const rows = content[key] as Record<string, unknown>[];
  if (table === "pages") return <PagesManager pages={rows.map(toPageRow)} editable={supabaseConfigured()} />;
  if (table === "events") return <EventsManager events={rows as Article[]} editable={supabaseConfigured()} today={kampalaClock().today} />;
  if (table === "gallery_items") return <GalleryManager items={rows as GalleryItem[]} editable={supabaseConfigured()} />;
  if (table === "campuses") {
    const campuses = content.campuses.map((campus) => ({ ...toCampusRow(campus as unknown as Record<string, unknown>), insight: campusInsight(campus, content) }));
    return <CampusesManager campuses={campuses} sectionCount={content.campus_sections.length} editable={supabaseConfigured()} />;
  }
  if (table === "campus_sections") {
    return <CampusSectionsManager sections={rows.map(toSectionRow)} campuses={campusOptions(content.campuses)} editable={supabaseConfigured()} />;
  }
  if (table === "teachers") return <TeachersManager teachers={rows.map(toTeacherRow)} editable={supabaseConfigured()} />;
  if (table === "vacancies") {
    const today = kampalaClock().today;
    const [{ mode, rows: vacancies }, jobs, auth] = await Promise.all([loadAdminVacancies(), loadJobApplications(), requireAdmin()]);
    const openRoles = vacancies.filter((row) => ["open", "closing"].includes(vacancyStatus(row, today))).length;
    const fresh = jobs.rows.filter((row) => row.status === "new").length;
    const query = await searchParams;
    const pick = (key: string) => String((Array.isArray(query[key]) ? query[key]?.[0] : query[key]) ?? "");

    if (pick("view") === "applications") {
      const now = Date.now();
      const supabase = "error" in auth ? null : auth.supabase;
      const [team, people] = supabase
        ? await Promise.all([loadTeam(supabase), loadPeople(supabase, jobs.rows.map((row) => row.assigned_to))])
        : [[], new Map<string, string>()];
      const roles = vacancies
        .filter((row) => row.id)
        .map((row) => ({ id: row.id!, title: row.title || "Untitled vacancy", live: ["open", "closing"].includes(vacancyStatus(row, today)) }))
        .sort((a, b) => Number(b.live) - Number(a.live) || a.title.localeCompare(b.title));
      return (
        <JobApplicationsBoard
          applicants={toBoardApplicants(jobs.rows, people, now)}
          mode={jobs.mode}
          roles={roles}
          team={team}
          currentUserId={"error" in auth ? "" : auth.user.id}
          initialRole={pick("role")}
          initialStage={pick("stage")}
          initialLayout={pick("layout")}
          openRoles={openRoles}
          now={now}
          error={jobs.error}
        />
      );
    }
    return (
      <VacanciesManager
        vacancies={vacancies}
        mode={mode}
        today={today}
        careersEmail={await careersEmail()}
        applicants={applicantCounts(jobs.rows)}
        jobsMode={jobs.mode}
        totalApplicants={jobs.rows.length}
        freshApplicants={fresh}
      />
    );
  }
  if (table === "alumni_events") return <AlumniEventsManager events={rows.map(toAlumniEventRow)} editable={supabaseConfigured()} />;
  if (table === "alumni_profiles") return <AlumniProfilesManager profiles={rows.map(toAlumniProfileRow)} editable={supabaseConfigured()} />;
  if (table === "alumni_photos") return <AlumniPhotosManager photos={rows.map(toAlumniPhotoRow)} editable={supabaseConfigured()} />;
  return (
    <div>
      <div className="admin-page-title">
        <div>
          <h1>{resource.label}</h1>
          <p>Add, edit, or hide items that appear on the public website.</p>
        </div>
        <Link className="admin-btn" href={`/admin/content/${table}/new`}>Add {resource.label.toLowerCase()}</Link>
      </div>
      <div className="admin-card">
        <CollectionTable table={table} rows={rows} />
      </div>
    </div>
  );
}
