import { AlumniArchive } from "@/components/site/AlumniViews";
import { getContent } from "@/lib/content";

export const metadata = { title: "Alumni Profiles Archive" };

export default async function AlumniProfilesPage() {
  const content = await getContent();
  return (
    <AlumniArchive
      title="Alumni Profiles"
      items={content.alumni_profiles}
      hrefBase="/alumni-profile"
      sidebar={{ news: content.news, events: content.events }}
    />
  );
}
