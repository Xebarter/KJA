import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostSingle } from "@/components/site/PostSingle";
import { findBySlug, getContent } from "@/lib/content";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const item = findBySlug((await getContent()).alumni_events, (await params).slug);
  return { title: item?.title ?? "Alumni Event", description: item?.seo_description || item?.excerpt || undefined };
}

export default async function AlumniEventDetail({ params }: Params) {
  const content = await getContent();
  const item = findBySlug(content.alumni_events, (await params).slug);
  if (!item) notFound();
  return <PostSingle item={item} hrefBase="/alumni-events" siblings={content.alumni_events} sidebar={{ news: content.news, events: content.events }} />;
}
