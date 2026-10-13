import Link from "next/link";
import type { ChildRow, FeeRow } from "@/lib/account";
import { initials } from "@/lib/applications";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY = 86_400_000;

function kampalaToday() {
  return new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
}

function ymd(value: string | null | undefined) {
  const [y, m, d] = (value || "").slice(0, 10).split("-").map(Number);
  return y && m && d ? { y, m, d, time: Date.UTC(y, m - 1, d) } : null;
}

function shortDate(value: string | null | undefined, withYear = true) {
  const date = ymd(value);
  if (!date) return "";
  return `${date.d} ${MONTHS[date.m - 1]}${withYear ? ` ${date.y}` : ""}`;
}

function daysFrom(today: string, value: string) {
  const a = ymd(today);
  const b = ymd(value);
  return a && b ? Math.round((b.time - a.time) / DAY) : 0;
}

function ugx(value: number) {
  return `UGX ${Math.round(value).toLocaleString("en-US")}`;
}

function money(row: FeeRow) {
  const due = Number(row.amount_due) || 0;
  const paid = Number(row.amount_paid) || 0;
  return { due, paid, balance: Math.max(0, due - paid), percent: due ? Math.min(100, Math.round((paid / due) * 100)) : 100 };
}

function status(row: FeeRow, today: string) {
  const { paid, balance } = money(row);
  if (!balance) return { tone: "paid", label: "Paid", icon: "fa-circle-check" };
  if (row.due_on && row.due_on.slice(0, 10) < today) return { tone: "overdue", label: "Overdue", icon: "fa-triangle-exclamation" };
  if (paid > 0) return { tone: "part", label: "Part paid", icon: "fa-circle-half-stroke" };
  return { tone: "due", label: "Due", icon: "fa-clock" };
}

function totals(rows: FeeRow[]) {
  return rows.reduce(
    (sum, row) => {
      const m = money(row);
      return { due: sum.due + m.due, paid: sum.paid + m.paid, balance: sum.balance + m.balance };
    },
    { due: 0, paid: 0, balance: 0 },
  );
}

function newestFirst(a: FeeRow, b: FeeRow) {
  return String(b.due_on || "").localeCompare(String(a.due_on || ""));
}

