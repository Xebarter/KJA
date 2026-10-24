import type { Metadata } from "next";
import { AcademicsGate } from "@/components/academics/ui";
import { TeacherShell } from "@/components/teacher/Shell";
import { requireTeacher } from "@/lib/teacher-access";
import "../admin/admin.css";
import "../admin/(panel)/applications/applications.css";
import "../admissions_office/office.css";
import "../academics_office/academics.css";
import "../academics_office/(desk)/overview.css";
import "./teacher.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Teacher desk", template: "%s | KJA Teacher" },
  robots: { index: false, follow: false },
};

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const teacher = await requireTeacher();
  // Do not redirect to /admin/login here — middleware already sends unsigned users there,
  // and bouncing signed-in staff back creates ERR_TOO_MANY_REDIRECTS with the login gate.
  if ("error" in teacher) {
    return (
      <div className="kja-admin kja-office acd-page">
        <AcademicsGate title="Teacher desk" state={{ notice: "auth", message: teacher.error }} />
      </div>
    );
  }
  const name = teacher.profile.full_name || teacher.profile.email || "Teacher";
  return (
    <div className="kja-admin kja-office acd-page">
      <TeacherShell name={name} email={teacher.profile.email || teacher.user.email || ""} classTeacher={teacher.classes.length > 0} locked={teacher.mustResetPassword}>
        {children}
      </TeacherShell>
    </div>
  );
}
