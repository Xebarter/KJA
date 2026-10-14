import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { FeeRateGrid } from "@/components/accounts/FeeRateGrid";
import { CategoriesManager, DiscountsManager, ItemsManager, TermsManager } from "@/components/accounts/SetupForms";
import { notReady } from "@/components/accounts/ui";
import { Panel } from "@/components/office/ui";
import { ACCOUNTS_BASE, loadCampuses, loadTerms, missingAccountsSchema, requireAccounts } from "@/lib/accounts";
import { kampalaToday, type DiscountRule, type ExpenseCategory, type FeeItem, type FeeRate } from "@/lib/accounts-format";
import { getContent } from "@/lib/content";
import { composeFees } from "@/lib/info-pages";
import { SCHOOL_CLASSES, isUuid, pick } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Fee setup" };

const NURSERY = SCHOOL_CLASSES.filter((entry) => entry.section === "nursery").map((entry) => entry.code);

/** Which register classes a line on the website fee page covers, e.g. "Primary School (P1 – P6)". */
function classesFor(label: string): string[] {
  const range = label.match(/P\s*(\d)\s*[–-]\s*P?\s*(\d)/i);
  if (range) {
    const [from, to] = [Number(range[1]), Number(range[2])];
    return SCHOOL_CLASSES.filter((entry) => entry.section === "primary" && Number(entry.code.slice(1)) >= from && Number(entry.code.slice(1)) <= to).map((entry) => entry.code);
  }
  const single = label.match(/\bP\s*(\d)\b/i) ?? (/seven/i.test(label) ? ["", "7"] : null);
  if (single) return [`P${single[1]}`];
  if (/nursery|pre-?school|kindergarten|daycare/i.test(label)) return NURSERY;
  if (/primary/i.test(label)) return SCHOOL_CLASSES.filter((entry) => entry.section === "primary").map((entry) => entry.code);
  return [];
}

