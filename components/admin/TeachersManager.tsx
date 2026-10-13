"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { saveRecord } from "@/app/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import { FEATURED_TEACHERS, featuredSlugs, initialsOf, orderTeachers, profileChecks, type TeacherRow } from "@/lib/teacher-admin";

type StatusFilter = "all" | "live" | "hidden";
type Gap = "none" | "photo" | "bio";
type Sort = "website" | "name" | "incomplete";
type Feedback = { ok?: string; error?: string } | null;

export function TeachersManager({ teachers, editable }: { teachers: TeacherRow[]; editable: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(teachers);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [gap, setGap] = useState<Gap>("none");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("website");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => setRows(teachers), [teachers]);

  const featured = useMemo(() => featuredSlugs(rows), [rows]);
  const enriched = useMemo(
    () =>
      orderTeachers(rows).map((row) => {
        const checks = profileChecks(row);
        return { ...row, checks, score: checks.filter((check) => check.ok).length, spot: featured.indexOf(row.slug) };
      }),
    [rows, featured],
  );

  const counts = useMemo(() => {
    const live = enriched.filter((row) => row.published).length;
    return {
      live,
      hidden: enriched.length - live,
      noPhoto: enriched.filter((row) => !row.checks[0].ok).length,
      noBio: enriched.filter((row) => !row.checks[3].ok).length,
      complete: enriched.filter((row) => row.score === row.checks.length).length,
      points: enriched.reduce((sum, row) => sum + row.score, 0),
    };
  }, [enriched]);
  const completeness = enriched.length ? Math.round((counts.points / (enriched.length * 4)) * 100) : 0;

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = enriched.filter((row) => {
      if (status === "live" && !row.published) return false;
      if (status === "hidden" && row.published) return false;
      if (gap === "photo" && row.checks[0].ok) return false;
      if (gap === "bio" && row.checks[3].ok) return false;
      return !needle || [row.title, row.role, row.slug].some((value) => value.toLowerCase().includes(needle));
    });
    if (sort === "name") list.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "incomplete") list.sort((a, b) => a.score - b.score || a.title.localeCompare(b.title));
    return list;
  }, [enriched, status, gap, q, sort]);

  const filtered = status !== "all" || gap !== "none" || q.trim() !== "" || sort !== "website";
  const clear = () => {
    setStatus("all");
    setGap("none");
    setQ("");
    setSort("website");
  };

  const togglePublished = (row: TeacherRow, next: boolean) => {
    if (!row.id) return;
    setBusy(row.id);
    startTransition(async () => {
      const data = new FormData();
      data.set("id", row.id!);
      data.set("published", next ? "on" : "off");
      try {
        await saveRecord("teachers", data);
        setRows((list) => list.map((entry) => (entry.id === row.id ? { ...entry, published: next } : entry)));
        setFeedback({ ok: `${row.title} is ${next ? "now shown on the website" : "now hidden from the website"}.` });
        router.refresh();
      } catch (error) {
        setFeedback({ error: error instanceof Error ? error.message : "Could not update this profile." });
      } finally {
        setBusy(null);
      }
    });
  };

  const kpis = [
    { key: "live", label: "On the website", icon: "fa-globe", count: counts.live, note: `${FEATURED_TEACHERS} featured on the homepage`, active: status === "live", onClick: () => setStatus((value) => (value === "live" ? "all" : "live")) },
    { key: "hidden", label: "Hidden", icon: "fa-eye-slash", count: counts.hidden, note: counts.hidden ? "Only admins can see these" : "Nothing hidden", active: status === "hidden", onClick: () => setStatus((value) => (value === "hidden" ? "all" : "hidden")) },
    { key: "photo", label: "Missing a photo", icon: "fa-camera", count: counts.noPhoto, note: counts.noPhoto ? "Shown without a portrait" : "Every profile has a portrait", active: gap === "photo", onClick: () => setGap((value) => (value === "photo" ? "none" : "photo")) },
    { key: "bio", label: "Missing a bio", icon: "fa-feather-pointed", count: counts.noBio, note: counts.noBio ? "Profile pages look empty" : "Every profile has a bio", active: gap === "bio", onClick: () => setGap((value) => (value === "bio" ? "none" : "bio")) },
  ];

  const faces = enriched.slice(0, 5);

  return (
    <div className="app-page apl tch-admin">
      <PageHeader
        kicker="People"
        icon="fa-chalkboard-user"
        title="Teachers"
        description="The leadership team and teachers families meet on the website. Their portraits and roles appear on the homepage and About page, and each has a profile page."
        actions={
          <>
            {editable ? (
              <Link className="admin-hero-btn is-primary" href="/admin/content/teachers/new"><i className="fa-solid fa-user-plus" aria-hidden="true" /> Add teacher</Link>
            ) : (
              <span className="admin-hero-btn is-disabled" aria-disabled="true" title="Connect Supabase first"><i className="fa-solid fa-user-plus" aria-hidden="true" /> Add teacher</span>
            )}
            <a className="admin-hero-btn" href="/teachers" target="_blank" rel="noopener noreferrer">
              <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> Teachers page
            </a>
          </>
        }
      >
        <div className="tch-summary">
          <div className="tch-faces" aria-hidden="true">
            {faces.map((row) => (
              <span key={row.id ?? row.slug}>{row.image_url ? <img src={row.image_url} alt="" /> : initialsOf(row.title)}</span>
            ))}
            {enriched.length > faces.length ? <span className="is-more">+{enriched.length - faces.length}</span> : null}
          </div>
          <p className="tch-summary-head">
            <span>Profile completeness</span>
            <strong>{completeness}%</strong>
          </p>
          <span className="tch-meter" role="img" aria-label={`Profiles are ${completeness}% complete`}>
            <span style={{ width: `${completeness}%` }} />
          </span>
          <p className="tch-summary-foot">
            <span><i className="fa-solid fa-circle-check" aria-hidden="true" /> {counts.complete} of {enriched.length} complete</span>
            <span><i className="fa-solid fa-star" aria-hidden="true" /> {featured.length} on the homepage</span>
          </p>
        </div>
      </PageHeader>

      {!editable ? (
        <div className="admin-card app-notice apl-notice">
          <i className="fa-solid fa-database" aria-hidden="true" />
          <div>
            <h2>Teachers are read-only for now</h2>
            <p>You&apos;re seeing the profiles imported with the website. Connect Supabase and import the content to edit them here.</p>
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
        <div className="app-filters" role="search">
          <label className="app-search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <span className="visually-hidden">Search teachers</span>
            <input type="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search by name or role" />
          </label>
          <select aria-label="Status" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
            <option value="all">Any status</option>
            <option value="live">On the website</option>
            <option value="hidden">Hidden</option>
          </select>
          <select aria-label="Sort" value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
            <option value="website">Website order</option>
            <option value="name">Name A–Z</option>
            <option value="incomplete">Least complete first</option>
          </select>
          {filtered ? (
            <button type="button" className="app-clear app-link-btn" onClick={clear}>
              Clear
            </button>
          ) : null}
        </div>

        {feedback?.ok ? <p className="app-feedback" role="status"><i className="fa-solid fa-check" /> {feedback.ok}</p> : null}
        {feedback?.error ? <p className="app-feedback is-error" role="alert"><i className="fa-solid fa-circle-exclamation" /> {feedback.error}</p> : null}

        {visible.length ? (
          <ul className={`tch-grid${pending ? " is-busy" : ""}`}>
            {visible.map((row) => {
              const editHref = row.id ? `/admin/content/teachers/${row.id}` : null;
              const missing = row.checks.filter((check) => !check.ok);
              return (
                <li
                  key={row.id ?? row.slug}
                  className={`tch-card${row.published ? "" : " is-hidden"}${busy && busy === row.id ? " is-saving" : ""}`}
                  onClick={(event) => {
                    if (!editHref || (event.target as HTMLElement).closest("a, button, input, label")) return;
                    router.push(editHref);
                  }}
                >
                  <figure className="tch-photo">
                    {row.image_url ? <img src={row.image_url} alt="" loading="lazy" /> : <span className="tch-initials">{initialsOf(row.title)}</span>}
                    <span className={`tch-state${row.published ? " is-live" : ""}`}>
                      <i className={`fa-solid ${row.published ? "fa-circle" : "fa-eye-slash"}`} aria-hidden="true" /> {row.published ? "Live" : "Hidden"}
                    </span>
                    {row.spot >= 0 ? (
                      <span className="tch-feature" title={`Shown on the homepage and About page (position ${row.spot + 1} of ${FEATURED_TEACHERS})`}>
                        <i className="fa-solid fa-star" aria-hidden="true" /> Homepage #{row.spot + 1}
                      </span>
                    ) : null}
                  </figure>
                  <div className="tch-body">
                    <h3>{editHref ? <Link href={editHref}>{row.title || "Unnamed teacher"}</Link> : row.title || "Unnamed teacher"}</h3>
                    <p className="tch-role">{row.role || "No role yet"}</p>
                    <div className="tch-health">
                      <p>
                        <span>Profile</span>
                        <strong>{row.score}/{row.checks.length}</strong>
                      </p>
                      <span className="tch-steps" aria-hidden="true">
                        {row.checks.map((check) => <span key={check.key} className={check.ok ? "is-ok" : ""} />)}
                      </span>
                      {missing.length ? (
                        <ul className="tch-todo" aria-label="Missing from this profile">
                          {missing.map((check) => <li key={check.key}>{check.todo}</li>)}
                        </ul>
                      ) : (
                        <p className="tch-done"><i className="fa-solid fa-circle-check" aria-hidden="true" /> Profile complete</p>
                      )}
                    </div>
                  </div>
                  <div className="tch-actions">
                    <label className="story-switch" title={row.published ? "Hide from the website" : "Show on the website"}>
                      <input type="checkbox" checked={row.published} disabled={!row.id || pending} onChange={(event) => togglePublished(row, event.target.checked)} />
                      <span aria-hidden="true" />
                      <span className="visually-hidden">Shown on the website</span>
                    </label>
                    <a
                      className={`story-icon${row.published ? "" : " is-off"}`}
                      href={row.published ? `/teacher/${row.slug}` : undefined}
                      target="_blank"
                      rel="noreferrer"
                      title={row.published ? "View profile page" : "Hidden from the website"}
                      aria-disabled={!row.published}
                    >
                      <i className="fa-solid fa-arrow-up-right-from-square" />
                    </a>
                    {editHref ? (
                      <Link className="tch-edit" href={editHref}>
                        <i className="fa-solid fa-pen" aria-hidden="true" /> Edit profile
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
            {editable && !filtered ? (
              <li className="tch-add">
                <Link href="/admin/content/teachers/new">
                  <span><i className="fa-solid fa-user-plus" aria-hidden="true" /></span>
                  <strong>Add a teacher</strong>
                  <small>Introduce a new member of staff with a portrait, role and short bio.</small>
                </Link>
              </li>
            ) : null}
          </ul>
        ) : (
          <div className="apl-empty">
            <span><i className="fa-solid fa-chalkboard-user" aria-hidden="true" /></span>
            <h2>{rows.length ? "No teachers match" : "No teachers yet"}</h2>
            <p>{rows.length ? "Try a different search or clear the filters." : "Use Add teacher to introduce the first one."}</p>
          </div>
        )}

        <div className="apl-pager">
          <span>Showing {visible.length} of {enriched.length} {enriched.length === 1 ? "teacher" : "teachers"}</span>
          <span className="pg-legend">
            <i className="fa-solid fa-circle-info" aria-hidden="true" /> The first {FEATURED_TEACHERS} live teachers in website order appear on the homepage and About page.
          </span>
        </div>
      </section>
    </div>
  );
}
