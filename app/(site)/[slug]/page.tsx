import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Banner, Prose } from "@/components/site/Views";
import { WpPageView } from "@/components/site/WpPageView";
import { findBySlug, getContent } from "@/lib/content";
import { renderOnFirstVisit } from "@/lib/site-cache";

type Params = { params: Promise<{ slug: string }> };

const SIDEBAR_PAGES = new Set([
  "from-the-director", "admissions", "fees",
  "academics", "arts", "sport", "leadership",
  "sports", "music", "language", "adventure", "religion", "talent",
]);

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const page = findBySlug((await getContent()).pages, slug);
  return { title: page?.title ?? "Page", description: page?.seo_description || page?.excerpt || undefined };
}

export default async function CmsPage({ params }: Params) {
  const { slug } = await params;
  const content = await getContent();
  const page = findBySlug(content.pages, slug);
  if (!page) notFound();
  if (SIDEBAR_PAGES.has(slug)) return <WpPageView page={page} news={content.news} events={content.events} />;
  return (
    <main>
      <Banner title={page.title} />
      <div className="container py-5">
        <Prose html={page.body} />
      </div>
    </main>
  );
}

export const generateStaticParams = renderOnFirstVisit;
