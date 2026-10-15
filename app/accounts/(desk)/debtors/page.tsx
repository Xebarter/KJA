import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { PageHeader } from "@/components/admin/PageHeader";
import { DebtorFinder } from "@/components/accounts/DebtorFinder";
import { DebtorsTable, FamilyDebtorsTable, type DebtorRow, type FamilyDebtorRow } from "@/components/accounts/DebtorsTable";
import { notReady } from "@/components/accounts/ui";
import { Empty, Pager } from "@/components/office/ui";
import { debtorsBase, debtorsQuery, familyDebtorsQuery, filterState, parseDebtorFilters, type DebtorFilters } from "./filters";
import { ACCOUNTS_BASE, loadCampuses, requireAccounts } from "@/lib/accounts";
import { AGING, agingOf, hrefWith, kampalaToday, ugx, ugxShort, type AgingKey } from "@/lib/accounts-format";
import { emailSetupProblem } from "@/lib/email/send";
import { className as classLabel, fetchAll } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Debtors" };

const BASE = `${ACCOUNTS_BASE}/debtors`;
const SIZE = 50;

const BAND_ICON: Record<AgingKey, string> = {
  current: "fa-calendar-check",
  d30: "fa-clock",
  d60: "fa-hourglass-half",
  d60plus: "fa-triangle-exclamation",
};

function owingHeading(total: number, families: boolean) {
  const n = total.toLocaleString("en-GB");
  if (families) return total === 1 ? "1 family owes" : `${n} families owe`;
  return total === 1 ? "1 pupil owes" : `${n} pupils owe`;
}

