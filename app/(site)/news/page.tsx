import { NewsArchive } from "@/components/site/ArchiveViews";
import { getContent } from "@/lib/content";

export const metadata = { title: "News Archive" };

export default async function NewsPage() {
  const content = await getContent();
  return <NewsArchive items={content.news} sidebar={{ news: content.news, events: content.events }} />;
}
