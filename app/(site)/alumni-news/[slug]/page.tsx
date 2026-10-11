import { notFound } from "next/navigation";
import { Banner, Detail } from "@/components/site/Views";
import { findBySlug, getContent } from "@/lib/content";

export default async function AlumniNewsDetail({ params }: { params: Promise<{ slug: string }> }) {
  const item = findBySlug((await getContent()).alumni_news, (await params).slug);
  if (!item) notFound();
  return <main><Banner title={item.title} crumbs="Alumni News" /><Detail item={item} /></main>;
}
