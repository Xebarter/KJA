import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostSingle } from "@/components/site/PostSingle";
import { findBySlug, getContent } from "@/lib/content";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const item = findBySlug((await getContent()).posts, (await params).slug);
  return { title: item?.seo_title ? { absolute: item.seo_title } : item?.title ?? "Blog", description: item?.seo_description || item?.excerpt || undefined };
}

export default async function BlogDetail({ params }: Params) {
  const content = await getContent();
  const item = findBySlug(content.posts, (await params).slug);
  if (!item) notFound();
  return (
    <PostSingle
      item={item}
      hrefBase="/blog"
      siblings={content.posts}
      sidebar={{ news: content.news, events: content.events }}
      category={item.category ? { href: "/blog", label: item.category } : undefined}
    />
  );
}
