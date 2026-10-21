"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { deleteStory, duplicateStory, setStoryFlag, type StoryActionResult } from "@/app/admin/(panel)/stories/actions";
import { formatDateTime, timeAgo } from "@/lib/applications";
import { kampalaIso, STORY_SOURCE_KEYS, STORY_SOURCES, type StorySource } from "@/lib/newsroom";
import { STATUS_INFO, STORY_TYPE_HELP, storyStatus, type StoryListItem, type StoryStatus } from "@/lib/story-admin";
import type { StoriesMode } from "@/lib/story-admin-server";

type StatusFilter = "all" | StoryStatus | "featured";
type Sort = "newest" | "oldest" | "edited" | "title";
const PAGE = 25;

export function StoryStatusBadge({ status, at }: { status: StoryStatus; at?: string | null }) {
  const info = STATUS_INFO[status];
  return (
    <span className={`app-status app-status-${info.tone}`} title={status === "scheduled" && at ? `Goes live ${formatDateTime(kampalaIso(at))}` : undefined}>
      {info.label}
    </span>
  );
}

export function StoryFeedback({ result }: { result: StoryActionResult | null }) {
  if (!result) return null;
  if (result.error) return <p className="app-feedback is-error" role="alert"><i className="fa-solid fa-circle-exclamation" /> {result.error}</p>;
  return (
    <>
      {result.ok ? <p className="app-feedback" role="status"><i className="fa-solid fa-check" /> {result.ok}</p> : null}
      {result.warning ? <p className="app-feedback is-warning" role="status"><i className="fa-solid fa-triangle-exclamation" /> {result.warning}</p> : null}
    </>
  );
}

