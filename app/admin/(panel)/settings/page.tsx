import { SettingsForm } from "@/components/admin/SettingsForm";
import { getAdminContent } from "@/lib/content";

export default async function SettingsPage() {
  const content = await getAdminContent();
  return (
    <div>
      <div className="admin-page-title">
        <div>
          <h1>Site settings</h1>
          <p>Contact details, about copy, and the admissions popup. Hero photos are on the Images page.</p>
        </div>
      </div>
      <div className="admin-card">
        <SettingsForm settings={content.settings} />
      </div>
    </div>
  );
}
