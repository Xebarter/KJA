import { AlumniEventsArchive } from "@/components/site/AlumniViews";
import { getContent } from "@/lib/content";

export const metadata = { title: "Alumni Events Archive" };

export default async function AlumniEventsPage() {
  const content = await getContent();
  return <AlumniEventsArchive items={content.alumni_events} sidebar={{ news: content.news, events: content.events }} />;
}
