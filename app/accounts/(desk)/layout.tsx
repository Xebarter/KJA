import { AccountsShell } from "@/components/accounts/Shell";
import { ROLE_LABELS } from "@/lib/office-nav";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AccountsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const badges = { expenses: 0, drafts: 0 };
  let term: string | null = null;
  let person = { name: "Accounts office", email: "", role: "Accounts officer" };
  if (supabase) {
    const [{ data }, expenses, drafts, current] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("expenses").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "draft"),
      supabase.from("fee_terms").select("label").eq("is_current", true).maybeSingle(),
    ]);
    badges.expenses = expenses.count ?? 0;
    badges.drafts = drafts.count ?? 0;
    term = (current.data?.label as string | undefined) ?? null;
    if (data.user) {
      const { data: profile } = await supabase.from("profiles").select("full_name, role").eq("id", data.user.id).maybeSingle();
      const email = data.user.email ?? "";
      person = {
        name: profile?.full_name?.trim() || data.user.user_metadata?.full_name || email || person.name,
        email,
        role: ROLE_LABELS[profile?.role ?? ""] ?? person.role,
      };
    }
  }
  return (
    <AccountsShell person={person} badges={badges} term={term}>
      {children}
    </AccountsShell>
  );
}
