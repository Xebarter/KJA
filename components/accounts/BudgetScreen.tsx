import Link from "next/link";
import { BudgetField, BudgetFinder, MonthStrip, PrintBudget } from "@/components/accounts/BudgetField";
import { ColumnChart, ExpenseStatus, Progress } from "@/components/accounts/ui";
import { Empty } from "@/components/office/ui";
import { ACCOUNTS_BASE } from "@/lib/accounts";
import { amount, hrefWith, ugx, ugxShort } from "@/lib/accounts-format";
import {
  TONE_LABEL,
  addMonths,
  buildBudget,
  monthEnd,
  monthLabel,
  usedPercent,
  type BudgetRow,
  type BudgetTone,
} from "@/lib/budget";

const BASE = `${ACCOUNTS_BASE}/budgeting`;

const FOCUS_SCOPE: Record<string, string> = {
  attention: "that need a look",
  over: "over the plan",
  track: "on track",
  open: "with no monthly plan",
};

function leftNote(row: BudgetRow) {
  if (row.monthly === null) return "No monthly plan";
  const left = row.monthly - row.spent;
  if (left < 0) return `${amount(-left)} over`;
  if (row.waiting > left) return `${amount(left)} left · waiting is more`;
  return `${amount(left)} left`;
}

function yearNote(row: BudgetRow, months: number) {
  if (row.monthly === null) return row.yearSpent ? `${amount(row.yearSpent)} spent so far` : "Nothing spent yet";
  const planned = row.monthly * months;
  const left = planned - row.yearSpent;
  return left < 0 ? `${amount(-left)} over ${months} ${months === 1 ? "month" : "months"}` : `${amount(left)} left of ${amount(planned)}`;
}

function toneClass(tone: BudgetTone) {
  if (tone === "over") return "is-over";
  if (tone === "close") return "is-close";
  if (tone === "open" || tone === "idle") return "is-open";
  return "";
}

function rateTone(used: number, over: boolean): "ok" | "tight" | "over" {
  if (over || used > 100) return "over";
  if (used >= 85) return "tight";
  return "ok";
}

function RateRing({ percent, tone, label }: { percent: number; tone: "ok" | "tight" | "over"; label: string }) {
  const shown = Math.min(100, Math.max(0, percent));
  return (
    <span className={`aov-rate is-${tone}`} title={label}>
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r="15" />
        <circle className="is-value" cx="18" cy="18" r="15" pathLength={100} style={{ "--aov-rate": shown } as React.CSSProperties} />
      </svg>
      <em>{percent > 999 ? "999+" : `${percent}%`}</em>
    </span>
  );
}

