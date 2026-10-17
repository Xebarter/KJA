import { AccountsShell } from "@/components/accounts/Shell";
import { requireAccounts } from "@/lib/accounts";
import { ROLE_LABELS } from "@/lib/office-nav";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AccountsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const badges = { expenses: 0, drafts: 0 };
  let term: string | null = null;
  let person = { name: "Accounts office", email: "", role: "Accounts officer" };
  if (supabase) {
    const [auth, expenses, drafts, current] = await Promise.all([
      requireAccounts(),
      supabase.from("expenses").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "draft"),
      supabase.from("fee_terms").select("label").eq("is_current", true).maybeSingle(),
    ]);
    badges.expenses = expenses.count ?? 0;
    badges.drafts = drafts.count ?? 0;
    term = (current.data?.label as string | undefined) ?? null;
    if (!("error" in auth)) {
      const email = auth.user.email ?? "";
      person = {
        name: auth.profile.full_name?.trim() || auth.user.user_metadata?.full_name || email || person.name,
        email,
        role: ROLE_LABELS[auth.profile.role ?? ""] ?? person.role,
      };
    }
  }
  return (
    <AccountsShell person={person} badges={badges} term={term}>
      {children}
    </AccountsShell>
  );
}
