import { MESSAGES_PAGE_SIZE, MessagesSetup, MessagesView, type MessageSummary } from "@/components/admin/MessagesView";
import { MESSAGE_KINDS, parseInboxFilters, searchNeedle, type ContactMessage } from "@/lib/inbox";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Messages" };

const COLUMNS = "id, name, email, phone, subject, message, read, created_at";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = parseInboxFilters(await searchParams);
  const supabase = supabaseConfigured() ? await createClient() : null;
  if (!supabase) return <MessagesSetup />;

  let list = supabase.from("contact_messages").select(COLUMNS, { count: "exact" }).order("created_at", { ascending: false });
  if (filters.box === "unread") list = list.eq("read", false);
  const kind = MESSAGE_KINDS.find((item) => item.value === filters.box);
  if (kind) list = list.ilike("subject", `${kind.prefix}%`);
  const needle = searchNeedle(filters.q);
  if (needle) {
    list = list.or(["name", "email", "subject", "message"].map((column) => `${column}.ilike.%${needle}%`).join(","));
  }
  const from = (filters.page - 1) * MESSAGES_PAGE_SIZE;

  const [summaryResult, listResult, selectedResult] = await Promise.all([
    supabase.from("contact_messages").select("id, subject, read, created_at").order("created_at", { ascending: false }).limit(5000),
    list.range(from, from + MESSAGES_PAGE_SIZE - 1),
    filters.id
      ? supabase.from("contact_messages").select(COLUMNS).eq("id", filters.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const rows = (listResult.data ?? []) as ContactMessage[];

  return (
    <MessagesView
      filters={filters}
      summary={(summaryResult.data ?? []) as MessageSummary[]}
      rows={rows}
      total={listResult.count ?? rows.length}
      selected={(selectedResult.data ?? null) as ContactMessage | null}
      loadError={summaryResult.error?.message || listResult.error?.message}
      nowMs={Date.now()}
    />
  );
}
