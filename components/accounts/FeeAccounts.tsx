import { Fragment, type CSSProperties } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { ClickRow } from "@/components/accounts/client";
import { FeeFinder, type FeeFilters } from "@/components/accounts/FeeFinder";
import { Chips, Progress } from "@/components/accounts/ui";
import { StudentFace } from "@/components/StudentFace";
import { Empty, Pager } from "@/components/office/ui";
import { ACCOUNTS_BASE } from "@/lib/accounts-nav";
import { amount, day, daysBetween, hrefWith, overdueText, percent, ugx, ugxShort, type BalanceRow } from "@/lib/accounts-format";
import { className, displayPhone, studentStatusInfo, telHref } from "@/lib/students";

const BASE = `${ACCOUNTS_BASE}/students`;
export const FEE_PAGE_SIZE = 50;

const SORTS = [
  { value: "", label: "Class, then name" },
  { value: "name", label: "Name A–Z" },
  { value: "owing", label: "Largest balance" },
  { value: "oldest", label: "Longest overdue" },
  { value: "paid", label: "Recently paid" },
] as const;

export type { FeeFilters };

export type FeeTotals = {
  pupils: number;
  owing: number;
  owed: number;
  clear: number;
  credit: number;
  creditAmount: number;
  billed: number;
  collected: number;
};

function classKey(row: BalanceRow) {
  return `${row.class_code ?? ""}|${row.stream ?? ""}|${row.campus ?? ""}`;
}

function classHeading(row: BalanceRow) {
  const name = row.class_code ? className(row.class_code) : "No class";
  return [name, row.stream ? `Stream ${row.stream}` : "", row.campus ?? ""].filter(Boolean).join(" · ");
}

function scopeLine(filters: FeeFilters) {
  const sort = SORTS.find((entry) => entry.value === filters.sort)?.label.toLowerCase() ?? "class, then name";
  const parts = [
    filters.balance === "owing" ? "still owing" : filters.balance === "clear" ? "fully paid" : filters.balance === "credit" ? "in credit" : "",
    filters.class ? className(filters.class) : "",
    filters.campus,
    filters.status === "all" ? "including former pupils" : filters.status && filters.status !== "active" ? studentStatusInfo(filters.status).label.toLowerCase() : "",
    filters.q ? `matching “${filters.q}”` : "",
  ].filter(Boolean);
  if (!parts.length) return `Current pupils, every class · ${sort}`;
  const line = parts.join(" · ");
  return `${line.charAt(0).toUpperCase()}${line.slice(1)} · ${sort}`;
}

function resultsHeading(total: number, filters: FeeFilters) {
  const n = total.toLocaleString("en-GB");
  if (filters.balance === "owing") return total === 1 ? "1 pupil owes" : `${n} pupils owe`;
  if (filters.balance === "clear") return total === 1 ? "1 account is clear" : `${n} accounts are clear`;
  if (filters.balance === "credit") return total === 1 ? "1 pupil is in credit" : `${n} pupils are in credit`;
  return total === 1 ? "1 account" : `${n} accounts`;
}

function Balance({ value, note, late }: { value: number; note?: string; late?: boolean }) {
  const state = value > 0 ? "owing" : value < 0 ? "credit" : "clear";
  return (
    <span className={`fac-bal is-${state}`} title={value ? ugx(value) : undefined}>
      {value === 0 ? (
        <span className="fac-bal-sum">Cleared</span>
      ) : (
        <span className="fac-bal-sum">
          <small>UGX</small>
          {amount(Math.abs(value))}
        </span>
      )}
      {value < 0 ? <span className="fac-pill">In credit</span> : null}
      {note ? <span className={`fac-pill${late ? " is-late" : " is-due"}`}>{note}</span> : null}
    </span>
  );
}

