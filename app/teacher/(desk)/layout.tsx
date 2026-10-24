import { AcademicsGate } from "@/components/academics/ui";
import { requireTeacher } from "@/lib/teacher-access";
import { redirect } from "next/navigation";
import "../../academics_office/(desk)/assessments/assessments.css";
import "../../academics_office/(desk)/attendance/attendance.css";
import "../../academics_office/(desk)/calendar/calendar.css";
import "../../academics_office/(desk)/homework/homework.css";

export default async function TeacherDeskLayout({ children }: { children: React.ReactNode }) {
  const teacher = await requireTeacher();
  if ("error" in teacher) {
    return <AcademicsGate title="Teacher desk" state={{ notice: "auth", message: teacher.error }} />;
  }
  if (teacher.mustResetPassword) redirect("/teacher/profile");
  return children;
}
