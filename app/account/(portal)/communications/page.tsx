import { CommunicationsView } from "@/components/account/CommunicationsView";
import { getContent } from "@/lib/content";
import { getPortal } from "@/lib/portal";

export const metadata = { title: "Communications" };

export default async function CommunicationsPage() {
  const [{ messages }, { settings }] = await Promise.all([getPortal(), getContent()]);
  return <CommunicationsView messages={messages} phone={settings.phone} email={settings.email} />;
}
