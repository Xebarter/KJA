import { notFound } from "next/navigation";
import { Banner, Detail } from "@/components/site/Views";
import { findBySlug, getContent } from "@/lib/content";

export default async function AlumniStoryDetail({ params }: { params: Promise<{ slug: string }> }) {
  const item = findBySlug((await getContent()).alumni_stories, (await params).slug);
  if (!item) notFound();
  return <main><Banner title={item.title} crumbs="Alumni Stories" /><Detail item={item} /></main>;
}
