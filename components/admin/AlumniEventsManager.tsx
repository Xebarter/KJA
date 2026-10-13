"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { saveRecord } from "@/app/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import { dateParts, daysUntil, eventTiming, kampalaToday, relativeDays, type AlumniEventRow, type EventTiming } from "@/lib/alumni-admin";

type Tab = "upcoming" | "past" | "undated" | "all";
type StatusFilter = "all" | "live" | "hidden";
type Feedback = { ok?: string; error?: string } | null;

const TIMING: Record<EventTiming, { label: string; tone: string }> = {
  today: { label: "Today", tone: "new" },
  upcoming: { label: "Upcoming", tone: "offer" },
  past: { label: "Past", tone: "closed" },
  undated: { label: "No date", tone: "wait" },
};

export function DateTile({ startsOn, size = "md" }: { startsOn: string; size?: "md" | "lg" }) {
  const parts = dateParts(startsOn);
  return (
    <span className={`alx-date alx-date--${size}${parts ? "" : " is-empty"}`} aria-hidden="true">
      {parts ? (
        <>
          <small>{parts.month}</small>
          <strong>{parts.day}</strong>
          <em>{parts.year}</em>
        </>
      ) : (
        <i className="fa-regular fa-calendar" />
      )}
    </span>
  );
}

