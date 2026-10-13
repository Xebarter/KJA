"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { saveRecord } from "@/app/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import { campusChecklist, campusRank, type CampusInsight, type CampusRow } from "@/lib/campus-admin";
import "@/app/admin/campuses.css";

export type CampusCardData = CampusRow & { insight: CampusInsight };
type Feedback = { ok?: string; error?: string } | null;

export function CampusesManager({ campuses, sectionCount, editable }: { campuses: CampusCardData[]; sectionCount: number; editable: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(campuses);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => setRows(campuses), [campuses]);

  const ordered = useMemo(() => [...rows].sort((a, b) => campusRank(a.slug) - campusRank(b.slug) || a.title.localeCompare(b.title)), [rows]);
  const live = rows.filter((row) => row.published).length;
  const totals = rows.reduce(
    (sum, row) => ({ facilities: sum.facilities + row.insight.facilities, clubs: sum.clubs + row.insight.clubs, photos: sum.photos + row.insight.photos }),
    { facilities: 0, clubs: 0, photos: 0 },
  );

  const togglePublished = (row: CampusCardData, next: boolean) => {
    if (!row.id) return;
    if (!next && !window.confirm(`Hide ${row.title} from the website? Its page and campus cards disappear until you show it again.`)) return;
    setBusy(row.id);
    startTransition(async () => {
      const data = new FormData();
      data.set("id", row.id!);
      data.set("published", next ? "on" : "off");
      try {
        await saveRecord("campuses", data);
        setRows((list) => list.map((entry) => (entry.id === row.id ? { ...entry, published: next } : entry)));
        setFeedback({ ok: `${row.title} is ${next ? "live on the website" : "now hidden from the website"}.` });
        router.refresh();
      } catch (error) {
        setFeedback({ error: error instanceof Error ? error.message : "Could not update the campus." });
      } finally {
        setBusy(null);
      }
    });
  };

  return (
    <div className="app-page apl cpa">
      <PageHeader
        kicker="Website content"
        icon="fa-school"
        title="Campuses"
        description="Every KJA campus has its own page and appears in the campus cards across the website. Keep each one's name, photo, summary and search snippet sharp."
        actions={
          <>
            {editable ? (
              <Link className="admin-hero-btn is-primary" href="/admin/content/campuses/new"><i className="fa-solid fa-plus" aria-hidden="true" /> New campus</Link>
            ) : (
              <span className="admin-hero-btn is-disabled" aria-disabled="true" title="Connect Supabase first"><i className="fa-solid fa-plus" aria-hidden="true" /> New campus</span>
            )}
            <Link className="admin-hero-btn" href="/admin/content/campus_sections">
              <i className="fa-solid fa-shapes" aria-hidden="true" /> Campus sections
            </Link>
          </>
        }
      >
        <div className="apl-pipeline">
          <p className="apl-pipeline-head">
            <span>Across all campuses</span>
            <strong>{live} of {rows.length} live</strong>
          </p>
          <div className="cpa-dots" aria-hidden="true">
            {ordered.map((row) => <span key={row.slug} className={row.published ? "is-live" : undefined} title={row.title} />)}
          </div>
          <dl className="apl-pipeline-figures">
            <div><dt>Facilities</dt><dd>{totals.facilities}</dd></div>
            <div><dt>Clubs</dt><dd>{totals.clubs}</dd></div>
            <div><dt>Photos</dt><dd>{totals.photos}</dd></div>
          </dl>
        </div>
      </PageHeader>

      {!editable ? (
        <div className="admin-card app-notice apl-notice">
          <i className="fa-solid fa-database" aria-hidden="true" />
          <div>
            <h2>Campuses are read-only for now</h2>
            <p>You&apos;re seeing the campuses imported with the website. Connect Supabase and import the content to edit them here.</p>
          </div>
        </div>
      ) : null}

      <div className="pg-usage-note pg-usage-note--layout is-banner cpa-banner">
        <i className="fa-solid fa-swatchbook" aria-hidden="true" />
        <div>
          <strong>What you edit here</strong>
          <p>
            The name, photo, summary and search description. Each campus page builds its detailed sections (welcome, clubs, facilities,
            campus life, fees and admissions) from that campus&apos;s designed layout, and you can see what each page shows below.
          </p>
        </div>
      </div>

      <div className="cpa-feedback" aria-live="polite">
        {feedback?.ok ? <p className="app-feedback" role="status"><i className="fa-solid fa-check" /> {feedback.ok}</p> : null}
        {feedback?.error ? <p className="app-feedback is-error" role="alert"><i className="fa-solid fa-circle-exclamation" /> {feedback.error}</p> : null}
      </div>

      {ordered.length ? (
        <div className="cpa-grid">
          {ordered.map((row) => {
            const editHref = row.id ? `/admin/content/campuses/${row.id}` : null;
            const photo = row.image_url || row.insight.heroImage;
            const checks = campusChecklist(row);
            const score = checks.filter((item) => item.ok).length;
            const missing = checks.find((item) => !item.ok);
            const stats = [
              row.insight.facilities ? { icon: "fa-building-columns", value: String(row.insight.facilities), label: "Facilities" } : null,
              row.insight.clubs ? { icon: "fa-medal", value: String(row.insight.clubs), label: "Clubs" } : null,
              row.insight.ratio ? { icon: "fa-scale-balanced", value: row.insight.ratio, label: "Ratio" } : null,
              row.insight.photos ? { icon: "fa-images", value: String(row.insight.photos), label: "Photos" } : null,
            ].filter((stat): stat is { icon: string; value: string; label: string } => Boolean(stat));
            return (
              <article key={row.id ?? row.slug} className={`cpa-card${row.published ? "" : " is-hidden"}${busy === row.id ? " is-busy" : ""}`}>
                <div className="cpa-card-media">
                  {photo ? <img src={photo} alt="" loading="lazy" /> : <span className="cpa-card-fallback"><i className="fa-solid fa-school" aria-hidden="true" /></span>}
                  <span className={`app-status app-status-${row.published ? "done" : "wait"}`}>{row.published ? "Live" : "Hidden"}</span>
                  {row.insight.flag ? <span className="cpa-flag"><i className="fa-solid fa-star" aria-hidden="true" /> {row.insight.flag}</span> : null}
                  <div className="cpa-card-title">
                    <span>{row.insight.stage}</span>
                    <h2>{editHref ? <Link href={editHref}>{row.title || row.slug}</Link> : row.title || row.slug}</h2>
                  </div>
                </div>
                <div className="cpa-card-body">
                  <p className="cpa-card-addr">
                    <i className="fa-solid fa-location-dot" aria-hidden="true" />
                    {row.insight.address || `kja.ug/branch/${row.slug}`}
                  </p>
                  <p className={`cpa-card-summary${row.excerpt ? "" : " is-empty"}`}>{row.excerpt || "No summary yet. Add one so the campus cards have something to say."}</p>
                  {stats.length ? (
                    <dl className="cpa-stats">
                      {stats.map((stat) => (
                        <div key={stat.label}>
                          <dt><i className={`fa-solid ${stat.icon}`} aria-hidden="true" /> {stat.label}</dt>
                          <dd>{stat.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="cpa-card-note"><i className="fa-solid fa-circle-info" aria-hidden="true" /> No designed layout yet: the page shows the name, photo and summary.</p>
                  )}
                  <div className={`cpa-health${score === checks.length ? " is-done" : ""}`}>
                    <div className="cpa-health-bar" aria-hidden="true"><span style={{ width: `${(score / checks.length) * 100}%` }} /></div>
                    <span>
                      <strong>{score}/{checks.length}</strong> {missing ? `Missing: ${missing.label.replace(/^An? /, "").toLowerCase()}` : "Ready to share"}
                    </span>
                  </div>
                </div>
                <footer className="cpa-card-foot">
                  <label className="story-switch" title={row.published ? "Hide from the website" : "Show on the website"}>
                    <input type="checkbox" checked={row.published} disabled={!row.id || pending} onChange={(event) => togglePublished(row, event.target.checked)} />
                    <span aria-hidden="true" />
                    <span className="visually-hidden">Live on the website</span>
                  </label>
                  <span className="cpa-card-foot-label">{row.published ? "On the website" : "Hidden"}</span>
                  <a
                    className={`story-icon${row.published ? "" : " is-off"}`}
                    href={row.published ? `/branch/${row.slug}` : undefined}
                    target="_blank"
                    rel="noreferrer"
                    title={row.published ? "View campus page" : "Hidden from the website"}
                    aria-disabled={!row.published}
                  >
                    <i className="fa-solid fa-arrow-up-right-from-square" />
                  </a>
                  {editHref ? (
                    <Link className="admin-btn admin-btn-ghost cpa-edit" href={editHref}><i className="fa-solid fa-pen" aria-hidden="true" /> Edit</Link>
                  ) : null}
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="admin-card apl-empty">
          <span><i className="fa-solid fa-school" aria-hidden="true" /></span>
          <h2>No campuses yet</h2>
          <p>Use New campus to add the first one.</p>
        </div>
      )}

      <Link className="cpa-library" href="/admin/content/campus_sections">
        <span className="cpa-library-icon"><i className="fa-solid fa-shapes" aria-hidden="true" /></span>
        <span>
          <strong>Campus sections library</strong>
          <small>{sectionCount} facilities, campus-life entries and clubs imported from the previous website, with their photos.</small>
        </span>
        <i className="fa-solid fa-arrow-right" aria-hidden="true" />
      </Link>
    </div>
  );
}
