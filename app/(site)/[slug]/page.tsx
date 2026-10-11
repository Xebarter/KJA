import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Banner, Prose } from "@/components/site/Views";
import { findBySlug, getContent } from "@/lib/content";

type Params = { params: Promise<{ slug: string }> };

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
  return (
    <main>
      <Banner title={page.title} />
      <div className="container py-5">
        {slug === "visit-us" ? (
          <p className="mb-4">
            <a href={content.settings.map_url} target="_blank" rel="noreferrer">{content.settings.address}</a>
            {" · "}{content.settings.phone}
          </p>
        ) : null}
        <Prose html={page.body} />
      </div>
    </main>
  );
}