async function websiteTuition() {
  try {
    const fees = composeFees(await getContent());
    const out: Record<string, Record<string, number>> = {};
    for (const campus of fees.campuses) {
      const byClass: Record<string, number> = {};
      for (const line of campus.lines) for (const code of classesFor(line.label)) byClass[code] = line.amount;
      if (Object.keys(byClass).length) out[campus.name.toLowerCase()] = byClass;
    }
    return { prefill: out, campuses: fees.campuses.map((campus) => campus.name) };
  } catch {
    return { prefill: {}, campuses: [] as string[] };
  }
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!supabaseConfigured()) return notReady("Fee setup", { kind: "config" });
  const auth = await requireAccounts();
  if ("error" in auth) return notReady("Fee setup", { kind: "auth", message: auth.error });
  const { supabase } = auth;
  const params = await searchParams;

  const { terms, current, error } = await loadTerms(supabase);
  if (error) return notReady("Fee setup", { kind: "schema", message: error });
  const wanted = pick(params, "term");
  const term = terms.find((entry) => entry.id === wanted) ?? current ?? null;
  const monthStart = `${kampalaToday().slice(0, 7)}-01`;

  const [items, rates, rules, given, categories, spending, invoiceTerms, registerCampuses, website] = await Promise.all([
    supabase.from("fee_items").select("id, name, kind, description, active, sort_order").order("sort_order").order("name"),
    term ? supabase.from("fee_rates").select("id, term_id, item_id, class_code, campus, amount").eq("term_id", term.id) : Promise.resolve({ data: [] }),
    supabase.from("discount_rules").select("id, name, kind, method, value, sibling_from, active").order("kind").order("name"),
    supabase.from("student_discounts").select("rule_id").not("rule_id", "is", null).limit(5000),
    supabase.from("expense_categories").select("id, name, icon, monthly_budget, active").order("name"),
    supabase.from("expenses").select("category_id, amount").gte("spent_on", monthStart).neq("status", "rejected").limit(5000),
    supabase.from("invoices").select("term_id").neq("status", "void").limit(20000),
    loadCampuses(supabase),
    websiteTuition(),
  ]);
  if (items.error && missingAccountsSchema(items.error.message)) return notReady("Fee setup", { kind: "schema", message: items.error.message });

  const allItems = (items.data || []) as FeeItem[];
  const active = allItems.filter((item) => item.active);
  const campuses = [...new Set([...registerCampuses, ...website.campuses])].sort((a, b) => a.localeCompare(b));
  const wantedCampus = pick(params, "campus");
  const campus = campuses.find((name) => name === wantedCampus) ?? "";
  const ruleUse: Record<string, number> = {};
  for (const row of given.data || []) if (row.rule_id) ruleUse[row.rule_id] = (ruleUse[row.rule_id] ?? 0) + 1;
  const spent: Record<string, number> = {};
  for (const row of spending.data || []) if (row.category_id) spent[row.category_id] = (spent[row.category_id] ?? 0) + Number(row.amount);
  const termUse: Record<string, number> = {};
  for (const row of invoiceTerms.data || []) termUse[row.term_id] = (termUse[row.term_id] ?? 0) + 1;
  const rateRows = (rates.data || []) as FeeRate[];
  const ratedClasses = new Set(rateRows.map((rate) => rate.class_code));

  const steps = [
    { done: Boolean(current), label: "Set the current term", href: "#terms" },
    { done: active.some((item) => item.kind === "tuition"), label: "Have a Tuition fee item", href: "#items" },
    { done: ratedClasses.size >= SCHOOL_CLASSES.length, label: `Fees set for every class${term ? ` in ${term.label}` : ""}`, href: "#rates" },
    { done: (rules.data || []).some((rule) => rule.active), label: "Switch on the discounts you use", href: "#discounts" },
  ];

  return (
    <div className="app-page ofc-page acc-page">
      <PageHeader
        kicker="Setup"
        icon="fa-sliders"
        title="Fee setup"
        description="Terms, what each class pays, and the discounts and expense categories the office uses. Invoices are generated from these settings."
        actions={
          <>
            <Link className="admin-hero-btn is-primary" href={`${ACCOUNTS_BASE}/invoices/generate`}><i className="fa-solid fa-file-invoice" aria-hidden="true" /> Generate term invoices</Link>
            <Link className="admin-hero-btn" href="/fees" target="_blank"><i className="fa-solid fa-globe" aria-hidden="true" /> Website fee page</Link>
          </>
        }
      >
        <ol className="acc-checklist">
          {steps.map((step) => (
            <li key={step.label} className={step.done ? "is-done" : ""}>
              <a href={step.href}>
                <i className={`fa-solid ${step.done ? "fa-circle-check" : "fa-circle"}`} aria-hidden="true" />
                {step.label}
              </a>
            </li>
          ))}
        </ol>
      </PageHeader>

      <nav className="acc-subnav" aria-label="Setup sections">
        <a href="#terms">Terms</a>
        <a href="#items">Fee items</a>
        <a href="#rates">Fees by class</a>
        <a href="#discounts">Discounts</a>
        <a href="#categories">Expense categories</a>
      </nav>

      <div className="ofc-two acc-setup-top">
        <Panel title="Terms" description="The current term is used for new payments and invoices." id="terms">
          <TermsManager terms={terms} usage={termUse} />
        </Panel>
        <Panel title="Fee items" description="What families are billed for. Switch an item off to stop billing it." id="items">
          <ItemsManager items={allItems} />
        </Panel>
      </div>

      <Panel
        title="Fees by class"
        description={term ? `What each class pays in ${term.label}. ${ratedClasses.size} of ${SCHOOL_CLASSES.length} classes have fees.` : "Add a term first."}
        id="rates"
        className="acc-rates-panel"
      >
        {term ? (
          <FeeRateGrid
            key={`${term.id}-${campus}`}
            terms={terms.map((entry) => ({ id: entry.id, label: entry.label }))}
            termId={term.id}
            campus={campus}
            campuses={campuses}
            items={active}
            rates={rateRows}
            prefill={website.prefill}
          />
        ) : <p className="app-muted">Add a term above, then set the fees for each class.</p>}
      </Panel>

      <div className="ofc-two">
        <Panel title="Discounts" description="Sibling and staff discounts apply automatically. Bursaries are given to individual pupils from their fee account." id="discounts">
          <DiscountsManager rules={(rules.data || []) as DiscountRule[]} usage={ruleUse} />
        </Panel>
        <Panel title="Expense categories" description="Used to group spending in reports. Set a monthly budget to track overspending." id="categories">
          <CategoriesManager categories={(categories.data || []) as ExpenseCategory[]} spent={spent} />
        </Panel>
      </div>
      {isUuid(wanted) && !terms.some((entry) => entry.id === wanted) ? <p className="app-muted">That term no longer exists; showing the current term.</p> : null}
    </div>
  );
}
