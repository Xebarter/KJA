import { PageHeader } from "@/components/admin/PageHeader";
import { StudentsPortalDesk, type PortalStudentRow } from "@/components/admin/StudentsPortalDesk";
import { requireAdmin } from "@/lib/admin-applications";
import "./students.css";

export const metadata = { title: "Students" };

type StudentRow = {
  id: string;
  full_name: string | null;
  student_number: string | null;
  class_code: string | null;
  stream: string | null;
  status: string | null;
  profile_id: string | null;
  photo_path?: string | null;
};

export default async function AdminStudentsPage() {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return (
      <div className="asp-page">
        <PageHeader
          kicker="Administration"
          icon="fa-user-graduate"
          title="Students"
          description="Issue student portal access for pupils on the register."
        />
        <div className="admin-card app-notice apl-notice">
          <i className="fa-solid fa-lock" aria-hidden="true" />
          <div>
            <h2>Not available</h2>
            <p>{auth.error}</p>
          </div>
        </div>
      </div>
    );
  }

  // photo_path is only a string path — images load lazily in the browser via StudentFace.
  let rows: StudentRow[] = [];
  let loadError: string | null = null;
  {
    const withPhotos = await auth.supabase
      .from("students")
      .select("id, full_name, student_number, class_code, stream, status, profile_id, photo_path")
      .order("full_name", { ascending: true })
      .limit(800);
    if (withPhotos.error && /photo_path/i.test(withPhotos.error.message)) {
      const fallback = await auth.supabase
        .from("students")
        .select("id, full_name, student_number, class_code, stream, status, profile_id")
        .order("full_name", { ascending: true })
        .limit(800);
      if (fallback.error) loadError = fallback.error.message;
      else rows = (fallback.data || []) as StudentRow[];
    } else if (withPhotos.error) {
      loadError = withPhotos.error.message;
    } else {
      rows = (withPhotos.data || []) as StudentRow[];
    }
  }

  if (loadError) {
    return (
      <div className="asp-page">
        <PageHeader
          kicker="Administration"
          icon="fa-user-graduate"
          title="Students"
          description="Issue student portal access for pupils on the register."
        />
        <div className="admin-card app-notice apl-notice">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
          <div>
            <h2>Could not load students</h2>
            <p>{loadError}</p>
          </div>
        </div>
      </div>
    );
  }

  const profileIds = rows.map((row) => row.profile_id).filter(Boolean) as string[];
  const emailByProfile = new Map<string, string>();
  if (profileIds.length) {
    const { data: profiles } = await auth.supabase.from("profiles").select("id, email").in("id", profileIds);
    for (const profile of profiles || []) {
      if (profile.email) emailByProfile.set(profile.id as string, profile.email as string);
    }
  }

  const students: PortalStudentRow[] = rows.map((row) => {
    const profileId = row.profile_id;
    return {
      id: row.id,
      full_name: row.full_name || "Student",
      student_number: row.student_number,
      class_code: row.class_code,
      stream: row.stream,
      status: row.status || "active",
      hasLogin: Boolean(profileId),
      loginEmail: profileId ? emailByProfile.get(profileId) || null : null,
      // null = known no photo (skip request); undefined omitted means try by id — we pass null/path only
      photo_path: row.photo_path === undefined ? undefined : row.photo_path || null,
    };
  });

  return (
    <div className="asp-page">
      <PageHeader
        kicker="Administration"
        icon="fa-user-graduate"
        title="Students"
        description={
          <>
            Give pupils access to the <strong>student portal</strong>. Find someone on the register, or create a new pupil and share a temporary password.
          </>
        }
      />
      <StudentsPortalDesk students={students} />
    </div>
  );
}
