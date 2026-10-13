import Link from "next/link";
import { notFound } from "next/navigation";
import { StoriesSetupNotice } from "@/components/admin/Stories";
import { StoryEditor } from "@/components/admin/StoryEditor";
import { isStoryTable, sourceForTable, STORY_SOURCES } from "@/lib/newsroom";
import { blankStory, loadAdminStories, loadStoryRow, storySuggestions, toRecord } from "@/lib/story-admin-server";

export async function generateMetadata({ params }: { params: Promise<{ table: string; id: string }> }) {
  const { table, id } = await params;
  const source = sourceForTable(table);
  return { title: id === "new" && source ? `New ${STORY_SOURCES[source].singular.toLowerCase()}` : "Edit story" };
}

export default async function StoryEditPage({ params }: { params: Promise<{ table: string; id: string }> }) {
  const { table, id } = await params;
  if (!isStoryTable(table)) notFound();
  const { mode, items } = await loadAdminStories();

  if (mode === "setup") {
    return (
      <div className="app-page">
        <Link className="app-back" href="/admin/stories"><i className="fa-solid fa-arrow-left" /> All stories</Link>
        <StoriesSetupNotice mode={mode} />
      </div>
    );
  }

  let record = blankStory(table);
  if (id !== "new") {
    const row = /^[0-9a-f-]{36}$/i.test(id) ? await loadStoryRow(table, id) : null;
    if (!row) notFound();
    record = toRecord(row, table);
  }

  return <StoryEditor key={`${table}:${id}`} record={record} mode={mode} suggestions={storySuggestions(items)} />;
}