function scopeLine(filters: DebtorFilters) {
  const sort = filters.sort === "oldest"
    ? "longest overdue first"
    : filters.sort === "name"
      ? "name A–Z"
      : filters.sort === "class"
        ? "by class, then name"
        : "largest balance first";
  const parts = [
    filters.aging ? AGING.find((entry) => entry.key === filters.aging)?.label : "",
    filters.class ? classLabel(filters.class) : "",
    filters.campus,
    filters.pupils === "left" ? "Former pupils" : filters.pupils === "all" ? "Current and former pupils" : "",
    filters.min ? `Owing at least ${ugx(filters.min)}` : "",
    filters.q ? `Matching “${filters.q}”` : "",
  ].filter(Boolean);
  if (!parts.length) {
    return filters.view === "families"
      ? `Every family with a balance, ${sort}`
      : `Every current pupil with a balance, ${sort}`;
  }
  const line = parts.join(" · ");
  return `${line.charAt(0).toUpperCase()}${line.slice(1)} · ${sort.charAt(0).toUpperCase()}${sort.slice(1)}`;
}

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
  const families = filters.view === "families";

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
  const familyCount = new Set(everyone.map((row) => row.family_id ?? "")).size;
  const campuses = await loadCampuses(supabase);
  const narrowed = Boolean(filters.q || filters.class || filters.campus || filters.aging || filters.min || filters.pupils);

  const tiles = (
    <nav className="ofc-reg-summary acc-debt-summary" aria-label="How old the debts are">
      <Link
        href={href({ aging: "" })}
        className={`ofc-reg-tile${owed ? "" : " is-ok"}${filters.aging ? "" : " is-on"}`}
        aria-current={filters.aging ? undefined : "true"}
        scroll={false}
      >
        <span className="ofc-reg-tile-icon" aria-hidden="true"><i className="fa-solid fa-hand-holding-dollar" /></span>
        <span className="ofc-reg-tile-body">
          <span className="ofc-reg-tile-label">Outstanding</span>
          <strong>
            <span className="visually-hidden">{ugx(owed)} </span>
            <span aria-hidden="true">{ugxShort(owed)}</span>
          </strong>
          <small>{owed ? `${everyone.length.toLocaleString("en-GB")} pupils · ${familyCount.toLocaleString("en-GB")} families` : "Every account is clear"}</small>
        </span>
      </Link>
      {AGING.map((bucket) => {
        const band = buckets[bucket.key];
        const on = filters.aging === bucket.key;
        const share = owed ? Math.round((band.total / owed) * 100) : 0;
        return (
          <Link
            key={bucket.key}
            href={href({ aging: on ? "" : bucket.key })}
            className={`ofc-reg-tile is-${bucket.tone}${on ? " is-on" : ""}`}
            aria-current={on ? "true" : undefined}
            scroll={false}
            title={ugx(band.total)}
          >
            <span className="ofc-reg-tile-icon" aria-hidden="true"><i className={`fa-solid ${BAND_ICON[bucket.key]}`} /></span>
            <span className="ofc-reg-tile-body">
              <span className="ofc-reg-tile-label">{bucket.short}</span>
              <strong>
                <span className="visually-hidden">{ugx(band.total)} </span>
                <span aria-hidden="true">{ugxShort(band.total)}</span>
              </strong>
              <small>
                {band.count
                  ? `${band.count.toLocaleString("en-GB")} pupil${band.count === 1 ? "" : "s"} · ${share}%`
                  : "None in this band"}
              </small>
              {owed ? (
                <span className="acc-debt-meter" style={{ "--share": `${share}%` } as CSSProperties}>
                  <span />
                </span>
              ) : null}
            </span>
          </Link>
        );
      })}
    </nav>
  );

  const finder = <DebtorFinder filters={filters} campuses={campuses} />;
  const scope = scopeLine(filters);

  if (families) {
    const { data, count, error } = await familyDebtorsQuery(supabase, filters, "*", true).range(from, from + SIZE - 1);
    if (error) return notReady("Debtors", { kind: "schema", message: error.message });
    const rows = ((data || []) as unknown as FamilyDebtorRow[]).map((row) => ({ ...row, balance: Number(row.balance) }));
    const total = count ?? 0;
    return (
      <Shell tiles={tiles} finder={finder} heading={owingHeading(total, true)} scope={scope} hint="Open a family to see each child and what they owe" hintIcon="fa-solid fa-people-roof" showHint={rows.length > 0} exportHref={hrefWith(`${BASE}/export`, state)}>
        {rows.length ? (
          <FamilyDebtorsTable rows={rows} today={today} />
        ) : (
          <Empty icon={narrowed ? "fa-face-meh" : "fa-face-smile"} title={narrowed ? "No families match" : "No families owe"}>
            {narrowed ? "Remove a filter above to widen the list." : "Nothing is outstanding."}
          </Empty>
        )}
        <Pager page={filters.page} pages={Math.max(1, Math.ceil(total / SIZE))} total={total} from={from} size={SIZE} href={(n) => href({ page: n })} />
      </Shell>
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
    <Shell tiles={tiles} finder={finder} heading={owingHeading(total, false)} scope={scope} hint="Tick pupils to email their families a reminder" hintIcon="fa-regular fa-square-check" exportHref={hrefWith(`${BASE}/export`, state)} showHint={rows.length > 0}>
      {rows.length ? (
        <DebtorsTable rows={rows} today={today} emailReady={emailSetupProblem()} />
      ) : (
        <Empty icon={narrowed ? "fa-face-meh" : "fa-face-smile"} title={narrowed ? "Nobody matches" : "Nobody owes anything"}>
          {narrowed ? "Remove a filter above to widen the list." : "Every pupil's account is clear."}
        </Empty>
      )}
      <Pager page={filters.page} pages={Math.max(1, Math.ceil(total / SIZE))} total={total} from={from} size={SIZE} href={(n) => href({ page: n })} />
    </Shell>
  );
}

function Shell({
  tiles,
  finder,
  heading,
  scope,
  hint,
  hintIcon,
  showHint = true,
  exportHref,
  children,
}: {
  tiles: ReactNode;
  finder: ReactNode;
  heading: string;
  scope: string;
  hint: string;
  hintIcon: string;
  showHint?: boolean;
  exportHref: string;
  children: ReactNode;
}) {
  return (
    <div className="app-page ofc-page acc-page">
      <PageHeader
        kicker="Billing"
        icon="fa-hand-holding-dollar"
        title="Debtors"
        description="Balances still outstanding, across every term. Filter by how old the debt is, then email a reminder or export the list to call."
        actions={
          <a className="admin-hero-btn" href={exportHref}><i className="fa-solid fa-file-csv" aria-hidden="true" /> Export CSV</a>
        }
      />
      {tiles}
      <section className="admin-card ofc-register" aria-labelledby="debtor-results">
        {finder}
        <header className="ofc-reg-results">
          <div>
            <h2 id="debtor-results">{heading}</h2>
            <p>{scope}</p>
          </div>
          {showHint ? (
            <p className="ofc-reg-hint">
              <i className={hintIcon} aria-hidden="true" /> {hint}
            </p>
          ) : null}
        </header>
        {children}
      </section>
    </div>
  );
}
