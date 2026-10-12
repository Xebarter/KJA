import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostSingle } from "@/components/site/PostSingle";
import { findBySlug, getContent } from "@/lib/content";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const item = findBySlug((await getContent()).alumni_profiles, (await params).slug);
  return { title: item?.title ?? "Alumni Profile", description: item?.seo_description || item?.excerpt || undefined };
}

export default async function AlumniProfileDetail({ params }: Params) {
  const content = await getContent();
  const item = findBySlug(content.alumni_profiles, (await params).slug);
  if (!item) notFound();
  return <PostSingle item={item} hrefBase="/alumni-profile" siblings={content.alumni_profiles} sidebar={{ news: content.news, events: content.events }} />;
}
