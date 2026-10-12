import { BlogIndex } from "@/components/site/ArchiveViews";
import { getContent } from "@/lib/content";

export const metadata = { title: "Blog" };

export default async function BlogPage() {
  const content = await getContent();
  return <BlogIndex posts={content.posts} sidebar={{ news: content.news, events: content.events }} />;
}
