import Link from "next/link";
import { ApplicationFiltersBar, PendingPayments, ScrollingTabs, type PendingPayment } from "@/components/admin/Applications";
import { ApplicationBoard } from "@/components/admin/applications/ApplicationBoard";
import { ApplicationList } from "@/components/admin/applications/ApplicationList";
import type { ApplicationItem, WorkspaceContext } from "@/components/admin/applications/types";
import { PageHeader } from "@/components/admin/PageHeader";
import { filterHref, type ApplicationFilters } from "@/lib/applications";

export type QuickView = { label: string; value: number; icon: string; note: string; tone: string; href: string; active: boolean };
export type StatusTab = { value: string; label: string; count: number; tone: string };
export type PipelineStage = { value: string; label: string; tone: string; count: number };

export type WorkspaceViewProps = {
  base: string;
  filters: ApplicationFilters;
  totalApplications: number;
  openCount: number;
  offered: number;
  enrolled: number;
  collected: string;
  paidCount: number;
  pipeline: PipelineStage[];
  quick: QuickView[];
  tabs: StatusTab[];
  pendingPayments: PendingPayment[];
  paymentsTracked: boolean;
  campuses: string[];
  items: ApplicationItem[];
  context: WorkspaceContext;
  truncated: boolean;
  exportHref: string;
  total: number;
  from: number;
  pageSize: number;
};

const nf = (value: number) => value.toLocaleString("en-GB");

