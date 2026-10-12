import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TecStyles } from "@/components/site/tec/TecStyles";
import { TecSingleEvent } from "@/components/site/tec/TecViews";
import { findBySlug, getContent } from "@/lib/content";
import { kampalaClock, toCalEvents } from "@/lib/events-calendar";
import { buildEventSingle } from "@/lib/events-single";

type Params = { params: Promise<{ slug: string }> };

const SITE_NAME = "Kampala Junior Academy";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const item = findBySlug((await getContent()).events, (await params).slug);
  return { title: item?.title ?? "Event", description: item?.seo_description || item?.excerpt || undefined };
}

export default async function EventDetail({ params }: Params) {
  const [{ slug }, content] = await Promise.all([params, getContent()]);
  const item = findBySlug(content.events, slug);
  if (!item) notFound();
  const clock = kampalaClock();
  const single = buildEventSingle(toCalEvents(content.events), item.slug, item.body || "", clock);
  if (!single) notFound();
  return (
    // Stands in for WordPress's single-tribe_events body class, which part of TEC's single-event CSS is scoped to.
    <div className="single-tribe_events">
      <TecStyles extra={["single-skeleton", "single-full"]} />
      <TecSingleEvent single={single} body={item.body || ""} documentTitle={`${single.event.plainTitle} | ${SITE_NAME}`} today={clock.today} />
    </div>
  );
}
