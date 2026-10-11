import { Banner, ArticleGrid } from "@/components/site/Views";
import { getContent } from "@/lib/content";

export const metadata = { title: "Blog" };

export default async function BlogPage() {
  const content = await getContent();
  return (
    <main>
      <Banner title="Blog" />
      <div className="container py-5"><ArticleGrid items={content.posts} hrefBase="/blog" empty="No blog posts yet." /></div>
    </main>
  );
}
