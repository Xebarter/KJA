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
              <li><code>supabase/schema.sql</code>: creates the tables</li>
              <li><code>supabase/seed.sql</code>: imports the existing stories</li>
              <li><code>supabase/stories.sql</code>: adds featuring, tags, SEO and scheduling</li>
            </ol>
          </>
        ) : (
          <>
            <h2>One more step to unlock every story feature</h2>
            <p>
              Stories can be edited, but categories, tags, featuring and SEO fields need <code>supabase/stories.sql</code>. Run it once in the
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
    { value: "live" as const, label: "Live on the site", icon: "fa-signal", count: counts.byStatus.live },
    { value: "scheduled" as const, label: "Scheduled", icon: "fa-clock", count: counts.byStatus.scheduled },
    { value: "draft" as const, label: "Drafts", icon: "fa-pen-to-square", count: counts.byStatus.draft },
    { value: "featured" as const, label: "Featured", icon: "fa-star", count: counts.byStatus.featured },
  ];

  return (
    <div className="app-page story-admin">
      <div className="admin-page-title">
        <div>
          <h1>Stories</h1>
          <p>School news, blog posts and alumni stories. Everything that appears in the newsroom.</p>
        </div>
        <NewStoryMenu disabled={!editable} />
      </div>

      <StoriesSetupNotice mode={mode} />
      {loadError ? <p className="admin-card app-feedback is-error">{loadError}</p> : null}

      <div className="app-stats">
        {stats.map((stat) => (
          <button
            key={stat.value}
            type="button"
            className={`app-stat${status === stat.value ? " is-active" : ""}`}
            onClick={() => setStatus((current) => (current === stat.value ? "all" : stat.value))}
            aria-pressed={status === stat.value}
          >
            <i className={`fa-solid ${stat.icon}`} aria-hidden="true" />
            <strong>{stat.count}</strong>
            <span>{stat.label}</span>
          </button>
        ))}
      </div>

      <div className="admin-card app-list-card">
        <nav className="app-tabs" aria-label="Filter by type">
          {(["all", ...STORY_SOURCE_KEYS] as const).map((key) => (
            <button key={key} type="button" className={type === key ? "active" : ""} aria-pressed={type === key} onClick={() => setType(key)}>
              {key === "all" ? "All stories" : STORY_SOURCES[key].label}
              <span>{key === "all" ? rows.length : counts.byType.get(key) ?? 0}</span>
            </button>
          ))}
        </nav>

        <div className="app-filters" role="search">
          <label className="app-search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <span className="visually-hidden">Search stories</span>
            <input type="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search title, tag, category or author" />
          </label>
          <select aria-label="Status" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
            <option value="all">Any status</option>
            <option value="live">Live</option>
            <option value="scheduled">Scheduled</option>
            <option value="draft">Drafts</option>
            <option value="featured">Featured</option>
          </select>
          <select aria-label="Sort" value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="edited">Recently edited</option>
            <option value="title">Title A–Z</option>
          </select>
          {filtered ? (
            <button
              type="button"
              className="app-clear app-link-btn"
              onClick={() => {
                setType("all");
                setStatus("all");
                setQ("");
                setSort("newest");
              }}
            >
              Clear
            </button>
          ) : null}
        </div>

        <StoryFeedback result={result} />

        {visible.length ? (
          <table className={`app-table story-table${pending ? " is-busy" : ""}`}>
            <thead>
              <tr>
                <th>Story</th>
                <th>Type</th>
                <th>Status</th>
                <th>Date</th>
                <th aria-label="Featured" />
                <th className="story-col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.slice(0, limit).map((row) => {
                const editHref = row.id ? `/admin/stories/${row.table}/${row.id}` : null;
                const live = row.status === "live";
                return (
                  <tr
                    key={row.key}
                    className={busyKey === row.key ? "is-selected" : undefined}
                    onClick={(event) => {
                      if (!editHref || (event.target as HTMLElement).closest("a, button, input, label")) return;
                      router.push(editHref);
                    }}
                  >
                    <td className="story-col-main">
                      <span className="story-thumb">
                        {row.image ? <img src={row.image} alt="" loading="lazy" /> : <i className={`fa-solid ${STORY_TYPE_HELP[row.source].icon}`} aria-hidden="true" />}
                      </span>
                      <span className="story-title">
                        {editHref ? <Link href={editHref}>{row.title}</Link> : <strong>{row.title}</strong>}
                        <small>
                          <span className="story-path" title={row.href}>{row.href}</span>
                          {row.category ? <em>{row.category}</em> : null}
                          {row.tags.length ? <em>{row.tags.length} tag{row.tags.length === 1 ? "" : "s"}</em> : null}
                        </small>
                      </span>
                    </td>
                    <td data-label="Type">
                      <span className="story-type">
                        <i className={`fa-solid ${STORY_TYPE_HELP[row.source].icon}`} aria-hidden="true" />
                        {STORY_SOURCES[row.source].label}
                      </span>
                    </td>
                    <td data-label="Status">
                      <StoryStatusBadge status={row.status} at={row.publishedAt} />
                    </td>
                    <td data-label="Date">
                      <span className="story-date">{shortDate(row.publishedAt)}</span>
                      <small>{row.updatedAt ? `Edited ${timeAgo(row.updatedAt)}` : row.author}</small>
                    </td>
                    <td className="story-col-star">
                      <button
                        type="button"
                        className={`story-star${row.featured ? " is-on" : ""}`}
                        disabled={!row.id || pending}
                        aria-pressed={row.featured}
                        title={row.featured ? "Remove from featured" : "Feature on the newsroom"}
                        onClick={() =>
                          run(row, () => setStoryFlag(row.table, row.id!, "featured", !row.featured), (entry) => ({ ...entry, featured: !entry.featured }))
                        }
                      >
                        <i className={`fa-${row.featured ? "solid" : "regular"} fa-star`} />
                        <span className="visually-hidden">Featured</span>
                      </button>
                    </td>
                    <td className="story-col-actions">
                      <div className="story-actions">
                        <label className="story-switch" title={row.status === "draft" ? "Publish" : "Move to drafts"}>
                          <input
                            type="checkbox"
                            checked={row.status !== "draft"}
                            disabled={!row.id || pending}
                            onChange={(event) => {
                              const next = event.target.checked;
                              run(row, () => setStoryFlag(row.table, row.id!, "published", next), (entry) => ({
                                ...entry,
                                status: storyStatus(next, entry.publishedAt || (next ? new Date().toISOString() : null)),
                              }));
                            }}
                          />
                          <span aria-hidden="true" />
                          <span className="visually-hidden">Published</span>
                        </label>
                        <a
                          className={`story-icon${live ? "" : " is-off"}`}
                          href={live ? row.href : undefined}
                          target="_blank"
                          rel="noreferrer"
                          title={live ? "View on website" : "Not live yet"}
                          aria-disabled={!live}
                        >
                          <i className="fa-solid fa-arrow-up-right-from-square" />
                        </a>
                        <button
                          type="button"
                          className="story-icon"
                          title="Duplicate as a draft"
                          disabled={!row.id || pending}
                          onClick={() =>
                            run(row, () => duplicateStory(row.table, row.id!), undefined, (outcome) => {
                              if (outcome.id) router.push(`/admin/stories/${outcome.table ?? row.table}/${outcome.id}`);
                            })
                          }
                        >
                          <i className="fa-regular fa-copy" />
                        </button>
                        <button
                          type="button"
                          className="story-icon is-danger"
                          title="Delete"
                          disabled={!row.id || pending}
                          onClick={() => {
                            if (!window.confirm(`Delete “${row.title}”? This can't be undone.`)) return;
                            run(row, () => deleteStory(row.table, row.id!), () => null);
                          }}
                        >
                          <i className="fa-regular fa-trash-can" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="app-empty">
            <i className="fa-regular fa-newspaper" aria-hidden="true" />
            <p>{rows.length ? "No stories match these filters." : "No stories yet. Use New story to write the first one."}</p>
          </div>
        )}

        <div className="app-pager">
          <span>
            Showing {Math.min(limit, visible.length)} of {visible.length} {visible.length === 1 ? "story" : "stories"}
          </span>
          {visible.length > limit ? (
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setLimit((value) => value + PAGE)}>
              Show more
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
