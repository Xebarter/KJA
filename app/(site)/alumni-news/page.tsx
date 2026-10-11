import { Banner, ArticleGrid } from "@/components/site/Views";
import { getContent } from "@/lib/content";

export const metadata = { title: "Alumni News" };

export default async function AlumniNewsPage() {
  const content = await getContent();
  return <main><Banner title="Alumni News" crumbs="Alumni" /><div className="container py-5"><ArticleGrid items={content.alumni_news} hrefBase="/alumni-news" empty="No alumni news yet." /></div></main>;
}