/** The applications page itself. Everything here is already loaded; ApplicationsWorkspace fetches it. */
export function WorkspaceView(props: WorkspaceViewProps) {
  const { base, filters, items, context, total, from, pageSize } = props;
  const board = filters.view === "board";
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const filtered = Boolean(filters.q || filters.campus || filters.grade || filters.owner || filters.payment || filters.received || filters.attention);

  return (
    <div className="app-page apl">
      <PageHeader
        kicker="Admissions"
        icon="fa-file-signature"
        title="Applications"
        description="Every admission application from the website and parent portal, shared by the whole team."
        actions={
          <>
            <a className="admin-hero-btn" href={props.exportHref}>
              <i className="fa-solid fa-file-arrow-down" aria-hidden="true" /> Export CSV
            </a>
            <a className="admin-hero-btn" href="/admissions" target="_blank" rel="noopener noreferrer">
              <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> Admissions page
            </a>
          </>
        }
      >
        <div className="apl-pipeline">
          <p className="apl-pipeline-head">
            <span>Admissions pipeline</span>
            <strong>{nf(props.totalApplications)} total</strong>
          </p>
          <div className="admin-pipeline is-dark" role="img" aria-label={props.pipeline.map((stage) => `${stage.label}: ${stage.count}`).join(", ") || "No applications yet"}>
            {props.pipeline.map((stage) => (
              <span key={stage.value} className={`admin-seg admin-seg-${stage.tone}`} style={{ flexGrow: stage.count }} title={`${stage.label}: ${stage.count}`} />
            ))}
          </div>
          <dl className="apl-pipeline-figures">
            <div><dt>Open</dt><dd>{nf(props.openCount)}</dd></div>
            <div><dt>Offered</dt><dd>{nf(props.offered)}</dd></div>
            <div><dt>Enrolled</dt><dd>{nf(props.enrolled)}</dd></div>
          </dl>
          <Link className="apl-pipeline-fees" href={filterHref(filters, { status: "all", payment: "paid" }, base)}>
            <i className="fa-solid fa-mobile-screen-button" aria-hidden="true" />
            <span><strong>{props.collected}</strong> in admission fees</span>
            <em>{props.paidCount} paid</em>
          </Link>
        </div>
      </PageHeader>

      <nav className="apw-quick" aria-label="Quick views">
        {props.quick.map((view) => (
          <Link
            key={view.label}
            href={view.href}
            className={`apw-quick-item is-${view.tone}${view.active ? " is-on" : ""}`}
            aria-current={view.active ? "page" : undefined}
          >
            <span className="apw-quick-icon" aria-hidden="true"><i className={`fa-solid ${view.icon}`} /></span>
            <span className="apw-quick-text">
              <strong>{nf(view.value)}</strong>
              <span>{view.label}</span>
              <small>{view.note}</small>
            </span>
          </Link>
        ))}
      </nav>

      {props.pendingPayments.length ? <PendingPayments items={props.pendingPayments} tracked={props.paymentsTracked} /> : null}

      <section className="apl-card apw-panel" aria-label="Applications">
        <header className="apw-head">
          {board ? (
            <div className="apw-head-title">
              <h2>Admissions board</h2>
              <p>Drag a card to move it to the next stage.</p>
            </div>
          ) : (
            <ScrollingTabs className="apw-tabs" label="Filter by status" current={filters.status}>
              {props.tabs.map((tab) => {
                const active = filters.status === tab.value;
                return (
                  <Link
                    key={tab.value}
                    href={filterHref(filters, { status: tab.value }, base)}
                    className={`${active ? "is-on" : ""}${tab.count ? "" : " is-empty"}`}
                    aria-current={active ? "page" : undefined}
                  >
                    {tab.tone ? <span className={`admin-dot admin-seg-${tab.tone}`} aria-hidden="true" /> : null}
                    {tab.label}
                    <em>{nf(tab.count)}</em>
                  </Link>
                );
              })}
            </ScrollingTabs>
          )}
          <nav className="apw-views" aria-label="View">
            <Link href={filterHref(filters, { view: "list" }, base)} className={board ? "" : "is-on"} aria-current={board ? undefined : "page"}>
              <i className="fa-solid fa-list" aria-hidden="true" /> List
            </Link>
            <Link href={filterHref(filters, { view: "board" }, base)} className={board ? "is-on" : ""} aria-current={board ? "page" : undefined}>
              <i className="fa-solid fa-table-columns" aria-hidden="true" /> Board
            </Link>
          </nav>
        </header>

        <ApplicationFiltersBar filters={filters} campuses={props.campuses} team={context.team} total={board ? null : total} />

        {context.emailProblem ? (
          <p className="apw-banner">
            <i className="fa-regular fa-envelope" aria-hidden="true" />
            Parent emails are off: {context.emailProblem}
          </p>
        ) : null}

        {!items.length ? (
          <div className="apw-empty">
            <span aria-hidden="true"><i className={`fa-solid ${filters.attention ? "fa-circle-check" : filtered ? "fa-magnifying-glass" : "fa-inbox"}`} /></span>
            <h2>{filters.attention ? "Nothing needs attention" : props.totalApplications ? "No matching applications" : "No applications yet"}</h2>
            <p>
              {filters.attention
                ? "Every open application has an owner and is moving on time."
                : props.totalApplications ? "Try another status, or clear the search and filters." : "New applications from the website will appear here."}
            </p>
            {filtered || filters.status !== "open" ? (
              <Link className="apw-empty-btn" href={filterHref(filters, { q: "", campus: "", grade: "", owner: "", payment: "", received: "", attention: false, status: "all" }, base)}>
                Show every application
              </Link>
            ) : null}
          </div>
        ) : board ? (
          <ApplicationBoard items={items} context={context} truncated={props.truncated} />
        ) : (
          <ApplicationList items={items} context={context} exportHref={props.exportHref} />
        )}

        {!board && total ? (
          <footer className="apl-pager apw-pager">
            <span>
              Showing <strong>{nf(from + 1)}–{nf(Math.min(from + pageSize, total))}</strong> of <strong>{nf(total)}</strong>
            </span>
            {pages > 1 ? (
              <div>
                {filters.page > 1 ? (
                  <Link className="apl-page-btn" href={filterHref(filters, { page: filters.page - 1 }, base)}>
                    <i className="fa-solid fa-chevron-left" aria-hidden="true" /> Previous
                  </Link>
                ) : null}
                <span className="apl-page-num">Page {filters.page} of {pages}</span>
                {filters.page < pages ? (
                  <Link className="apl-page-btn" href={filterHref(filters, { page: filters.page + 1 }, base)}>
                    Next <i className="fa-solid fa-chevron-right" aria-hidden="true" />
                  </Link>
                ) : null}
              </div>
            ) : null}
          </footer>
        ) : null}
      </section>
    </div>
  );
}
