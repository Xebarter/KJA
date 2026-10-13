import { StoriesManager } from "@/components/admin/Stories";
import { STORY_SOURCE_KEYS, type StorySource } from "@/lib/newsroom";
import { loadAdminStories } from "@/lib/story-admin-server";

export const metadata = { title: "Stories" };

const pick = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export default async function StoriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const { mode, items, error } = await loadAdminStories();
  const type = pick(params.type);
  const status = pick(params.status);
  return (
    <StoriesManager
      mode={mode}
      items={items}
      loadError={error}
      initial={{
        type: (STORY_SOURCE_KEYS as string[]).includes(type) ? (type as StorySource) : "all",
        status: ["live", "scheduled", "draft", "featured"].includes(status) ? (status as "live") : "all",
        q: pick(params.q),
      }}
    />
  );
}
