import { notFound } from "next/navigation";
import { Banner, Detail } from "@/components/site/Views";
import { findBySlug, getContent } from "@/lib/content";

export default async function AlumniProfileDetail({ params }: { params: Promise<{ slug: string }> }) {
  const item = findBySlug((await getContent()).alumni_profiles, (await params).slug);
  if (!item) notFound();
  return <main><Banner title={item.title} crumbs="Alumni Profiles" /><Detail item={item} /></main>;
}
