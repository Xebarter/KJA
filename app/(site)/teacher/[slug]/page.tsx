import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostSingle } from "@/components/site/PostSingle";
import { findBySlug, getContent } from "@/lib/content";
import { renderOnFirstVisit } from "@/lib/site-cache";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const item = findBySlug((await getContent()).teachers, (await params).slug);
  return { title: item?.title ?? "Teacher" };
}

export default async function TeacherPage({ params }: Params) {
  const [{ slug }, content] = await Promise.all([params, getContent()]);
  const item = findBySlug(content.teachers, slug);
  if (!item) notFound();
  return <PostSingle item={item} hrefBase="/teacher" siblings={content.teachers} sidebar={{ news: content.news, events: content.events }} />;
}

export const generateStaticParams = renderOnFirstVisit;
