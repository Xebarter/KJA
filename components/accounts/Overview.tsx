import Link from "next/link";
import { AccountsPageHeader } from "@/components/accounts/AccountsPageHeader";
import { AgingBar, ColumnChart, Progress, type Column } from "@/components/accounts/ui";
import { StudentFace } from "@/components/StudentFace";
import { ACCOUNTS_BASE } from "@/lib/accounts";
import {
  methodInfo,
  percent,
  ugx,
  ugxShort,
  type AgingKey,
} from "@/lib/accounts-format";

const ACTIVITY_ICON: Record<string, string> = {
  payment: "fa-receipt",
  invoice: "fa-file-invoice",
  expense: "fa-wallet",
  void: "fa-ban",
  reminder: "fa-envelope",
  discount: "fa-tag",
  setup: "fa-sliders",
  note: "fa-note-sticky",
};

export type OverviewClass = { code: string; name: string; section: string; billed: number; paid: number };
export type OverviewPayment = { id: string; name: string; receipt: string; paidOn: string; method: string; amount: number };
export type OverviewDebtor = { id: string; name: string; classCode: string | null; balance: number };
export type OverviewActivity = { id: string; kind: string; body: string; when: string; who: string };

export type AccountsOverviewProps = {
  title: string;
  todayLabel: string;
  today: string;
  termLabel: string | null;
  needsSetup: boolean;
  collectedToday: number;
  collectedTerm: number;
  billedTerm: number;
  rate: number;
  outstanding: number;
  debtorCount: number;
  pendingCount: number;
  pendingTotal: number;
  received30: number;
  spent30: number;
  columns: Column[];
  buckets: Record<AgingKey, { count: number; total: number }>;
  classes: OverviewClass[];
  payments: OverviewPayment[];
  debtors: OverviewDebtor[];
  activity: OverviewActivity[];
};

function money(value: number) {
  return (
    <>
      <small>UGX</small> {ugxShort(value)}
    </>
  );
}

function RateRing({ value }: { value: number }) {
  return (
    <span className="aov-rate" title={`${value}% of this term's bill collected`}>
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r="15" />
        <circle className="is-value" cx="18" cy="18" r="15" pathLength={100} style={{ "--aov-rate": value } as React.CSSProperties} />
      </svg>
      <em>{value}%</em>
    </span>
  );
}

