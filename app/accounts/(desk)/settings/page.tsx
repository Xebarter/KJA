import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { FeeRateGrid } from "@/components/accounts/FeeRateGrid";
import { SetupNav, type SetupTile } from "@/components/accounts/SetupNav";
import { CategoriesManager, DiscountsManager, ItemsManager, TermsManager } from "@/components/accounts/SetupForms";
import { notReady } from "@/components/accounts/ui";
import { Empty } from "@/components/office/ui";
import { groupOf } from "@/lib/accounts-agg";
import { ACCOUNTS_BASE, loadCampuses, loadTerms, missingAccountsSchema, requireAccounts } from "@/lib/accounts";
import { kampalaToday, ugxShort, type DiscountRule, type ExpenseCategory, type FeeItem, type FeeRate } from "@/lib/accounts-format";
import { getContent } from "@/lib/content";
import { composeFees } from "@/lib/info-pages";
import { SCHOOL_CLASSES, isUuid, pick } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";
import "./settings.css";

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
    groupOf(supabase.from("student_discounts").select("rule_id, id.count()").not("rule_id", "is", null), "rule_id", "count"),
    supabase.from("expense_categories").select("id, name, icon, monthly_budget, active").order("name"),
    groupOf(supabase.from("expenses").select("category_id, amount.sum()").gte("spent_on", monthStart).neq("status", "rejected"), "category_id"),
    groupOf(supabase.from("invoices").select("term_id, id.count()").neq("status", "void"), "term_id", "count"),
    loadCampuses(supabase),
    websiteTuition(),
  ]);
  if (items.error && missingAccountsSchema(items.error.message)) return notReady("Fee setup", { kind: "schema", message: items.error.message });

  const allItems = (items.data || []) as FeeItem[];
  const active = allItems.filter((item) => item.active);
  const campuses = [...new Set([...registerCampuses, ...website.campuses])].sort((a, b) => a.localeCompare(b));
  const wantedCampus = pick(params, "campus");
  const campus = campuses.find((name) => name === wantedCampus) ?? "";
  const ruleUse = Object.fromEntries(given ?? []);
  const spent = Object.fromEntries([...(spending ?? [])].filter(([id]) => id));
  const termUse = Object.fromEntries(invoiceTerms ?? []);
  const rateRows = (rates.data || []) as FeeRate[];
  const ratedClasses = new Set(rateRows.map((rate) => rate.class_code));
  const discountRules = (rules.data || []) as DiscountRule[];
  const expenseCategories = (categories.data || []) as ExpenseCategory[];
  const activeRules = discountRules.filter((rule) => rule.active);
  const activeCategories = expenseCategories.filter((entry) => entry.active);
  const monthSpent = Object.values(spent).reduce((sum, value) => sum + value, 0);
  const hasTuition = active.some((item) => item.kind === "tuition");
  const classesLeft = SCHOOL_CLASSES.length - ratedClasses.size;
  const staleTerm = isUuid(wanted) && !terms.some((entry) => entry.id === wanted);

  const tiles: SetupTile[] = [
    {
      id: "terms",
      label: "Current term",
      icon: "fa-calendar-days",
      tone: current ? "ok" : "warn",
      value: current ? `T${current.term}` : "—",
      note: current ? current.label : "Choose a term to bill",
    },
    {
      id: "items",
      label: "Fee items",
      icon: "fa-list-check",
      tone: hasTuition ? "navy" : "warn",
      value: String(active.length),
      note: !allItems.length ? "Nothing to bill yet" : !hasTuition ? "Tuition is missing" : allItems.length === active.length ? "All items are billed" : `${allItems.length - active.length} switched off`,
    },
    {
      id: "rates",
      label: "Classes set",
      icon: "fa-table-cells",
      tone: term && classesLeft <= 0 ? "ok" : "warn",
      value: term ? String(ratedClasses.size) : "—",
      note: !term ? "Add a term first" : classesLeft > 0 ? `${classesLeft} still to set` : "Every class has fees",
      share: term ? Math.round((ratedClasses.size / SCHOOL_CLASSES.length) * 100) : undefined,
    },
    {
      id: "discounts",
      label: "Discounts",
      icon: "fa-tags",
      tone: activeRules.length ? "gold" : "warn",
      value: String(activeRules.length),
      note: activeRules.length ? "On for new invoices" : discountRules.length ? "None switched on" : "None added yet",
    },
    {
      id: "categories",
      label: "Categories",
      icon: "fa-folder-tree",
      tone: "navy",
      value: String(activeCategories.length),
      note: monthSpent ? `${ugxShort(monthSpent)} spent this month` : "No spending this month",
    },
  ];

  const ready = [Boolean(current), hasTuition, Boolean(term) && classesLeft <= 0, activeRules.length > 0].filter(Boolean).length;
  const ratesNote = !term
    ? "Add a term first, then set what each class pays."
    : staleTerm
      ? `That term no longer exists. Showing ${term.label}.`
      : `What each class pays in ${term.label}.`;

  return (
    <div className="app-page ofc-page acc-page set-page">
      <PageHeader
        kicker="Setup"
        icon="fa-sliders"
        title="Fee setup"
        description={ready === 4
          ? "Fee setup is complete for the current term. New invoices use these terms, class fees and discounts."
          : `${ready} of 4 setup steps are done. Terms, class fees, discounts and expense categories are what new invoices are built from.`}
        actions={
          <>
            <Link className="admin-hero-btn is-primary" href={`${ACCOUNTS_BASE}/invoices/generate`}><i className="fa-solid fa-file-invoice" aria-hidden="true" /> Generate term invoices</Link>
            <Link className="admin-hero-btn" href="/fees" target="_blank"><i className="fa-solid fa-globe" aria-hidden="true" /> Website fee page</Link>
          </>
        }
      />

      <SetupNav tiles={tiles} />

      <TermsManager terms={terms} usage={termUse} />
      <ItemsManager items={allItems} />

      <section className="admin-card ofc-register set-card set-rates" id="rates" aria-labelledby="rates-heading">
        <header className="ofc-reg-results">
          <div>
            <h2 id="rates-heading">
              Fees by class
              {term ? <span className="set-count">{ratedClasses.size} of {SCHOOL_CLASSES.length}</span> : null}
            </h2>
            <p>{ratesNote}</p>
          </div>
          <p className="ofc-reg-hint">
            <i className="fa-solid fa-coins" aria-hidden="true" /> Amounts are per pupil, for the term
          </p>
        </header>
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
        ) : (
          <Empty icon="fa-calendar" title="No term yet">Add a term above, then set the fees for each class.</Empty>
        )}
      </section>

      <DiscountsManager rules={discountRules} usage={ruleUse} />
      <CategoriesManager categories={expenseCategories} spent={spent} />
    </div>
  );
}
