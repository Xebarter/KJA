import { Banner, EventGrid } from "@/components/site/Views";
import { getContent } from "@/lib/content";

export const metadata = { title: "Events" };

export default async function EventsPage() {
  const content = await getContent();
  return <main><Banner title="Events" /><div className="container py-5"><EventGrid items={content.events} /></div></main>;
}
