import { Banner, ArticleGrid } from "@/components/site/Views";
import { getContent } from "@/lib/content";

export const metadata = { title: "Alumni Stories" };

export default async function AlumniStoriesPage() {
  const content = await getContent();
  return <main><Banner title="Our Stories" crumbs="Alumni" /><div className="container py-5"><ArticleGrid items={content.alumni_stories} hrefBase="/alumni-stories" empty="No stories yet." /></div></main>;
}
