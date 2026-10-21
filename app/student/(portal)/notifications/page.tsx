import { StudentNotificationsView } from "@/components/student/NotificationsView";
import { getStudentPortal } from "@/lib/student-portal";

export const metadata = { title: "Notifications" };

export default async function StudentNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const noticeId = String(Array.isArray(query.n) ? query.n[0] : query.n || "");
  const portal = await getStudentPortal();
  return (
    <StudentNotificationsView
      notifications={portal.notifications}
      initialNoticeId={noticeId || undefined}
    />
  );
}
