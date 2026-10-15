import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { AgingBar, ColumnChart, notReady } from "@/components/accounts/ui";
import { PrintButton } from "@/components/office/client";
import { ACCOUNTS_BASE, loadTerms, requireAccounts } from "@/lib/accounts";
import { amount, day, hrefWith, overdueText, percent, ugx, ugxShort } from "@/lib/accounts-format";
import { loadAccountsReport, rateText, reportSelection, type AccountsReport, type ReportClass } from "@/lib/accounts-reports";
import { StudentFace } from "@/components/StudentFace";
import { isClassCode, pick, studentStatusInfo } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";
import { ReportNav } from "./nav";
import "./reports.css";

export const metadata = { title: "Reports" };

const NAV = [
  { href: "#position", label: "Position", icon: "fa-scale-balanced" },
  { href: "#collections", label: "Collections", icon: "fa-money-bill-wave" },
  { href: "#billing", label: "Billing", icon: "fa-file-invoice" },
  { href: "#debtors", label: "Debtors", icon: "fa-hand-holding-dollar" },
  { href: "#spending", label: "Spending", icon: "fa-wallet" },
  { href: "#terms", label: "Terms", icon: "fa-calendar" },
];

const n = (value: number) => value.toLocaleString("en-GB");
const sum = (rows: ReportClass[], key: keyof ReportClass) => rows.reduce((total, row) => total + Number(row[key]), 0);

