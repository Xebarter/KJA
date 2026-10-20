import { HomeworkList } from "@/components/student/HomeworkList";
import { getStudentPortal } from "@/lib/student-portal";

export const metadata = { title: "Homework" };

export default async function StudentHomeworkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const portal = await getStudentPortal();
  const query = await searchParams;
  const view = String(Array.isArray(query.view) ? query.view[0] : query.view || "open");
  const filter = view === "done" || view === "all" ? view : "open";

  return <HomeworkList items={portal.homework} filter={filter} />;
}
