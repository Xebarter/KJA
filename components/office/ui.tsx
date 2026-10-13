import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { studentStatusInfo } from "@/lib/students";

export function StudentStatus({ status }: { status: string | null | undefined }) {
  const info = studentStatusInfo(status);
  return <span className={`app-status app-status-${info.tone}`}>{info.label}</span>;
}

export function Sex({ sex }: { sex: string | null | undefined }) {
  if (sex !== "M" && sex !== "F") return <span className="app-muted">–</span>;
  return <span className={`ofc-sex is-${sex === "M" ? "boy" : "girl"}`} title={sex === "M" ? "Boy" : "Girl"}>{sex}</span>;
}

/** A full-page message when the office can't load: not connected, no access or the migration hasn't run. */
export function OfficeNotice({ title, icon = "fa-plug-circle-exclamation", heading, children }: {
  title: string;
  icon?: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div className="app-page">
      <PageHeader kicker="Admissions office" icon="fa-building-user" title={title} description="Kampala Junior Academy admissions and student register." />
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

export function MigrationHint({ message }: { message: string }) {
  return (
    <>
      <p>{message}</p>
      <p>
        If this is a new setup, run every file in <code>supabase/0010_student_register</code> and then <code>supabase/0011_admissions_office.sql</code> in
        the Supabase SQL editor.
      </p>
    </>
  );
}

export function Empty({ icon = "fa-folder-open", title, children }: { icon?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="apl-empty">
      <span><i className={`fa-regular ${icon}`} aria-hidden="true" /></span>
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function Panel({ title, description, action, children, className = "", id }: {
  title: string;
  description?: React.ReactNode;
  action?: { href: string; label: string; file?: boolean };
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={`dash-panel ofc-panel ${className}`} id={id}>
      <header className="dash-panel-head">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {action?.file ? <a className="is-file" href={action.href}><i className="fa-solid fa-file-csv" aria-hidden="true" /> {action.label}</a> : null}
        {action && !action.file ? <Link href={action.href}>{action.label}</Link> : null}
      </header>
      {children}
    </section>
  );
}

export type Kpi = { label: string; value: number | string; icon: string; note: string; href: string; up?: boolean };

export function Kpis({ items, columns = 4 }: { items: Kpi[]; columns?: 3 | 4 }) {
  return (
    <div className={`admin-kpis${columns === 3 ? " is-3" : ""}`}>
      {items.map((kpi) => (
        <Link key={kpi.label} href={kpi.href} className="admin-kpi">
          <span className="admin-kpi-icon"><i className={`fa-solid ${kpi.icon}`} aria-hidden="true" /></span>
          <span className="admin-kpi-label">{kpi.label}</span>
          <strong>{typeof kpi.value === "number" ? kpi.value.toLocaleString("en-GB") : kpi.value}</strong>
          <span className={`admin-kpi-note${kpi.up ? " is-up" : ""}`}>
            {kpi.up ? <i className="fa-solid fa-arrow-trend-up" aria-hidden="true" /> : null} {kpi.note}
          </span>
          <i className="fa-solid fa-arrow-right admin-kpi-go" aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
}

export type Bar = { label: string; sub?: string; href?: string; segments: { value: number; tone: string; label: string }[] };

/** Horizontal stacked bars drawn with CSS, scaled to the largest row. */
export function BarChart({ rows, legend, label }: { rows: Bar[]; legend?: { tone: string; label: string }[]; label: string }) {
  const max = Math.max(1, ...rows.map((row) => row.segments.reduce((sum, segment) => sum + segment.value, 0)));
  return (
    <figure className="ofc-bars" aria-label={label}>
      {legend ? (
        <figcaption className="ofc-legend">
          {legend.map((item) => <span key={item.label}><i className={`tone-${item.tone}`} aria-hidden="true" /> {item.label}</span>)}
        </figcaption>
      ) : null}
      <ul>
        {rows.map((row) => {
          const total = row.segments.reduce((sum, segment) => sum + segment.value, 0);
          const title = `${row.label}: ${row.segments.map((segment) => `${segment.value} ${segment.label}`).join(", ")}`;
          const inner = (
            <>
              <span className="ofc-bar-label">
                <strong>{row.label}</strong>
                {row.sub ? <small>{row.sub}</small> : null}
              </span>
              <span className="ofc-bar-track" title={title}>
                <span className="ofc-bar-fill" style={{ width: `${(total / max) * 100}%` }}>
                  {row.segments.map((segment) => segment.value ? (
                    <span key={segment.label} className={`tone-${segment.tone}`} style={{ flexGrow: segment.value }} />
                  ) : null)}
                </span>
              </span>
              <span className="ofc-bar-value">{total.toLocaleString("en-GB")}</span>
            </>
          );
          return <li key={row.label}>{row.href ? <Link href={row.href}>{inner}</Link> : <div>{inner}</div>}</li>;
        })}
      </ul>
    </figure>
  );
}

export function Pager({ page, pages, total, from, size, href }: {
  page: number;
  pages: number;
  total: number;
  from: number;
  size: number;
  href: (page: number) => string;
}) {
  if (!total) return null;
  return (
    <footer className="apl-pager">
      <span>
        Showing <strong>{from + 1}–{Math.min(from + size, total)}</strong> of <strong>{total.toLocaleString("en-GB")}</strong>
      </span>
      {pages > 1 ? (
        <div>
          {page > 1 ? <Link className="apl-page-btn" href={href(page - 1)}><i className="fa-solid fa-chevron-left" aria-hidden="true" /> Previous</Link> : null}
          <span className="apl-page-num">Page {page} of {pages}</span>
          {page < pages ? <Link className="apl-page-btn" href={href(page + 1)}>Next <i className="fa-solid fa-chevron-right" aria-hidden="true" /></Link> : null}
        </div>
      ) : null}
    </footer>
  );
}

export function Detail({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`app-detail${wide ? " ofc-detail-wide" : ""}`}>
      <dt>{label}</dt>
      <dd>{children === null || children === undefined || children === "" ? <span className="app-muted">Not recorded</span> : children}</dd>
    </div>
  );
}
