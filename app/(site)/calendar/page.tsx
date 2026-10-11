import { Banner, EventGrid, Prose } from "@/components/site/Views";
import { findBySlug, getContent } from "@/lib/content";

export const metadata = { title: "Calendar" };

export default async function CalendarPage() {
  const content = await getContent();
  const intro = findBySlug(content.pages, "calendar");
  return (
    <main>
      <Banner title={intro?.title || "Calendar"} />
      <div className="container py-5">
        <Prose html={intro?.body} />
        <EventGrid items={content.events} />
      </div>
    </main>
  );
}
