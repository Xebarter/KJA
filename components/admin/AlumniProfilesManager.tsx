"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { saveRecord } from "@/app/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import { initialsOf } from "@/lib/alumni";
import { parseInterview, profileYears, type AlumniProfileRow } from "@/lib/alumni-admin";
import { ALUMNI_QUESTIONS } from "@/lib/forms";

type StatusFilter = "all" | "live" | "hidden";
type Gap = "none" | "photo" | "interview";
type Sort = "class" | "name";
type Feedback = { ok?: string; error?: string } | null;

export function AlumniProfilesManager({ profiles, editable }: { profiles: AlumniProfileRow[]; editable: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(profiles);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [gap, setGap] = useState<Gap>("none");
  const [year, setYear] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("class");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => setRows(profiles), [profiles]);

  const enriched = useMemo(
    () =>
      rows.map((row) => {
        const answers = parseInterview(row.body);
        const answered = answers ? answers.filter(Boolean).length : null;
        return { ...row, answered, years: profileYears(row.body) };
      }),
    [rows],
  );

  const classes = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of enriched) if (row.classOf) map.set(row.classOf, (map.get(row.classOf) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [enriched]);

  const counts = useMemo(() => {
    const live = enriched.filter((row) => row.published).length;
    return {
      live,
      hidden: enriched.length - live,
      noPhoto: enriched.filter((row) => !row.image_url).length,
      incomplete: enriched.filter((row) => row.answered !== null && row.answered < ALUMNI_QUESTIONS.length).length,
    };
  }, [enriched]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = enriched.filter((row) => {
      if (status === "live" && !row.published) return false;
      if (status === "hidden" && row.published) return false;
      if (gap === "photo" && row.image_url) return false;
      if (gap === "interview" && (row.answered === null || row.answered === ALUMNI_QUESTIONS.length)) return false;
      if (year !== "all" && row.classOf !== year) return false;
      return !needle || [row.name, row.role, row.classOf, row.slug].some((value) => value.toLowerCase().includes(needle));
    });
    if (sort === "class") list.sort((a, b) => Number(b.classOf || 0) - Number(a.classOf || 0) || a.name.localeCompare(b.name));
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [enriched, status, gap, year, q, sort]);

  const filtered = status !== "all" || gap !== "none" || year !== "all" || q.trim() !== "" || sort !== "class";
  const clear = () => {
    setStatus("all");
    setGap("none");
    setYear("all");
    setQ("");
    setSort("class");
  };

  const togglePublished = (row: AlumniProfileRow, next: boolean) => {
    if (!row.id) return;
    setBusy(row.id);
    startTransition(async () => {
      const data = new FormData();
      data.set("id", row.id!);
      data.set("published", next ? "on" : "off");
      try {
        await saveRecord("alumni_profiles", data);
        setRows((list) => list.map((entry) => (entry.id === row.id ? { ...entry, published: next } : entry)));
        setFeedback({ ok: `${row.name}'s profile is ${next ? "now on the website" : "now hidden"}.` });
        router.refresh();
      } catch (error) {
        setFeedback({ error: error instanceof Error ? error.message : "Could not update this profile." });
      } finally {
        setBusy(null);
      }
    });
  };

  const span = classes.length ? (classes.length === 1 ? classes[0][0] : `${classes[classes.length - 1][0]}–${classes[0][0]}`) : null;
  const kpis = [
    { key: "live", label: "On the website", icon: "fa-globe", count: counts.live, note: span ? `Classes of ${span}` : "No class years yet", active: status === "live", onClick: () => setStatus((value) => (value === "live" ? "all" : "live")) },
    { key: "hidden", label: "Hidden", icon: "fa-eye-slash", count: counts.hidden, note: counts.hidden ? "Waiting for review" : "Nothing hidden", active: status === "hidden", onClick: () => setStatus((value) => (value === "hidden" ? "all" : "hidden")) },
    { key: "photo", label: "Missing a portrait", icon: "fa-camera", count: counts.noPhoto, note: counts.noPhoto ? "Shown with initials" : "Every profile has a portrait", active: gap === "photo", onClick: () => setGap((value) => (value === "photo" ? "none" : "photo")) },
    { key: "interview", label: "Unfinished interviews", icon: "fa-comments", count: counts.incomplete, note: counts.incomplete ? "Some questions unanswered" : "All interviews complete", active: gap === "interview", onClick: () => setGap((value) => (value === "interview" ? "none" : "interview")) },
  ];

  const faces = enriched.filter((row) => row.image_url).slice(0, 5);

  return (
    <div className="app-page apl alx-admin cms-desk">
      <PageHeader
        kicker="Alumni"
        icon="fa-user-graduate"
        title="Alumni profiles"
        description="Former pupils in their own words. Each profile is a short interview: time at KJA, best memories, clubs, and where life has taken them since."
        actions={
          <>
            {editable ? (
              <Link className="admin-hero-btn is-primary" href="/admin/content/alumni_profiles/new"><i className="fa-solid fa-user-plus" aria-hidden="true" /> New profile</Link>
            ) : (
              <span className="admin-hero-btn is-disabled" aria-disabled="true" title="Connect Supabase first"><i className="fa-solid fa-user-plus" aria-hidden="true" /> New profile</span>
            )}
            <a className="admin-hero-btn" href="/alumni-profiles" target="_blank" rel="noopener noreferrer">
              <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> Profiles page
            </a>
            <Link className="admin-hero-btn" href="/admin/inbox/messages">
              <i className="fa-solid fa-inbox" aria-hidden="true" /> Alumni submissions
            </Link>
          </>
        }
      >
        <div className="apl-pipeline alx-classes">
          <p className="apl-pipeline-head">
            <span>Classes represented</span>
            <strong>{enriched.length} {enriched.length === 1 ? "profile" : "profiles"}</strong>
          </p>
          {faces.length ? (
            <div className="tch-faces alx-faces" aria-hidden="true">
              {faces.map((row) => <span key={row.id ?? row.slug}><img src={row.image_url} alt="" /></span>)}
              {enriched.length > faces.length ? <span className="is-more">+{enriched.length - faces.length}</span> : null}
            </div>
          ) : null}
          {classes.length ? (
            <div className="alx-class-chips">
              {classes.slice(0, 10).map(([value, count]) => (
                <button key={value} type="button" className={year === value ? "is-active" : ""} onClick={() => setYear((current) => (current === value ? "all" : value))}>
                  {value}
                  {count > 1 ? <em>{count}</em> : null}
                </button>
              ))}
            </div>
          ) : (
            <p className="alx-next-empty"><i className="fa-solid fa-graduation-cap" aria-hidden="true" /> Class years appear here as profiles are added.</p>
          )}
        </div>
      </PageHeader>

      {!editable ? (
        <div className="admin-card app-notice apl-notice">
          <i className="fa-solid fa-database" aria-hidden="true" />
          <div>
            <h2>Profiles are read-only for now</h2>
            <p>Connect Supabase and import the content to add or edit alumni profiles here.</p>
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
            <span className="visually-hidden">Search profiles</span>
            <input type="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search by name, class or role" />
          </label>
          <select aria-label="Class" value={year} onChange={(event) => setYear(event.target.value)}>
            <option value="all">Every class</option>
            {classes.map(([value]) => <option key={value} value={value}>Class of {value}</option>)}
          </select>
          <select aria-label="Status" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
            <option value="all">Any status</option>
            <option value="live">On the website</option>
            <option value="hidden">Hidden</option>
          </select>
          <select aria-label="Sort" value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
            <option value="class">Newest class</option>
            <option value="name">Name A–Z</option>
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
          <ul className={`tch-grid alx-profiles${pending ? " is-busy" : ""}`}>
            {visible.map((row) => {
              const editHref = row.id ? `/admin/content/alumni_profiles/${row.id}` : null;
              const total = ALUMNI_QUESTIONS.length;
              return (
                <li
                  key={row.id ?? row.slug}
                  className={`tch-card alx-profile${row.published ? "" : " is-hidden"}${busy && busy === row.id ? " is-saving" : ""}`}
                  onClick={(event) => {
                    if (!editHref || (event.target as HTMLElement).closest("a, button, input, label")) return;
                    router.push(editHref);
                  }}
                >
                  <figure className="tch-photo">
                    {row.image_url ? <img src={row.image_url} alt="" loading="lazy" /> : <span className="tch-initials">{initialsOf(row.name)}</span>}
                    <span className={`tch-state${row.published ? " is-live" : ""}`}>
                      <i className={`fa-solid ${row.published ? "fa-circle" : "fa-eye-slash"}`} aria-hidden="true" /> {row.published ? "Live" : "Hidden"}
                    </span>
                    <span className="alx-class-badge"><i className="fa-solid fa-graduation-cap" aria-hidden="true" /> {row.classOf ? `Class of ${row.classOf}` : "Class not set"}</span>
                  </figure>
                  <div className="tch-body">
                    <h3>{editHref ? <Link href={editHref}>{row.name || "Unnamed"}</Link> : row.name || "Unnamed"}</h3>
                    <p className="tch-role">{row.role || (row.years ? `${row.years} at KJA` : "No headline yet")}</p>
                    <div className="tch-health">
                      {row.answered === null ? (
                        <p className="alx-free"><i className="fa-solid fa-feather-pointed" aria-hidden="true" /> Written as a free-form story</p>
                      ) : (
                        <>
                          <p>
                            <span>Interview</span>
                            <strong>{row.answered}/{total}</strong>
                          </p>
                          <span className="tch-steps" aria-hidden="true">
                            {Array.from({ length: total }, (_, index) => <span key={index} className={index < (row.answered ?? 0) ? "is-ok" : ""} />)}
                          </span>
                        </>
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
                      data-act="View"
                      href={row.published ? `/alumni-profile/${row.slug}` : undefined}
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
                <Link href="/admin/content/alumni_profiles/new">
                  <span><i className="fa-solid fa-user-plus" aria-hidden="true" /></span>
                  <strong>Add an alumni profile</strong>
                  <small>Turn a get-in-touch reply into a profile with a portrait and interview answers.</small>
                </Link>
              </li>
            ) : null}
          </ul>
        ) : (
          <div className="apl-empty">
            <span><i className="fa-solid fa-user-graduate" aria-hidden="true" /></span>
            <h2>{rows.length ? "No profiles match" : "No alumni profiles yet"}</h2>
            <p>{rows.length ? "Try a different search or clear the filters." : "Use New profile to feature the first former pupil."}</p>
          </div>
        )}

        <div className="apl-pager">
          <span>Showing {visible.length} of {enriched.length} {enriched.length === 1 ? "profile" : "profiles"}</span>
          <span className="pg-legend">
            <i className="fa-solid fa-circle-info" aria-hidden="true" /> The website lists profiles newest class first.
          </span>
        </div>
      </section>
    </div>
  );
}
