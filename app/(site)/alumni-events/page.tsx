import { AlumniEventsView } from "@/components/site/AlumniViews";
import { splitAlumniEvents } from "@/lib/alumni";
import { getContent } from "@/lib/content";

export const metadata = {
  title: "Alumni Events",
  description: "Reunions, homecomings and gatherings for Kampala Junior Academy alumni.",
};

export default async function AlumniEventsPage() {
  const content = await getContent();
  const { upcoming, past } = splitAlumniEvents(content.alumni_events);
  return <AlumniEventsView upcoming={upcoming} past={past} email={content.settings.email} />;
}
