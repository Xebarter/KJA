import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StoryArticle } from "@/components/site/StoryArticle";
import { requireAdmin } from "@/lib/admin-applications";
import { formatDateTime } from "@/lib/applications";
import { getContent } from "@/lib/content";
import { isStoryTable, kampalaIso, sourceForTable } from "@/lib/newsroom";
import { STATUS_INFO, storyStatus } from "@/lib/story-admin";
import { composeStoryPage } from "@/lib/story-page";
import type { Article } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Story preview", robots: { index: false, follow: false } };

export default async function StoryPreview({ params }: { params: Promise<{ table: string; id: string }> }) {
  const { table, id } = await params;
  if (!isStoryTable(table) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const auth = await requireAdmin();
  if ("error" in auth) notFound();
  const { data } = await auth.supabase.from(table).select("*").eq("id", id).maybeSingle();
  if (!data) notFound();

  const item = data as Article;
  const page = composeStoryPage(await getContent(), item, sourceForTable(table)!);
  const status = storyStatus(item.published, item.published_at);
  return (
    <>
      <div className="kja-preview-bar" role="status">
        <span>
          <i className="fa-regular fa-eye" aria-hidden="true" />
          <strong>Preview</strong>
          {status === "live"
            ? "This story is live."
            : status === "scheduled"
              ? `Scheduled for ${formatDateTime(kampalaIso(item.published_at))}. Only admins can see it.`
              : `${STATUS_INFO[status].label}. Only admins can see it.`}
        </span>
        <a href={`/admin/stories/${table}/${id}`}>
          <i className="fa-solid fa-pen" aria-hidden="true" /> Back to editor
        </a>
      </div>
      <StoryArticle {...page} />
    </>
  );
}
