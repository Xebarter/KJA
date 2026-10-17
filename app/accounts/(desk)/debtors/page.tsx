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
import { loadFeeBook, type FeePupil } from "@/lib/accounts-roll";
import { emailSetupProblem } from "@/lib/email/send";
import { SCHOOL_CLASSES, className as classLabel, fetchAll } from "@/lib/students";
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

  let book: FeePupil[] | null = null;
  let everyone: { balance: number; oldest_due: string | null; family_id: string | null }[];
  if (!filters.q) {
    try {
      book = await loadFeeBook(supabase);
    } catch (error) {
      return notReady("Debtors", { kind: "schema", message: error instanceof Error ? error.message : "Couldn't load balances." });
    }
    everyone = book.filter((pupil) => debtorScope(pupil, filters)).map((pupil) => ({ balance: pupil.balance, oldest_due: pupil.oldest_due, family_id: pupil.family_id }));
  } else {
    try {
      everyone = await fetchAll((a, b) => debtorsBase(supabase, filters, "student_id, balance, oldest_due, family_id").order("student_id").range(a, b));
    } catch (error) {
      return notReady("Debtors", { kind: "schema", message: error instanceof Error ? error.message : "Couldn't load balances." });
    }
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
    if (book) {
      const grouped = new Map<string, { balance: number; oldest_due: string | null; last_paid_on: string | null; children: number }>();
      for (const pupil of book) {
        if (!pupil.family_id) continue;
        const group = grouped.get(pupil.family_id) ?? { balance: 0, oldest_due: null, last_paid_on: null, children: 0 };
        group.balance += pupil.balance;
        if (pupil.status === "active") group.children += 1;
        if (pupil.oldest_due && (!group.oldest_due || pupil.oldest_due < group.oldest_due)) group.oldest_due = pupil.oldest_due;
        if (pupil.last_paid_on && (!group.last_paid_on || pupil.last_paid_on > group.last_paid_on)) group.last_paid_on = pupil.last_paid_on;
        grouped.set(pupil.family_id, group);
      }
      let familyRows = [...grouped.entries()]
        .filter(([, group]) => group.balance > 0)
        .filter(([, group]) => !filters.aging || agingOf(group.oldest_due, today) === filters.aging)
        .filter(([, group]) => !filters.min || group.balance >= filters.min);
      if (filters.sort === "name" && familyRows.length) {
        const ids = familyRows.map(([id]) => id);
        const { data: named } = await supabase.from("families").select("id, mailing_name").in("id", ids);
        const names = new Map((named || []).map((row) => [row.id, row.mailing_name || ""]));
        familyRows.sort((a, b) => (names.get(a[0]) || "").localeCompare(names.get(b[0]) || ""));
      } else {
        familyRows.sort((a, b) => {
          if (filters.sort === "oldest") return (a[1].oldest_due || "9999").localeCompare(b[1].oldest_due || "9999") || b[1].balance - a[1].balance;
          return b[1].balance - a[1].balance;
        });
      }
      const pageIds = familyRows.slice(from, from + SIZE).map(([id]) => id);
      const [homes, guardians] = await Promise.all([
        pageIds.length ? supabase.from("families").select("id, family_code, mailing_name").in("id", pageIds) : Promise.resolve({ data: [] as { id: string; family_code: string | null; mailing_name: string | null }[] }),
        pageIds.length ? supabase.from("guardians").select("family_id, full_name, phone, email, is_primary, relationship").in("family_id", pageIds) : Promise.resolve({ data: [] as Contact[] }),
      ]);
      const home = new Map((homes.data || []).map((row) => [row.id, row]));
      const contact = contactsByFamily((guardians.data || []) as Contact[]);
      const rows: FamilyDebtorRow[] = familyRows.slice(from, from + SIZE).map(([id, group]) => {
        const person = contact.get(id);
        return {
          family_id: id,
          family_code: home.get(id)?.family_code ?? null,
          mailing_name: home.get(id)?.mailing_name ?? null,
          contact_name: person?.full_name ?? null,
          contact_phone: person?.phone ?? null,
          contact_email: person?.email ?? null,
          children: group.children,
          balance: group.balance,
          oldest_due: group.oldest_due,
          last_paid_on: group.last_paid_on,
        };
      });
      const total = familyRows.length;
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

  let base: Omit<DebtorRow, "last_reminded">[];
  let total: number;
  if (book) {
    const classOrder = new Map<string, number>(SCHOOL_CLASSES.map((entry) => [entry.code, entry.order]));
    const matched = book
      .filter((pupil) => debtorScope(pupil, filters))
      .filter((pupil) => !filters.aging || agingOf(pupil.oldest_due, today) === filters.aging)
      .filter((pupil) => !filters.min || pupil.balance >= filters.min);
    matched.sort((a, b) => {
      if (filters.sort === "oldest") return (a.oldest_due || "9999").localeCompare(b.oldest_due || "9999") || b.balance - a.balance;
      if (filters.sort === "class") return (classOrder.get(a.class_code || "") ?? 99) - (classOrder.get(b.class_code || "") ?? 99) || a.full_name.localeCompare(b.full_name);
      if (filters.sort === "name") return a.full_name.localeCompare(b.full_name);
      return b.balance - a.balance || a.full_name.localeCompare(b.full_name);
    });
    total = matched.length;
    const pagePupils = matched.slice(from, from + SIZE);
    const familyIds = [...new Set(pagePupils.map((row) => row.family_id).filter((id): id is string => Boolean(id)))];
    const [homes, guardians] = await Promise.all([
      familyIds.length ? supabase.from("families").select("id, family_code, mailing_name").in("id", familyIds) : Promise.resolve({ data: [] as { id: string; family_code: string | null; mailing_name: string | null }[] }),
      familyIds.length ? supabase.from("guardians").select("family_id, full_name, phone, email, is_primary, relationship").in("family_id", familyIds) : Promise.resolve({ data: [] as Contact[] }),
    ]);
    const home = new Map((homes.data || []).map((row) => [row.id, row]));
    const contact = contactsByFamily((guardians.data || []) as Contact[]);
    base = pagePupils.map((pupil) => {
      const person = pupil.family_id ? contact.get(pupil.family_id) : undefined;
      return {
        student_id: pupil.id,
        full_name: pupil.full_name,
        student_number: pupil.student_number,
        class_code: pupil.class_code,
        stream: pupil.stream,
        family_id: pupil.family_id,
        mailing_name: pupil.family_id ? home.get(pupil.family_id)?.mailing_name ?? null : null,
        contact_name: person?.full_name ?? null,
        contact_phone: person?.phone ?? null,
        contact_email: person?.email ?? null,
        balance: pupil.balance,
        oldest_due: pupil.oldest_due,
        last_paid_on: pupil.last_paid_on,
        terms_owing: pupil.terms_owing,
      };
    });
  } else {
    const { data, count, error } = await debtorsQuery(supabase, filters, "*", true).range(from, from + SIZE - 1);
    if (error) return notReady("Debtors", { kind: "schema", message: error.message });
    base = (data || []) as unknown as Omit<DebtorRow, "last_reminded">[];
    total = count ?? 0;
  }
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

function debtorScope(pupil: FeePupil, filters: DebtorFilters) {
  if (filters.pupils === "" && pupil.status !== "active") return false;
  if (filters.pupils === "left" && pupil.status === "active") return false;
  if (filters.class && pupil.class_code !== filters.class) return false;
  if (filters.campus && (pupil.campus || "") !== filters.campus) return false;
  return pupil.balance > 0;
}

type Contact = { family_id: string; full_name: string | null; phone: string | null; email: string | null; is_primary: boolean; relationship: string | null };

function contactsByFamily(rows: Contact[]) {
  const grouped = new Map<string, Contact[]>();
  for (const row of rows) {
    const list = grouped.get(row.family_id) ?? [];
    list.push(row);
    grouped.set(row.family_id, list);
  }
  const picked = new Map<string, Contact>();
  for (const [id, list] of grouped) {
    picked.set(id, [...list].sort((a, b) => {
      if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
      if (Boolean(a.email) !== Boolean(b.email)) return a.email ? -1 : 1;
      if ((a.relationship === "guardian") !== (b.relationship === "guardian")) return a.relationship === "guardian" ? 1 : -1;
      return (b.relationship || "").localeCompare(a.relationship || "");
    })[0]);
  }
  return picked;
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
