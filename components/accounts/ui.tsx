import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import {
  AGING,
  expenseStatusInfo,
  invoiceStatusInfo,
  methodInfo,
  ugx,
  ugxShort,
  type AgingKey,
} from "@/lib/accounts-format";

/** A full-page message when the accounts office can't load: not connected, no access or the migration hasn't run. */
export function AccountsNotice({ title, icon = "fa-plug-circle-exclamation", heading, children }: {
  title: string;
  icon?: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div className="app-page">
      <PageHeader kicker="Accounts office" icon="fa-calculator" title={title} description="Kampala Junior Academy fees, payments and spending." />
      <div className="admin-card app-notice apl-notice">
        <i className={`fa-solid ${icon}`} aria-hidden="true" />
        <div>
          <h2>{heading}</h2>
          {children}
        </div>
      </div>
    </div>
  );
}

export function SchemaHint({ message }: { message: string }) {
  return (
    <>
      <p>{message}</p>
      <p>
        If this is a new setup, run <code>supabase/0014_accounts.sql</code> in the Supabase SQL editor (after the admissions office files up to{" "}
        <code>0013_student_photos.sql</code>).
      </p>
    </>
  );
}

/** Shown in place of a page until Supabase is connected, the user has access and the schema exists. */
export function notReady(title: string, problem: { kind: "config" } | { kind: "auth"; message?: string | null } | { kind: "schema"; message?: string | null }) {
  if (problem.kind === "config") {
    return <AccountsNotice title={title} heading="Connect Supabase"><p>Add your Supabase keys to <code>.env.local</code> to use the accounts office.</p></AccountsNotice>;
  }
  if (problem.kind === "auth") {
    return <AccountsNotice title={title} icon="fa-lock" heading="Not available"><p>{problem.message}</p></AccountsNotice>;
  }
  return <AccountsNotice title={title} heading="The accounts office isn't set up yet"><SchemaHint message={problem.message || "The accounts tables are not available yet."} /></AccountsNotice>;
}

export function Money({ value, tone, short = false }: { value: number; tone?: "auto" | "plain"; short?: boolean }) {
  const cls = tone === "auto" ? (value > 0 ? " is-owing" : value < 0 ? " is-credit" : " is-clear") : "";
  return <span className={`acc-money${cls}`} title={short ? ugx(value) : undefined}>{short ? ugxShort(value) : ugx(value)}</span>;
}

/** Owing, cleared or in credit, for a pupil or family balance. */
export function BalancePill({ balance }: { balance: number }) {
  if (balance > 0) return <span className="app-status app-status-new">Owes {ugxShort(balance)}</span>;
  if (balance < 0) return <span className="app-status app-status-visit">Credit {ugxShort(-balance)}</span>;
  return <span className="app-status app-status-done">Cleared</span>;
}

export function InvoiceStatus({ status }: { status: string }) {
  const info = invoiceStatusInfo(status);
  return <span className={`app-status app-status-${info.tone}`}>{info.label}</span>;
}

export function ExpenseStatus({ status }: { status: string }) {
  const info = expenseStatusInfo(status);
  return <span className={`app-status app-status-${info.tone}`}>{info.label}</span>;
}

export function MethodTag({ method }: { method: string | null | undefined }) {
  if (!method) return <span className="app-muted">–</span>;
  const info = methodInfo(method);
  return (
    <span className={`acc-method is-${info.value}`}>
      <i className={`fa-solid ${info.icon}`} aria-hidden="true" /> {info.label}
    </span>
  );
}

