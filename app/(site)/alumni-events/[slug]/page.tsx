import { notFound } from "next/navigation";
import { Banner, Detail } from "@/components/site/Views";
import { findBySlug, getContent } from "@/lib/content";

export default async function AlumniEventDetail({ params }: { params: Promise<{ slug: string }> }) {
  const item = findBySlug((await getContent()).alumni_events, (await params).slug);
  if (!item) notFound();
  return <main><Banner title={item.title} crumbs="Alumni Events" /><Detail item={item} /></main>;
}