export function BudgetingView({ month, today, focus, q, book, outstanding, visible, counts, alerts }: {
  month: string;
  today: string;
  focus: string;
  q: string;
  book: ReturnType<typeof buildBudget>;
  outstanding: number;
  visible: BudgetRow[];
  counts: { attention: number; over: number; track: number; open: number };
  alerts: { row: BudgetRow; text: string }[];
}) {
  const year = Number(month.slice(0, 4));
  const label = monthLabel(month);
  const short = monthLabel(month, "short");
  const through = `${monthLabel(`${year}-01`, "short")}–${short}`;
  const filters = { month, focus, q };
  const href = (changes: Record<string, string | number | null>) => hrefWith(BASE, filters, changes);
  const left = book.plan - book.spent;
  const cash = book.collected - book.spent;
  const used = book.plan ? usedPercent(book.spent, book.plan) : 0;
  const yearUsed = book.toDatePlan ? usedPercent(book.toDateSpent, book.toDatePlan) : 0;
  const feeUsed = book.collected ? usedPercent(book.spent, book.collected) : 0;
  const pace = book.monthIndex > 0 ? Math.round(book.toDateSpent / book.monthIndex * 12) : 0;
  const years = [...new Set([year - 1, year, year + 1, Number(today.slice(0, 4))])].filter((entry) => entry >= 2000 && entry <= 2100).sort((a, b) => a - b);
  const thisMonth = today.slice(0, 7);
  const expenseHref = (category: string | null) => hrefWith(`${ACCOUNTS_BASE}/expenses`, {}, { category: category ?? "", month });
  const overBy = book.rows.reduce((total, row) => total + (row.tone === "over" && row.monthly !== null ? row.spent - row.monthly : 0), 0);
  const scope = [FOCUS_SCOPE[focus] ? `${label}, ${FOCUS_SCOPE[focus]}` : label, q ? `matching “${q}”` : ""].filter(Boolean).join(" · ");
  const count = (value: number) => value.toLocaleString("en-GB");

  const tiles = [
    {
      key: "",
      label: "All categories",
      icon: "fa-layer-group",
      tone: "navy",
      count: book.rows.length,
      note: book.plan ? `${ugxShort(book.plan)} planned a month` : "No monthly plan yet",
    },
    {
      key: "attention",
      label: "Needs a look",
      icon: "fa-eye",
      tone: "warn",
      count: counts.attention,
      note: counts.attention ? "Over, close, or no plan" : "Nothing to review",
    },
    {
      key: "over",
      label: "Over the plan",
      icon: "fa-arrow-trend-up",
      tone: "over",
      count: counts.over,
      note: counts.over ? `${ugxShort(overBy)} past the plan` : "None over",
    },
    {
      key: "track",
      label: "On track",
      icon: "fa-circle-check",
      tone: "ok",
      count: counts.track,
      note: counts.track ? "Inside the monthly plan" : "None on track yet",
    },
    {
      key: "open",
      label: "No plan",
      icon: "fa-pen",
      tone: "med",
      count: counts.open,
      note: counts.open ? "Add a monthly amount" : "Every category is planned",
    },
  ];

  return (
    <div className="app-page ofc-page acc-page aov-page bgt-page">
      <header className="aov-head">
        <div>
          <p className="aov-kicker">
            <i className="fa-solid fa-scale-balanced" aria-hidden="true" /> Spending
          </p>
          <h1>Budgeting</h1>
          <p className="aov-lede">
            <span className="aov-term">{label}</span>
            <span>Monthly plans beside what has already been spent, and what is still waiting for approval.</span>
          </p>
        </div>
        <div className="aov-actions bgt-no-print">
          <Link className="aov-btn" href={hrefWith(`${BASE}/export`, filters)}>
            <i className="fa-solid fa-file-csv" aria-hidden="true" /> Download CSV
          </Link>
          <PrintBudget />
          <Link className="aov-btn is-primary" href={`${ACCOUNTS_BASE}/expenses/new`}>
            <i className="fa-solid fa-plus" aria-hidden="true" /> Add an expense
          </Link>
        </div>
      </header>

      <section className="bgt-board" aria-label="Choose a month">
        <div className="bgt-board-top">
          <div className="bgt-nav">
            <Link href={href({ month: addMonths(month, -1) })} scroll={false} aria-label="Previous month">
              <i className="fa-solid fa-chevron-left" aria-hidden="true" />
            </Link>
            <div>
              <span>Month</span>
              <strong>{label}</strong>
            </div>
            <Link href={href({ month: addMonths(month, 1) })} scroll={false} aria-label="Next month">
              <i className="fa-solid fa-chevron-right" aria-hidden="true" />
            </Link>
          </div>
          <div className="bgt-years">
            {month !== thisMonth ? (
              <Link className="bgt-today" href={href({ month: thisMonth })} scroll={false}>This month</Link>
            ) : null}
            <span className="bgt-year-links">
              {years.map((entry) => (
                <Link key={entry} href={href({ month: `${entry}-${month.slice(5)}` })} scroll={false} className={entry === year ? "is-on" : ""} aria-current={entry === year ? "true" : undefined}>{entry}</Link>
              ))}
            </span>
          </div>
        </div>

        <MonthStrip month={month}>
          <ol className="bgt-months">
            {book.months.map((entry) => {
              const hot = entry.plan > 0 && entry.spent > entry.plan;
              const width = entry.plan > 0 ? Math.min(100, Math.round((entry.spent / entry.plan) * 100)) : entry.spent ? 100 : 0;
              return (
                <li key={entry.key}>
                  <Link href={href({ month: entry.key })} scroll={false} className={`bgt-month${entry.key === month ? " is-on" : ""}${hot ? " is-over" : ""}`} aria-current={entry.key === month ? "true" : undefined}>
                    <span>{entry.short}</span>
                    <span className="bgt-meter" aria-hidden="true"><span style={{ width: `${width}%` }} /></span>
                    <small>{entry.spent ? ugxShort(entry.spent) : "—"}</small>
                  </Link>
                </li>
              );
            })}
          </ol>
        </MonthStrip>

        <div className="bgt-snap">
          {book.plan ? (
            <span className={`aov-rate${used > 100 ? " is-over" : used >= 85 ? " is-tight" : " is-ok"}`} title={`${used}% of the monthly plan spent`}>
              <svg viewBox="0 0 36 36" aria-hidden="true">
                <circle cx="18" cy="18" r="15" />
                <circle className="is-value" cx="18" cy="18" r="15" pathLength={100} style={{ "--aov-rate": Math.min(100, used) } as React.CSSProperties} />
              </svg>
              <em>{used > 999 ? "999+" : `${used}%`}</em>
            </span>
          ) : (
            <span className="bgt-ring-empty" aria-hidden="true"><i className="fa-solid fa-bullseye" /></span>
          )}
          <div className="bgt-snap-copy">
            <span>{book.plan ? "Spent of the plan" : "Spent"}</span>
            <strong title={ugx(book.spent)}><small>UGX</small> {ugxShort(book.spent)}</strong>
            <p>
              {book.plan ? (
                left < 0 ? <>{ugxShort(-left)} over a {ugxShort(book.plan)} plan</> : <>{ugxShort(left)} left of a {ugxShort(book.plan)} plan</>
              ) : (
                <>Set a monthly amount on each category below.</>
              )}
            </p>
          </div>
          <ul className="bgt-metrics">
            <li className={book.waiting ? "is-warn" : ""}>
              <span>Waiting</span>
              <strong title={ugx(book.waiting)}>{ugxShort(book.waiting)}</strong>
              <small>{book.waiting ? "Needs approval" : "Nothing waiting"}</small>
            </li>
            <li className={book.plan && left < 0 ? "is-bad" : book.plan ? "is-good" : ""}>
              <span>Left</span>
              <strong title={book.plan ? ugx(left) : undefined}>{book.plan ? ugxShort(left) : "—"}</strong>
              <small>{book.plan ? (left < 0 ? "Past the plan" : "Before waiting") : "No plan yet"}</small>
            </li>
            <li>
              <span>Collected</span>
              <strong title={ugx(book.collected)}>{ugxShort(book.collected)}</strong>
              <small>{book.invoiced ? `${ugxShort(book.invoiced)} invoiced` : "Fees this month"}</small>
            </li>
            <li className={cash >= 0 ? "is-good" : "is-bad"}>
              <span>Cover</span>
              <strong title={ugx(cash)}>{ugxShort(cash)}</strong>
              <small>{cash >= 0 ? "Fees cover spending" : "Spending is ahead"}</small>
            </li>
          </ul>
        </div>

        {alerts.length ? (
          <ul className="bgt-watch" aria-label="Needs a look">
            {alerts.slice(0, 3).map(({ row, text }) => (
              <li key={row.id ?? "none"} className={toneClass(row.tone)}>
                <i className={`fa-solid ${row.icon}`} aria-hidden="true" />
                <span>{text}</span>
                {row.id ? <Link href={expenseHref(row.id)}>Expenses</Link> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <nav className="bgt-tiles ofc-reg-summary" aria-label="Category summary and quick filters">
        {tiles.map((tile) => {
          const on = tile.key ? focus === tile.key : !focus;
          return (
            <Link
              key={tile.key || "all"}
              href={href({ focus: on && tile.key ? "" : tile.key })}
              scroll={false}
              className={`ofc-reg-tile is-${tile.tone}${on ? " is-on" : ""}`}
              aria-current={on ? "true" : undefined}
            >
              <span className="ofc-reg-tile-icon" aria-hidden="true"><i className={`fa-solid ${tile.icon}`} /></span>
              <span className="ofc-reg-tile-body">
                <span className="ofc-reg-tile-label">{tile.label}</span>
                <strong>{count(tile.count)}</strong>
                <small>{tile.note}</small>
              </span>
            </Link>
          );
        })}
      </nav>

      <section className="ofc-register" aria-labelledby="budget-results">
        <BudgetFinder month={month} focus={focus} q={q} />

        <header className="ofc-reg-results">
          <div>
            <h2 id="budget-results">{count(visible.length)} {visible.length === 1 ? "category" : "categories"}</h2>
            <p>{scope}</p>
          </div>
          <div className="bgt-results-side bgt-no-print">
            <p className="ofc-reg-hint">
              <i className="fa-solid fa-pen" aria-hidden="true" /> Type 1,500,000 or 1.5m, then save
            </p>
            <Link href={`${ACCOUNTS_BASE}/settings#categories`}>Add a category</Link>
          </div>
        </header>

        {visible.length ? (
          <div className="ofc-table-scroll">
            <table className="app-table acc-table bgt-table">
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Monthly plan</th>
                  <th scope="col" className="is-num">Spent</th>
                  <th scope="col" className="is-num">Waiting</th>
                  <th scope="col">This month</th>
                  <th scope="col">Year to {short}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id ?? "none"} className={toneClass(row.tone)}>
                    <td data-label="Category">
                      <span className="bgt-who">
                        <span className={`bgt-badge is-${row.tone}`} aria-hidden="true"><i className={`fa-solid ${row.icon}`} /></span>
                        <span>
                          {row.id ? <Link className="bgt-name" href={expenseHref(row.id)}>{row.name}</Link> : <strong className="bgt-name">{row.name}</strong>}
                          <small>
                            <span className={`bgt-pill is-${row.tone}`}>{TONE_LABEL[row.tone]}</span>
                            {row.active ? null : <span className="bgt-hidden">Hidden</span>}
                          </small>
                        </span>
                      </span>
                    </td>
                    <td data-label="Monthly plan">
                      {row.id ? <BudgetField id={row.id} amount={row.monthly} /> : <span className="app-muted">—</span>}
                    </td>
                    <td data-label="Spent" className="is-num"><strong className={row.tone === "over" ? "is-over" : undefined}>{amount(row.spent)}</strong></td>
                    <td data-label="Waiting" className="is-num">{row.waiting ? <strong className="is-wait">{amount(row.waiting)}</strong> : <span className="app-muted">—</span>}</td>
                    <td data-label="This month" className="bgt-used">
                      {row.monthly ? <Progress value={row.spent} max={row.monthly} label={`${row.name} used`} /> : null}
                      <small>{row.monthly ? `${usedPercent(row.spent, row.monthly)}% · ${leftNote(row)}` : leftNote(row)}</small>
                    </td>
                    <td data-label="Year so far" className="bgt-year"><small>{yearNote(row, book.monthIndex)}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="fa-scale-balanced" title={book.rows.length ? "Nothing matches" : "No spending categories yet"}>
            {book.rows.length ? <>Try another filter, or <Link href={href({ focus: "", q: "" })}>show every category</Link>.</> : <Link href={`${ACCOUNTS_BASE}/settings#categories`}>Add categories in Fee setup</Link>}
          </Empty>
        )}
      </section>

      <div className="bgt-lower">
        <section className="aov-card bgt-chart">
          <header className="aov-card-head">
            <div>
              <h2>{year}, month by month</h2>
              <p>Spent against the monthly plan. Each category keeps one amount for the whole year.</p>
            </div>
          </header>
          <ColumnChart
            label={`Spending and plan for ${year}`}
            legend={["Spent", "Monthly plan"]}
            columns={book.months.map((entry) => ({
              key: entry.key,
              label: entry.short,
              value: entry.spent,
              secondary: entry.plan,
              href: href({ month: entry.key }),
              highlight: entry.key === month,
            }))}
          />
        </section>

        <div className="bgt-rail">
          <section className="aov-card bgt-insight">
            <header className="aov-card-head">
              <div>
                <h2>Year to {short}</h2>
                <p>{through}</p>
              </div>
            </header>
            <div className="bgt-insight-lead">
              {book.toDatePlan ? (
                <RateRing percent={yearUsed} tone={rateTone(yearUsed, book.toDateSpent > book.toDatePlan)} label="Share of the year-to-date plan already spent" />
              ) : (
                <span className="bgt-ring-empty" aria-hidden="true"><i className="fa-solid fa-chart-line" /></span>
              )}
              <div>
                <span>Spent so far</span>
                <strong title={ugx(book.toDateSpent)}><small>UGX</small> {ugxShort(book.toDateSpent)}</strong>
                <p>
                  {pace
                    ? book.yearPlan
                      ? pace > book.yearPlan
                        ? <>Finishes about {ugxShort(pace - book.yearPlan)} over the {ugxShort(book.yearPlan)} plan.</>
                        : <>Finishes near {ugxShort(pace)}, inside the {ugxShort(book.yearPlan)} plan.</>
                      : <>At this pace the year finishes near {ugxShort(pace)}.</>
                    : <>No approved spending yet in {year}.</>}
                </p>
              </div>
            </div>
            <ul className="bgt-insight-rows">
              <li><span>Plan so far</span><strong title={book.toDatePlan ? ugx(book.toDatePlan) : undefined}>{book.toDatePlan ? ugxShort(book.toDatePlan) : "Not set"}</strong></li>
              <li className={book.toDateWaiting ? "is-warn" : undefined}><span>Still waiting</span><strong title={ugx(book.toDateWaiting)}>{ugxShort(book.toDateWaiting)}</strong></li>
              <li><span>Full-year plan</span><strong title={book.yearPlan ? ugx(book.yearPlan) : undefined}>{book.yearPlan ? ugxShort(book.yearPlan) : "Not set"}</strong></li>
              <li><span>Fees collected</span><strong title={ugx(book.toDateCollected)}>{ugxShort(book.toDateCollected)}</strong></li>
              <li><span>Fees invoiced</span><strong title={ugx(book.toDateInvoiced)}>{ugxShort(book.toDateInvoiced)}</strong></li>
            </ul>
          </section>

          <section className="aov-card bgt-insight">
            <header className="aov-card-head">
              <div>
                <h2>Fees in {short}</h2>
                <p>Collections beside this month&apos;s spending</p>
              </div>
              <Link href={`${ACCOUNTS_BASE}/payments?from=${month}-01&to=${monthEnd(month)}`}>Receipts <i className="fa-solid fa-arrow-right" aria-hidden="true" /></Link>
            </header>
            <div className="bgt-insight-lead">
              {book.collected ? (
                <RateRing percent={feeUsed} tone={rateTone(feeUsed, book.spent > book.collected)} label="Share of fees collected that spending has used" />
              ) : (
                <span className="bgt-ring-empty" aria-hidden="true"><i className="fa-solid fa-money-bill-wave" /></span>
              )}
              <div>
                <span>Collected</span>
                <strong title={ugx(book.collected)}><small>UGX</small> {ugxShort(book.collected)}</strong>
                <p>
                  {book.collected && book.spent
                    ? <>Spending used {usedPercent(book.spent, book.collected)}% of the fees collected.</>
                    : book.spent
                      ? <>Spending is not yet covered by fees collected.</>
                      : <>No approved spending this month.</>}
                </p>
              </div>
            </div>
            <ul className="bgt-insight-rows">
              <li><span>Invoiced</span><strong title={ugx(book.invoiced)}>{ugxShort(book.invoiced)}</strong></li>
              <li className={book.collected && book.spent > book.collected ? "is-bad" : undefined}><span>Spent</span><strong title={ugx(book.spent)}>{ugxShort(book.spent)}</strong></li>
              <li className={outstanding > 0 ? "is-warn" : "is-good"}><span>Owed, all terms</span><strong title={ugx(outstanding)}>{ugxShort(outstanding)}</strong></li>
            </ul>
          </section>

          {book.campuses.length > 1 ? (
            <section className="aov-card bgt-insight">
              <header className="aov-card-head">
                <div>
                  <h2>Spent by campus</h2>
                  <p>Approved spending in {short}</p>
                </div>
              </header>
              <ul className="bgt-campus">
                {book.campuses.map((row) => (
                  <li key={row.name}>
                    <span>{row.name}</span>
                    <strong title={ugx(row.spent)}>{ugxShort(row.spent)}</strong>
                    <span className="bgt-campus-meter" role="img" aria-label={`${row.name} spent ${ugx(row.spent)}`}>
                      <span style={{ width: `${book.campuses[0].spent ? Math.round((row.spent / book.campuses[0].spent) * 100) : 0}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="aov-card bgt-insight">
            <header className="aov-card-head">
              <div>
                <h2>Largest this month</h2>
                <p>{book.largest.length ? `${book.largest.length} biggest expenses` : label}</p>
              </div>
              <Link href={expenseHref(null)}>All expenses <i className="fa-solid fa-arrow-right" aria-hidden="true" /></Link>
            </header>
            {book.largest.length ? (
              <ul className="bgt-large">
                {book.largest.map((row) => (
                  <li key={row.id}>
                    <Link href={`${ACCOUNTS_BASE}/expenses/${row.id}`}>
                      <span>
                        <strong>{row.payee}</strong>
                        <small>{row.category}{row.campus ? ` · ${row.campus}` : ""}</small>
                      </span>
                      <span className="bgt-large-end">
                        <em title={ugx(row.amount)}>{ugxShort(row.amount)}</em>
                        <ExpenseStatus status={row.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="bgt-insight-empty">No expenses in {label}.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
