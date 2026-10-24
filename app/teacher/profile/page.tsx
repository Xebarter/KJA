import { changeTeacherPassword, clearTeacherPhoto, setTeacherPhoto } from "@/app/teacher/actions";
import { AcademicsGate } from "@/components/academics/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { ProfileDesk } from "@/components/teacher/ProfileDesk";
import { requireTeacher } from "@/lib/teacher-access";
import "./profile.css";

export const metadata = { title: "Profile" };

export default async function TeacherProfilePage() {
  const teacher = await requireTeacher();
  if ("error" in teacher) return <AcademicsGate title="Profile" state={{ notice: "auth", message: teacher.error }} />;

  const name = teacher.profile.full_name || "Teacher";
  const email = teacher.profile.email || teacher.user.email || "";

  const { data: staff, error: staffError } = await teacher.supabase
    .from("teaching_staff")
    .select("full_name, title, campus, initials, photo_path, email")
    .eq("id", teacher.staffId)
    .maybeSingle();

  const photoMissing = Boolean(staffError && /photo_path|schema cache|does not exist/i.test(staffError.message));
  const record = photoMissing
    ? await teacher.supabase
        .from("teaching_staff")
        .select("full_name, title, campus, initials, email")
        .eq("id", teacher.staffId)
        .maybeSingle()
        .then((result) => result.data)
    : staff;

  const displayName = record?.full_name || name;
  const classes = teacher.classes.map((row) => row.label);
  const subjects = [...new Set(teacher.subjects.map((row) => `${row.subjectName} · ${row.label}`))];

  return (
    <div className="app-page ofc-page tch-page tch-prf-page">
      <PageHeader
        kicker="Account"
        icon="fa-user"
        title="Profile"
        description={
          teacher.mustResetPassword ? (
            <>Set your password, then add a photo if you like. Pupils see your photo on <strong>My Class</strong>.</>
          ) : (
            <>
              Your photo appears on the Pupils App <strong>My Class</strong> page and on the academics office <strong>Staff</strong> list.
            </>
          )
        }
      />
      {staffError && !photoMissing ? <p className="admin-empty">{staffError.message}</p> : null}
      <ProfileDesk
        name={displayName}
        email={(record?.email as string | null) || email}
        title={(record?.title as string | null) || null}
        campus={(record?.campus as string | null) || null}
        initialsMark={(record?.initials as string | null) || null}
        photoPath={photoMissing ? null : ((staff?.photo_path as string | null) || null)}
        staffId={teacher.staffId}
        mustResetPassword={teacher.mustResetPassword}
        classes={classes}
        subjects={subjects}
        termLabel={teacher.term?.label || null}
        changePassword={changeTeacherPassword}
        setPhoto={setTeacherPhoto}
        clearPhoto={clearTeacherPhoto}
      />
      {photoMissing ? (
        <p className="admin-empty">Run supabase/0046_teacher_photos.sql to enable profile photos.</p>
      ) : null}
    </div>
  );
}
