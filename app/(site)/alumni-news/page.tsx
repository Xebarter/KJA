import { AlumniArchive } from "@/components/site/AlumniViews";
import { getContent } from "@/lib/content";

export const metadata = { title: "Alumni news Archive" };

export default async function AlumniNewsPage() {
  const content = await getContent();
  return (
    <AlumniArchive
      title="Alumni News"
      items={content.alumni_news}
      hrefBase="/alumni-news"
      sidebar={{ news: content.news, events: content.events }}
      showDate
      featured
    />
  );
}