function Card({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className="aov-card" aria-labelledby={id}>
      <header className="aov-card-head">
        <div>
          <h2 id={id}>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {action ? (
          <Link href={action.href}>
            {action.label} <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </Link>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function Quiet({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <p className="aov-quiet">
      <i className={`fa-solid ${icon}`} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

const SECTIONS = [
  { key: "nursery", label: "Nursery" },
  { key: "primary", label: "Primary" },
];

/** The accounts office home: today's position, then the work waiting on the desk. */
export function AccountsOverview(props: AccountsOverviewProps) {
  const net = props.received30 - props.spent30;
  const waiting = (props.pendingCount ? 1 : 0) + (props.debtorCount ? 1 : 0);
  const tasks = [
    {
      label: "Expenses to approve",
      note: props.pendingCount ? ugx(props.pendingTotal) : "Nothing waiting",
      count: props.pendingCount,
      href: `${ACCOUNTS_BASE}/expenses?status=pending`,
      icon: "fa-receipt",
    },
    {
      label: "Pupils who owe",
      note: props.outstanding ? ugxShort(props.outstanding) : "Everyone is paid up",
      count: props.debtorCount,
      href: `${ACCOUNTS_BASE}/debtors`,
      icon: "fa-hand-holding-dollar",
    },
  ];
  const classGroups = SECTIONS.map((section) => ({
    ...section,
    rows: props.classes.filter((row) => row.section === section.key),
  })).filter((section) => section.rows.length);
  const otherClasses = props.classes.filter((row) => !SECTIONS.some((section) => section.key === row.section));
  const moved = props.received30 > 0 || props.spent30 > 0;

  return (
    <div className="app-page ofc-page acc-page aov-page">
      <AccountsPageHeader
        kicker={props.todayLabel}
        icon="fa-calendar"
        iconFamily="regular"
        title={props.title}
        description={
          <>
            {props.termLabel ? <span className="aov-term">{props.termLabel}</span> : <span className="aov-term is-setup">No term set</span>}
            <span>
              <strong>{ugxShort(props.collectedToday)}</strong> in today
            </span>
            {props.outstanding ? (
              <>
                <span className="aov-dot" aria-hidden="true" />
                <span>
                  <strong>{ugxShort(props.outstanding)}</strong> still owed
                </span>
              </>
            ) : (
              <>
                <span className="aov-dot" aria-hidden="true" />
                <span>All current pupils paid up</span>
              </>
            )}
          </>
        }
        actions={
          <>
            <Link className="aov-btn is-primary" href={`${ACCOUNTS_BASE}/payments?record=1`}>
              <i className="fa-solid fa-plus" aria-hidden="true" /> Record payment
            </Link>
            <Link className="aov-btn" href={`${ACCOUNTS_BASE}/expenses?add=1`}>
              <i className="fa-solid fa-receipt" aria-hidden="true" /> Add expense
            </Link>
            <Link className="aov-btn" href={`${ACCOUNTS_BASE}/reports`}>
              <i className="fa-solid fa-chart-column" aria-hidden="true" /> Reports
            </Link>
          </>
        }
      />

      {props.needsSetup ? (
        <div className="acc-banner is-warn aov-setup">
          <i className="fa-solid fa-sliders" aria-hidden="true" />
          <p>Set the current term and class fees, then generate invoices.</p>
          <Link className="aov-btn is-primary" href={`${ACCOUNTS_BASE}/settings`}>
            Fee setup
          </Link>
        </div>
      ) : null}

      <section className="aov-figures" aria-label="Today's figures">
        <Link className="aov-stat is-good" href={`${ACCOUNTS_BASE}/payments?range=today`}>
          <span className="aov-stat-top">
            <span>Collected today</span>
            <i className="fa-solid fa-coins" aria-hidden="true" />
          </span>
          <strong>{money(props.collectedToday)}</strong>
          <small>{props.today}</small>
        </Link>
        <Link className="aov-stat" href={`${ACCOUNTS_BASE}/reports#collections`}>
          <span className="aov-stat-top">
            <span>{props.termLabel ? `Collected in ${props.termLabel}` : "Collected"}</span>
          </span>
          <span className="aov-stat-row">
            <strong>{money(props.collectedTerm)}</strong>
            {props.billedTerm ? <RateRing value={props.rate} /> : null}
          </span>
          <small>{props.billedTerm ? `of ${ugxShort(props.billedTerm)} billed` : "No invoices yet"}</small>
        </Link>
        <Link className={`aov-stat${props.outstanding ? " is-bad" : " is-good"}`} href={`${ACCOUNTS_BASE}/debtors`}>
          <span className="aov-stat-top">
            <span>Outstanding</span>
            <i className="fa-solid fa-hand-holding-dollar" aria-hidden="true" />
          </span>
          <strong>{money(props.outstanding)}</strong>
          <small>{props.debtorCount.toLocaleString("en-GB")} {props.debtorCount === 1 ? "pupil owes" : "pupils owe"}</small>
        </Link>
        <Link className={`aov-stat${props.pendingCount ? " is-warn" : " is-good"}`} href={`${ACCOUNTS_BASE}/expenses?status=pending`}>
          <span className="aov-stat-top">
            <span>Awaiting approval</span>
            <i className="fa-solid fa-receipt" aria-hidden="true" />
          </span>
          <strong>{props.pendingCount.toLocaleString("en-GB")}</strong>
          <small>{props.pendingCount ? ugx(props.pendingTotal) : "Nothing waiting"}</small>
        </Link>
      </section>

      <div className="aov-grid">
        <div className="aov-col aov-col-desk">
          <Card
            id="aov-desk"
            title="Needs attention"
            description={waiting ? `${waiting} ${waiting === 1 ? "item" : "items"} waiting` : "Nothing waiting"}
            action={{ href: `${ACCOUNTS_BASE}/debtors`, label: "Debtors" }}
          >
            {props.outstanding ? (
              <div className="aov-aging">
                <AgingBar buckets={props.buckets} hrefFor={(key) => `${ACCOUNTS_BASE}/debtors?aging=${key}`} />
              </div>
            ) : (
              <Quiet icon="fa-face-smile">Every current pupil is paid up.</Quiet>
            )}
            <ul className="aov-tasks">
              {tasks.map((item) => (
                <li key={item.label}>
                  <Link href={item.href} className={item.count ? "" : "is-done"}>
                    <span className="aov-task-icon" aria-hidden="true">
                      <i className={`fa-solid ${item.count ? item.icon : "fa-check"}`} />
                    </span>
                    <span className="aov-task-text">
                      <strong>{item.label}</strong>
                      <small>{item.note}</small>
                    </span>
                    <em>{item.count.toLocaleString("en-GB")}</em>
                    <i className="fa-solid fa-chevron-right" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
            {props.debtors.length ? (
              <>
                <p className="aov-section">Largest balances</p>
                <ul className="aov-people">
                  {props.debtors.map((row) => (
                    <li key={row.id}>
                      <Link href={`${ACCOUNTS_BASE}/students/${row.id}`}>
                        <StudentFace id={row.id} name={row.name} className="aov-avatar" />
                        <span>
                          <strong>{row.name}</strong>
                          <small>{row.classCode ?? "No class"}</small>
                        </span>
                        <em title={ugx(row.balance)}>{ugxShort(row.balance)}</em>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </Card>

          <Card id="aov-receipts" title="Recent payments" description="Latest receipts." action={{ href: `${ACCOUNTS_BASE}/payments`, label: "All payments" }}>
            {props.payments.length ? (
              <ul className="aov-people">
                {props.payments.map((row) => {
                  const method = methodInfo(row.method);
                  return (
                    <li key={row.id}>
                      <Link href={`${ACCOUNTS_BASE}/payments/${row.id}`}>
                        <span className={`aov-avatar is-${method.value}`} aria-hidden="true">
                          <i className={`fa-solid ${method.icon}`} />
                        </span>
                        <span>
                          <strong>{row.name}</strong>
                          <small>
                            {row.receipt} · {row.paidOn} · {method.label}
                          </small>
                        </span>
                        <em className="is-in" title={ugx(row.amount)}>{ugxShort(row.amount)}</em>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Quiet icon="fa-money-bill-wave">
                No payments yet. <Link href={`${ACCOUNTS_BASE}/payments?record=1`}>Record one</Link>
              </Quiet>
            )}
          </Card>

          <Card id="aov-activity" title="Activity" description="Latest fee-account changes.">
            {props.activity.length ? (
              <ol className="aov-log">
                {props.activity.map((row) => (
                  <li key={row.id}>
                    <span className={`aov-log-icon is-${row.kind}`} aria-hidden="true">
                      <i className={`fa-solid ${ACTIVITY_ICON[row.kind] ?? "fa-pen"}`} />
                    </span>
                    <div>
                      <p>{row.body}</p>
                      <small>
                        {row.when}
                        {row.who ? ` · ${row.who}` : ""}
                      </small>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <Quiet icon="fa-clock-rotate-left">Nothing recorded yet.</Quiet>
            )}
          </Card>
        </div>

        <div className="aov-col aov-col-insight">
          <Card id="aov-cash" title="Last 30 days" description="Fees received vs approved or paid spending." action={{ href: `${ACCOUNTS_BASE}/reports`, label: "Reports" }}>
            <ul className="aov-cash">
              <li className="is-in">
                <span>Fees received</span>
                <strong>{ugxShort(props.received30)}</strong>
              </li>
              <li className="is-out">
                <span>Spending</span>
                <strong>{ugxShort(props.spent30)}</strong>
              </li>
              <li className={net < 0 ? "is-down" : "is-net"}>
                <span>Net</span>
                <strong>{ugxShort(net)}</strong>
              </li>
            </ul>
            {moved ? (
              <ColumnChart columns={props.columns} label="Fees received and spending over 30 days" legend={["Fees received", "Spending"]} />
            ) : (
              <Quiet icon="fa-chart-column">No fees or spending in the last 30 days.</Quiet>
            )}
          </Card>

          <Card id="aov-classes" title="Collected by class" description={props.termLabel ?? "This term"} action={{ href: `${ACCOUNTS_BASE}/reports`, label: "Reports" }}>
            {classGroups.length || otherClasses.length ? (
              <div className="aov-classes">
                {classGroups.map((section) => (
                  <div key={section.key}>
                    <p className="aov-section">{section.label}</p>
                    <ul>
                      {section.rows.map((row) => (
                        <ClassRow key={row.code} row={row} />
                      ))}
                    </ul>
                  </div>
                ))}
                {otherClasses.length ? (
                  <ul>
                    {otherClasses.map((row) => (
                      <ClassRow key={row.code} row={row} />
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <Quiet icon="fa-chalkboard">Generate term invoices to see collection by class.</Quiet>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function ClassRow({ row }: { row: OverviewClass }) {
  const share = row.billed ? percent(row.paid, row.billed) : 0;
  return (
    <li>
      <Link href={`${ACCOUNTS_BASE}/students?class=${row.code}&balance=owing`} title={`${row.name}: ${ugx(row.paid)} of ${ugx(row.billed)}`}>
        <span className="aov-code">{row.code}</span>
        <span className="aov-class-name">
          <strong>{row.name}</strong>
          <small>
            {ugxShort(row.paid)} of {ugxShort(row.billed)}
          </small>
        </span>
        <Progress value={row.paid} max={row.billed || row.paid} label={`${row.code} collected`} />
        <em className={share >= 100 ? "is-done" : ""}>{row.billed ? `${share}%` : "-"}</em>
      </Link>
    </li>
  );
}
