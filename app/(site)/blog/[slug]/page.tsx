import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Banner, Detail } from "@/components/site/Views";
import { findBySlug, getContent } from "@/lib/content";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const item = findBySlug((await getContent()).posts, (await params).slug);
  return { title: item?.title ?? "Blog" };
}

export default async function BlogDetail({ params }: Params) {
  const item = findBySlug((await getContent()).posts, (await params).slug);
  if (!item) notFound();
  return <main><Banner title={item.title} crumbs="Blog" /><Detail item={item} /></main>;
}
