import { AlumniProfilesView } from "@/components/site/AlumniViews";
import { alumniProfiles } from "@/lib/alumni";
import { getContent } from "@/lib/content";

export const metadata = {
  title: "Alumni Profiles",
  description: "Meet Kampala Junior Academy graduates and find out where they are now.",
};

export default async function AlumniProfilesPage() {
  const content = await getContent();
  return <AlumniProfilesView profiles={alumniProfiles(content.alumni_profiles)} email={content.settings.email} />;
}
