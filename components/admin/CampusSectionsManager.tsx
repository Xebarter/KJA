"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { deleteRecord, saveRecord } from "@/app/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import { campusIcon, kindOf, plainText, sectionKey, SECTION_KINDS, type CampusOption, type SectionKind, type SectionRow } from "@/lib/campus-admin";
import "@/app/admin/campuses.css";

type Feedback = { ok?: string; error?: string } | null;
type Tab = "all" | SectionKind;
type Sort = "order" | "title" | "photo";

const PAGE_SIZE = 24;
const ASIDE_LABELS: Record<SectionKind, string> = { facility: "Facilities", life: "Life", activity: "Clubs" };

export function CampusSectionsManager({ sections, campuses, editable }: { sections: SectionRow[]; campuses: CampusOption[]; editable: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(sections);
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [campus, setCampus] = useState("");
  const [sort, setSort] = useState<Sort>("order");
  const [dupesOnly, setDupesOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => setRows(sections), [sections]);
  useEffect(() => setPage(1), [tab, query, campus, sort, dupesOnly]);

  const campusName = useMemo(() => new Map(campuses.map((item) => [item.slug, item.title])), [campuses]);
  const dupeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(sectionKey(row.title), (counts.get(sectionKey(row.title)) ?? 0) + 1);
    return counts;
  }, [rows]);
  const isDupe = (row: SectionRow) => (dupeCounts.get(sectionKey(row.title)) ?? 0) > 1;

  const kindCounts = useMemo(() => {
    const counts: Record<SectionKind, number> = { facility: 0, life: 0, activity: 0 };
    for (const row of rows) counts[row.kind] += 1;
    return counts;
  }, [rows]);
  const withPhotos = rows.filter((row) => row.image_url).length;
  const dupes = rows.filter(isDupe).length;
  const assigned = rows.filter((row) => row.campus_slug).length;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = rows.filter((row) => {
      if (tab !== "all" && row.kind !== tab) return false;
      if (campus === "none" ? row.campus_slug : campus && row.campus_slug !== campus) return false;
      if (dupesOnly && (dupeCounts.get(sectionKey(row.title)) ?? 0) < 2) return false;
      if (needle && !`${row.title} ${plainText(row.body)}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    return list.sort((a, b) => {
      if (dupesOnly) return sectionKey(a.title).localeCompare(sectionKey(b.title)) || a.title.localeCompare(b.title);
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "photo") return Number(Boolean(b.image_url)) - Number(Boolean(a.image_url)) || a.title.localeCompare(b.title);
      return a.sort_order - b.sort_order || a.title.localeCompare(b.title);
    });
  }, [rows, tab, campus, query, sort, dupesOnly, dupeCounts]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const filtering = Boolean(query.trim() || campus || dupesOnly);

  const assign = (row: SectionRow, slug: string) => {
    if (!row.id) return;
    const previous = row.campus_slug;
    setRows((list) => list.map((entry) => (entry.id === row.id ? { ...entry, campus_slug: slug } : entry)));
    setBusy(row.id);
    startTransition(async () => {
      const data = new FormData();
      data.set("id", row.id!);
      data.set("campus_slug", slug);
      try {
        await saveRecord("campus_sections", data);
        setFeedback({ ok: slug ? `“${row.title}” now belongs to ${campusName.get(slug) ?? slug}.` : `“${row.title}” is shared by every campus.` });
        router.refresh();
      } catch (error) {
        setRows((list) => list.map((entry) => (entry.id === row.id ? { ...entry, campus_slug: previous } : entry)));
        setFeedback({ error: error instanceof Error ? error.message : "Could not update the section." });
      } finally {
        setBusy(null);
      }
    });
  };

  const remove = (row: SectionRow) => {
    if (!row.id) return;
    const twin = isDupe(row) ? " Another entry has a very similar title, so this may be a duplicate." : "";
    if (!window.confirm(`Delete “${row.title}”?${twin} This can't be undone.`)) return;
    setBusy(row.id);
    startTransition(async () => {
      try {
        await deleteRecord("campus_sections", row.id!);
        setRows((list) => list.filter((entry) => entry.id !== row.id));
        setFeedback({ ok: `Deleted “${row.title}”.` });
        router.refresh();
      } catch (error) {
        setFeedback({ error: error instanceof Error ? error.message : "Could not delete the section." });
      } finally {
        setBusy(null);
      }
    });
  };

  const reset = () => {
    setQuery("");
    setCampus("");
    setDupesOnly(false);
  };

  return (
    <div className="app-page apl cps">
      <PageHeader
        kicker="Website content"
        icon="fa-shapes"
        title="Campus sections"
        description="A library of facilities, campus-life traditions and clubs, each with a description and photo. Tidy them up, sort them by campus and keep the best photos ready."
        actions={
          <>
            {editable ? (
              <Link className="admin-hero-btn is-primary" href="/admin/content/campus_sections/new"><i className="fa-solid fa-plus" aria-hidden="true" /> New section</Link>
            ) : (
              <span className="admin-hero-btn is-disabled" aria-disabled="true" title="Connect Supabase first"><i className="fa-solid fa-plus" aria-hidden="true" /> New section</span>
            )}
            <Link className="admin-hero-btn" href="/admin/content/campuses"><i className="fa-solid fa-school" aria-hidden="true" /> Campuses</Link>
          </>
        }
      >
        <div className="apl-pipeline">
          <p className="apl-pipeline-head">
            <span>Section library</span>
            <strong>{rows.length} entries</strong>
          </p>
          <div className="admin-pipeline is-dark cps-mix" aria-hidden="true">
            {SECTION_KINDS.map((kind) => (kindCounts[kind.value] ? <span key={kind.value} className={`cps-mix-${kind.value}`} style={{ flexGrow: kindCounts[kind.value] }} /> : null))}
          </div>
          <dl className="apl-pipeline-figures">
            {SECTION_KINDS.map((kind) => (
              <div key={kind.value}>
                <dt><i className={`cps-dot cps-dot-${kind.value}`} aria-hidden="true" /> {ASIDE_LABELS[kind.value]}</dt>
                <dd>{kindCounts[kind.value]}</dd>
              </div>
            ))}
          </dl>
          <p className="cps-aside-foot">
            <span><i className="fa-regular fa-image" aria-hidden="true" /> {withPhotos} with photos</span>
            {dupes ? (
              <button type="button" onClick={() => setDupesOnly(true)}><i className="fa-solid fa-clone" aria-hidden="true" /> {dupes} look alike</button>
            ) : null}
          </p>
        </div>
      </PageHeader>

      {!editable ? (
        <div className="admin-card app-notice apl-notice">
          <i className="fa-solid fa-database" aria-hidden="true" />
          <div>
            <h2>Campus sections are read-only for now</h2>
            <p>You&apos;re seeing the entries imported with the website. Connect Supabase and import the content to edit them here.</p>
          </div>
        </div>
      ) : null}

      <div className="pg-usage-note pg-usage-note--fixed is-banner">
        <i className="fa-solid fa-circle-info" aria-hidden="true" />
        <div>
          <strong>Not shown on the website yet</strong>
          <p>
            Campus pages build their facilities, clubs and campus-life sections from each campus&apos;s designed layout. These entries and their photos are
            kept for reference and reuse, and their photos also appear in <Link href="/admin/images">Images</Link>.
          </p>
        </div>
      </div>

      <section className="admin-card apl-card cps-card">
        <div className="apl-tabs pg-tabs" role="tablist" aria-label="Section type">
          <button type="button" role="tab" aria-selected={tab === "all"} className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>
            All <em>{rows.length}</em>
          </button>
          {SECTION_KINDS.map((kind) => (
            <button key={kind.value} type="button" role="tab" aria-selected={tab === kind.value} className={tab === kind.value ? "active" : ""} onClick={() => setTab(kind.value)}>
              <i className={`fa-solid ${kind.icon}`} aria-hidden="true" /> {kind.label} <em>{kindCounts[kind.value]}</em>
            </button>
          ))}
        </div>

        <div className="app-filters cps-filters">
          <label className="app-search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <input type="search" value={query} placeholder="Search titles and descriptions" aria-label="Search sections" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <select aria-label="Campus" value={campus} onChange={(event) => setCampus(event.target.value)}>
            <option value="">Every campus</option>
            <option value="none">Shared (no campus)</option>
            {campuses.map((item) => <option key={item.slug} value={item.slug}>{item.title}</option>)}
          </select>
          <select aria-label="Sort" value={sort} onChange={(event) => setSort(event.target.value as Sort)} disabled={dupesOnly}>
            <option value="order">Display order</option>
            <option value="title">Title A–Z</option>
            <option value="photo">Photos first</option>
          </select>
          <button type="button" className={`cps-toggle${dupesOnly ? " is-active" : ""}`} aria-pressed={dupesOnly} onClick={() => setDupesOnly((value) => !value)}>
            <i className="fa-solid fa-clone" aria-hidden="true" /> Look-alikes{dupes ? <em>{dupes}</em> : null}
          </button>
        </div>

        <div className="cps-feedback" aria-live="polite">
          {feedback?.ok ? <p className="app-feedback" role="status"><i className="fa-solid fa-check" /> {feedback.ok}</p> : null}
          {feedback?.error ? <p className="app-feedback is-error" role="alert"><i className="fa-solid fa-circle-exclamation" /> {feedback.error}</p> : null}
        </div>

        {dupesOnly ? (
          <p className="cps-dupe-note">
            <i className="fa-solid fa-clone" aria-hidden="true" /> These entries share a title with at least one other entry. Keep the one with the best photo and description, and delete the rest.
          </p>
        ) : null}

        {visible.length ? (
          <ul className="cps-grid">
            {visible.map((row) => {
              const kind = kindOf(row.kind);
              const text = plainText(row.body);
              const editHref = row.id ? `/admin/content/campus_sections/${row.id}` : null;
              const twins = dupeCounts.get(sectionKey(row.title)) ?? 0;
              return (
                <li key={row.id ?? `${row.kind}-${row.title}`} className={`cps-item${busy === row.id ? " is-busy" : ""}`}>
                  <div className={`cps-item-media cps-kind-${row.kind}`}>
                    {row.image_url ? <img src={row.image_url} alt="" loading="lazy" /> : <i className={`fa-solid ${campusIcon(row.title, kind.icon)}`} aria-hidden="true" />}
                    <span className={`cps-chip cps-chip-${row.kind}`}><i className={`fa-solid ${kind.icon}`} aria-hidden="true" /> {kind.short}</span>
                    {twins > 1 ? <span className="cps-twin" title={`${twins} entries have this title`}><i className="fa-solid fa-clone" aria-hidden="true" /> {twins}×</span> : null}
                  </div>
                  <div className="cps-item-body">
                    <h3>{editHref ? <Link href={editHref}>{row.title || "Untitled"}</Link> : row.title || "Untitled"}</h3>
                    <p className={text ? undefined : "is-empty"}>{text || "No description yet."}</p>
                  </div>
                  <div className="cps-item-foot">
                    <label className="cps-assign">
                      <i className="fa-solid fa-location-dot" aria-hidden="true" />
                      <span className="visually-hidden">Campus for {row.title}</span>
                      <select value={row.campus_slug} disabled={!editable || !row.id || busy === row.id} onChange={(event) => assign(row, event.target.value)}>
                        <option value="">All campuses</option>
                        {campuses.map((item) => <option key={item.slug} value={item.slug}>{item.title}</option>)}
                        {row.campus_slug && !campusName.has(row.campus_slug) ? <option value={row.campus_slug}>{row.campus_slug}</option> : null}
                      </select>
                    </label>
                    <span className="cps-order" title="Display order">#{row.sort_order}</span>
                    {editHref ? (
                      <Link className="story-icon" href={editHref} title="Edit section" aria-label={`Edit ${row.title}`}><i className="fa-solid fa-pen" /></Link>
                    ) : null}
                    {editable && row.id ? (
                      <button type="button" className="story-icon is-danger" title="Delete section" aria-label={`Delete ${row.title}`} disabled={busy === row.id} onClick={() => remove(row)}>
                        <i className="fa-regular fa-trash-can" />
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="apl-empty">
            <span><i className="fa-solid fa-shapes" aria-hidden="true" /></span>
            <h2>{filtering ? "No sections match" : rows.length ? "Nothing in this group yet" : "No campus sections yet"}</h2>
            <p>{filtering ? "Try a different search or clear the filters." : "Use New section to add a facility, tradition or club."}</p>
            {filtering ? <button type="button" className="admin-btn admin-btn-ghost" onClick={reset}>Clear filters</button> : null}
          </div>
        )}

        <footer className="apl-pager cps-pager">
          <span>
            {filtered.length
              ? `Showing ${(current - 1) * PAGE_SIZE + 1}–${Math.min(current * PAGE_SIZE, filtered.length)} of ${filtered.length}`
              : "No entries"}
            {" · "}
            {assigned} assigned to a campus
          </span>
          {pages > 1 ? (
            <span className="cps-pager-btns">
              <button type="button" className="story-icon" disabled={current <= 1} onClick={() => setPage(current - 1)} aria-label="Previous page"><i className="fa-solid fa-chevron-left" /></button>
              <span>{current} / {pages}</span>
              <button type="button" className="story-icon" disabled={current >= pages} onClick={() => setPage(current + 1)} aria-label="Next page"><i className="fa-solid fa-chevron-right" /></button>
            </span>
          ) : null}
        </footer>
      </section>
    </div>
  );
}