export function FeesView({ kids, fees, childId }: { kids: ChildRow[]; fees: FeeRow[]; childId?: string }) {
  const today = kampalaToday();
  const selected = kids.find((child) => child.id === childId);
  const visible = selected ? fees.filter((row) => row.child_id === selected.id) : fees;
  const sum = totals(visible);
  const all = totals(fees);
  const paidPercent = sum.due ? Math.min(100, Math.round((sum.paid / sum.due) * 100)) : 100;
  const nextRow = visible
    .filter((row) => money(row).balance > 0 && row.due_on)
    .sort((a, b) => String(a.due_on).localeCompare(String(b.due_on)))[0];
  const nextDays = nextRow?.due_on ? daysFrom(today, nextRow.due_on) : 0;
  const overdue = visible.filter((row) => status(row, today).tone === "overdue").length;

  const known = new Set(kids.map((child) => child.id));
  const groups = [
    ...(selected ? [selected] : kids).map((child) => ({ id: child.id, child, rows: visible.filter((row) => row.child_id === child.id) })),
    ...(!selected && fees.some((row) => !known.has(row.child_id))
      ? [{ id: "other", child: undefined, rows: fees.filter((row) => !known.has(row.child_id)) }]
      : []),
  ]
    .map((group) => ({ ...group, rows: [...group.rows].sort(newestFirst) }))
    .filter((group) => group.rows.length);

  return (
    <div className="ov fe">
      <section className="ch-hero fe-hero">
        <div className="ch-hero-copy">
          <p className="ch-kicker">Finance</p>
          <h1>School fees</h1>
          <p>Balances are updated by the school accounts office. Pay using the details on your term invoice.</p>
        </div>
        {fees.length ? (
          <dl className="ch-hero-stats">
            <div>
              <dt>Outstanding</dt>
              <dd className="fe-hero-amount">{all.balance ? ugx(all.balance) : "Nil"}</dd>
            </div>
            <div>
              <dt>Paid</dt>
              <dd>{all.due ? Math.min(100, Math.round((all.paid / all.due) * 100)) : 100}%</dd>
            </div>
          </dl>
        ) : null}
      </section>

      {kids.length > 1 && fees.length ? (
        <nav className="rp-tabs fe-tabs" aria-label="Filter fees by child">
          <Link href="/account/fees" className={selected ? "" : "is-active"} aria-current={selected ? undefined : "page"}>
            All children
          </Link>
          {kids.map((child) => {
            const owed = totals(fees.filter((row) => row.child_id === child.id)).balance;
            return (
              <Link
                key={child.id}
                href={`/account/fees?child=${child.id}`}
                className={selected?.id === child.id ? "is-active" : ""}
                aria-current={selected?.id === child.id ? "page" : undefined}
              >
                {child.full_name.split(/\s+/)[0]}
                <span className={owed ? "is-owed" : "is-clear"}>{owed ? ugx(owed).replace("UGX ", "") : <i className="fa-solid fa-check" aria-label="Cleared" />}</span>
              </Link>
            );
          })}
        </nav>
      ) : null}

      {!kids.length ? (
        <section className="ov-panel">
          <div className="ov-empty">
            <i className="fa-solid fa-children" aria-hidden="true" />
            <p>Add your children to your account and their fee balances will appear here once the accounts office links them.</p>
            <Link className="ov-btn ov-btn-dark" href="/account/children">Add a child</Link>
          </div>
        </section>
      ) : !visible.length ? (
        <section className="ov-panel">
          <div className="ov-empty">
            <i className="fa-solid fa-receipt" aria-hidden="true" />
            <p>
              No fee records for {selected ? selected.full_name.split(/\s+/)[0] : "your children"} yet. They&apos;ll appear here once the
              accounts office links them to your account.
            </p>
            <Link className="ov-btn ov-btn-outline" href="/fees">View the fee structure</Link>
          </div>
        </section>
      ) : (
        <>
          <div className="fe-summary">
            <section className={`fe-balance${sum.balance ? "" : " is-clear"}`}>
              <p className="fe-label">{selected ? `${selected.full_name.split(/\s+/)[0]}'s balance` : "Outstanding balance"}</p>
              <p className="fe-amount">{sum.balance ? ugx(sum.balance) : "All paid up"}</p>
              <div className="fe-progress" role="progressbar" aria-valuenow={paidPercent} aria-valuemin={0} aria-valuemax={100} aria-label="Fees paid">
                <span style={{ width: `${paidPercent}%` }} />
              </div>
              <p className="fe-progress-meta">
                <span>{ugx(sum.paid)} paid of {ugx(sum.due)}</span>
                <strong>{paidPercent}%</strong>
              </p>
              {nextRow?.due_on ? (
                <div className={`fe-next${nextDays < 0 ? " is-late" : nextDays <= 14 ? " is-soon" : ""}`}>
                  <time className="fe-next-date" dateTime={nextRow.due_on.slice(0, 10)}>
                    <span>{MONTHS[(ymd(nextRow.due_on)?.m || 1) - 1]}</span>
                    <strong>{ymd(nextRow.due_on)?.d}</strong>
                  </time>
                  <div>
                    <strong>
                      {nextDays < 0
                        ? `Overdue by ${-nextDays} ${-nextDays === 1 ? "day" : "days"}`
                        : nextDays === 0
                          ? "Due today"
                          : `Due in ${nextDays} ${nextDays === 1 ? "day" : "days"}`}
                    </strong>
                    <span>{ugx(money(nextRow).balance)} · {nextRow.term}</span>
                  </div>
                </div>
              ) : !sum.balance ? (
                <p className="fe-cleared"><i className="fa-solid fa-circle-check" aria-hidden="true" /> Thank you, every term is fully paid.</p>
              ) : null}
              {overdue > 1 ? (
                <p className="fe-warning"><i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> {overdue} terms are past their due date.</p>
              ) : null}
            </section>

            <section className="fe-pay">
              <h2>How to pay</h2>
              <ol>
                <li>
                  <span>1</span>
                  <p><strong>Use your term invoice.</strong> Pay to the bank account shown on the invoice from the school.</p>
                </li>
                <li>
                  <span>2</span>
                  <p><strong>Add a reference.</strong> Quote your child&apos;s full name and student number.</p>
                </li>
                <li>
                  <span>3</span>
                  <p><strong>Keep your receipt.</strong> The accounts office records the payment and your balance updates here.</p>
                </li>
              </ol>
              <div className="fe-pay-actions">
                <Link className="ov-btn ov-btn-dark" href="/account/messages">
                  <i className="fa-solid fa-comments" aria-hidden="true" /> Ask the accounts office
                </Link>
                <Link className="fe-pay-link" href="/fees">
                  Fee structure <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                </Link>
              </div>
            </section>
          </div>

          {groups.map(({ id, child, rows }) => {
            const groupSum = totals(rows);
            return (
              <section className="ov-panel fe-group" key={id}>
                <header className="fe-group-head">
                  <span className="ov-child-avatar" aria-hidden="true">{child ? initials(child.full_name) : <i className="fa-solid fa-receipt" />}</span>
                  <div>
                    <h2>{child ? child.full_name : "Other fee records"}</h2>
                    <p>{child ? [child.grade, child.campus ? `${child.campus} campus` : ""].filter(Boolean).join(" · ") || "Fee statement" : "Not linked to a child on your account"}</p>
                  </div>
                  <span className={`fe-group-total${groupSum.balance ? "" : " is-clear"}`}>
                    <small>{groupSum.balance ? "Balance" : "Status"}</small>
                    {groupSum.balance ? ugx(groupSum.balance) : "Cleared"}
                  </span>
                </header>

                <div className="fe-statement" role="table" aria-label={`Fee statement${child ? ` for ${child.full_name}` : ""}`}>
                  <div className="fe-row fe-row-head" role="row">
                    <span role="columnheader">Term</span>
                    <span role="columnheader">Amount</span>
                    <span role="columnheader">Paid</span>
                    <span role="columnheader">Balance</span>
                    <span className="fe-due" role="columnheader">Due date</span>
                    <span className="fe-status" role="columnheader">Status</span>
                  </div>
                  {rows.map((row) => {
                    const m = money(row);
                    const s = status(row, today);
                    return (
                      <div className={`fe-row is-${s.tone}`} role="row" key={row.id}>
                        <span className="fe-term" role="cell">
                          <strong>{row.term}</strong>
                          {row.description ? <small>{row.description}</small> : null}
                          <span className="fe-mini" aria-hidden="true"><i style={{ width: `${m.percent}%` }} /></span>
                        </span>
                        <span className="fe-num" role="cell" data-label="Amount">{ugx(m.due)}</span>
                        <span className="fe-num" role="cell" data-label="Paid">{ugx(m.paid)}</span>
                        <span className="fe-num fe-num-balance" role="cell" data-label="Balance">{m.balance ? ugx(m.balance) : "—"}</span>
                        <span className="fe-due" role="cell" data-label="Due date">{row.due_on ? shortDate(row.due_on) : "—"}</span>
                        <span className="fe-status" role="cell">
                          <span className={`fe-pill fe-pill--${s.tone}`}>
                            <i className={`fa-solid ${s.icon}`} aria-hidden="true" /> {s.label}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </>
      )}

      <aside className="rp-help">
        <span className="rp-help-icon"><i className="fa-solid fa-headset" aria-hidden="true" /></span>
        <div>
          <strong>Something doesn&apos;t look right?</strong>
          <p>If a payment you made isn&apos;t showing yet, send the accounts office a message with a copy of your receipt.</p>
        </div>
        <Link className="ov-btn ov-btn-dark" href="/account/messages">Message the school</Link>
      </aside>
    </div>
  );
}
