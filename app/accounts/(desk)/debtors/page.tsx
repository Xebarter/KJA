import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { AutoSubmit } from "@/components/accounts/client";
import { DebtorsTable, type DebtorRow } from "@/components/accounts/DebtorsTable";
import { AgingBar, Chips, Money, Stat, notReady } from "@/components/accounts/ui";
import { Empty, Pager } from "@/components/office/ui";
import { DEBTOR_SORTS, debtorsBase, debtorsQuery, familyDebtorsQuery, filterState, parseDebtorFilters } from "./filters";
import { ACCOUNTS_BASE, loadCampuses, requireAccounts } from "@/lib/accounts";
import { AGING, agingOf, amount, day, hrefWith, kampalaToday, overdueText, type AgingKey } from "@/lib/accounts-format";
import { emailSetupProblem } from "@/lib/email/send";
import { SCHOOL_CLASSES, displayPhone, fetchAll } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Debtors" };

const BASE = `${ACCOUNTS_BASE}/debtors`;
const SIZE = 50;

type FamilyRow = {
  family_id: string;
  family_code: string | null;
  mailing_name: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  children: number;
  balance: number;
  oldest_due: string | null;
  last_paid_on: string | null;
};

export default async function DebtorsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!supabaseConfigured()) return notReady("Debtors", { kind: "config" });
  const auth = await requireAccounts();
  if ("error" in auth) return notReady("Debtors", { kind: "auth", message: auth.error });
  const { supabase } = auth;
  const filters = parseDebtorFilters(await searchParams);
  const state = filterState(filters);
  const href = (changes: Record<string, string | number | null>) => hrefWith(BASE, state, changes);
  const today = kampalaToday();
  const from = (filters.page - 1) * SIZE;

  let everyone: { balance: number; oldest_due: string | null; family_id: string | null }[];
  try {
    everyone = await fetchAll((a, b) => debtorsBase(supabase, filters, "student_id, balance, oldest_due, family_id").order("student_id").range(a, b));
  } catch (error) {
    return notReady("Debtors", { kind: "schema", message: error instanceof Error ? error.message : "Couldn't load balances." });
  }
  const buckets = Object.fromEntries(AGING.map((bucket) => [bucket.key, { count: 0, total: 0 }])) as Record<AgingKey, { count: number; total: number }>;
  for (const row of everyone) {
    const bucket = buckets[agingOf(row.oldest_due, today)];
    bucket.count += 1;
    bucket.total += Number(row.balance);
  }
  const owed = everyone.reduce((sum, row) => sum + Number(row.balance), 0);
  const overdue = owed - buckets.current.total;
  const familyCount = new Set(everyone.map((row) => row.family_id ?? "")).size;
  const campuses = await loadCampuses(supabase);

  const header = (
    <PageHeader
      kicker="Billing"
      icon="fa-hand-holding-dollar"
      title="Debtors"
      description="Everyone who owes, oldest debts first to chase. Email families a reminder in a few clicks, or export the list to call them."
      actions={
        <a className="admin-hero-btn" href={hrefWith(`${BASE}/export`, state)}><i className="fa-solid fa-file-csv" aria-hidden="true" /> Export CSV</a>
      }
    >
      <div className="acc-hero-figures">
        <Stat label="Total owed" value={<Money value={owed} short />} note={`${everyone.length.toLocaleString("en-GB")} pupils · ${familyCount.toLocaleString("en-GB")} families`} tone={owed ? "bad" : "good"} />
        <Stat label="Overdue" value={<Money value={overdue} short />} note={owed ? `${Math.round((overdue / owed) * 100)}% of what's owed` : "Nothing overdue"} tone={overdue ? "warn" : undefined} />
      </div>
    </PageHeader>
  );

  const finder = (
    <AutoSubmit className="ofc-finder" action={BASE} label="Filter debtors">
      {filters.view ? <input type="hidden" name="view" value={filters.view} /> : null}
      {filters.aging ? <input type="hidden" name="aging" value={filters.aging} /> : null}
      <div className="ofc-finder-top">
        <label className="ofc-finder-search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <span className="visually-hidden">Search</span>
          <input type="search" name="q" defaultValue={filters.q} placeholder={filters.view ? "Family name, number or parent" : "Pupil, parent or family number"} />
        </label>
        {!filters.view ? (
          <>
            <label className="ofc-finder-field is-inline">
              <span>Class</span>
              <select name="class" defaultValue={filters.class}>
                <option value="">All classes</option>
                {SCHOOL_CLASSES.map((entry) => <option key={entry.code} value={entry.code}>{entry.code} · {entry.name}</option>)}
              </select>
            </label>
            {campuses.length > 1 ? (
              <label className="ofc-finder-field is-inline">
                <span>Campus</span>
                <select name="campus" defaultValue={filters.campus}>
                  <option value="">All campuses</option>
                  {campuses.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                </select>
              </label>
            ) : null}
            <label className="ofc-finder-field is-inline">
              <span>Pupils</span>
              <select name="pupils" defaultValue={filters.pupils}>
                <option value="">Current pupils</option>
                <option value="left">Former pupils</option>
                <option value="all">Everyone</option>
              </select>
            </label>
          </>
        ) : null}
        <label className="ofc-finder-field is-inline">
          <span>Owing at least</span>
          <input name="min" inputMode="numeric" defaultValue={filters.min ? amount(filters.min) : ""} placeholder="Any amount" className="acc-short-input" />
        </label>
        <label className="ofc-finder-field is-inline">
          <span>Sort</span>
          <select name="sort" defaultValue={filters.sort}>
            {DEBTOR_SORTS.filter((entry) => !filters.view || entry.value !== "class").map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </select>
        </label>
        <button className="admin-btn" type="submit">Search</button>
      </div>
    </AutoSubmit>
  );

  const views = (
    <Chips
      label="Group by"
      items={[
        { href: href({ view: "" }), label: "By pupil", on: !filters.view },
        { href: href({ view: "families", class: "", campus: "", pupils: "" }), label: "By family", on: filters.view === "families" },
      ]}
    />
  );

  const aging = (
    <section className="admin-card acc-aging-card">
      <header>
        <h2>How old the debts are</h2>
        {filters.aging ? <Link className="app-link-btn" href={href({ aging: "" })}>Show all ages</Link> : <p>Click a band to see just those pupils.</p>}
      </header>
      <AgingBar buckets={buckets} hrefFor={(key) => href({ aging: filters.aging === key ? "" : key })} />
    </section>
  );

  if (filters.view === "families") {
    const { data, count, error } = await familyDebtorsQuery(supabase, filters, "*", true).range(from, from + SIZE - 1);
    if (error) return notReady("Debtors", { kind: "schema", message: error.message });
    const rows = ((data || []) as FamilyRow[]).map((row) => ({ ...row, balance: Number(row.balance) }));
    const total = count ?? 0;
    return (
      <div className="app-page ofc-page acc-page">
        {header}
        {aging}
        <section className="admin-card ofc-register">
          {finder}
          <div className="acc-list-head">{views}<p>{total.toLocaleString("en-GB")} famil{total === 1 ? "y" : "ies"} owe</p></div>
          {rows.length ? (
            <div className="ofc-table-scroll">
              <table className="app-table acc-table">
                <thead>
                  <tr>
                    <th scope="col">Family</th>
                    <th scope="col">Contact</th>
                    <th scope="col">Children</th>
                    <th scope="col" className="is-num">Owes</th>
                    <th scope="col">Overdue</th>
                    <th scope="col">Last paid</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const bucket = AGING.find((entry) => entry.key === agingOf(row.oldest_due, today)) ?? AGING[0];
                    return (
                      <tr key={row.family_id}>
                        <td data-label="Family">
                          <Link className="acc-doc-link" href={`${ACCOUNTS_BASE}/families/${row.family_id}`}>{row.mailing_name || `Family ${row.family_code}`}</Link>
                          <small>{row.family_code}</small>
                        </td>
                        <td data-label="Contact">
                          {row.contact_name ?? "–"}
                          <small>{[row.contact_phone ? displayPhone(row.contact_phone) : "", row.contact_email ?? ""].filter(Boolean).join(" · ") || "No contact details"}</small>
                        </td>
                        <td data-label="Children">{row.children}</td>
                        <td data-label="Owes" className="is-num"><strong className="acc-owing">{amount(row.balance)}</strong></td>
                        <td data-label="Overdue"><span className={`acc-age is-${bucket.tone}`}>{row.oldest_due ? overdueText(row.oldest_due, today) : "No due date"}</span></td>
                        <td data-label="Last paid">{row.last_paid_on ? day(row.last_paid_on) : <span className="app-muted">Never</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon="fa-face-smile" title="No families owe">Nothing outstanding for these filters.</Empty>
          )}
          <Pager page={filters.page} pages={Math.max(1, Math.ceil(total / SIZE))} total={total} from={from} size={SIZE} href={(n) => href({ page: n })} />
        </section>
      </div>
    );
  }

  const { data, count, error } = await debtorsQuery(supabase, filters, "*", true).range(from, from + SIZE - 1);
  if (error) return notReady("Debtors", { kind: "schema", message: error.message });
  const base = (data || []) as unknown as Omit<DebtorRow, "last_reminded">[];
  const reminded = new Map<string, string>();
  if (base.length) {
    const { data: reminders } = await supabase
      .from("fee_reminders")
      .select("student_id, sent_at")
      .in("student_id", base.map((row) => row.student_id))
      .eq("status", "sent")
      .order("sent_at", { ascending: false });
    for (const reminder of reminders || []) if (!reminded.has(reminder.student_id)) reminded.set(reminder.student_id, reminder.sent_at);
  }
  const rows: DebtorRow[] = base.map((row) => ({ ...row, balance: Number(row.balance), last_reminded: reminded.get(row.student_id) ?? null }));
  const total = count ?? 0;

  return (
    <div className="app-page ofc-page acc-page">
      {header}
      {aging}
      <section className="admin-card ofc-register">
        {finder}
        <div className="acc-list-head">{views}<p>{total.toLocaleString("en-GB")} pupil{total === 1 ? "" : "s"} owe</p></div>
        {rows.length ? (
          <DebtorsTable rows={rows} today={today} emailReady={emailSetupProblem()} />
        ) : (
          <Empty icon="fa-face-smile" title={filters.q || filters.class || filters.aging || filters.min ? "Nobody matches" : "Nobody owes anything"}>
            {filters.q || filters.class || filters.aging || filters.min ? "Try clearing a filter." : "Every pupil's account is clear."}
          </Empty>
        )}
        <Pager page={filters.page} pages={Math.max(1, Math.ceil(total / SIZE))} total={total} from={from} size={SIZE} href={(n) => href({ page: n })} />
      </section>
    </div>
  );
}
