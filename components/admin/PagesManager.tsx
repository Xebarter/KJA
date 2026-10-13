"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { saveRecord } from "@/app/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import { decodeEntities } from "@/lib/html";
import { pageUsage, pageWords, USAGE_INFO, type PageRow, type PageUsage } from "@/lib/page-admin";

type StatusFilter = "all" | "live" | "hidden";
type Sort = "title" | "newest" | "longest";
type Feedback = { ok?: string; error?: string } | null;

function shortDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Kampala" });
}

export function PageUsageBadge({ usage }: { usage: PageUsage }) {
  const info = USAGE_INFO[usage];
  return (
    <span className={`pg-usage pg-usage--${usage}`} title={info.hint}>
      <i className={`fa-solid ${info.icon}`} aria-hidden="true" /> {info.label}
    </span>
  );
}

export function PagesManager({ pages, editable }: { pages: PageRow[]; editable: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(pages);
  const [usage, setUsage] = useState<PageUsage | "all">("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("title");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => setRows(pages), [pages]);

  const enriched = useMemo(
    () => rows.map((row) => ({ ...row, title: decodeEntities(row.title) || row.slug, usage: pageUsage(row.slug), words: pageWords(row.body) })),
    [rows],
  );

  const counts = useMemo(() => {
    const byUsage: Record<PageUsage, number> = { content: 0, layout: 0, fixed: 0 };
    let live = 0;
    for (const row of enriched) {
      byUsage[row.usage] += 1;
      if (row.published) live += 1;
    }
    return { byUsage, live, hidden: enriched.length - live };
  }, [enriched]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = enriched.filter((row) => {
      if (usage !== "all" && row.usage !== usage) return false;
      if (status === "live" && !row.published) return false;
      if (status === "hidden" && row.published) return false;
      return !needle || [row.title, row.slug, row.excerpt].some((value) => value.toLowerCase().includes(needle));
    });
    if (sort === "title") list.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "newest") list.sort((a, b) => String(b.published_at || "").localeCompare(String(a.published_at || "")));
    if (sort === "longest") list.sort((a, b) => b.words - a.words);
    return list;
  }, [enriched, usage, status, q, sort]);

  const filtered = usage !== "all" || status !== "all" || q.trim() !== "" || sort !== "title";

  const togglePublished = (row: PageRow, next: boolean) => {
    if (!row.id) return;
    setBusy(row.id);
    startTransition(async () => {
      const data = new FormData();
      data.set("id", row.id!);
      data.set("published", next ? "on" : "off");
      try {
        await saveRecord("pages", data);
        setRows((list) => list.map((entry) => (entry.id === row.id ? { ...entry, published: next } : entry)));
        setFeedback({ ok: `“${decodeEntities(row.title)}” is ${next ? "live on the website" : "now hidden"}.` });
        router.refresh();
      } catch (error) {
        setFeedback({ error: error instanceof Error ? error.message : "Could not update the page." });
      } finally {
        setBusy(null);
      }
    });
  };

  const totalWords = enriched.reduce((sum, row) => sum + row.words, 0);
  const missingImage = enriched.filter((row) => !row.image_url).length;
  const kpis = [
    { key: "live", label: "Live", icon: "fa-signal", count: counts.live, note: `${enriched.length ? Math.round((counts.live / enriched.length) * 100) : 0}% of all pages`, active: status === "live", onClick: () => setStatus((value) => (value === "live" ? "all" : "live")) },
    { key: "hidden", label: "Hidden", icon: "fa-eye-slash", count: counts.hidden, note: counts.hidden ? "Only admins can see these" : "Nothing hidden", active: status === "hidden", onClick: () => setStatus((value) => (value === "hidden" ? "all" : "hidden")) },
    { key: "content", label: "Editable", icon: USAGE_INFO.content.icon, count: counts.byUsage.content, note: "Shown exactly as written", active: usage === "content", onClick: () => setUsage((value) => (value === "content" ? "all" : "content")) },
    { key: "fixed", label: "Built-in", icon: USAGE_INFO.fixed.icon, count: counts.byUsage.fixed, note: "Designed in code", active: usage === "fixed", onClick: () => setUsage((value) => (value === "fixed" ? "all" : "fixed")) },
  ];

  return (
    <div className="app-page apl pg-admin">
      <PageHeader
        kicker="Website content"
        icon="fa-file-lines"
        title="Pages"
        description="The website's standing pages: about the school, admissions, fees, programmes and policies. Edit their words, banners and search previews here."
        actions={
          <>
            {editable ? (
              <Link className="admin-hero-btn is-primary" href="/admin/content/pages/new"><i className="fa-solid fa-plus" aria-hidden="true" /> New page</Link>
            ) : (
              <span className="admin-hero-btn is-disabled" aria-disabled="true" title="Connect Supabase first"><i className="fa-solid fa-plus" aria-hidden="true" /> New page</span>
            )}
            <a className="admin-hero-btn" href="/" target="_blank" rel="noopener noreferrer">
              <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> View website
            </a>
          </>
        }
      >
        <div className="apl-pipeline pg-mix">
          <p className="apl-pipeline-head">
            <span>How the site uses them</span>
            <strong>{enriched.length.toLocaleString("en-GB")} pages</strong>
          </p>
          <div className="admin-pipeline is-dark" role="img" aria-label={(["content", "layout", "fixed"] as const).map((key) => `${USAGE_INFO[key].label}: ${counts.byUsage[key]}`).join(", ")}>
            {(["content", "layout", "fixed"] as const).map((key) => (
              <span key={key} className={`pg-seg pg-seg--${key}`} style={{ flexGrow: counts.byUsage[key] }} />
            ))}
          </div>
          <dl className="apl-pipeline-figures pg-mix-figures">
            {(["content", "layout", "fixed"] as const).map((key) => (
              <div key={key} className={`pg-mix--${key}`}><dt>{USAGE_INFO[key].short}</dt><dd>{counts.byUsage[key]}</dd></div>
            ))}
          </dl>
          <p className="pg-mix-foot">
            <span><i className="fa-solid fa-font" aria-hidden="true" /> {totalWords.toLocaleString("en-GB")} words</span>
            <span><i className="fa-regular fa-image" aria-hidden="true" /> {missingImage ? `${missingImage} without a banner` : "Every page has a banner"}</span>
          </p>
        </div>
      </PageHeader>

      {!editable ? (
        <div className="admin-card app-notice apl-notice">
          <i className="fa-solid fa-database" aria-hidden="true" />
          <div>
            <h2>Pages are read-only for now</h2>
            <p>You&apos;re seeing the pages imported with the website. Connect Supabase and import the content to edit them here.</p>
          </div>
        </div>
      ) : null}

      <div className="admin-kpis">
        {kpis.map((kpi) => (
          <button key={kpi.key} type="button" className={`admin-kpi${kpi.active ? " is-active" : ""}`} onClick={kpi.onClick} aria-pressed={kpi.active}>
            <span className="admin-kpi-icon"><i className={`fa-solid ${kpi.icon}`} aria-hidden="true" /></span>
            <span className="admin-kpi-label">{kpi.label}</span>
            <strong>{kpi.count.toLocaleString("en-GB")}</strong>
            <span className="admin-kpi-note">{kpi.note}</span>
            <i className={`fa-solid ${kpi.active ? "fa-xmark" : "fa-filter"} admin-kpi-go`} aria-hidden="true" />
          </button>
        ))}
      </div>

      <section className="apl-card">
        <nav className="apl-tabs pg-tabs" aria-label="Filter by page type">
          {(["all", "content", "layout", "fixed"] as const).map((key) => (
            <button key={key} type="button" className={usage === key ? "active" : ""} aria-pressed={usage === key} onClick={() => setUsage(key)}>
              {key === "all" ? null : <span className={`pg-seg pg-seg--${key} admin-dot`} aria-hidden="true" />}
              {key === "all" ? "All pages" : USAGE_INFO[key].label}
              <em>{key === "all" ? enriched.length : counts.byUsage[key]}</em>
            </button>
          ))}
        </nav>

        {usage !== "all" ? (
          <p className={`pg-usage-note pg-usage-note--${usage}`}>
            <i className={`fa-solid ${USAGE_INFO[usage].icon}`} aria-hidden="true" /> {USAGE_INFO[usage].hint}
          </p>
        ) : null}

        <div className="app-filters" role="search">
          <label className="app-search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <span className="visually-hidden">Search pages</span>
            <input type="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search by title, address or summary" />
          </label>
          <select aria-label="Status" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
            <option value="all">Any status</option>
            <option value="live">Live</option>
            <option value="hidden">Hidden</option>
          </select>
          <select aria-label="Sort" value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
            <option value="title">Title A–Z</option>
            <option value="newest">Newest first</option>
            <option value="longest">Longest first</option>
          </select>
          {filtered ? (
            <button type="button" className="app-clear app-link-btn" onClick={() => { setUsage("all"); setStatus("all"); setQ(""); setSort("title"); }}>
              Clear
            </button>
          ) : null}
        </div>

        {feedback?.ok ? <p className="app-feedback" role="status"><i className="fa-solid fa-check" /> {feedback.ok}</p> : null}
        {feedback?.error ? <p className="app-feedback is-error" role="alert"><i className="fa-solid fa-circle-exclamation" /> {feedback.error}</p> : null}

        {visible.length ? (
          <table className={`app-table story-table pg-table${pending ? " is-busy" : ""}`}>
            <thead>
              <tr>
                <th>Page</th>
                <th>Type</th>
                <th>Status</th>
                <th>Length</th>
                <th className="story-col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const editHref = row.id ? `/admin/content/pages/${row.id}` : null;
                const path = `/${row.slug}`;
                return (
                  <tr
                    key={row.id ?? row.slug}
                    className={busy && busy === row.id ? "is-selected" : undefined}
                    onClick={(event) => {
                      if (!editHref || (event.target as HTMLElement).closest("a, button, input, label")) return;
                      router.push(editHref);
                    }}
                  >
                    <td className="pg-col-main">
                      <div className="pg-page">
                        <span className="story-thumb">
                          {row.image_url ? <img src={row.image_url} alt="" loading="lazy" /> : <i className={`fa-solid ${USAGE_INFO[row.usage].icon}`} aria-hidden="true" />}
                        </span>
                        <span className="story-title">
                          {editHref ? <Link href={editHref}>{row.title}</Link> : <strong>{row.title}</strong>}
                          <small>
                            <span className="story-path" title={`kja.ug${path}`}>kja.ug{path}</span>
                          </small>
                        </span>
                      </div>
                    </td>
                    <td data-label="Type"><PageUsageBadge usage={row.usage} /></td>
                    <td data-label="Status">
                      <span className={`app-status app-status-${row.published ? "done" : "wait"}`}>{row.published ? "Live" : "Hidden"}</span>
                    </td>
                    <td data-label="Length">
                      <span className="story-date">{row.words ? `${row.words.toLocaleString()} words` : "Empty"}</span>
                      <small>{shortDate(row.published_at) ? `Added ${shortDate(row.published_at)}` : "\u00a0"}</small>
                    </td>
                    <td className="story-col-actions">
                      <div className="story-actions">
                        <label className="story-switch" title={row.published ? "Hide from the website" : "Show on the website"}>
                          <input
                            type="checkbox"
                            checked={row.published}
                            disabled={!row.id || pending}
                            onChange={(event) => togglePublished(row, event.target.checked)}
                          />
                          <span aria-hidden="true" />
                          <span className="visually-hidden">Live on the website</span>
                        </label>
                        <a
                          className={`story-icon${row.published ? "" : " is-off"}`}
                          href={row.published ? path : undefined}
                          target="_blank"
                          rel="noreferrer"
                          title={row.published ? "View on website" : "Hidden from the website"}
                          aria-disabled={!row.published}
                        >
                          <i className="fa-solid fa-arrow-up-right-from-square" />
                        </a>
                        {editHref ? (
                          <Link className="story-icon" href={editHref} title="Edit page">
                            <i className="fa-solid fa-pen" />
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="apl-empty">
            <span><i className="fa-regular fa-file-lines" aria-hidden="true" /></span>
            <h2>{rows.length ? "No pages match" : "No pages yet"}</h2>
            <p>{rows.length ? "Try a different search or clear the filters." : "Use New page to create the first one."}</p>
          </div>
        )}

        <div className="apl-pager">
          <span>Showing {visible.length} of {enriched.length} {enriched.length === 1 ? "page" : "pages"}</span>
          <span className="pg-legend">
            <i className="fa-solid fa-circle-info" aria-hidden="true" /> Click a row to edit. The switch shows or hides a page instantly.
          </span>
        </div>
      </section>
    </div>
  );
}
