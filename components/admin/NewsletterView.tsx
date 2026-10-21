import { NewsletterDesk } from "@/components/admin/NewsletterDesk";
import type { Subscriber } from "@/lib/inbox";
import "@/app/admin/inbox.css";

const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "az", label: "Email A–Z" },
] as const;
type Sort = (typeof SORTS)[number]["value"];
export type NewsletterState = { q: string; sort: Sort; page: number };

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export function parseNewsletterState(params: Record<string, string | string[] | undefined>): NewsletterState {
  const sortParam = first(params.sort);
  const page = Number.parseInt(first(params.page), 10);
  return {
    q: first(params.q).slice(0, 100),
    sort: SORTS.some((item) => item.value === sortParam) ? (sortParam as Sort) : "newest",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function NewsletterSetup() {
  return (
    <div className="inbox-page nl-desk">
      <header className="nl-head">
        <div>
          <h1>Newsletter</h1>
          <p>People who asked to hear school news.</p>
        </div>
      </header>
      <div className="admin-card app-notice">
        <h2>Connect Supabase to collect subscribers</h2>
        <p>The newsletter sign-up form in the site footer stores emails in Supabase. Add the project keys to start building your list.</p>
      </div>
    </div>
  );
}

export function NewsletterView({ state, all, error, nowMs }: { state: NewsletterState; all: Subscriber[]; error?: string; nowMs: number }) {
  return <NewsletterDesk all={all} error={error} nowMs={nowMs} initial={state} />;
}
