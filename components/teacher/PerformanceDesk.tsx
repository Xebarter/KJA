"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { StudentFace } from "@/components/StudentFace";

export type PerfTone = "blank" | "missed" | "low" | "mid" | "high";

export type PerfPaper = {
  id: string;
  name: string;
  kind: string;
  kindLabel: string;
  weight: number;
  maxScore: number;
  heldOn: string;
  status: "open" | "submitted" | "approved";
  href: string;
  average: number | null;
  entered: number;
  blank: number;
};

export type PerfMark = {
  text: string;
  percent: number | null;
  tone: PerfTone;
};

export type PerfPupil = {
  id: string;
  name: string;
  number: string;
  photoPath: string | null;
  percent: number | null;
  grade: string | null;
  place: number | null;
  gaps: number;
  missed: number;
  marks: PerfMark[];
  watch: boolean;
};

export type PerfBand = {
  label: string;
  count: number;
};

export type PerfPost = {
  key: string;
  subjectName: string;
  label: string;
};

export type PerfKindOption = {
  value: string;
  label: string;
  count: number;
};

type SortKey = "place" | "name" | "percent" | "gaps";
type FocusKey = "all" | "watch" | "gaps";

const nf = (value: number) => value.toLocaleString("en-GB");

function percentText(value: number | null) {
  if (value === null) return "—";
  return `${value.toLocaleString("en-GB", { maximumFractionDigits: 1 })}%`;
}

function statusLabel(status: PerfPaper["status"]) {
  if (status === "approved") return "Locked";
  if (status === "submitted") return "Submitted";
  return "Open";
}

