import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlumniEventView } from "@/components/site/AlumniViews";
import { splitAlumniEvents } from "@/lib/alumni";
import { findBySlug, getContent } from "@/lib/content";
import { renderOnFirstVisit } from "@/lib/site-cache";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const item = findBySlug((await getContent()).alumni_events, (await params).slug);
  return { title: item?.title ?? "Alumni Event", description: item?.seo_description || item?.excerpt || undefined };
}

export default async function AlumniEventDetail({ params }: Params) {
  const content = await getContent();
  const item = findBySlug(content.alumni_events, (await params).slug);
  if (!item) notFound();
  const { upcoming, past } = splitAlumniEvents(content.alumni_events);
  const others = [...upcoming, ...past].filter((event) => event.slug !== item.slug);
  return <AlumniEventView item={item} others={others} email={content.settings.email} />;
}

export const generateStaticParams = renderOnFirstVisit;
