import { AlumniStoriesView } from "@/components/site/AlumniViews";
import { alumniVoices } from "@/lib/alumni";
import { getContent } from "@/lib/content";

export const metadata = {
  title: "Alumni Stories",
  description: "Former Kampala Junior Academy pupils share their memories of school and where life has taken them since.",
};

export default async function AlumniStoriesPage() {
  const content = await getContent();
  return <AlumniStoriesView voices={alumniVoices(content.alumni_stories)} email={content.settings.email} />;
}
