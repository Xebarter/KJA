import { redirect } from "next/navigation";
import { StudentShell } from "@/components/student/Shell";
import { getStudentPortal } from "@/lib/student-portal";

export const dynamic = "force-dynamic";

export default async function StudentPortalLayout({ children }: { children: React.ReactNode }) {
  const portal = await getStudentPortal();
  if (!portal.user) redirect("/?login=1&next=/student");
  if (portal.profile?.role && portal.profile.role !== "student") redirect("/account");

  const name = portal.displayName || portal.profile?.full_name || portal.profile?.email || "Student";

  return (
    <StudentShell
      name={name}
      classLabel={portal.classLabel}
      unread={portal.unread}
      unreadMessages={portal.unreadMessages}
    >
      {portal.mustResetPassword ? (
        <div className="st-banner">
          <i className="fa-solid fa-key" aria-hidden="true" />
          <p>
            Please <a href="/student/profile">set a new password</a> before you continue.
          </p>
        </div>
      ) : null}
      {children}
    </StudentShell>
  );
}