export function FeeAccountsView({
  rows,
  total,
  page,
  from,
  filters,
  campuses,
  today,
  totals,
}: {
  rows: BalanceRow[];
  total: number;
  page: number;
  from: number;
  filters: FeeFilters;
  campuses: string[];
  today: string;
  totals: FeeTotals;
}) {
  const href = (changes: Record<string, string | number | null>) =>
    hrefWith(BASE, { ...filters, status: filters.status === "active" ? "" : filters.status }, changes);
  const rate = percent(totals.collected, totals.billed);
  const collectedShare = totals.billed ? Math.min(100, Math.round((totals.collected / totals.billed) * 100)) : 0;
  const grouped = !filters.sort && new Set(rows.map(classKey)).size > 1;
  const narrowed = Boolean(filters.q || filters.class || filters.campus || filters.balance || (filters.status && filters.status !== "active"));
  const n = (value: number) => value.toLocaleString("en-GB");
  let previous = "";
  let stripe = 0;

  return (
    <div className="app-page ofc-page acc-page fac-page">
      <PageHeader
        kicker="Billing"
        icon="fa-children"
        title="Fee accounts"
        description="Every pupil’s billed, paid and outstanding fees. Filter the register, then open a statement or take a payment."
        actions={
          <>
            <Link className="admin-hero-btn is-primary" href={`${ACCOUNTS_BASE}/payments/new`}><i className="fa-solid fa-plus" aria-hidden="true" /> Record a payment</Link>
            <Link className="admin-hero-btn" href={`${ACCOUNTS_BASE}/debtors`}><i className="fa-solid fa-hand-holding-dollar" aria-hidden="true" /> Debtors</Link>
          </>
        }
      />

      <section className="fac-board" aria-label="Fee position">
        <header className="fac-cap">
          <p>Collection position</p>
          <p>As of {day(today)}</p>
        </header>
        <div className="fac-board-main">
          <div className="fac-hero">
            {totals.billed ? (
              <span className={`fac-ring${totals.owed ? "" : " is-done"}`} title={`${rate}% of billed fees collected`}>
                <svg viewBox="0 0 36 36" aria-hidden="true">
                  <circle cx="18" cy="18" r="15" />
                  <circle className="is-value" cx="18" cy="18" r="15" pathLength={100} style={{ "--fac-rate": rate } as CSSProperties} />
                </svg>
                <em>{rate}%</em>
              </span>
            ) : null}
            <div>
              <span>{totals.billed ? "Collected" : "On the register"}</span>
              <strong>
                {totals.billed ? (
                  <>
                    <small>UGX</small> {ugxShort(totals.collected)}
                  </>
                ) : (
                  n(totals.pupils)
                )}
              </strong>
              <p>
                {totals.billed
                  ? totals.owed
                    ? `${ugxShort(totals.owed)} still to collect, of ${ugxShort(totals.billed)} billed`
                    : totals.credit
                      ? `All of ${ugxShort(totals.billed)} billed is in, plus ${ugxShort(totals.creditAmount)} ahead`
                      : `All of ${ugxShort(totals.billed)} billed is in`
                  : "Nothing billed in this view yet"}
              </p>
            </div>
          </div>
        </div>
        {totals.billed ? (
          <div className="fac-book">
            <div className="fac-book-bar" role="img" aria-label={`${rate}% collected of ${ugx(totals.billed)} billed`}>
              {collectedShare ? <span className="is-in" style={{ width: `${collectedShare}%` }} /> : null}
            </div>
            <ul className="fac-book-legend">
              <li className="is-in"><i aria-hidden="true" /> Collected <em>{ugxShort(totals.collected)}</em></li>
              <li className="is-out"><i aria-hidden="true" /> Outstanding <em>{totals.owed ? ugxShort(totals.owed) : "None"}</em></li>
              <li><i aria-hidden="true" /> Billed <em>{ugxShort(totals.billed)}</em></li>
            </ul>
          </div>
        ) : null}
      </section>

      <ul className="fac-tiles" aria-label="Fee position filters">
        <li>
          <Link
            className={`fac-tile${totals.owed ? " is-bad" : ""}${filters.balance === "owing" ? " is-on" : ""}`}
            href={href({ balance: filters.balance === "owing" ? "" : "owing" })}
            scroll={false}
            aria-current={filters.balance === "owing" ? "true" : undefined}
            title={totals.owed ? ugx(totals.owed) : undefined}
          >
            <span className="fac-tile-icon" aria-hidden="true"><i className="fa-solid fa-hand-holding-dollar" /></span>
            <span className="fac-tile-body">
              <span className="fac-tile-label">Outstanding</span>
              <strong>{totals.owed ? ugxShort(totals.owed) : "None"}</strong>
              <small>{totals.owing ? `${n(totals.owing)} ${totals.owing === 1 ? "pupil" : "pupils"}` : "Every account is clear"}</small>
            </span>
          </Link>
        </li>
        <li>
          <Link
            className={`fac-tile is-ok${filters.balance === "clear" ? " is-on" : ""}`}
            href={href({ balance: filters.balance === "clear" ? "" : "clear" })}
            scroll={false}
            aria-current={filters.balance === "clear" ? "true" : undefined}
          >
            <span className="fac-tile-icon" aria-hidden="true"><i className="fa-solid fa-circle-check" /></span>
            <span className="fac-tile-body">
              <span className="fac-tile-label">Fully paid</span>
              <strong>{n(totals.clear)}</strong>
              <small>{totals.pupils ? `${Math.round((totals.clear / totals.pupils) * 100)}% of ${n(totals.pupils)}` : "None in this view"}</small>
            </span>
          </Link>
        </li>
        <li>
          <Link
            className={`fac-tile is-credit${filters.balance === "credit" ? " is-on" : ""}`}
            href={href({ balance: filters.balance === "credit" ? "" : "credit" })}
            scroll={false}
            aria-current={filters.balance === "credit" ? "true" : undefined}
            title={totals.credit ? ugx(totals.creditAmount) : undefined}
          >
            <span className="fac-tile-icon" aria-hidden="true"><i className="fa-solid fa-coins" /></span>
            <span className="fac-tile-body">
              <span className="fac-tile-label">In credit</span>
              <strong>{n(totals.credit)}</strong>
              <small>{totals.credit ? `${ugxShort(totals.creditAmount)} paid ahead` : "No one is ahead"}</small>
            </span>
          </Link>
        </li>
        <li>
          <Link
            className={`fac-tile${filters.balance ? "" : " is-on"}`}
            href={href({ balance: "" })}
            scroll={false}
            aria-current={filters.balance ? undefined : "true"}
          >
            <span className="fac-tile-icon" aria-hidden="true"><i className="fa-solid fa-children" /></span>
            <span className="fac-tile-body">
              <span className="fac-tile-label">On roll</span>
              <strong>{n(totals.pupils)}</strong>
              <small>{filters.status === "all" ? "Every status" : "Current pupils"}</small>
            </span>
          </Link>
        </li>
      </ul>

      <section className="ofc-register" aria-labelledby="fee-results">
        <FeeFinder filters={filters} campuses={campuses} />
        <header className="fac-results">
          <div>
            <h2 id="fee-results">{resultsHeading(total, filters)}</h2>
            <p>{scopeLine(filters)}</p>
          </div>
          <Chips
            label="Account status"
            items={[
              { href: href({ balance: "" }), label: "All", count: totals.pupils, on: !filters.balance },
              { href: href({ balance: "owing" }), label: "Owing", count: totals.owing, on: filters.balance === "owing" },
              { href: href({ balance: "clear" }), label: "Clear", count: totals.clear, on: filters.balance === "clear" },
              { href: href({ balance: "credit" }), label: "Credit", count: totals.credit, on: filters.balance === "credit" },
            ]}
          />
        </header>

        {rows.length ? (
          <div className="ofc-table-scroll">
            <table className="app-table acc-table fac-table">
              <thead>
                <tr>
                  <th scope="col">Pupil</th>
                  <th scope="col" className="fac-col-class">Class</th>
                  <th scope="col">Collected</th>
                  <th scope="col" className="is-num">Balance</th>
                  <th scope="col" className="fac-col-paid">Last paid</th>
                  <th scope="col" className="ofc-col-go"><span className="visually-hidden">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const key = classKey(row);
                  const showGroup = grouped && key !== previous;
                  previous = key;
                  const overdue = row.balance > 0 && row.oldest_due ? daysBetween(row.oldest_due, today) > 0 : false;
                  const note = row.balance > 0 && row.oldest_due
                    ? [row.terms_owing > 1 ? `${row.terms_owing} terms` : "", overdueText(row.oldest_due, today)].filter(Boolean).join(" · ")
                    : "";
                  const state = row.balance > 0 ? "owing" : row.balance < 0 ? "credit" : "clear";
                  const alt = stripe++ % 2 === 1;
                  const family = row.contact_name || row.mailing_name || row.family_code;
                  const pct = row.invoiced ? percent(row.paid, row.invoiced) : null;
                  return (
                    <Fragment key={row.student_id}>
                      {showGroup ? (
                        <tr className="fac-group">
                          <td colSpan={6}>{classHeading(row)}</td>
                        </tr>
                      ) : null}
                      <ClickRow href={`${BASE}/${row.student_id}`} className={`is-${state}${alt ? " is-alt" : ""}`}>
                        <td data-label="Pupil">
                          <div className="fac-who">
                            <StudentFace id={row.student_id} name={row.full_name} className="ofc-who-avatar" />
                            <div>
                              <Link href={`${BASE}/${row.student_id}`} className="ofc-who-name">{row.full_name}</Link>
                              <span className="ofc-who-meta">
                                <span className="ofc-num">{row.student_number}</span>
                                {row.staff_child ? <em className="fac-tag is-staff">Staff child</em> : null}
                                {row.status !== "active" ? <em className="fac-tag">{studentStatusInfo(row.status).label}</em> : null}
                              </span>
                              {row.family_id && family ? (
                                <span className="fac-family">
                                  <Link href={`${ACCOUNTS_BASE}/families/${row.family_id}`}>{family}</Link>
                                  {row.contact_phone ? <a href={telHref(row.contact_phone) || undefined}>{displayPhone(row.contact_phone)}</a> : null}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="fac-col-class" data-label="Class">
                          <span className="fac-class-cell">
                            <span className="fac-class">{row.class_code ?? "—"}{row.stream ? ` ${row.stream}` : ""}</span>
                            {row.campus ? <small>{row.campus}</small> : null}
                          </span>
                        </td>
                        <td data-label="Collected" className={`fac-rate is-${state}`}>
                          {row.invoiced ? <Progress value={Math.min(row.paid, row.invoiced)} max={row.invoiced} label={`${row.full_name} collected`} /> : null}
                          <span className="fac-rate-note">
                            {pct !== null ? <strong>{pct}%</strong> : null}
                            {pct !== null ? ` · ${amount(row.paid)} of ${amount(row.invoiced)}` : row.paid ? `${amount(row.paid)} paid, nothing billed` : "Nothing billed"}
                          </span>
                        </td>
                        <td className="is-num" data-label="Balance">
                          <Balance value={row.balance} note={note} late={overdue} />
                        </td>
                        <td className="fac-col-paid" data-label="Last paid">
                          {row.last_paid_on ? <span className="fac-paid">{day(row.last_paid_on)}</span> : <span className="app-muted">No payment yet</span>}
                        </td>
                        <td className="ofc-col-go" aria-hidden="true"><i className="fa-solid fa-chevron-right" /></td>
                      </ClickRow>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={narrowed ? "fa-face-meh" : "fa-children"} title={narrowed ? "No pupils match" : "No pupils yet"}>
            {narrowed ? "Remove a filter above to widen the list." : "Pupils appear here once they are enrolled."}
          </Empty>
        )}
        <Pager page={page} pages={Math.max(1, Math.ceil(total / FEE_PAGE_SIZE))} total={total} from={from} size={FEE_PAGE_SIZE} href={(n) => href({ page: n })} />
      </section>
    </div>
  );
}
