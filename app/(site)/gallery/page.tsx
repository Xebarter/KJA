import { GalleryArchive } from "@/components/site/ArchiveViews";
import { getContent } from "@/lib/content";

export const metadata = { title: "Gallery Items Archive" };

export default async function GalleryPage() {
  const content = await getContent();
  return <GalleryArchive items={content.gallery} sidebar={{ news: content.news, events: content.events }} />;
}
