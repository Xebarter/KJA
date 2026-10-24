import {
  assignTeacherPosts,
  deleteStaff,
  issueTeacherLogin,
  releaseTeacherPost,
  resetTeacherLogin,
  revokeTeacherLogin,
  saveStaff,
} from "@/app/academics_office/(desk)/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import { StaffDesk } from "@/components/academics/StaffDesk";
import { AcademicsGate, OfficeOnly } from "@/components/academics/ui";
import { openAcademics } from "@/lib/academics-access";
import { loadStaffDesk } from "@/lib/academics-staff";
import { syncAssignedTeacherDeskLogins } from "@/lib/teacher-desk-sync";

export const metadata = { title: "Staff" };

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ member?: string }> }) {
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Staff" state={opened} />;
  if (!opened.auth.office) return <OfficeOnly title="Staff" />;
  const query = await searchParams;
  let data;
  try {
    data = await loadStaffDesk(opened.auth.supabase, opened.auth.user.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load the staff list.";
    return <AcademicsGate title="Staff" state={{ notice: "schema", message }} />;
  }

  // Assigned teachers without a desk login get Auth + profiles.role=staff so they can open /teacher and appear on /admin/team.
  const repair = await syncAssignedTeacherDeskLogins();
  if (repair.linked) {
    try {
      data = await loadStaffDesk(opened.auth.supabase, opened.auth.user.id);
    } catch {
      // Keep the first load if refresh fails; issued passwords still surface below.
    }
  }

  const requested = query.member || "";
  const initialId = requested === "new" || data.members.some((member) => member.id === requested) ? requested : "";

  const active = data.members.filter((member) => member.active);
  const classTeachers = active.filter((member) => member.classes.length).length;
  const posts = active.reduce((sum, member) => sum + member.subjects.length, 0);
  const nf = (value: number) => value.toLocaleString("en-GB");

  return (
    <div className="app-page ofc-page acd-page stf-page">
      <PageHeader
        kicker="Teaching"
        icon="fa-chalkboard-user"
        title="Staff"
        description={data.term ? <>{data.term.label} · find a teacher, assign classes, or fill open posts.</> : "Add teachers, then set a current term to assign classes and subjects."}
      />
      <section className="stf-strip" aria-label="This term">
        <div>
          <span className="stf-stat-icon" aria-hidden="true"><i className="fa-solid fa-chalkboard-user" /></span>
          <span className="stf-stat-copy"><span>On the roll</span><strong>{nf(active.length)}</strong><small>{data.members.length - active.length ? `${nf(data.members.length - active.length)} hidden` : "None hidden"}</small></span>
        </div>
        <div className={classTeachers ? "is-ok" : ""}>
          <span className="stf-stat-icon" aria-hidden="true"><i className="fa-solid fa-users" /></span>
          <span className="stf-stat-copy"><span>Class teachers</span><strong>{nf(classTeachers)}</strong><small>Leading a class</small></span>
        </div>
        <div>
          <span className="stf-stat-icon" aria-hidden="true"><i className="fa-solid fa-book-open" /></span>
          <span className="stf-stat-copy"><span>Subject posts</span><strong>{nf(posts)}</strong><small>Class and subject pairs</small></span>
        </div>
        <div className={data.gaps.length ? "is-warn" : "is-ok"}>
          <span className="stf-stat-icon" aria-hidden="true"><i className="fa-solid fa-door-open" /></span>
          <span className="stf-stat-copy"><span>Classes open</span><strong>{nf(data.gaps.length)}</strong><small>No class teacher yet</small></span>
        </div>
      </section>
      <StaffDesk
        members={data.members}
        gaps={data.gaps}
        groups={data.groups}
        subjects={data.subjects}
        posts={data.posts}
        leads={data.leads}
        termId={data.term?.id ?? null}
        termLabel={data.term?.label ?? null}
        initialId={initialId}
        initialIssued={repair.issued}
        loginNotes={repair.errors}
        save={saveStaff}
        assign={assignTeacherPosts}
        release={releaseTeacherPost}
        issue={issueTeacherLogin}
        reset={resetTeacherLogin}
        revoke={revokeTeacherLogin}
        remove={deleteStaff}
      />
    </div>
  );
}
