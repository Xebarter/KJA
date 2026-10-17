import Link from "next/link";
import type { ChildRow, FeeRow, ReceiptRow } from "@/lib/account";
import { StudentFace } from "@/components/StudentFace";
import { FeePay } from "@/components/account/FeePay";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY = 86_400_000;

const STATUS: Record<string, string> = {
  graduated: "Graduated",
  transferred: "Transferred",
  withdrawn: "Withdrawn",
  left: "Left",
};

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

function owingFirst(a: FeeRow, b: FeeRow) {
  return String(a.due_on || "9999").localeCompare(String(b.due_on || "9999"));
}

function firstName(name: string) {
  return name.split(/\s+/)[0] || name;
}

export function FeesView({
  kids,
  fees,
  receipts = [],
  childId,
  payerPhone = "",
  online = false,
}: {
  kids: ChildRow[];
  fees: FeeRow[];
  receipts?: ReceiptRow[];
  childId?: string;
  payerPhone?: string;
  online?: boolean;
}) {
  const today = kampalaToday();
  const selected = kids.find((child) => child.id === childId);
  const shown = selected ? [selected] : kids;
  const cards = shown
    .map((child) => {
      const rows = fees.filter((row) => row.child_id === child.id).sort(newestFirst);
      const sum = totals(rows);
      const childReceipts = receipts.filter((row) => row.child_id === child.id);
      const next = rows.filter((row) => money(row).balance > 0 && row.due_on).sort(owingFirst)[0];
      const overdue = rows.filter((row) => status(row, today).tone === "overdue").length;
      return { child, rows, sum, receipts: childReceipts, next, overdue };
    })
    .sort((a, b) => b.sum.balance - a.sum.balance || a.child.full_name.localeCompare(b.child.full_name));

  const visibleFees = shown.flatMap((child) => fees.filter((row) => row.child_id === child.id));
  const sum = totals(visibleFees);
  const paidPercent = sum.due ? Math.min(100, Math.round((sum.paid / sum.due) * 100)) : kids.length ? 100 : 0;
  const owingChildren = cards.filter((card) => card.sum.balance > 0).length;
  const clearedChildren = cards.filter((card) => card.rows.length > 0 && !card.sum.balance).length;
  const nextRow = visibleFees.filter((row) => money(row).balance > 0 && row.due_on).sort(owingFirst)[0];
  const nextDays = nextRow?.due_on ? daysFrom(today, nextRow.due_on) : 0;
  const nextChild = nextRow ? kids.find((child) => child.id === nextRow.child_id) : undefined;

  return (
    <div className="ov fe">
      <section className="ch-hero fe-hero">
        <div className="ch-hero-copy">
          <p className="ch-kicker">Finance</p>
          <h1>School fees</h1>
          <p>
            {kids.length
              ? "Every child the admissions office has enrolled on your family, with what has been billed, what you have paid, and what is still owing."
              : "Fee balances appear here once the admissions office enrols your children."}
          </p>
        </div>
        {kids.length ? (
          <dl className="ch-hero-stats">
            <div>
              <dt>Still owing</dt>
              <dd className="fe-hero-amount">{sum.balance ? ugx(sum.balance) : "Nil"}</dd>
            </div>
            <div>
              <dt>Paid</dt>
              <dd>{paidPercent}%</dd>
            </div>
          </dl>
        ) : null}
      </section>

      {!kids.length ? (
        <section className="ov-panel">
          <div className="ov-empty">
            <i className="fa-solid fa-children" aria-hidden="true" />
            <p>Children appear here when the admissions office enrols them on your family. Their fees show on each child once the accounts office issues them.</p>
          </div>
        </section>
      ) : (
        <>
          {kids.length > 1 ? (
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
                    {firstName(child.full_name)}
                    <span className={owed ? "is-owed" : "is-clear"}>{owed ? ugx(owed).replace("UGX ", "") : <i className="fa-solid fa-check" aria-label="Cleared" />}</span>
                  </Link>
                );
              })}
            </nav>
          ) : null}

          <section className={`fe-meter${sum.balance ? "" : " is-clear"}`} aria-label="Fee progress">
            <div className="fe-meter-copy">
              <p className="fe-label">{selected ? `${firstName(selected.full_name)}'s fees` : "Family fees"}</p>
              <p className="fe-amount">{sum.balance ? ugx(sum.balance) : sum.due ? "All paid up" : "Nothing billed yet"}</p>
              <div className="fe-progress" role="progressbar" aria-valuenow={paidPercent} aria-valuemin={0} aria-valuemax={100} aria-label="Share of fees paid">
                <span style={{ width: `${paidPercent}%` }} />
              </div>
              <p className="fe-progress-meta">
                <span>{ugx(sum.paid)} paid of {ugx(sum.due)}</span>
                <strong>{paidPercent}%</strong>
              </p>
            </div>
            <dl>
              <div>
                <dt>Children</dt>
                <dd>{shown.length}</dd>
                <small>{owingChildren ? `${owingChildren} still owing` : clearedChildren ? "All cleared" : "No bills yet"}</small>
              </div>
              <div>
                <dt>Billed</dt>
                <dd>{ugx(sum.due)}</dd>
                <small>Issued by the accounts office</small>
              </div>
              <div>
                <dt>Paid</dt>
                <dd>{ugx(sum.paid)}</dd>
                <small>{paidPercent}% of what was billed</small>
              </div>
              <div>
                <dt>Next due</dt>
                <dd>{nextRow?.due_on ? shortDate(nextRow.due_on, false) : "—"}</dd>
                <small>
                  {nextRow?.due_on
                    ? `${nextDays < 0 ? `${-nextDays}d overdue` : nextDays === 0 ? "Due today" : `In ${nextDays}d`}${nextChild && !selected ? ` · ${firstName(nextChild.full_name)}` : ""}`
                    : "No date set"}
                </small>
              </div>
            </dl>
          </section>

          <div className="fe-children">
            {cards.map(({ child, rows, sum: childSum, receipts: childReceipts, next, overdue }) => {
              const percent = childSum.due ? Math.min(100, Math.round((childSum.paid / childSum.due) * 100)) : 0;
              const payable = rows
                .filter((row) => row.term_id && money(row).balance > 0)
                .sort(owingFirst)
                .map((row) => ({ id: row.term_id as string, label: row.term, balance: money(row).balance, dueOn: row.due_on }));
              const nextDaysForChild = next?.due_on ? daysFrom(today, next.due_on) : 0;
              const enrolment = child.status && child.status !== "active" ? STATUS[child.status] || "" : "";
              const subtitle = [child.grade, child.campus ? `${child.campus} campus` : "", child.student_code ? `#${child.student_code}` : "", enrolment].filter(Boolean).join(" · ");

              return (
                <article className={`fe-child${childSum.balance ? "" : rows.length ? " is-clear" : ""}`} key={child.id} id={`child-${child.id}`}>
                  <header className="fe-child-head">
                    <StudentFace id={child.id} name={child.full_name} photoPath={child.photo_path} className="ch-avatar" />
                    <div>
                      <h2>{child.full_name}</h2>
                      <p>{subtitle || "On the school register"}</p>
                    </div>
                    <span className={`fe-child-owing${childSum.balance ? "" : " is-clear"}`}>
                      <small>{childSum.balance ? "Still owing" : rows.length ? "Status" : "Fees"}</small>
                      {childSum.balance ? ugx(childSum.balance) : rows.length ? "Cleared" : "Not billed"}
                    </span>
                  </header>

                  {rows.length ? (
                    <>
                      <div className="fe-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={`Fees paid for ${child.full_name}`}>
                        <span style={{ width: `${percent}%` }} />
                      </div>
                      <p className="fe-progress-meta">
                        <span>{ugx(childSum.paid)} paid of {ugx(childSum.due)}</span>
                        <strong>{percent}%</strong>
                      </p>

                      <dl className="fe-split">
                        <div>
                          <dt>Billed</dt>
                          <dd>{ugx(childSum.due)}</dd>
                        </div>
                        <div>
                          <dt>Paid</dt>
                          <dd>{ugx(childSum.paid)}</dd>
                        </div>
                        <div>
                          <dt>Balance</dt>
                          <dd>{childSum.balance ? ugx(childSum.balance) : "Nil"}</dd>
                        </div>
                        <div>
                          <dt>Next due</dt>
                          <dd className={nextDaysForChild < 0 ? "is-late" : ""}>
                            {next?.due_on ? shortDate(next.due_on) : childSum.balance ? "Not set" : "—"}
                          </dd>
                        </div>
                      </dl>

                      {overdue ? (
                        <p className="fe-warning"><i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> {overdue === 1 ? "One term is" : `${overdue} terms are`} past the due date.</p>
                      ) : null}

                      <div className="fe-statement" role="table" aria-label={`Fee statement for ${child.full_name}`}>
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

                      {payable.length ? (
                        <FeePay
                          childId={child.id}
                          childName={child.full_name}
                          studentCode={child.student_code}
                          terms={payable}
                          phone={payerPhone}
                          online={online}
                        />
                      ) : (
                        <p className="fe-cleared"><i className="fa-solid fa-circle-check" aria-hidden="true" /> Every issued term is fully paid.</p>
                      )}

                      {childReceipts.length ? (
                        <div className="fe-child-receipts">
                          <h3>Recent receipts</h3>
                          <ul>
                            {childReceipts.slice(0, 4).map((receipt) => (
                              <li key={receipt.id}>
                                <a href={`/account/fees/receipt/${receipt.id}`}>
                                  <strong>{receipt.receipt_no}</strong>
                                  <span>{[receipt.method, shortDate(receipt.paid_on)].filter(Boolean).join(" · ")}</span>
                                </a>
                                <em>{ugx(receipt.amount)}</em>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="fe-none">No fees have been issued for {firstName(child.full_name)} yet. They appear here when the accounts office bills this child.</p>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}

      <aside className="rp-help">
        <span className="rp-help-icon"><i className="fa-solid fa-headset" aria-hidden="true" /></span>
        <div>
          <strong>A payment is missing?</strong>
          <p>Bank and SchoolPay payments show here after the accounts office records them. Send a copy of the receipt if one is not listed yet.</p>
        </div>
        <Link className="ov-btn ov-btn-dark" href="/account/messages">Message the school</Link>
      </aside>
    </div>
  );
}
