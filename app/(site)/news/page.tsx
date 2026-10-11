import { Banner, ArticleGrid } from "@/components/site/Views";
import { getContent } from "@/lib/content";

export const metadata = { title: "News" };

export default async function NewsPage() {
  const content = await getContent();
  return (
    <main>
      <Banner title="News" />
      <div className="container py-5"><ArticleGrid items={content.news} hrefBase="/news" empty="No news yet." /></div>
    </main>
  );
}
