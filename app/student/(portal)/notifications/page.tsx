import { StudentNotificationsView } from "@/components/student/NotificationsView";
import { getStudentPortal } from "@/lib/student-portal";

export const metadata = { title: "Notifications" };

export default async function StudentNotificationsPage() {
  const portal = await getStudentPortal();
  return <StudentNotificationsView notifications={portal.notifications} />;
}