export function StoriesSetupNotice({ mode }: { mode: StoriesMode }) {
  if (mode === "live") return null;
  return (
    <div className="admin-card story-setup">
      <i className="fa-solid fa-database" aria-hidden="true" />
      <div>
        {mode === "setup" ? (
          <>
            <h2>Finish connecting the story database</h2>
            <p>
              You&apos;re seeing the stories imported with the website, so they are read-only for now. In the Supabase SQL editor, run these files in order,
              then refresh this page:
            </p>
            <ol>
              <li><code>supabase/0001_schema.sql</code>: creates the tables</li>
              <li><code>supabase/0002_seed.sql</code>: imports the existing stories</li>
              <li><code>supabase/0005_stories.sql</code>: adds featuring, tags, SEO and scheduling</li>
            </ol>
          </>
        ) : (
          <>
            <h2>One more step to unlock every story feature</h2>
            <p>
              Stories can be edited, but categories, tags, featuring and SEO fields need <code>supabase/0005_stories.sql</code>. Run it once in the
              Supabase SQL editor. It&apos;s safe to run again.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export function NewStoryMenu({ disabled }: { disabled?: boolean }) {
  if (disabled) {
    return (
      <span className="admin-btn is-disabled" aria-disabled="true" title="Connect the story database first">
        <i className="fa-solid fa-plus" /> New story
      </span>
    );
  }
  return (
    <details className="story-new">
      <summary className="admin-btn">
        <i className="fa-solid fa-plus" /> New story <i className="fa-solid fa-chevron-down story-new-caret" />
      </summary>
      <div className="story-new-menu" role="menu">
        {STORY_SOURCE_KEYS.map((source) => (
          <Link key={source} role="menuitem" href={`/admin/stories/${STORY_SOURCES[source].table}/new`}>
            <i className={`fa-solid ${STORY_TYPE_HELP[source].icon}`} aria-hidden="true" />
            <span>
              <strong>{STORY_SOURCES[source].singular}</strong>
              <small>{STORY_TYPE_HELP[source].hint}</small>
            </span>
          </Link>
        ))}
      </div>
    </details>
  );
}

function shortDate(value: string | null) {
  const iso = kampalaIso(value);
  if (!iso) return "No date";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Kampala" });
}

const time = (value: string | null) => new Date(kampalaIso(value) || 0).getTime();

export function StoriesManager({
  mode,
  items,
  loadError,
  initial,
}: {
  mode: StoriesMode;
  items: StoryListItem[];
  loadError?: string;
  initial: { type: StorySource | "all"; status: StatusFilter; q: string };
}) {
  const router = useRouter();
  const [type, setType] = useState(initial.type);
  const [status, setStatus] = useState<StatusFilter>(initial.status);
  const [q, setQ] = useState(initial.q);
  const [sort, setSort] = useState<Sort>("newest");
  const [limit, setLimit] = useState(PAGE);
  const [rows, setRows] = useState(items);
  const [result, setResult] = useState<StoryActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const editable = mode !== "setup";

  useEffect(() => setRows(items), [items]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (type !== "all") params.set("type", type);
    if (status !== "all") params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
    setLimit(PAGE);
  }, [type, status, q]);

  const counts = useMemo(() => {
    const byType = new Map<string, number>();
    const byStatus = { live: 0, scheduled: 0, draft: 0, featured: 0 };
    for (const row of rows) {
      byType.set(row.source, (byType.get(row.source) ?? 0) + 1);
      byStatus[row.status] += 1;
      if (row.featured) byStatus.featured += 1;
    }
    return { byType, byStatus };
  }, [rows]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter((row) => {
      if (type !== "all" && row.source !== type) return false;
      if (status === "featured" ? !row.featured : status !== "all" && row.status !== status) return false;
      if (!needle) return true;
      return [row.title, row.slug, row.author, row.category ?? "", ...row.tags].some((value) => value.toLowerCase().includes(needle));
    });
    const sorted = [...list];
    if (sort === "oldest") sorted.reverse();
    if (sort === "edited") sorted.sort((a, b) => time(b.updatedAt || b.createdAt) - time(a.updatedAt || a.createdAt));
    if (sort === "title") sorted.sort((a, b) => a.title.localeCompare(b.title));
    return sorted;
  }, [rows, type, status, q, sort]);

  const filtered = type !== "all" || status !== "all" || q.trim() !== "" || sort !== "newest";

  const run = (row: StoryListItem, task: () => Promise<StoryActionResult>, apply?: (row: StoryListItem) => StoryListItem | null, after?: (result: StoryActionResult) => void) => {
    if (!row.id) return;
    setBusyKey(row.key);
    startTransition(async () => {
      const outcome = await task();
      setResult(outcome);
      setBusyKey(null);
      if (outcome.error) return;
      if (apply) setRows((list) => list.flatMap((entry) => (entry.key === row.key ? (apply(entry) ? [apply(entry)!] : []) : [entry])));
      after?.(outcome);
      router.refresh();
    });
  };

  const stats = [
    { value: "live" as const, label: "Live", hint: "On the website", icon: "fa-signal", count: counts.byStatus.live, tone: "ok" },
    { value: "scheduled" as const, label: "Scheduled", hint: "Waiting to go live", icon: "fa-clock", count: counts.byStatus.scheduled, tone: "wait" },
    { value: "draft" as const, label: "Drafts", hint: "Not published", icon: "fa-pen", count: counts.byStatus.draft, tone: "" },
    { value: "featured" as const, label: "Featured", hint: "Shown first", icon: "fa-star", count: counts.byStatus.featured, tone: "gold" },
  ];

  function clearFilters() {
    setType("all");
    setStatus("all");
    setQ("");
    setSort("newest");
  }

  return (
    <div className="app-page story-admin">
      <div className="admin-page-title">
        <div>
          <h1>Stories</h1>
          <p>News, blog posts and alumni stories for the website.</p>
        </div>
        <NewStoryMenu disabled={!editable} />
      </div>

      <StoriesSetupNotice mode={mode} />
      {loadError ? <p className="admin-card app-feedback is-error">{loadError}</p> : null}

      <div className="sto-strip" aria-label="Story summary">
        {stats.map((stat) => (
          <button
            key={stat.value}
            type="button"
            className={`sto-stat${stat.tone ? ` is-${stat.tone}` : ""}${status === stat.value ? " is-on" : ""}`}
            onClick={() => setStatus((current) => (current === stat.value ? "all" : stat.value))}
            aria-pressed={status === stat.value}
          >
            <span className="sto-stat-icon" aria-hidden="true"><i className={`fa-solid ${stat.icon}`} /></span>
            <span className="sto-stat-copy">
              <span>{stat.label}</span>
              <strong>{stat.count.toLocaleString("en-GB")}</strong>
              <small>{stat.hint}</small>
            </span>
          </button>
        ))}
      </div>

      <section className="sto-panel" aria-label="Story list">
        <div className="sto-tools">
          <label className="sto-search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <input type="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search title, tag, category or author" aria-label="Search stories" />
            {q ? (
              <button type="button" onClick={() => setQ("")} aria-label="Clear search">
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            ) : null}
          </label>
          <div className="sto-types" role="group" aria-label="Story type">
            {(["all", ...STORY_SOURCE_KEYS] as const).map((key) => (
              <button key={key} type="button" className={type === key ? "is-on" : ""} aria-pressed={type === key} onClick={() => setType(key)}>
                {key === "all" ? "All" : STORY_SOURCES[key].label}
                <em>{(key === "all" ? rows.length : counts.byType.get(key) ?? 0).toLocaleString("en-GB")}</em>
              </button>
            ))}
          </div>
          <select className="sto-sort" aria-label="Sort" value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="edited">Recently edited</option>
            <option value="title">Title A–Z</option>
          </select>
          {filtered ? (
            <button type="button" className="sto-clear" onClick={clearFilters}>Clear</button>
          ) : null}
        </div>

        <StoryFeedback result={result} />

        {visible.length ? (
          <ul className="sto-list">
            {visible.slice(0, limit).map((row) => {
              const editHref = row.id ? `/admin/stories/${row.table}/${row.id}` : null;
              const live = row.status === "live";
              const published = row.status !== "draft";
              return (
                <li key={row.key} className={busyKey === row.key ? "is-busy" : row.featured ? "is-featured" : undefined}>
                  <div
                    className="sto-row"
                    onClick={(event) => {
                      if (!editHref || (event.target as HTMLElement).closest("a, button, input, label")) return;
                      router.push(editHref);
                    }}
                  >
                    <span className="sto-thumb">
                      {row.image ? <img src={row.image} alt="" loading="lazy" /> : <i className={`fa-solid ${STORY_TYPE_HELP[row.source].icon}`} aria-hidden="true" />}
                    </span>
                    <div className="sto-copy">
                      {editHref ? <Link href={editHref}>{row.title}</Link> : <strong>{row.title}</strong>}
                      <p>
                        <span>{STORY_SOURCES[row.source].label}</span>
                        <span>{shortDate(row.publishedAt)}</span>
                        {row.updatedAt ? <span>Edited {timeAgo(row.updatedAt)}</span> : row.author ? <span>{row.author}</span> : null}
                      </p>
                      {row.category || row.tags.length ? (
                        <p className="sto-tags">
                          {row.category ? <em>{row.category}</em> : null}
                          {row.tags.slice(0, 3).map((tag) => <em key={tag}>{tag}</em>)}
                          {row.tags.length > 3 ? <em>+{row.tags.length - 3}</em> : null}
                        </p>
                      ) : null}
                    </div>
                    <div className="sto-side">
                      <StoryStatusBadge status={row.status} at={row.publishedAt} />
                      {row.id ? (
                        <label className="sto-publish" title={published ? "Move back to drafts" : "Publish on the website"}>
                          <span className="story-switch">
                            <input
                              type="checkbox"
                              checked={published}
                              disabled={pending}
                              onChange={(event) => {
                                const next = event.target.checked;
                                run(row, () => setStoryFlag(row.table, row.id!, "published", next), (entry) => ({
                                  ...entry,
                                  status: storyStatus(next, entry.publishedAt || (next ? new Date().toISOString() : null)),
                                }));
                              }}
                            />
                            <span aria-hidden="true" />
                          </span>
                          <span>{published ? "Published" : "Draft"}</span>
                        </label>
                      ) : null}
                      {editHref ? <Link className="sto-edit" href={editHref}>Edit</Link> : null}
                    </div>
                    {row.id ? (
                      <div className="sto-links">
                        <button
                          type="button"
                          className={row.featured ? "is-on" : ""}
                          disabled={pending}
                          aria-pressed={row.featured}
                          onClick={() => run(row, () => setStoryFlag(row.table, row.id!, "featured", !row.featured), (entry) => ({ ...entry, featured: !entry.featured }))}
                        >
                          <i className={`fa-${row.featured ? "solid" : "regular"} fa-star`} aria-hidden="true" />
                          {row.featured ? "Featured" : "Feature"}
                        </button>
                        {live ? (
                          <a href={row.href} target="_blank" rel="noreferrer">
                            <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> View
                          </a>
                        ) : null}
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(row, () => duplicateStory(row.table, row.id!), undefined, (outcome) => {
                            if (outcome.id) router.push(`/admin/stories/${outcome.table ?? row.table}/${outcome.id}`);
                          })}
                        >
                          Duplicate
                        </button>
                        <button
                          type="button"
                          className="is-danger"
                          disabled={pending}
                          onClick={() => {
                            if (!window.confirm(`Delete “${row.title}”? This can't be undone.`)) return;
                            run(row, () => deleteStory(row.table, row.id!), () => null);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="sto-empty">
            <i className="fa-regular fa-newspaper" aria-hidden="true" />
            <strong>{rows.length ? "Nothing matches" : "No stories yet"}</strong>
            <p>{rows.length ? "Try another type, or clear the search and filters." : "Write the first story for the newsroom."}</p>
            {rows.length ? <button type="button" onClick={clearFilters}>Clear filters</button> : null}
          </div>
        )}

        {visible.length ? (
          <div className="sto-pager">
            <span>
              Showing {Math.min(limit, visible.length).toLocaleString("en-GB")} of {visible.length.toLocaleString("en-GB")}
            </span>
            {visible.length > limit ? (
              <button type="button" onClick={() => setLimit((value) => value + PAGE)}>Show more</button>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
