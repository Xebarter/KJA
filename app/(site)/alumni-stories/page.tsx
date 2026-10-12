import { AlumniArchive } from "@/components/site/AlumniViews";
import { getContent } from "@/lib/content";

export const metadata = { title: "Alumni Stories Archive" };

export default async function AlumniStoriesPage() {
  const content = await getContent();
  return (
    <AlumniArchive
      title="Alumni Testimonials"
      items={content.alumni_stories}
      hrefBase="/alumni-story"
      sidebar={{ news: content.news, events: content.events }}
      featured
      repeatFeatured
    />
  );
}
