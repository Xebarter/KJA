import { AlumniGalleryArchive } from "@/components/site/AlumniViews";
import { getContent } from "@/lib/content";

export const metadata = { title: "Alumni Photo Gallery Items Archive" };

export default async function AlumniGalleryPage() {
  const content = await getContent();
  return <AlumniGalleryArchive items={content.alumni_photos} sidebar={{ news: content.news, events: content.events }} />;
}
