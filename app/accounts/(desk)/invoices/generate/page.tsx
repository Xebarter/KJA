import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { InvoiceWizard } from "@/components/accounts/InvoiceWizard";
import { notReady } from "@/components/accounts/ui";
import { ACCOUNTS_BASE, loadTerms, requireAccounts } from "@/lib/accounts";
import { fetchAll, pick } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Generate term invoices" };

export default async function GeneratePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!supabaseConfigured()) return notReady("Generate term invoices", { kind: "config" });
  const auth = await requireAccounts();
  if ("error" in auth) return notReady("Generate term invoices", { kind: "auth", message: auth.error });
  const { supabase } = auth;
  const { terms, current, error } = await loadTerms(supabase);
  if (error) return notReady("Generate term invoices", { kind: "schema", message: error });
  if (!terms.length) {
    return notReady("Generate term invoices", { kind: "schema", message: "There are no terms yet. Add one in Fee setup first." });
  }
  const wanted = pick(await searchParams, "term");
  const termId = terms.find((term) => term.id === wanted)?.id ?? current?.id ?? terms[0].id;

  const [rates, billed, pupils] = await Promise.all([
    supabase.from("fee_rates").select("term_id, class_code").gt("amount", 0).limit(10000),
    supabase.from("invoices").select("term_id").eq("kind", "term").neq("status", "void").limit(20000),
    fetchAll<{ class_code: string | null }>((from, to) => supabase.from("students").select("class_code").eq("status", "active").order("id").range(from, to)),
  ]);
  const ratedClasses: Record<string, string[]> = {};
  for (const row of rates.data || []) (ratedClasses[row.term_id] ??= []).push(row.class_code);
  const billedByTerm: Record<string, number> = {};
  for (const row of billed.data || []) billedByTerm[row.term_id] = (billedByTerm[row.term_id] ?? 0) + 1;
  const activeByClass: Record<string, number> = {};
  for (const row of pupils) if (row.class_code) activeByClass[row.class_code] = (activeByClass[row.class_code] ?? 0) + 1;

  return (
    <div className="app-page ofc-page acc-page ofc-narrow">
      <PageHeader
        kicker="Invoices"
        icon="fa-file-invoice"
        title="Generate term invoices"
        description="Bill a whole term in one go. You'll see exactly what will be created before anything is saved."
        actions={<Link className="admin-hero-btn" href={`${ACCOUNTS_BASE}/settings#rates`}><i className="fa-solid fa-sliders" aria-hidden="true" /> Check the fees</Link>}
      />
      <InvoiceWizard
        terms={terms.map((term) => ({ id: term.id, label: term.label, due_on: term.due_on, billed: billedByTerm[term.id] ?? 0 }))}
        termId={termId}
        ratedClasses={ratedClasses}
        activeByClass={activeByClass}
      />
    </div>
  );
}
