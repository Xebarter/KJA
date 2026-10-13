import Link from "next/link";
import { CopyButton, SubscriberTable, type SubscriberRow } from "@/components/admin/Inbox";
import { PageHeader } from "@/components/admin/PageHeader";
import { formatDate, formatDateTime, initials, timeAgo } from "@/lib/applications";
import { emailDomain, monthlySignups, topDomains, type Subscriber } from "@/lib/inbox";
import "@/app/admin/inbox.css";

const BASE = "/admin/inbox/newsletter";
const PAGE_SIZE = 50;
const DAY = 24 * 60 * 60 * 1000;
const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "az", label: "Email A–Z" },
] as const;
type Sort = (typeof SORTS)[number]["value"];
export type NewsletterState = { q: string; sort: Sort; page: number };

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export function parseNewsletterState(params: Record<string, string | string[] | undefined>): NewsletterState {
  const sortParam = first(params.sort);
  const page = Number.parseInt(first(params.page), 10);
  return {
    q: first(params.q).slice(0, 100),
    sort: SORTS.some((item) => item.value === sortParam) ? (sortParam as Sort) : "newest",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

function href(state: NewsletterState, changes: Partial<NewsletterState>) {
  const next = { ...state, page: 1, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.sort !== "newest") params.set("sort", next.sort);
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return query ? `${BASE}?${query}` : BASE;
}

export function NewsletterSetup() {
  return (
    <div className="inbox-page">
      <Hero total={0} month={0} week={0} trend={[]} emails="" />
      <div className="admin-card app-notice">
        <h2>Connect Supabase to collect subscribers</h2>
        <p>The newsletter sign-up form in the site footer stores emails in Supabase. Add the project keys to start building your list.</p>
      </div>
    </div>
  );
}

export function NewsletterView({ state, all, error, nowMs }: { state: NewsletterState; all: Subscriber[]; error?: string; nowMs: number }) {
  const { q, sort } = state;
  const age = (row: Subscriber) => nowMs - new Date(row.created_at).getTime();
  const month = all.filter((row) => age(row) < 30 * DAY).length;
  const previousMonth = all.filter((row) => age(row) >= 30 * DAY && age(row) < 60 * DAY).length;
  const week = all.filter((row) => age(row) < 7 * DAY).length;
  const months = monthlySignups(all);
  const yearTotal = months.reduce((sum, bucket) => sum + bucket.count, 0);
  const peak = Math.max(1, ...months.map((bucket) => bucket.count));
  const domains = topDomains(all);
  const growth = previousMonth ? Math.round(((month - previousMonth) / previousMonth) * 100) : null;
  const best = months.reduce((top, bucket) => (bucket.count > top.count ? bucket : top), months[0]);

  const needle = q.toLowerCase();
  const matches = needle ? all.filter((row) => row.email.toLowerCase().includes(needle)) : [...all];
  if (sort === "oldest") matches.reverse();
  if (sort === "az") matches.sort((a, b) => a.email.localeCompare(b.email));
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const page = Math.min(state.page, pages);
  const visible = matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const rows: SubscriberRow[] = visible.map((row) => ({
    id: row.id,
    email: row.email,
    initials: initials(row.email),
    domain: emailDomain(row.email),
    joined: timeAgo(row.created_at, nowMs),
    joinedFull: formatDateTime(row.created_at),
    isNew: age(row) < 7 * DAY,
  }));

  return (
    <div className="inbox-page">
      <Hero total={all.length} month={month} week={week} trend={months.map((bucket) => bucket.count)} emails={all.map((row) => row.email).join(", ")} />

      {error ? (
        <p className="app-feedback is-error" role="alert">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> Couldn&apos;t load subscribers: {error}
        </p>
      ) : null}

      <div className="admin-kpis nl-kpis">
        <div className="admin-kpi">
          <span className="admin-kpi-icon"><i className="fa-solid fa-arrow-trend-up" aria-hidden="true" /></span>
          <span className="admin-kpi-label">Growth</span>
          <strong>{growth === null ? (month ? "New" : "—") : `${growth > 0 ? "+" : ""}${growth}%`}</strong>
          <span className={`admin-kpi-note${growth !== null && growth > 0 ? " is-up" : ""}`}>
            {previousMonth ? `${month} vs ${previousMonth} in the previous 30 days` : month ? "First sign-ups in 60 days" : "No sign-ups in 60 days"}
          </span>
        </div>
        <div className="admin-kpi">
          <span className="admin-kpi-icon"><i className="fa-solid fa-trophy" aria-hidden="true" /></span>
          <span className="admin-kpi-label">Best month</span>
          <strong className="nl-kpi-text">{best.count ? `${best.label} ${best.year}` : "—"}</strong>
          <span className="admin-kpi-note">{best.count ? `${best.count} ${best.count === 1 ? "sign-up" : "sign-ups"}` : "Over the last 12 months"}</span>
        </div>
        <div className="admin-kpi">
          <span className="admin-kpi-icon"><i className="fa-solid fa-at" aria-hidden="true" /></span>
          <span className="admin-kpi-label">Top provider</span>
          <strong className="nl-kpi-text">{domains[0]?.domain ?? "—"}</strong>
          <span className="admin-kpi-note">{domains[0] ? `${Math.round((domains[0].count / all.length) * 100)}% of the list` : "No sign-ups yet"}</span>
        </div>
        <div className="admin-kpi">
          <span className="admin-kpi-icon"><i className="fa-solid fa-clock-rotate-left" aria-hidden="true" /></span>
          <span className="admin-kpi-label">Latest sign-up</span>
          <strong className="nl-kpi-text">{all[0] ? timeAgo(all[0].created_at, nowMs) : "—"}</strong>
          <span className="admin-kpi-note">{all.length ? `List started ${formatDate(all[all.length - 1].created_at)}` : "Waiting for the first subscriber"}</span>
        </div>
      </div>

      <div className="nl-insights">
        <section className="dash-panel nl-chart-panel">
          <div className="dash-panel-head">
            <div>
              <h2>Sign-ups by month</h2>
              <p>{yearTotal} new {yearTotal === 1 ? "subscriber" : "subscribers"} in the last 12 months</p>
            </div>
          </div>
          <ol className="nl-chart" aria-label="Monthly sign-ups">
            {months.map((bucket, index) => (
              <li key={bucket.key} className={index === months.length - 1 ? "is-current" : undefined}>
                <span className="nl-bar" style={{ height: `${Math.max(bucket.count ? 6 : 2, (bucket.count / peak) * 100)}%` }}>
                  <em>{bucket.count}</em>
                </span>
                <span className="nl-chart-label">
                  {bucket.label}
                  {bucket.label === "Jan" || index === 0 ? <small>{bucket.year}</small> : null}
                </span>
                <span className="visually-hidden">{`${bucket.label} ${bucket.year}: ${bucket.count}`}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="dash-panel nl-domains-panel">
          <div className="dash-panel-head">
            <div>
              <h2>Email providers</h2>
              <p>Where your newsletter is delivered</p>
            </div>
          </div>
          {domains.length ? (
            <ul className="nl-domains">
              {domains.map((item) => (
                <li key={item.domain}>
                  <span className="nl-domain-name">{item.domain}</span>
                  <span className="nl-domain-count">{item.count} · {Math.round((item.count / all.length) * 100)}%</span>
                  <span className="nl-domain-track"><span style={{ width: `${(item.count / domains[0].count) * 100}%` }} /></span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dash-empty">Providers appear once people subscribe.</p>
          )}
        </section>
      </div>

      <section className="admin-card nl-list">
        <div className="nl-list-head">
          <div>
            <h2>Subscribers</h2>
            <p>{q ? `${matches.length} of ${all.length} match “${q}”` : `${all.length} ${all.length === 1 ? "person" : "people"} on the list`}</p>
          </div>
          <form className="nl-tools" action={BASE} role="search">
            <div className="inbox-search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
              <label className="visually-hidden" htmlFor="nl-q">Search subscribers</label>
              <input id="nl-q" name="q" type="search" defaultValue={q} placeholder="Search email…" />
              {q ? (
                <Link href={href(state, { q: "" })} className="inbox-search-clear" aria-label="Clear search">
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </Link>
              ) : null}
            </div>
            <label className="visually-hidden" htmlFor="nl-sort">Sort subscribers</label>
            <select id="nl-sort" name="sort" defaultValue={sort}>
              {SORTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <button className="admin-btn admin-btn-ghost" type="submit">Apply</button>
          </form>
        </div>

        {rows.length ? (
          <SubscriberTable rows={rows} />
        ) : (
          <div className="inbox-empty">
            <span><i className={`fa-solid ${q ? "fa-magnifying-glass" : "fa-paper-plane"}`} aria-hidden="true" /></span>
            <h3>{q ? "No matching subscribers" : "No subscribers yet"}</h3>
            <p>{q ? "Try part of an email address or a provider such as gmail." : "Visitors can join from the newsletter form in the website footer."}</p>
          </div>
        )}

        {pages > 1 ? (
          <nav className="inbox-pager" aria-label="Subscriber pages">
            <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, matches.length)} of {matches.length}</span>
            <div>
              {page > 1 ? (
                <Link href={href(state, { page: page - 1 })} aria-label="Previous page"><i className="fa-solid fa-chevron-left" aria-hidden="true" /></Link>
              ) : <span aria-hidden="true"><i className="fa-solid fa-chevron-left" /></span>}
              {page < pages ? (
                <Link href={href(state, { page: page + 1 })} aria-label="Next page"><i className="fa-solid fa-chevron-right" aria-hidden="true" /></Link>
              ) : <span aria-hidden="true"><i className="fa-solid fa-chevron-right" /></span>}
            </div>
          </nav>
        ) : null}
      </section>
    </div>
  );
}

function Hero({ total, month, week, trend, emails }: { total: number; month: number; week: number; trend: number[]; emails: string }) {
  const peak = Math.max(1, ...trend);
  return (
    <PageHeader
      kicker="Audience"
      icon="fa-paper-plane"
      title="Newsletter"
      description="Families, alumni and friends who asked to hear school news. Paste the list into your email's BCC field, or export it for a mailing tool."
      actions={
        <>
          {emails ? <CopyButton text={emails} label="Copy all emails" done="Emails copied" className="admin-hero-btn" labelled /> : null}
          <a className="admin-hero-btn" href={`${BASE}/export`}>
            <i className="fa-solid fa-file-arrow-down" aria-hidden="true" /> Export CSV
          </a>
          <Link className="admin-hero-btn" href="/admin/inbox/messages">
            <i className="fa-solid fa-envelope" aria-hidden="true" /> Messages
          </Link>
        </>
      }
    >
      <div className="apl-pipeline nl-glance">
        <p className="apl-pipeline-head">
          <span>Mailing list</span>
          <strong>{month ? `+${month} this month` : "No new sign-ups yet"}</strong>
        </p>
        <div className="nl-glance-total">
          <strong>{total.toLocaleString("en-GB")}</strong>
          <span>{total === 1 ? "subscriber" : "subscribers"}</span>
          {trend.length ? (
            <span className="nl-spark" aria-hidden="true">
              {trend.map((count, index) => <i key={index} style={{ height: `${Math.max(8, (count / peak) * 100)}%` }} />)}
            </span>
          ) : null}
        </div>
        <dl className="apl-pipeline-figures">
          <div><dt>30 days</dt><dd>{month}</dd></div>
          <div><dt>This week</dt><dd>{week}</dd></div>
          <div><dt>Monthly</dt><dd>{trend.length ? Math.round(trend.reduce((sum, count) => sum + count, 0) / trend.length) : 0}</dd></div>
        </dl>
      </div>
    </PageHeader>
  );
}
