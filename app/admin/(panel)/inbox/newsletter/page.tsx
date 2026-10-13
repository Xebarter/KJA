import { NewsletterSetup, NewsletterView, parseNewsletterState } from "@/components/admin/NewsletterView";
import type { Subscriber } from "@/lib/inbox";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Newsletter" };

export default async function NewsletterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const state = parseNewsletterState(await searchParams);
  const supabase = supabaseConfigured() ? await createClient() : null;
  if (!supabase) return <NewsletterSetup />;

  const { data, error } = await supabase
    .from("newsletter_subscribers")
    .select("id, email, created_at")
    .order("created_at", { ascending: false })
    .limit(10000);

  return <NewsletterView state={state} all={(data ?? []) as Subscriber[]} error={error?.message} nowMs={Date.now()} />;
}
