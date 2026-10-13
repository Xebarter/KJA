import { EventsHero } from "@/components/site/EventsHero";
import { NewsroomClose } from "@/components/site/Newsroom";
import { TecStyles } from "@/components/site/tec/TecStyles";
import { getContent } from "@/lib/content";
import { kampalaClock, toCalEvents } from "@/lib/events-calendar";
import "../events.css";

export default async function EventsLayout({ children }: { children: React.ReactNode }) {
  const content = await getContent();
  return (
    <div className="kja-events">
      <TecStyles />
      <EventsHero events={toCalEvents(content.events)} articles={content.events} clock={kampalaClock()} />
      <section id="kja-calendar" className="kja-ev-cal" aria-label="Events calendar">
        <div className="container">
          <div className="kja-ev-panel">{children}</div>
        </div>
      </section>
      <NewsroomClose email={content.settings.email} />
    </div>
  );
}
