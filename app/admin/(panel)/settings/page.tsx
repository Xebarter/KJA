import { SettingsForm } from "@/components/admin/SettingsForm";
import { getContent } from "@/lib/content";

export default async function SettingsPage() {
  const content = await getContent();
  return (
    <div className="admin-card">
      <h1>Site settings</h1>
      <SettingsForm settings={content.settings} />
    </div>
  );
}
