import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Banner, Detail } from "@/components/site/Views";
import { findBySlug, getContent } from "@/lib/content";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const item = findBySlug((await getContent()).news, (await params).slug);
  return { title: item?.title ?? "News", description: item?.seo_description || item?.excerpt || undefined };
}

export default async function NewsDetail({ params }: Params) {
  const item = findBySlug((await getContent()).news, (await params).slug);
  if (!item) notFound();
  return <main><Banner title={item.title} crumbs="News" /><Detail item={item} /></main>;
}