export function AlumniEventsManager({ events, editable }: { events: AlumniEventRow[]; editable: boolean }) {
  const router = useRouter();
  const today = kampalaToday();
  const [rows, setRows] = useState(events);
  const [tab, setTab] = useState<Tab>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => setRows(events), [events]);

  const enriched = useMemo(
    () =>
      rows.map((row) => {
        const timing = eventTiming(row.starts_on, today);
        const missing = [!row.image_url && "a photo", !row.location && "a venue", !row.excerpt && "a summary"].filter(Boolean) as string[];
        return { ...row, timing, days: daysUntil(row.starts_on, today), missing };
      }),
    [rows, today],
  );

  const counts = useMemo(() => {
    const by = { upcoming: 0, past: 0, undated: 0 };
    for (const row of enriched) {
      if (row.timing === "past") by.past += 1;
      else if (row.timing === "undated") by.undated += 1;
      else by.upcoming += 1;
    }
    const live = enriched.filter((row) => row.published).length;
    return { ...by, live, hidden: enriched.length - live, incomplete: enriched.filter((row) => row.missing.length).length };
  }, [enriched]);

  const next = useMemo(
    () =>
      enriched
        .filter((row) => row.published && (row.timing === "upcoming" || row.timing === "today"))
        .sort((a, b) => a.starts_on.localeCompare(b.starts_on))[0] ?? null,
    [enriched],
  );

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = enriched.filter((row) => {
      if (tab === "upcoming" && row.timing !== "upcoming" && row.timing !== "today") return false;
      if (tab === "past" && row.timing !== "past") return false;
      if (tab === "undated" && row.timing !== "undated") return false;
      if (status === "live" && !row.published) return false;
      if (status === "hidden" && row.published) return false;
      return !needle || [row.title, row.location, row.slug, row.excerpt].some((value) => value.toLowerCase().includes(needle));
    });
    const upcomingFirst = (a: (typeof list)[number], b: (typeof list)[number]) => {
      const rank = (row: typeof a) => (row.timing === "past" ? 2 : row.timing === "undated" ? 1 : 0);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return rank(a) === 0 ? a.starts_on.localeCompare(b.starts_on) : b.starts_on.localeCompare(a.starts_on);
    };
    return list.sort(upcomingFirst);
  }, [enriched, tab, status, q]);

  const filtered = tab !== "all" || status !== "all" || q.trim() !== "";

  const togglePublished = (row: AlumniEventRow, nextValue: boolean) => {
    if (!row.id) return;
    setBusy(row.id);
    startTransition(async () => {
      const data = new FormData();
      data.set("id", row.id!);
      data.set("published", nextValue ? "on" : "off");
      try {
        await saveRecord("alumni_events", data);
        setRows((list) => list.map((entry) => (entry.id === row.id ? { ...entry, published: nextValue } : entry)));
        setFeedback({ ok: `“${row.title}” is ${nextValue ? "now on the website" : "now hidden"}.` });
        router.refresh();
      } catch (error) {
        setFeedback({ error: error instanceof Error ? error.message : "Could not update the event." });
      } finally {
        setBusy(null);
      }
    });
  };

  const kpis = [
    { key: "upcoming", label: "Upcoming", icon: "fa-calendar-plus", count: counts.upcoming, note: next ? `Next: ${relativeDays(next.days).toLowerCase()}` : "Nothing scheduled", active: tab === "upcoming", onClick: () => setTab((value) => (value === "upcoming" ? "all" : "upcoming")) },
    { key: "past", label: "Past events", icon: "fa-clock-rotate-left", count: counts.past, note: "Kept as a record", active: tab === "past", onClick: () => setTab((value) => (value === "past" ? "all" : "past")) },
    { key: "hidden", label: "Hidden", icon: "fa-eye-slash", count: counts.hidden, note: counts.hidden ? "Only admins can see these" : "Nothing hidden", active: status === "hidden", onClick: () => setStatus((value) => (value === "hidden" ? "all" : "hidden")) },
    { key: "live", label: "On the website", icon: "fa-globe", count: counts.live, note: counts.incomplete ? `${counts.incomplete} missing details` : "All details complete", active: status === "live", onClick: () => setStatus((value) => (value === "live" ? "all" : "live")) },
  ];

  const nextParts = next ? dateParts(next.starts_on) : null;

  return (
    <div className="app-page apl alx-admin">
      <PageHeader
        kicker="Alumni"
        icon="fa-calendar-days"
        title="Alumni events"
        description="Reunions, homecomings and get-togethers for former pupils. Upcoming events are promoted on the alumni pages; past ones stay as a record."
        actions={
          <>
            {editable ? (
              <Link className="admin-hero-btn is-primary" href="/admin/content/alumni_events/new"><i className="fa-solid fa-calendar-plus" aria-hidden="true" /> New event</Link>
            ) : (
              <span className="admin-hero-btn is-disabled" aria-disabled="true" title="Connect Supabase first"><i className="fa-solid fa-calendar-plus" aria-hidden="true" /> New event</span>
            )}
            <a className="admin-hero-btn" href="/alumni-events" target="_blank" rel="noopener noreferrer">
              <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> Alumni events page
            </a>
          </>
        }
      >
        <div className="apl-pipeline alx-next">
          <p className="apl-pipeline-head">
            <span>Next on the calendar</span>
            {next ? <strong>{relativeDays(next.days)}</strong> : null}
          </p>
          {next && nextParts ? (
            <Link className="alx-next-card" href={`/admin/content/alumni_events/${next.id}`}>
              <DateTile startsOn={next.starts_on} size="lg" />
              <span>
                <strong>{next.title}</strong>
                <small><i className="fa-regular fa-calendar" aria-hidden="true" /> {nextParts.long}</small>
                {next.location ? <small><i className="fa-solid fa-location-dot" aria-hidden="true" /> {next.location}</small> : null}
              </span>
            </Link>
          ) : (
            <div className="alx-next-empty">
              <i className="fa-regular fa-calendar-xmark" aria-hidden="true" />
              <p>No upcoming event is live. The alumni events page will show past events only.</p>
            </div>
          )}
        </div>
      </PageHeader>

      {!editable ? (
        <div className="admin-card app-notice apl-notice">
          <i className="fa-solid fa-database" aria-hidden="true" />
          <div>
            <h2>Events are read-only for now</h2>
            <p>Connect Supabase and import the content to add or edit alumni events here.</p>
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
        <nav className="apl-tabs pg-tabs" aria-label="Filter by date">
          {([
            ["all", "All events", enriched.length],
            ["upcoming", "Upcoming", counts.upcoming],
            ["past", "Past", counts.past],
            ["undated", "No date", counts.undated],
          ] as const).map(([key, label, count]) =>
            key === "undated" && !count ? null : (
              <button key={key} type="button" className={tab === key ? "active" : ""} aria-pressed={tab === key} onClick={() => setTab(key)}>
                {label}
                <em>{count}</em>
              </button>
            ),
          )}
        </nav>

        <div className="app-filters" role="search">
          <label className="app-search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <span className="visually-hidden">Search events</span>
            <input type="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search by title or venue" />
          </label>
          <select aria-label="Status" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
            <option value="all">Any status</option>
            <option value="live">On the website</option>
            <option value="hidden">Hidden</option>
          </select>
          {filtered ? (
            <button type="button" className="app-clear app-link-btn" onClick={() => { setTab("all"); setStatus("all"); setQ(""); }}>
              Clear
            </button>
          ) : null}
        </div>

        {feedback?.ok ? <p className="app-feedback" role="status"><i className="fa-solid fa-check" /> {feedback.ok}</p> : null}
        {feedback?.error ? <p className="app-feedback is-error" role="alert"><i className="fa-solid fa-circle-exclamation" /> {feedback.error}</p> : null}

        {visible.length ? (
          <ul className={`alx-events${pending ? " is-busy" : ""}`}>
            {visible.map((row) => {
              const editHref = row.id ? `/admin/content/alumni_events/${row.id}` : null;
              const timing = TIMING[row.timing];
              return (
                <li
                  key={row.id ?? row.slug}
                  className={`alx-event is-${row.timing}${row.published ? "" : " is-hidden"}${busy && busy === row.id ? " is-saving" : ""}`}
                  onClick={(event) => {
                    if (!editHref || (event.target as HTMLElement).closest("a, button, input, label")) return;
                    router.push(editHref);
                  }}
                >
                  <DateTile startsOn={row.starts_on} />
                  <span className="alx-event-photo">
                    {row.image_url ? <img src={row.image_url} alt="" loading="lazy" /> : <i className="fa-regular fa-image" aria-hidden="true" />}
                  </span>
                  <div className="alx-event-main">
                    <h3>{editHref ? <Link href={editHref}>{row.title || "Untitled event"}</Link> : row.title || "Untitled event"}</h3>
                    <p className="alx-event-meta">
                      <span><i className="fa-solid fa-location-dot" aria-hidden="true" /> {row.location || <em>No venue yet</em>}</span>
                      <span className="alx-event-path">kja.ug/alumni-events/{row.slug}</span>
                    </p>
                    {row.missing.length ? <p className="alx-missing"><i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> Add {row.missing.join(", ")}</p> : null}
                  </div>
                  <div className="alx-event-when">
                    <span className={`app-status app-status-${timing.tone}`}>{timing.label}</span>
                    <small>{relativeDays(row.days)}</small>
                  </div>
                  <div className="story-actions alx-event-actions">
                    <label className="story-switch" title={row.published ? "Hide from the website" : "Show on the website"}>
                      <input type="checkbox" checked={row.published} disabled={!row.id || pending} onChange={(event) => togglePublished(row, event.target.checked)} />
                      <span aria-hidden="true" />
                      <span className="visually-hidden">Shown on the website</span>
                    </label>
                    <a
                      className={`story-icon${row.published ? "" : " is-off"}`}
                      href={row.published ? `/alumni-events/${row.slug}` : undefined}
                      target="_blank"
                      rel="noreferrer"
                      title={row.published ? "View on website" : "Hidden from the website"}
                      aria-disabled={!row.published}
                    >
                      <i className="fa-solid fa-arrow-up-right-from-square" />
                    </a>
                    {editHref ? (
                      <Link className="story-icon" href={editHref} title="Edit event">
                        <i className="fa-solid fa-pen" />
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="apl-empty">
            <span><i className="fa-regular fa-calendar" aria-hidden="true" /></span>
            <h2>{rows.length ? "No events match" : "No alumni events yet"}</h2>
            <p>{rows.length ? "Try a different search or clear the filters." : "Plan the first reunion with New event. It appears on the alumni events page as soon as it's live."}</p>
            {!rows.length && editable ? (
              <Link className="admin-btn" href="/admin/content/alumni_events/new"><i className="fa-solid fa-calendar-plus" aria-hidden="true" /> New event</Link>
            ) : null}
          </div>
        )}

        <div className="apl-pager">
          <span>Showing {visible.length} of {enriched.length} {enriched.length === 1 ? "event" : "events"}</span>
          <span className="pg-legend">
            <i className="fa-solid fa-circle-info" aria-hidden="true" /> Upcoming events are listed soonest first, past events newest first.
          </span>
        </div>
      </section>
    </div>
  );
}