/** How old the unpaid balances are, as one stacked bar with a legend. */
export function AgingBar({ buckets, hrefFor }: { buckets: Record<AgingKey, { count: number; total: number }>; hrefFor?: (key: AgingKey) => string }) {
  const total = AGING.reduce((sum, bucket) => sum + buckets[bucket.key].total, 0);
  return (
    <div className="acc-aging">
      <div className="acc-aging-bar" role="img" aria-label={AGING.map((bucket) => `${bucket.label}: ${ugx(buckets[bucket.key].total)}`).join(", ")}>
        {total ? AGING.map((bucket) => buckets[bucket.key].total ? (
          <span key={bucket.key} className={`is-${bucket.tone}`} style={{ flexGrow: buckets[bucket.key].total }} />
        ) : null) : <span className="is-empty" style={{ flexGrow: 1 }} />}
      </div>
      <ul className="acc-aging-legend">
        {AGING.map((bucket) => {
          const inner = (
            <>
              <i className={`is-${bucket.tone}`} aria-hidden="true" />
              <span>{bucket.short}</span>
              <strong>{ugxShort(buckets[bucket.key].total)}</strong>
              <small>{buckets[bucket.key].count} pupil{buckets[bucket.key].count === 1 ? "" : "s"}</small>
            </>
          );
          return <li key={bucket.key}>{hrefFor ? <Link href={hrefFor(bucket.key)}>{inner}</Link> : <div>{inner}</div>}</li>;
        })}
      </ul>
    </div>
  );
}

export type Column = { key: string; label: string; sub?: string; value: number; secondary?: number; href?: string; highlight?: boolean };

/** Vertical columns drawn with CSS, scaled to the tallest. Optional second series shows as a thinner bar. */
export function ColumnChart({ columns, label, legend, format = ugxShort }: {
  columns: Column[];
  label: string;
  legend?: [string, string?];
  format?: (value: number) => string;
}) {
  const max = Math.max(1, ...columns.map((column) => Math.max(column.value, column.secondary ?? 0)));
  return (
    <figure className="acc-columns" aria-label={label}>
      {legend ? (
        <figcaption className="ofc-legend">
          <span><i className="acc-swatch is-main" aria-hidden="true" /> {legend[0]}</span>
          {legend[1] ? <span><i className="acc-swatch is-second" aria-hidden="true" /> {legend[1]}</span> : null}
        </figcaption>
      ) : null}
      <ol style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
        {columns.map((column) => {
          const title = `${column.label}${column.sub ? ` ${column.sub}` : ""}: ${ugx(column.value)}${column.secondary !== undefined ? ` · ${ugx(column.secondary)}` : ""}`;
          const bars = (
            <>
              <span className="acc-col-bars">
                <span className="acc-col is-main" style={{ height: `${(column.value / max) * 100}%` }} />
                {column.secondary !== undefined ? <span className="acc-col is-second" style={{ height: `${(column.secondary / max) * 100}%` }} /> : null}
              </span>
              <span className="acc-col-label">{column.label}</span>
            </>
          );
          return (
            <li key={column.key} className={column.highlight ? "is-highlight" : ""} title={title}>
              <span className="acc-col-value">{column.value ? format(column.value) : ""}</span>
              {column.href ? <Link href={column.href}>{bars}</Link> : <div>{bars}</div>}
            </li>
          );
        })}
      </ol>
    </figure>
  );
}

/** A progress bar for "collected of billed". */
export function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
  return (
    <span className="acc-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

/** Pill links for quick filters, e.g. invoice status. */
export function Chips({ items, label }: { items: { href: string; label: string; count?: number; on: boolean }[]; label: string }) {
  return (
    <nav className="ofc-chips" aria-label={label}>
      {items.map((item) => (
        <Link key={item.href + item.label} href={item.href} className={item.on ? "is-on" : ""} aria-current={item.on ? "true" : undefined} scroll={false}>
          {item.label}
          {item.count !== undefined ? <span>{item.count.toLocaleString("en-GB")}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

const STAT_ICON = { good: "fa-circle-check", warn: "fa-clock", bad: "fa-circle-exclamation" };

export function Stat({ label, value, note, tone, icon }: { label: string; value: React.ReactNode; note?: React.ReactNode; tone?: "good" | "warn" | "bad"; icon?: string }) {
  return (
    <div className={`acc-stat${tone ? ` is-${tone}` : ""}`}>
      <span className="acc-stat-top">
        <span>{label}</span>
        <i className={`fa-solid ${icon ?? (tone ? STAT_ICON[tone] : "fa-chart-simple")}`} aria-hidden="true" />
      </span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  );
}
