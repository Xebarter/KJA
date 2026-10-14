import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventView, type EventCampus } from "@/components/site/EventView";
import { findBySlug, getContent } from "@/lib/content";
import { formatHm, kampalaClock, toCalEvents, type CalEvent } from "@/lib/events-calendar";
import { buildEventSingle } from "@/lib/events-single";
import type { Article } from "@/lib/types";
import { renderOnFirstVisit } from "@/lib/site-cache";

type Params = { params: Promise<{ slug: string }> };

const SITE_NAME = "Kampala Junior Academy";
const SITE_URL = "https://kja.ug";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const item = findBySlug((await getContent()).events, (await params).slug);
  const image = item?.image_url || item?.thumbnail_url;
  return {
    title: item?.title ?? "Event",
    description: item?.seo_description || item?.excerpt || undefined,
    openGraph: item ? { title: item.title, type: "website", images: image ? [image] : undefined } : undefined,
  };
}

function campusMap(events: Article[], campuses: Article[]) {
  const byName = new Map(campuses.map((campus) => [campus.title.trim().toLowerCase(), campus]));
  const map: Record<string, EventCampus | undefined> = {};
  for (const event of events) {
    const campus = byName.get((event.location || "").trim().toLowerCase());
    if (campus) map[event.slug] = { slug: campus.slug, title: campus.title, image: campus.image_url || null };
  }
  return map;
}

function isoOf(ymd: string, minutes: number, allDay: boolean) {
  return allDay ? ymd : `${ymd}T${formatHm(minutes)}:00+03:00`;
}

function eventJsonLd(event: CalEvent, item: Article, campus: EventCampus | undefined) {
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.plainTitle,
    description: event.description || undefined,
    image: item.image_url || undefined,
    startDate: isoOf(event.startDate, event.startMinutes, event.allDay),
    endDate: isoOf(event.endDate, event.endMinutes, event.allDay),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url: `${SITE_URL}${event.href}/`,
    location: {
      "@type": "Place",
      name: campus ? `${SITE_NAME} – ${campus.title} Campus` : SITE_NAME,
      address: { "@type": "PostalAddress", addressLocality: campus?.title || "Kampala", addressCountry: "UG" },
    },
    organizer: { "@type": "EducationalOrganization", name: SITE_NAME, url: SITE_URL },
  };
}

export default async function EventDetail({ params }: Params) {
  const [{ slug }, content] = await Promise.all([params, getContent()]);
  const item = findBySlug(content.events, slug);
  if (!item) notFound();
  const single = buildEventSingle(toCalEvents(content.events), item.slug, item.body || "", kampalaClock());
  if (!single) notFound();
  const campuses = campusMap(content.events, content.campuses);
  const jsonLd = JSON.stringify(eventJsonLd(single.event, item, campuses[item.slug])).replace(/</g, "\\u003c");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <EventView single={single} campuses={campuses} phone={content.settings.phone} email={content.settings.email} />
    </>
  );
}

export const generateStaticParams = renderOnFirstVisit;
