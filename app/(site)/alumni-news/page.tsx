import { AlumniNewsView } from "@/components/site/AlumniViews";
import { alumniNews, alumniProfiles, alumniVoices } from "@/lib/alumni";
import { getContent } from "@/lib/content";

export const metadata = {
  title: "Alumni News",
  description: "News, milestones and reunions from the Kampala Junior Academy alumni network.",
};

export default async function AlumniNewsPage() {
  const content = await getContent();
  return (
    <AlumniNewsView
      news={alumniNews(content.alumni_news)}
      voices={alumniVoices(content.alumni_stories)}
      profiles={alumniProfiles(content.alumni_profiles)}
      email={content.settings.email}
    />
  );
}
