import { NotificationsView } from "@/components/account/NotificationsView";
import { getPortal } from "@/lib/portal";

export default async function NotificationsPage() {
  const { notifications } = await getPortal();
  return <NotificationsView notifications={notifications} />;
}
