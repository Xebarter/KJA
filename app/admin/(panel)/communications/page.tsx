import { CommunicationsDesk } from "@/components/admin/CommunicationsDesk";
import { PageHeader } from "@/components/admin/PageHeader";
import { buildAdminThreads } from "@/lib/communications";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Communications" };

export default async function CommunicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const threadParam = Array.isArray(params.thread) ? params.thread[0] : params.thread;
  const selectedThread = threadParam && /^[0-9a-f-]{36}$/i.test(threadParam) ? threadParam : "";
  const box = Array.isArray(params.box) ? params.box[0] : params.box;
  const filter = box === "awaiting" || box === "unread" ? box : "all";

  if (!supabaseConfigured()) {
    return (
      <div className="cm-page">
        <PageHeader
          kicker="Inbox"
          icon="fa-comments"
          title="Communications"
          description="Message parents through the portal — broadcasts, family notices, and direct replies."
        />
        <div className="admin-card app-notice">
          <h2>Connect Supabase</h2>
          <p>Parent communications need a connected Supabase project.</p>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  if (!supabase) {
    return (
      <div className="cm-page">
        <PageHeader kicker="Inbox" icon="fa-comments" title="Communications" description="Message parents through the portal." />
        <div className="admin-card app-notice">
          <h2>Session unavailable</h2>
          <p>Sign in again to open Communications.</p>
        </div>
      </div>
    );
  }

  const { data: rows, error } = await supabase
    .from("parent_messages")
    .select("id, user_id, subject, body, direction, read, created_at, thread_id, family_id")
    .order("created_at", { ascending: false })
    .limit(4000);

  const messageRows = (rows || []) as Array<{
    id: string;
    user_id: string;
    subject: string;
    body: string;
    direction: "in" | "out";
    read: boolean;
    created_at: string;
    thread_id: string | null;
    family_id: string | null;
  }>;

  const userIds = [...new Set(messageRows.map((row) => row.user_id))];
  const familyIds = [...new Set(messageRows.map((row) => row.family_id).filter(Boolean))] as string[];

  const [{ data: profiles }, { data: families }] = await Promise.all([
    userIds.length
      ? supabase.from("profiles").select("id, full_name, email").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
    familyIds.length
      ? supabase.from("families").select("id, family_code").in("id", familyIds)
      : Promise.resolve({ data: [] as { id: string; family_code: string | null }[] }),
  ]);

  const profileMap = new Map(
    (profiles || []).map((row) => [row.id as string, { full_name: row.full_name as string | null, email: row.email as string | null }]),
  );
  const familyMap = new Map((families || []).map((row) => [row.id as string, { family_code: row.family_code as string | null }]));
  const threads = buildAdminThreads(messageRows, profileMap, familyMap);
  const awaiting = threads.filter((t) => t.unreadOut > 0).length;
  const selectedMessages = selectedThread
    ? messageRows.filter((row) => row.thread_id === selectedThread).sort((a, b) => a.created_at.localeCompare(b.created_at))
    : [];

  return (
    <CommunicationsDesk
      threads={threads}
      selectedThreadId={selectedThread}
      selectedMessages={selectedMessages}
      filter={filter}
      awaiting={awaiting}
      loadError={error?.message}
    />
  );
}
