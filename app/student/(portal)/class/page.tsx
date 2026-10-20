import { ClassDirectory } from "@/components/student/ClassDirectory";
import { getStudentPortal } from "@/lib/student-portal";

export const metadata = { title: "My class" };

export default async function StudentClassPage() {
  const portal = await getStudentPortal();
  return (
    <ClassDirectory
      classmates={portal.classmates}
      classTeacher={portal.classTeacher}
      teachers={portal.teachers}
      classLabel={portal.classLabel}
    />
  );
}
