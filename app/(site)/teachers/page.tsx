import { ArchiveLayout } from "@/components/site/ArchiveViews";
import { PeopleGrid } from "@/components/site/Views";
import { getContent } from "@/lib/content";

export const metadata = { title: "Teachers" };

export default async function TeachersPage() {
  const content = await getContent();
  return (
    <ArchiveLayout sidebar={{ news: content.news, events: content.events }}>
      <div className="entry-header">
        <h1 className="entry-title">All Teachers</h1>
      </div>
      <div className="py-5">
        <PeopleGrid items={content.teachers} hrefBase="/teacher" />
      </div>
    </ArchiveLayout>
  );
}
