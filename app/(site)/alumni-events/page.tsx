import { Banner, EventGrid } from "@/components/site/Views";
import { getContent } from "@/lib/content";

export const metadata = { title: "Alumni Events" };

export default async function AlumniEventsPage() {
  const content = await getContent();
  const items = content.alumni_events.map((item) => ({ ...item }));
  return <main><Banner title="Alumni Events" crumbs="Alumni" /><div className="container py-5">{items.length ? <EventGrid items={items} hrefBase="/alumni-events" /> : <p>No alumni events yet.</p>}</div></main>;
}