function Section({ id, kicker, title, description, children }: {
  id: string;
  kicker: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="acr-section" aria-labelledby={`${id}-title`}>
      <header className="acr-section-head">
        <div>
          <span>{kicker}</span>
          <h2 id={`${id}-title`}>{title}</h2>
        </div>
        {description ? <p>{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

function Card({ title, description, csv, link, flush = false, children }: {
  title: string;
  description?: string;
  csv?: string;
  link?: { href: string; label: string };
  flush?: boolean;
  children: React.ReactNode;
}) {
  return (
    <article className={`acr-card${flush ? " is-flush" : ""}`}>
      <header>
        <div>
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        {csv || link ? (
          <span className="acr-card-actions no-print">
            {link ? <Link className="acr-csv" href={link.href}>{link.label}</Link> : null}
            {csv ? <a className="acr-csv" href={csv}><i className="fa-solid fa-download" aria-hidden="true" /> CSV</a> : null}
          </span>
        ) : null}
      </header>
      {children}
    </article>
  );
}

function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
  return (
    <span className="acr-meter" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="acr-empty">{children}</p>;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!supabaseConfigured()) return notReady("Reports", { kind: "config" });
  const auth = await requireAccounts();
  if ("error" in auth) return notReady("Reports", { kind: "auth", message: auth.error });
  const { supabase, profile } = auth;
  const params = await searchParams;
  const { terms, current, error } = await loadTerms(supabase);
  if (error) return notReady("Reports", { kind: "schema", message: error });

  const termParam = pick(params, "term");
  const { term, filters } = reportSelection(terms, current, termParam);
  const href = (changes: Record<string, string | number | null>) => hrefWith(`${ACCOUNTS_BASE}/reports`, filters, changes);
  const exportHref = (kind: string) => hrefWith(`${ACCOUNTS_BASE}/reports/export`, { ...filters, kind });

  let report: AccountsReport;
  try {
    report = await loadAccountsReport(supabase, terms, current, termParam);
  } catch (loadError) {
    return notReady("Reports", { kind: "schema", message: loadError instanceof Error ? loadError.message : "Couldn't load the report." });
  }

  const paymentsHref = (changes: Record<string, string> = {}) => {
    const query = new URLSearchParams(changes);
    if (!term || (current && term.id !== current.id)) query.set("range", "all");
    else query.set("range", "term");
    return `${ACCOUNTS_BASE}/payments?${query}`;
  };
  const invoicesHref = (changes: Record<string, string> = {}) => {
    const query = new URLSearchParams(changes);
    if (!term) query.set("term", "all");
    else if (current && term.id !== current.id) query.set("term", term.id);
    const text = query.toString();
    return `${ACCOUNTS_BASE}/invoices${text ? `?${text}` : ""}`;
  };

  const preparedBy = profile.full_name || profile.email || "Accounts office";
  const generated = new Date().toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kampala" });
  const classTotals = {
    onRoll: sum(report.classes, "onRoll"),
    notBilled: sum(report.classes, "notBilled"),
    billedPupils: sum(report.classes, "billedPupils"),
    invoiced: sum(report.classes, "invoiced"),
    paid: sum(report.classes, "paid"),
    owing: sum(report.classes, "owing"),
    credit: sum(report.classes, "credit"),
    receipts: sum(report.classes, "receipts"),
  };
  const feeTotal = report.fees.reduce((total, row) => total + row.amount, 0);
  const periodCategories = report.categories.filter((row) => row.amount > 0);
  const budgets = report.categories.filter((row) => row.budget !== null);
  const categoryMax = Math.max(1, ...periodCategories.map((row) => row.amount));
  const topDebtors = report.debtors.filter((row) => row.status === "active").slice(0, 8);
  const records = [
    { label: "Voided receipts", value: n(report.voidedReceipts), note: "Kept on the books", href: paymentsHref({ show: "void" }) },
    { label: "Voided invoices", value: n(report.voidInvoices), note: report.voidInvoiceTotal ? ugx(report.voidInvoiceTotal) : "None voided", href: invoicesHref({ status: "void" }) },
    { label: "Reminders sent", value: n(report.reminders), note: term?.starts_on ? "During this term" : "On record", href: "" },
    { label: "Draft invoices", value: n(report.draftInvoices), note: report.draftTotal ? ugx(report.draftTotal) : "Nothing in draft", href: invoicesHref({ status: "draft" }) },
    { label: "To approve", value: n(report.pendingCount), note: report.pendingSpend ? ugx(report.pendingSpend) : "Nothing waiting", href: `${ACCOUNTS_BASE}/expenses?status=pending` },
  ];

  const stats = [
    {
      href: "#collections",
      label: "Collected",
      icon: "fa-money-bill-wave",
      tone: "navy",
      value: report.collected,
      note: report.rate !== null && report.billed > 0 ? `${report.rate}% of ${ugxShort(report.billed)} billed` : `${n(report.receipts)} receipts`,
      meter: report.rate !== null && report.billed > 0 ? Math.min(report.rate, 100) : null,
    },
    {
      href: "#billing",
      label: "Billed",
      icon: "fa-file-invoice",
      tone: "navy",
      value: report.billed,
      note: report.pupilsNotBilled
        ? `${n(report.issuedInvoices)} invoices · ${n(report.pupilsNotBilled)} not billed`
        : report.pupilsOnRoll
          ? `${n(report.issuedInvoices)} invoices · ${n(report.pupilsOnRoll)} on the roll`
          : `${n(report.issuedInvoices)} issued invoices`,
      meter: null,
    },
    {
      href: "#debtors",
      label: "Still owed",
      icon: "fa-hand-holding-dollar",
      tone: report.owing ? "bad" : "ok",
      value: report.owing,
      note: report.pupilsOwing ? `${n(report.pupilsOwing)} pupils · ${n(report.familiesOwing)} families` : "Nothing outstanding",
      meter: null,
    },
    {
      href: "#spending",
      label: "Spending",
      icon: "fa-wallet",
      tone: "navy",
      value: report.spent,
      note: report.pendingSpend ? `${ugxShort(report.pendingSpend)} waiting to approve` : "Approved and paid",
      meter: null,
    },
    {
      href: "#position",
      label: "Net",
      icon: report.net < 0 ? "fa-arrow-trend-down" : "fa-arrow-trend-up",
      tone: report.net < 0 ? "bad" : "ok",
      value: report.net,
      note: "Collections minus spending",
      meter: null,
    },
  ];
  const periods = [
    { value: "", label: current?.label ?? "Current term" },
    ...terms.filter((entry) => entry.id !== current?.id).map((entry) => ({ value: entry.id, label: entry.label })),
    { value: "all", label: "All terms" },
  ];

  return (
    <div className="app-page ofc-page acc-page acr-page">
      <header className="acr-print-only acr-print-head">
        <img src="/images/kja-logo.png" alt="" />
        <div>
          <p>Accounts office · Fee report</p>
          <h1>{report.periodLabel}</h1>
          <span>Billing, collections, debtors and spending</span>
        </div>
      </header>
      <p className="acr-print-only acr-print-meta">
        As of {day(report.today)} · Prepared by {preparedBy} · {generated}
      </p>

      <PageHeader
        kicker="Insights"
        icon="fa-chart-column"
        title="Reports"
        description={<>Billing, collections, debtors and spending for <strong>{report.periodLabel}</strong>. Every table on this page downloads as a spreadsheet.</>}
        actions={
          <>
            <PrintButton label="Print" />
            <a className="admin-hero-btn is-primary" href={exportHref("position")}><i className="fa-solid fa-file-csv" aria-hidden="true" /> Export summary</a>
          </>
        }
      />

      <div className="acr-toolbar no-print">
        <div className="acr-terms" role="group" aria-label="Report period">
          <span>Period</span>
          <div>
            {periods.map((period) => (
              <Link
                key={period.value || "current"}
                href={href({ term: period.value })}
                className={filters.term === period.value ? "is-on" : ""}
                aria-current={filters.term === period.value ? "true" : undefined}
              >
                {period.label}
              </Link>
            ))}
          </div>
        </div>
        <p className="acr-asof"><i className="fa-regular fa-clock" aria-hidden="true" /> As of {day(report.today)}</p>
      </div>

      <section className="acr-stats" aria-label="Report summary">
        {stats.map((stat, index) => (
          <a key={stat.label} href={stat.href} className={`acr-stat is-${stat.tone}`} style={{ animationDelay: `${index * 45}ms` }}>
            <span className="acr-stat-top">
              <span className="acr-stat-icon" aria-hidden="true"><i className={`fa-solid ${stat.icon}`} /></span>
              {stat.label}
            </span>
            <strong title={ugx(stat.value)}>{ugxShort(stat.value)}</strong>
            <span className="acr-stat-foot">
              {stat.meter !== null ? (
                <span className="acr-stat-meter" role="img" aria-label={`${stat.meter}% collected`}>
                  <span style={{ width: `${stat.meter}%` }} />
                </span>
              ) : null}
              <small>{stat.note}</small>
            </span>
          </a>
        ))}
      </section>

      <ul className="acr-flags" aria-label="Records to check">
        {records.map((item) => {
          const body = (<><span>{item.label}</span><strong>{item.value}</strong><small>{item.note}</small></>);
          return <li key={item.label}>{item.href ? <Link href={item.href}>{body}</Link> : <div>{body}</div>}</li>;
        })}
      </ul>

      {report.truncated ? (
        <div className="acc-banner is-warn">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <p>One list in this report reached 60,000 rows, so the totals stop there.</p>
        </div>
      ) : null}

      <ReportNav items={NAV} />

      <Section id="position" kicker="The books" title="Position" description={term ? `How ${term.label} stands, class by class.` : "Every term on the books, added together."}>
        <div className="acr-grid">
          <Card title="How the money moves" csv={exportHref("position")}>
            <dl className="acr-books">
              <div><dt>Fees billed</dt><dd>{amount(report.billed)}</dd></div>
              {report.linesLoaded ? <div className="is-quiet"><dt>Discounts already in those bills</dt><dd>{amount(report.discounts)}</dd></div> : null}
              <div>
                <dt>Collected</dt>
                <dd>
                  {amount(report.collected)}
                  {Math.abs(report.collected - report.paid) > 1 ? <small>{amount(report.paid)} applied on fee accounts</small> : null}
                </dd>
              </div>
              <div><dt>Still owed</dt><dd className={report.owing ? "acc-owing" : undefined}>{amount(report.owing)}</dd></div>
              <div><dt>Credit balances</dt><dd className={report.credit ? "acc-money is-credit" : undefined}>{amount(report.credit)}</dd></div>
              <div><dt>Spending</dt><dd>{amount(report.spent)}</dd></div>
              <div className="is-net"><dt>Net</dt><dd className={report.net < 0 ? "acc-owing" : "acc-paid"}>{amount(report.net)}</dd></div>
            </dl>
            <p className="acr-note">
              Spending is approved and paid expenses. Amounts waiting for approval stay out of the net.
              {term && !term.starts_on && !term.ends_on ? " This term has no dates, so the spending figure is every expense on the books." : ""}
            </p>
          </Card>

          <Card title="Income against spending" description={report.monthNote} csv={exportHref("monthly")}>
            {report.months.length ? (
              <ColumnChart
                columns={report.months.slice(-12).map((month) => ({ key: month.key, label: month.label, value: month.income, secondary: month.spend }))}
                label="Income and spending by month"
                legend={["Fees received", "Spending"]}
              />
            ) : (
              <EmptyLine>Nothing to compare in this period.</EmptyLine>
            )}
          </Card>
        </div>

        <Card
          title="Every class"
          description="Grouped by the class each pupil is in now. Collected is what has been applied to the fee account."
          csv={exportHref("classes")}
          flush
        >
          {report.classes.length ? (
            <div className="acr-scroll">
              <table className="acr-table">
                <thead>
                  <tr>
                    <th scope="col">Class</th>
                    <th scope="col" className="is-num">On roll</th>
                    <th scope="col" className="is-num">Not billed</th>
                    <th scope="col" className="is-num">Billed</th>
                    <th scope="col" className="is-num">Collected</th>
                    <th scope="col" className="is-num">Owed</th>
                    <th scope="col">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {report.classes.map((row) => (
                    <tr key={row.code || "none"}>
                      <td data-label="Class">
                        {isClassCode(row.code) ? (
                          <Link className="acr-class" href={`${ACCOUNTS_BASE}/students?class=${row.code}`}><strong>{row.code}</strong><small>{row.name}</small></Link>
                        ) : (
                          <strong>{row.name}</strong>
                        )}
                      </td>
                      <td data-label="On roll" className="is-num">{n(row.onRoll)}</td>
                      <td data-label="Not billed" className="is-num">{row.notBilled ? <strong className="acc-warn-text">{n(row.notBilled)}</strong> : n(row.notBilled)}</td>
                      <td data-label="Billed" className="is-num">{amount(row.invoiced)}<small>{n(row.billedPupils)} pupils</small></td>
                      <td data-label="Collected" className="is-num">{amount(row.paid)}<small>{n(row.receipts)} receipts</small></td>
                      <td data-label="Owed" className="is-num">
                        {row.owing && isClassCode(row.code) ? <Link className="acc-owing" href={`${ACCOUNTS_BASE}/students?class=${row.code}&balance=owing`}>{amount(row.owing)}</Link> : amount(row.owing)}
                        {row.credit ? <small>{amount(row.credit)} in credit</small> : null}
                      </td>
                      <td data-label="Rate">
                        <span className="acr-rate">
                          <Meter value={row.paid} max={row.invoiced || row.paid} label={`${row.name} collected`} />
                          <small>{rateText(row.paid, row.invoiced)}</small>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td data-label="Class"><strong>All classes</strong></td>
                    <td className="is-num" data-label="On roll">{n(classTotals.onRoll)}</td>
                    <td className="is-num" data-label="Not billed">{n(classTotals.notBilled)}</td>
                    <td className="is-num" data-label="Billed">{amount(classTotals.invoiced)}</td>
                    <td className="is-num" data-label="Collected">{amount(classTotals.paid)}</td>
                    <td className="is-num" data-label="Owed">{amount(classTotals.owing)}</td>
                    <td data-label="Rate">{rateText(classTotals.paid, classTotals.invoiced)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <EmptyLine>No pupils or invoices in this period.</EmptyLine>
          )}
        </Card>
      </Section>

      <Section id="collections" kicker="Cash in" title="Collections" description={report.receipts ? `${n(report.receipts)} receipts, averaging ${ugx(report.averageReceipt)}.` : "Receipts written in this period."}>
        <Card
          title={report.columnGrain === "week" ? "Collections by week" : "Collections by day"}
          description={[report.columnNote, report.busiestDay ? `Busiest day ${day(report.busiestDay.date)}, ${ugx(report.busiestDay.total)} across ${n(report.busiestDay.count)} receipts.` : ""].filter(Boolean).join(" ")}
          csv={exportHref("days")}
        >
          {report.columns.length ? <ColumnChart columns={report.columns} label="Collections over time" format={ugxShort} /> : <EmptyLine>No payments in this period.</EmptyLine>}
        </Card>

        <div className="acr-grid">
          <Card title="By payment method" csv={exportHref("methods")}>
            {report.methods.length ? (
              <ul className="acr-rows">
                {report.methods.map((method) => (
                  <li key={method.value}>
                    <Link href={paymentsHref({ method: method.value })}>
                      <span className="acr-row-icon"><i className={`fa-solid ${method.icon}`} aria-hidden="true" /></span>
                      <span className="acr-row-name"><strong>{method.label}</strong><small>{n(method.count)} receipts</small></span>
                      <Meter value={method.total} max={report.collected || method.total} label={`${method.label} share`} />
                      <strong>{ugxShort(method.total)}</strong>
                      <span className="acr-share">{percent(method.total, report.collected)}%</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <EmptyLine>No payments yet.</EmptyLine>}
          </Card>

          <Card title="Who recorded them" csv={exportHref("cashiers")}>
            {report.sources.length ? (
              <ul className="acr-pills">
                {report.sources.map((source) => (
                  <li key={source.value}><i className={`fa-solid ${source.icon}`} aria-hidden="true" /> {source.label} <strong>{ugxShort(source.total)}</strong> <small>{n(source.count)}</small></li>
                ))}
              </ul>
            ) : null}
            {report.cashiers.length ? (
              <ul className="acr-rows">
                {report.cashiers.map((row, index) => (
                  <li key={`${row.name}-${index}`}>
                    <div className="acr-row">
                      <span className="acr-row-icon"><i className="fa-solid fa-user" aria-hidden="true" /></span>
                      <span className="acr-row-name"><strong>{row.name}</strong><small>{n(row.count)} receipts</small></span>
                      <Meter value={row.total} max={report.collected || row.total} label={`${row.name} share`} />
                      <strong>{ugxShort(row.total)}</strong>
                      <span className="acr-share">{percent(row.total, report.collected)}%</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <EmptyLine>No payments yet.</EmptyLine>}
          </Card>
        </div>

        {report.campuses.length ? (
          <Card title="By campus" csv={exportHref("campuses")} flush>
            <div className="acr-scroll">
              <table className="acr-table">
                <thead>
                  <tr>
                    <th scope="col">Campus</th>
                    <th scope="col" className="is-num">Collected</th>
                    <th scope="col" className="is-num">Receipts</th>
                    <th scope="col" className="is-num">Billed</th>
                    <th scope="col" className="is-num">Owed</th>
                    <th scope="col">Share of collections</th>
                  </tr>
                </thead>
                <tbody>
                  {report.campuses.map((row) => (
                    <tr key={row.campus}>
                      <td data-label="Campus"><strong>{row.campus}</strong></td>
                      <td data-label="Collected" className="is-num">{amount(row.collected)}</td>
                      <td data-label="Receipts" className="is-num">{n(row.receipts)}</td>
                      <td data-label="Billed" className="is-num">{amount(row.billed)}</td>
                      <td data-label="Owed" className="is-num">{amount(row.owing)}</td>
                      <td data-label="Share">
                        <span className="acr-rate">
                          <Meter value={row.collected} max={report.collected || row.collected} label={`${row.campus} collections`} />
                          <small>{percent(row.collected, report.collected)}%</small>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}
      </Section>

      <Section id="billing" kicker="Invoices" title="Billing" description="Issued bills count towards balances. Drafts and voids stay out until they change.">
        <ul className="acr-facts">
          <li><Link href={invoicesHref({ status: "issued" })}><span>Issued</span><strong>{n(report.issuedInvoices)}</strong><small>{ugx(report.billed)}</small></Link></li>
          <li><Link href={invoicesHref({ kind: "term", status: "issued" })}><span>Term bills</span><strong>{n(report.termBills)}</strong><small>{ugx(report.termBillTotal)}</small></Link></li>
          <li><Link href={invoicesHref({ kind: "extra", status: "issued" })}><span>Extras</span><strong>{n(report.extraBills)}</strong><small>{ugx(report.extraBillTotal)}</small></Link></li>
          <li><Link href={invoicesHref({ status: "draft" })}><span>Drafts</span><strong>{n(report.draftInvoices)}</strong><small>{ugx(report.draftTotal)}</small></Link></li>
          <li><Link href={invoicesHref({ status: "void" })}><span>Void</span><strong>{n(report.voidInvoices)}</strong><small>{ugx(report.voidInvoiceTotal)}</small></Link></li>
        </ul>

        {term && report.pupilsNotBilled ? (
          <div className="acc-banner is-warn">
            <i className="fa-solid fa-file-invoice" aria-hidden="true" />
            <p>
              {n(report.pupilsNotBilled)} active {report.pupilsNotBilled === 1 ? "pupil has" : "pupils have"} no issued invoice for {report.periodLabel}.
              {report.draftsWaiting ? ` ${n(report.draftsWaiting)} of them already ${report.draftsWaiting === 1 ? "has" : "have"} a draft.` : ""}
            </p>
            <Link className="admin-btn" href={`${ACCOUNTS_BASE}/invoices/generate`}>Generate invoices</Link>
          </div>
        ) : null}

        <div className="acr-grid">
          <Card title="What the bills are for" description="Charges on issued invoices." csv={exportHref("fees")} flush>
            {report.fees.length ? (
              <div className="acr-scroll">
                <table className="acr-table">
                  <thead>
                    <tr><th scope="col">Item</th><th scope="col">Kind</th><th scope="col" className="is-num">Lines</th><th scope="col" className="is-num">Amount</th><th scope="col">Share</th></tr>
                  </thead>
                  <tbody>
                    {report.fees.map((row) => (
                      <tr key={row.name}>
                        <td data-label="Item"><i className={`fa-solid ${row.icon}`} aria-hidden="true" /> <strong>{row.name}</strong></td>
                        <td data-label="Kind">{row.kind}</td>
                        <td data-label="Lines" className="is-num">{n(row.count)}</td>
                        <td data-label="Amount" className="is-num">{amount(row.amount)}</td>
                        <td data-label="Share">
                          <span className="acr-rate">
                            <Meter value={row.amount} max={feeTotal} label={`${row.name} share`} />
                            <small>{percent(row.amount, feeTotal)}%</small>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr><td data-label="Item"><strong>All charges</strong></td><td data-label="Kind"></td><td className="is-num" data-label="Lines">{n(report.fees.reduce((total, row) => total + row.count, 0))}</td><td className="is-num" data-label="Amount">{amount(feeTotal)}</td><td data-label="Share"></td></tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <EmptyLine>{report.linesLoaded ? "No charges on issued invoices in this period." : "Fee lines could not be loaded."}</EmptyLine>
            )}
          </Card>

          <Card title="Discounts given" description="Taken off issued invoices, mostly from tuition." csv={exportHref("discounts")} flush>
            {report.discountLines.length ? (
              <div className="acr-scroll">
                <table className="acr-table">
                  <thead>
                    <tr><th scope="col">Discount</th><th scope="col" className="is-num">Lines</th><th scope="col" className="is-num">Amount</th><th scope="col">Share</th></tr>
                  </thead>
                  <tbody>
                    {report.discountLines.map((row) => (
                      <tr key={row.label}>
                        <td data-label="Discount"><strong>{row.label}</strong></td>
                        <td data-label="Lines" className="is-num">{n(row.count)}</td>
                        <td data-label="Amount" className="is-num">{amount(row.amount)}</td>
                        <td data-label="Share">
                          <span className="acr-rate">
                            <Meter value={row.amount} max={report.discounts} label={`${row.label} share`} />
                            <small>{percent(row.amount, report.discounts)}%</small>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr><td data-label="Discount"><strong>All discounts</strong></td><td className="is-num" data-label="Lines">{n(report.discountLines.reduce((total, row) => total + row.count, 0))}</td><td className="is-num" data-label="Amount">{amount(report.discounts)}</td><td data-label="Share"></td></tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <EmptyLine>{report.linesLoaded ? "No discounts on issued invoices in this period." : "Fee lines could not be loaded."}</EmptyLine>
            )}
          </Card>
        </div>
      </Section>

      <Section id="debtors" kicker="Still to collect" title="Debtors" description={term ? `Balances for ${term.label}. The debtors list itself is every term added together.` : "Active pupils with a balance, aged from the oldest unpaid due date."}>
        <div className="acr-grid">
          <Card title="How old the debts are" csv={exportHref("aging")}>
            {report.owing ? (
              <>
                <AgingBar buckets={report.aging} hrefFor={term ? undefined : (key) => `${ACCOUNTS_BASE}/debtors?aging=${key}`} />
                <p className="acr-note">{ugx(report.overdue)} is overdue. {n(report.pupilsClear)} billed pupils are clear{report.pupilsCredit ? `, and ${n(report.pupilsCredit)} are in credit` : ""}.</p>
              </>
            ) : (
              <EmptyLine>No outstanding balances in this period.</EmptyLine>
            )}
          </Card>

          <Card title="Largest balances" link={{ href: `${ACCOUNTS_BASE}/debtors`, label: "All debtors" }}>
            {topDebtors.length ? (
              <ul className="acr-people">
                {topDebtors.map((row) => (
                  <li key={row.id}>
                    <StudentFace id={row.id} name={row.name} className="acr-avatar" />
                    <div>
                      <Link href={`${ACCOUNTS_BASE}/students/${row.id}`}>{row.name}</Link>
                      <small>{[row.classCode, row.due ? overdueText(row.due) : ""].filter(Boolean).join(" · ")}</small>
                    </div>
                    <strong className="acc-owing">{amount(row.balance)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyLine>No active pupil owes anything in this period.</EmptyLine>
            )}
            {report.leaversOwing ? <p className="acr-note">{n(report.leaversOwing)} former {report.leaversOwing === 1 ? "pupil still owes" : "pupils still owe"} {ugx(report.leaversOwed)}.</p> : null}
          </Card>
        </div>

        {report.debtors.length ? (
          <Card title="Everyone who owes" description="Active pupils and former pupils, largest balance first." csv={exportHref("debtors")} flush>
            <div className="acr-scroll">
              <table className="acr-table">
                <thead>
                  <tr>
                    <th scope="col">Pupil</th>
                    <th scope="col">Class</th>
                    <th scope="col">Status</th>
                    <th scope="col">Due</th>
                    <th scope="col" className="is-num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {report.debtors.slice(0, 12).map((row) => (
                    <tr key={row.id}>
                      <td data-label="Pupil">
                        <span className="acr-who">
                          <StudentFace id={row.id} name={row.name} className="acr-avatar" />
                          <Link href={`${ACCOUNTS_BASE}/students/${row.id}`}>{row.name}</Link>
                        </span>
                      </td>
                      <td data-label="Class">{row.classCode || "–"}</td>
                      <td data-label="Status"><span className={`acr-pill${row.status === "active" ? "" : " is-former"}`}>{studentStatusInfo(row.status).label}</span></td>
                      <td data-label="Due">{row.due ? overdueText(row.due) : "No due date"}</td>
                      <td data-label="Balance" className="is-num acc-owing">{amount(row.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {report.debtors.length > 12 ? <p className="acr-note">{n(report.debtors.length - 12)} more on the CSV and the debtors list.</p> : null}
          </Card>
        ) : null}
      </Section>

      <Section id="spending" kicker="Cash out" title="Spending" description="Approved and paid expenses in this period. Pending items are listed and kept out of the totals.">
        <div className="acr-grid">
          <Card title="By category" csv={exportHref("categories")}>
            {periodCategories.length ? (
              <ul className="acr-rows">
                {periodCategories.map((row) => (
                  <li key={row.id || "none"}>
                    <Link href={row.id ? `${ACCOUNTS_BASE}/expenses?category=${row.id}&month=all` : `${ACCOUNTS_BASE}/expenses?month=all`}>
                      <span className="acr-row-icon"><i className={`fa-solid ${row.icon}`} aria-hidden="true" /></span>
                      <span className="acr-row-name"><strong>{row.name}</strong><small>{n(row.count)} expenses</small></span>
                      <Meter value={row.amount} max={categoryMax} label={`${row.name} spending`} />
                      <strong>{ugxShort(row.amount)}</strong>
                      <span className="acr-share">{percent(row.amount, report.spent)}%</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <EmptyLine>No approved or paid expenses in this period.</EmptyLine>}
          </Card>

          <Card title={`Budgets in ${report.budgetMonthLabel}`} description="This calendar month, whichever term the report is set to." link={{ href: `${ACCOUNTS_BASE}/settings#categories`, label: "Edit" }}>
            {budgets.length ? (
              <ul className="acr-rows">
                {budgets.map((row) => {
                  const budget = row.budget ?? 0;
                  const used = budget > 0 ? Math.round((row.monthSpend / budget) * 100) : null;
                  return (
                    <li key={row.id} className={row.monthSpend > budget ? "is-over" : ""}>
                      <div className="acr-row">
                        <span className="acr-row-icon"><i className={`fa-solid ${row.icon}`} aria-hidden="true" /></span>
                        <span className="acr-row-name"><strong>{row.name}</strong><small>{amount(row.monthSpend)} of {amount(budget)}</small></span>
                        <Meter value={row.monthSpend} max={budget} label={`${row.name} budget`} />
                        <strong>{ugxShort(row.monthSpend)}</strong>
                        <span className="acr-share">{used === null ? "–" : `${used}%`}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : <EmptyLine>Set a monthly budget on an expense category in Fee setup.</EmptyLine>}
          </Card>
        </div>

        <div className="acr-grid">
          <Card title="Where each expense stands" csv={exportHref("expenses")}>
            {report.expenseStatuses.length ? (
              <ul className="acr-rows">
                {report.expenseStatuses.map((status) => (
                  <li key={status.value}>
                    <Link href={`${ACCOUNTS_BASE}/expenses?status=${status.value}&month=all`}>
                      <span className="acr-row-icon"><i className={`fa-solid ${status.icon}`} aria-hidden="true" /></span>
                      <span className="acr-row-name"><strong>{status.label}</strong><small>{n(status.count)} items</small></span>
                      <Meter value={status.amount} max={Math.max(...report.expenseStatuses.map((entry) => entry.amount), 1)} label={`${status.label} share`} />
                      <strong>{ugxShort(status.amount)}</strong>
                      <span className="acr-share">{n(status.count)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <EmptyLine>No expenses in this period.</EmptyLine>}
          </Card>

          <Card title="Largest expenses" link={{ href: `${ACCOUNTS_BASE}/expenses`, label: "All expenses" }}>
            {report.largestExpenses.length ? (
              <ul className="acr-people">
                {report.largestExpenses.map((row) => (
                  <li key={row.id}>
                    <span className="acr-avatar is-soft" aria-hidden="true"><i className="fa-solid fa-receipt" /></span>
                    <div>
                      <Link href={`${ACCOUNTS_BASE}/expenses/${row.id}`}>{row.payee}</Link>
                      <small>{row.category} · {day(row.spentOn)} · {row.ref}</small>
                    </div>
                    <strong>{amount(row.amount)}</strong>
                  </li>
                ))}
              </ul>
            ) : <EmptyLine>No approved or paid expenses in this period.</EmptyLine>}
          </Card>
        </div>

        {report.expenseCampuses.length > 1 ? (
          <Card title="Spending by campus">
            <ul className="acr-rows">
              {report.expenseCampuses.map((row) => (
                <li key={row.campus}>
                  <div className="acr-row">
                    <span className="acr-row-icon"><i className="fa-solid fa-location-dot" aria-hidden="true" /></span>
                    <span className="acr-row-name"><strong>{row.campus}</strong><small>{n(row.count)} expenses</small></span>
                    <Meter value={row.amount} max={Math.max(...report.expenseCampuses.map((entry) => entry.amount), 1)} label={`${row.campus} spending`} />
                    <strong>{ugxShort(row.amount)}</strong>
                    <span className="acr-share">{percent(row.amount, report.spent)}%</span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </Section>

      <Section id="terms" kicker="Comparison" title="Across terms" description={report.termId ? "The highlighted row is the period above. Spending follows each term's start and end dates." : "Spending follows each term's start and end dates."}>
        <Card title="Term summary" csv={exportHref("terms")} flush>
          {report.terms.length ? (
            <div className="acr-scroll">
              <table className="acr-table">
                <thead>
                  <tr>
                    <th scope="col">Term</th>
                    <th scope="col" className="is-num">Billed</th>
                    <th scope="col" className="is-num">Collected</th>
                    <th scope="col" className="is-num">Owed</th>
                    <th scope="col">Rate</th>
                    <th scope="col" className="is-num">Spending</th>
                    <th scope="col" className="is-num">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {report.terms.map((row) => (
                    <tr key={row.id} className={row.id === report.termId ? "is-on" : ""}>
                      <td data-label="Term">
                        <Link href={href({ term: row.isCurrent ? "" : row.id })}><strong>{row.label}</strong></Link>
                        {row.isCurrent ? <small>Current</small> : null}
                      </td>
                      <td data-label="Billed" className="is-num">{amount(row.invoiced)}</td>
                      <td data-label="Collected" className="is-num">{amount(row.paid)}<small>{n(row.receipts)} receipts</small></td>
                      <td data-label="Owed" className="is-num">{amount(row.owing)}</td>
                      <td data-label="Rate">
                        <span className="acr-rate">
                          <Meter value={row.paid} max={row.invoiced || row.paid} label={`${row.label} collected`} />
                          <small>{rateText(row.paid, row.invoiced)}</small>
                        </span>
                      </td>
                      <td data-label="Spending" className="is-num">{row.dated ? amount(row.spent) : "–"}</td>
                      <td data-label="Net" className={`is-num${row.dated && row.paid - row.spent < 0 ? " acc-owing" : ""}`}>{row.dated ? amount(row.paid - row.spent) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyLine>No terms have bills, receipts or spending yet.</EmptyLine>}
          <p className="acr-note">
            A term needs both a start and an end date before spending can land in it.
            {report.outsideSpend ? ` ${ugx(report.outsideSpend)} of spending falls outside every term.` : ""}
          </p>
        </Card>
      </Section>
    </div>
  );
}
