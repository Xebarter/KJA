import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostSingle } from "@/components/site/PostSingle";
import { findBySlug, getContent } from "@/lib/content";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const item = findBySlug((await getContent()).news, (await params).slug);
  return { title: item?.seo_title ? { absolute: item.seo_title } : item?.title ?? "News", description: item?.seo_description || item?.excerpt || undefined };
}

export default async function NewsDetail({ params }: Params) {
  const content = await getContent();
  const item = findBySlug(content.news, (await params).slug);
  if (!item) notFound();
  return <PostSingle item={item} hrefBase="/news" siblings={content.news} sidebar={{ news: content.news, events: content.events }} />;
}