export function PerformanceDesk({
  posts,
  selectedPost,
  kinds,
  selectedKind,
  papers,
  pupils,
  bands,
  selectedPupilId,
  nursery,
  assessmentsHref,
}: {
  posts: PerfPost[];
  selectedPost: string;
  kinds: PerfKindOption[];
  selectedKind: string;
  papers: PerfPaper[];
  pupils: PerfPupil[];
  bands: PerfBand[];
  selectedPupilId: string | null;
  nursery: boolean;
  assessmentsHref: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("place");
  const [focus, setFocus] = useState<FocusKey>("all");

  const watchCount = pupils.filter((pupil) => pupil.watch).length;
  const gapCount = pupils.filter((pupil) => pupil.gaps > 0).length;
  const bandMax = Math.max(1, ...bands.map((band) => band.count));
  const paperTotal = kinds.reduce((sum, kind) => sum + kind.count, 0);
  const graded = bands.reduce((sum, band) => sum + band.count, 0);

  const visible = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = pupils.filter((pupil) => {
      if (focus === "watch" && !pupil.watch) return false;
      if (focus === "gaps" && pupil.gaps <= 0) return false;
      if (!words.length) return true;
      const hay = `${pupil.name} ${pupil.number}`.toLowerCase();
      return words.every((word) => hay.includes(word));
    });
    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
      if (sort === "gaps") return b.gaps - a.gaps || a.name.localeCompare(b.name);
      if (sort === "percent") {
        if (a.percent === null && b.percent === null) return a.name.localeCompare(b.name);
        if (a.percent === null) return 1;
        if (b.percent === null) return -1;
        return b.percent - a.percent || a.name.localeCompare(b.name);
      }
      const left = a.place ?? Number.POSITIVE_INFINITY;
      const right = b.place ?? Number.POSITIVE_INFINITY;
      return left - right || a.name.localeCompare(b.name);
    });
  }, [pupils, search, sort, focus]);

  const selected = selectedPupilId ? pupils.find((pupil) => pupil.id === selectedPupilId) || null : null;

  function hrefWith(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  function selectPupil(id: string | null) {
    router.replace(hrefWith({ pupil: id }), { scroll: false });
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && /input|textarea|select/i.test(target.tagName);
      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (event.key !== "Escape") return;
      if (search) {
        setSearch("");
        return;
      }
      if (!selectedPupilId) return;
      const next = new URLSearchParams(searchParams.toString());
      next.delete("pupil");
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [search, selectedPupilId, searchParams, pathname, router]);

  return (
    <div className="perf-desk">
      <div className="perf-controls">
        {posts.length > 1 ? (
          <label className="perf-subject">
            <span>Subject</span>
            <select
              value={selectedPost}
              aria-label="Subject"
              onChange={(event) => {
                router.replace(hrefWith({ post: event.target.value, pupil: null, kind: selectedKind || null }));
              }}
            >
              {posts.map((post) => (
                <option key={post.key} value={post.key}>
                  {post.subjectName} · {post.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {kinds.length > 1 ? (
          <div className="perf-kinds" role="group" aria-label="Paper type">
            <Link className={!selectedKind ? "is-on" : ""} href={hrefWith({ kind: null, pupil: selectedPupilId })}>
              All <em>{nf(paperTotal)}</em>
            </Link>
            {kinds.map((kind) => (
              <Link
                key={kind.value}
                className={selectedKind === kind.value ? "is-on" : ""}
                href={hrefWith({ kind: kind.value, pupil: selectedPupilId })}
              >
                {kind.label} <em>{nf(kind.count)}</em>
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      {papers.length ? (
        <section className="perf-papers" aria-label="Papers">
          <div className="perf-papers-head">
            <h2>Papers</h2>
            <Link href={assessmentsHref}>Markbooks</Link>
          </div>
          <div className="perf-papers-rail">
            {papers.map((paper) => (
              <Link key={paper.id} href={paper.href} className={`perf-paper is-${paper.status}`}>
                <span className="perf-paper-top">
                  <span className="perf-paper-kind">{paper.kindLabel}</span>
                  <em className={`perf-status is-${paper.status}`}>{statusLabel(paper.status)}</em>
                </span>
                <strong>{paper.name}</strong>
                <span className="perf-paper-foot">
                  <span>{paper.heldOn}</span>
                  <span>{paper.average === null ? "—" : percentText(paper.average)}</span>
                </span>
                {paper.blank ? (
                  <span className="perf-paper-gap">
                    {nf(paper.blank)} left
                  </span>
                ) : (
                  <span className="perf-paper-gap is-ok">Complete</span>
                )}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {bands.some((band) => band.count > 0) ? (
        <section className="perf-bands" aria-label="Grade spread">
          <div className="perf-bands-head">
            <h2>Grades</h2>
            <span>{nf(graded)} scored</span>
          </div>
          <ul>
            {bands.map((band) => (
              <li key={band.label}>
                <span className="perf-band-label">{band.label}</span>
                <span className="perf-band-track" aria-hidden="true">
                  <span style={{ width: `${Math.max(band.count ? 10 : 0, (band.count / bandMax) * 100)}%` }} />
                </span>
                <span className="perf-band-count">{nf(band.count)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="perf-sheet" aria-label="Class sheet">
        <div className="perf-tools">
          <label className="perf-search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <span className="perf-sr">Search pupils</span>
            <input
              ref={searchRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Find a pupil"
              aria-label="Search pupils"
            />
            {search ? (
              <button type="button" className="perf-search-clear" onClick={() => setSearch("")} aria-label="Clear search">
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            ) : (
              <kbd aria-hidden="true">/</kbd>
            )}
          </label>

          <div className="perf-focus" role="group" aria-label="Show">
            <button type="button" className={focus === "all" ? "is-on" : ""} aria-pressed={focus === "all"} onClick={() => setFocus("all")}>
              All <em>{nf(pupils.length)}</em>
            </button>
            <button type="button" className={focus === "watch" ? "is-on" : ""} aria-pressed={focus === "watch"} onClick={() => setFocus("watch")}>
              Watch <em>{nf(watchCount)}</em>
            </button>
            <button type="button" className={focus === "gaps" ? "is-on" : ""} aria-pressed={focus === "gaps"} onClick={() => setFocus("gaps")}>
              Gaps <em>{nf(gapCount)}</em>
            </button>
          </div>

          <label className="perf-sort">
            <span>Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} aria-label="Sort pupils">
              <option value="place">Place</option>
              <option value="percent">Percent</option>
              <option value="name">Name</option>
              <option value="gaps">Gaps</option>
            </select>
          </label>
        </div>

        <div className={`perf-layout${selected ? " has-detail" : ""}`}>
          <div className="perf-scroll">
            <table className="perf-table">
              <thead>
                <tr>
                  <th className="perf-col-pupil" scope="col">
                    Pupil
                  </th>
                  {papers.map((paper) => (
                    <th key={paper.id} className="perf-col-paper" scope="col" title={`${paper.name} · ${paper.kindLabel}`}>
                      <Link href={paper.href}>{paper.kindLabel}</Link>
                      <small>{percentText(paper.average)}</small>
                    </th>
                  ))}
                  <th className="perf-col-num" scope="col">
                    %
                  </th>
                  <th className="perf-col-num" scope="col">
                    Grade
                  </th>
                  <th className="perf-col-num" scope="col">
                    Pos
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.length ? (
                  visible.map((pupil) => {
                    const on = selected?.id === pupil.id;
                    return (
                      <tr key={pupil.id} className={`${on ? "is-on" : ""}${pupil.watch ? " is-watch" : ""}`}>
                        <th className="perf-col-pupil" scope="row">
                          <button
                            type="button"
                            className="perf-who"
                            onClick={() => selectPupil(on ? null : pupil.id)}
                            aria-pressed={on}
                          >
                            <span className={`perf-place${pupil.place && pupil.place <= 3 ? ` is-top is-t${pupil.place}` : ""}`}>
                              {pupil.place ? nf(pupil.place) : "—"}
                            </span>
                            <StudentFace id={pupil.id} name={pupil.name} photoPath={pupil.photoPath} className="perf-face" />
                            <span className="perf-who-copy">
                              <strong>{pupil.name}</strong>
                              <small>
                                {pupil.number ? <span>{pupil.number}</span> : null}
                                {pupil.gaps ? (
                                  <span className="perf-who-gap">
                                    {pupil.gaps} gap{pupil.gaps === 1 ? "" : "s"}
                                  </span>
                                ) : null}
                                {pupil.watch && !pupil.gaps ? <span className="perf-who-watch">Watch</span> : null}
                              </small>
                            </span>
                          </button>
                        </th>
                        {pupil.marks.map((mark, markIndex) => (
                          <td key={papers[markIndex]?.id || markIndex} className={`perf-mark is-${mark.tone}`}>
                            <span>{mark.text || "—"}</span>
                          </td>
                        ))}
                        <td className={`perf-mark is-avg${pupil.percent !== null && pupil.percent < 50 ? " is-low" : pupil.percent !== null && pupil.percent >= 70 ? " is-high" : ""}`}>
                          <span>{percentText(pupil.percent)}</span>
                        </td>
                        <td className="perf-mark is-grade">
                          <span>{pupil.grade || "—"}</span>
                        </td>
                        <td className="perf-mark is-pos">
                          <span>{pupil.place ? nf(pupil.place) : "—"}</span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="perf-empty" colSpan={Math.max(4, papers.length + 4)}>
                      <div>
                        <i className={`fa-solid ${search.trim() ? "fa-magnifying-glass" : "fa-heart-circle-check"}`} aria-hidden="true" />
                        <strong>
                          {search.trim()
                            ? "No pupils match"
                            : focus === "gaps"
                              ? "No gaps"
                              : focus === "watch"
                                ? "Nobody to watch"
                                : "No pupils"}
                        </strong>
                        <p>
                          {search.trim()
                            ? "Try another name or number."
                            : focus === "gaps"
                              ? "Every paper has a mark."
                              : focus === "watch"
                                ? "Nobody is below 50% or missing marks."
                                : "This class has no pupils on the roll."}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <aside className={`perf-detail${selected ? " is-open" : ""}`} aria-live="polite">
            {selected ? (
              <>
                <div className="perf-detail-head">
                  <StudentFace id={selected.id} name={selected.name} photoPath={selected.photoPath} className="perf-detail-face" />
                  <div>
                    <h2>{selected.name}</h2>
                    <p>{selected.number || "No number"}</p>
                  </div>
                  <button type="button" className="perf-detail-close" onClick={() => selectPupil(null)} aria-label="Close">
                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                  </button>
                </div>
                <dl className="perf-detail-stats">
                  <div>
                    <dt>%</dt>
                    <dd>{percentText(selected.percent)}</dd>
                  </div>
                  <div>
                    <dt>Grade</dt>
                    <dd>{selected.grade || "—"}</dd>
                  </div>
                  <div>
                    <dt>Place</dt>
                    <dd>{selected.place ? nf(selected.place) : "—"}</dd>
                  </div>
                  <div>
                    <dt>Gaps</dt>
                    <dd>{nf(selected.gaps)}</dd>
                  </div>
                </dl>
                <ul className="perf-detail-papers">
                  {papers.map((paper, index) => {
                    const mark = selected.marks[index];
                    return (
                      <li key={paper.id}>
                        <div>
                          <strong>{paper.name}</strong>
                          <span>{paper.kindLabel}</span>
                        </div>
                        <em className={`perf-mark is-${mark?.tone || "blank"}`}>{mark?.text || "—"}</em>
                        <Link href={paper.href}>Open</Link>
                      </li>
                    );
                  })}
                </ul>
                {selected.watch ? (
                  <p className="perf-detail-note">
                    <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                    {selected.percent !== null && selected.percent < 50 ? "Below 50%." : "Missing marks."}
                  </p>
                ) : null}
              </>
            ) : (
              <div className="perf-detail-empty">
                <span>
                  <i className="fa-solid fa-user-graduate" aria-hidden="true" />
                </span>
                <strong>Select a pupil</strong>
                <p>See every paper mark in one place.</p>
              </div>
            )}
          </aside>
        </div>

        <footer className="perf-foot">
          <p>
            {visible.length === pupils.length
              ? `${nf(pupils.length)} pupils`
              : `${nf(visible.length)} of ${nf(pupils.length)}`}
            {gapCount ? ` · ${nf(gapCount)} with gaps` : " · all marks in"}
            {" · "}
            {nursery ? "Nursery bands from weighted %" : "Weighted across papers"}
          </p>
        </footer>
      </section>
    </div>
  );
}
