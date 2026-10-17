"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { StoryCard } from "@/components/site/StoryCard";
import { STORY_SOURCES, type Story, type StorySource } from "@/lib/newsroom";

const PAGE_SIZE = 6;
type SourceFilter = "all" | StorySource;
type Sort = "newest" | "oldest";
type View = "grid" | "list";

function asSource(value: string | null): SourceFilter {
  return value && value in STORY_SOURCES ? (value as StorySource) : "all";
}

function ExplorerFallback({ stories, leadKey }: { stories: Story[]; leadKey?: string }) {
  const rest = stories.filter((story) => story.key !== leadKey).slice(0, PAGE_SIZE);
  if (!rest.length) {
    return (
      <div className="kja-explorer-empty">
        <i className="fas fa-newspaper" aria-hidden="true" />
        <h3>That's everything for now</h3>
        <p>New stories from our campuses will appear here.</p>
      </div>
    );
  }
  return (
    <div className="kja-explorer">
      <div className="kja-explorer-summary">
        <h2>More stories</h2>
      </div>
      <div className="kja-explorer-results">
        {rest.map((story) => <StoryCard story={story} key={story.key} />)}
      </div>
    </div>
  );
}

export function NewsroomExplorer({ stories, leadKey }: { stories: Story[]; leadKey?: string }) {
  return (
    <Suspense fallback={<ExplorerFallback stories={stories} leadKey={leadKey} />}>
      <NewsroomExplorerFilters stories={stories} leadKey={leadKey} />
    </Suspense>
  );
}

function NewsroomExplorerFilters({ stories, leadKey }: { stories: Story[]; leadKey?: string }) {
  const params = useSearchParams();
  const [source, setSource] = useState<SourceFilter>(() => asSource(params.get("type")));
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const [year, setYear] = useState(() => params.get("year") ?? "all");
  const [sort, setSort] = useState<Sort>(() => (params.get("sort") === "oldest" ? "oldest" : "newest"));
  const [view, setView] = useState<View>("grid");
  const signature = `${source}|${query}|${year}|${sort}`;
  const [page, setPage] = useState({ signature, limit: PAGE_SIZE });
  const limit = page.signature === signature ? page.limit : PAGE_SIZE;

  useEffect(() => {
    const url = new URL(window.location.href);
    const entries: [string, string | null][] = [
      ["type", source === "all" ? null : source],
      ["q", query.trim() || null],
      ["year", year === "all" ? null : year],
      ["sort", sort === "newest" ? null : sort],
    ];
    for (const [key, value] of entries) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    if (url.href !== window.location.href) window.history.replaceState(null, "", url);
  }, [source, query, year, sort]);

  const tabs = useMemo(() => {
    const counts = stories.reduce<Record<string, number>>((acc, story) => ({ ...acc, [story.source]: (acc[story.source] ?? 0) + 1 }), {});
    return [
      { id: "all" as SourceFilter, label: "All stories", count: stories.length },
      ...(Object.keys(STORY_SOURCES) as StorySource[])
        .filter((id) => counts[id])
        .map((id) => ({ id: id as SourceFilter, label: STORY_SOURCES[id].label, count: counts[id] })),
    ];
  }, [stories]);

  const years = useMemo(
    () => [...new Set(stories.map((story) => story.year).filter((value): value is string => Boolean(value)))].sort().reverse(),
    [stories],
  );

  const needle = query.trim().toLowerCase();
  const filtering = source !== "all" || Boolean(needle) || year !== "all";
  const results = useMemo(() => {
    const list = stories.filter(
      (story) =>
        (filtering || story.key !== leadKey) &&
        (source === "all" || story.source === source) &&
        (year === "all" || story.year === year) &&
        (!needle || `${story.title} ${story.excerpt} ${story.topic} ${story.author} ${story.tags.join(" ")}`.toLowerCase().includes(needle)),
    );
    return sort === "oldest" ? [...list].reverse() : list;
  }, [stories, leadKey, filtering, source, year, needle, sort]);

  const visible = results.slice(0, limit);
  const remaining = results.length - visible.length;

  function reset() {
    setSource("all");
    setQuery("");
    setYear("all");
    setSort("newest");
  }

  return (
    <div className="kja-explorer">
      <div className="kja-explorer-bar">
        <div className="kja-explorer-tabs" role="group" aria-label="Filter stories by type">
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              className={source === tab.id ? "active" : undefined}
              aria-pressed={source === tab.id}
              onClick={() => setSource(tab.id)}
            >
              {tab.label}
              <span>{tab.count}</span>
            </button>
          ))}
        </div>
        <div className="kja-explorer-tools">
          <label className="kja-explorer-search">
            <i className="fas fa-magnifying-glass" aria-hidden="true" />
            <span className="visually-hidden">Search stories</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search stories" />
          </label>
          <label className="kja-explorer-select">
            <span className="visually-hidden">Year</span>
            <select value={year} onChange={(event) => setYear(event.target.value)}>
              <option value="all">All years</option>
              {years.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="kja-explorer-select">
            <span className="visually-hidden">Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
            </select>
          </label>
          <div className="kja-explorer-view" role="group" aria-label="Layout">
            <button type="button" aria-label="Grid view" aria-pressed={view === "grid"} className={view === "grid" ? "active" : undefined} onClick={() => setView("grid")}>
              <i className="fas fa-grip" aria-hidden="true" />
            </button>
            <button type="button" aria-label="List view" aria-pressed={view === "list"} className={view === "list" ? "active" : undefined} onClick={() => setView("list")}>
              <i className="fas fa-list" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div className="kja-explorer-summary">
        <h2 aria-live="polite">
          {filtering ? `${results.length} ${results.length === 1 ? "story" : "stories"} found` : "More stories"}
        </h2>
        {filtering || sort !== "newest" ? (
          <button type="button" onClick={reset}><i className="fas fa-rotate-left" aria-hidden="true" /> Clear filters</button>
        ) : null}
      </div>

      {visible.length ? (
        <div className={`kja-explorer-results${view === "list" ? " is-list" : ""}`}>
          {visible.map((story) => <StoryCard story={story} key={story.key} />)}
        </div>
      ) : (
        <div className="kja-explorer-empty">
          <i className="fas fa-magnifying-glass" aria-hidden="true" />
          <h3>{filtering ? "No stories match" : "That's everything for now"}</h3>
          <p>{filtering ? "Try another word, type or year." : "New stories from our campuses will appear here."}</p>
          {filtering ? <button type="button" onClick={reset}>Show all stories</button> : null}
        </div>
      )}

      {remaining > 0 ? (
        <div className="kja-explorer-more">
          <button type="button" onClick={() => setPage({ signature, limit: limit + PAGE_SIZE })}>
            Load more stories <span>{remaining} more</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
