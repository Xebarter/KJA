import { MessagesView } from "@/components/account/MessagesView";
import { getContent } from "@/lib/content";
import { getPortal } from "@/lib/portal";

export default async function MessagesPage() {
  const [{ messages }, { settings }] = await Promise.all([getPortal(), getContent()]);
  return <MessagesView messages={messages} phone={settings.phone} email={settings.email} />;
}
