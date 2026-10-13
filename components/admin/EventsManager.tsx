"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { deleteRecord, saveRecord } from "@/app/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import { dayStart, formatTime, isYmd, MONTHS, MONTHS_SHORT, parseTime, WEEKDAYS_SHORT, weekday } from "@/lib/events-calendar";
import { decodeEntities } from "@/lib/html";
import type { Article } from "@/lib/types";

type Tab = "upcoming" | "past" | "hidden" | "all";
type Phase = "now" | "upcoming" | "past" | "tba";
type Feedback = { ok?: string; error?: string } | null;

type Row = {
  id?: string;
  slug: string;
  title: string;
  excerpt: string;
  image: string | null;
  location: string;
  published: boolean;
  start: string | null;
  end: string | null;
  time: string;
  phase: Phase;
  days: number | null;
  missing: string[];
};

const DAY_MS = 86_400_000;

function plain(html?: string | null) {
  return decodeEntities((html || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function timeLabel(event: Article) {
  const start = parseTime(event.start_time);
  if (start === null) return "All day";
  const end = parseTime(event.end_time);
  if (start === 0 && end === 23 * 60 + 59) return "All day";
  if (end === null || end === start) return formatTime(start);
  return `${formatTime(start)} – ${formatTime(end)}`;
}

function relative(days: number | null, phase: Phase) {
  if (phase === "tba" || days === null) return "Date to be announced";
  if (phase === "now") return days < 0 ? "Happening now" : "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  const abs = Math.abs(days);
  const amount = abs < 14 ? `${abs} days` : abs < 60 ? `${Math.round(abs / 7)} weeks` : `${Math.round(abs / 30)} months`;
  return days > 0 ? `In ${amount}` : `${amount} ago`;
}

function shortDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

function toRow(event: Article, today: string): Row {
  const start = isYmd(event.starts_on) ? event.starts_on : null;
  const end = start ? (isYmd(event.ends_on) && event.ends_on >= start ? event.ends_on : start) : null;
  const days = start ? Math.round((dayStart(start) - dayStart(today)) / DAY_MS) : null;
  let phase: Phase = "tba";
  if (start && end) phase = end < today ? "past" : start <= today ? "now" : "upcoming";
  const excerpt = plain(event.excerpt) || plain(event.body);
  const location = plain(event.location);
  const missing = [!event.image_url && !event.thumbnail_url ? "image" : "", !location ? "place" : ""].filter(Boolean);
  return {
    id: event.id,
    slug: event.slug,
    title: decodeEntities(event.title) || event.slug,
    excerpt,
    image: event.thumbnail_url || event.image_url || null,
    location,
    published: event.published !== false,
    start,
    end,
    time: timeLabel(event),
    phase,
    days,
    missing,
  };
}

function isUpcoming(row: Row) {
  return row.phase !== "past";
}

function DateTile({ start, end, dark }: { start: string | null; end: string | null; dark?: boolean }) {
  if (!start) {
    return (
      <span className={`aev-date is-tba${dark ? " is-dark" : ""}`} aria-label="Date to be announced">
        <em>Date</em>
        <strong>?</strong>
        <small>TBA</small>
      </span>
    );
  }
  const [, m, d] = start.split("-").map(Number);
  const endDay = end && end !== start && end.slice(0, 7) === start.slice(0, 7) ? Number(end.slice(8)) : null;
  return (
    <span className={`aev-date${dark ? " is-dark" : ""}`} aria-label={shortDate(start)}>
      <em>{MONTHS_SHORT[m - 1]}</em>
      <strong>{endDay ? `${d}–${endDay}` : d}</strong>
      <small>{WEEKDAYS_SHORT[weekday(start)]}</small>
    </span>
  );
}

export function EventsManager({ events, editable, today }: { events: Article[]; editable: boolean; today: string }) {
  const router = useRouter();
  const [rows, setRows] = useState(events);
  const [q, setQ] = useState("");
  const [campus, setCampus] = useState("all");
  const [needs, setNeeds] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => setRows(events), [events]);

  const enriched = useMemo(() => rows.map((event) => toRow(event, today)), [rows, today]);

  const counts = useMemo(() => {
    const thisMonth = today.slice(0, 7);
    return {
      upcoming: enriched.filter(isUpcoming).length,
      past: enriched.filter((row) => row.phase === "past").length,
      hidden: enriched.filter((row) => !row.published).length,
      month: enriched.filter((row) => row.start?.slice(0, 7) === thisMonth).length,
      needs: enriched.filter((row) => row.missing.length).length,
    };
  }, [enriched, today]);

  const [tab, setTab] = useState<Tab>(() => (counts.upcoming ? "upcoming" : "all"));

  const campuses = useMemo(() => [...new Set(enriched.map((row) => row.location).filter(Boolean))].sort(), [enriched]);

  const next = useMemo(
    () => enriched.filter((row) => row.published && (row.phase === "now" || row.phase === "upcoming")).sort((a, b) => a.start!.localeCompare(b.start!))[0],
    [enriched],
  );
  const last = useMemo(
    () => enriched.filter((row) => row.published && row.phase === "past").sort((a, b) => b.end!.localeCompare(a.end!))[0],
    [enriched],
  );
  const soon = useMemo(() => enriched.filter((row) => row.published && row.days !== null && row.days >= 0 && row.days <= 30 && row.phase !== "past").length, [enriched]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = enriched.filter((row) => {
      if (tab === "upcoming" && !isUpcoming(row)) return false;
      if (tab === "past" && row.phase !== "past") return false;
      if (tab === "hidden" && row.published) return false;
      if (campus !== "all" && row.location !== campus) return false;
      if (needs && !row.missing.length) return false;
      return !needle || [row.title, row.excerpt, row.location].some((value) => value.toLowerCase().includes(needle));
    });
    const ascending = tab === "upcoming";
    return list.sort((a, b) => {
      if (!a.start || !b.start) return a.start ? (ascending ? -1 : 1) : b.start ? (ascending ? 1 : -1) : 0;
      return ascending ? a.start.localeCompare(b.start) : b.start.localeCompare(a.start);
    });
  }, [enriched, tab, campus, needs, q]);

  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const row of visible) {
      const key = row.start ? row.start.slice(0, 7) : "tba";
      map.set(key, [...(map.get(key) || []), row]);
    }
    return [...map.entries()].map(([key, items]) => ({
      key,
      label: key === "tba" ? "Date to be announced" : `${MONTHS[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`,
      current: key === today.slice(0, 7),
      items,
    }));
  }, [visible, today]);

  const filtered = q.trim() !== "" || campus !== "all" || needs;

  const togglePublished = (row: Row, value: boolean) => {
    if (!row.id) return;
    setBusy(row.id);
    startTransition(async () => {
      const data = new FormData();
      data.set("id", row.id!);
      data.set("published", value ? "on" : "off");
      try {
        await saveRecord("events", data);
        setRows((list) => list.map((entry) => (entry.id === row.id ? { ...entry, published: value } : entry)));
        setFeedback({ ok: `“${row.title}” is ${value ? "live on the website" : "now hidden"}.` });
        router.refresh();
      } catch (error) {
        setFeedback({ error: error instanceof Error ? error.message : "Could not update the event." });
      } finally {
        setBusy(null);
      }
    });
  };

  const remove = (row: Row) => {
    if (!row.id || !window.confirm(`Delete “${row.title}”? This can't be undone.`)) return;
    setBusy(row.id);
    startTransition(async () => {
      try {
        await deleteRecord("events", row.id!);
        setRows((list) => list.filter((entry) => entry.id !== row.id));
        setFeedback({ ok: `“${row.title}” was deleted.` });
        router.refresh();
      } catch (error) {
        setFeedback({ error: error instanceof Error ? error.message : "Could not delete the event." });
      } finally {
        setBusy(null);
      }
    });
  };

  const pickTab = (value: Tab) => setTab((current) => (current === value && value !== "all" ? "all" : value));

  const kpis = [
    { key: "upcoming", label: "Upcoming", icon: "fa-calendar-check", count: counts.upcoming, note: next ? `Next: ${shortDate(next.start!)}` : "Nothing scheduled", active: tab === "upcoming", onClick: () => pickTab("upcoming") },
    { key: "past", label: "Past", icon: "fa-clock-rotate-left", count: counts.past, note: last ? `Latest: ${shortDate(last.start!)}` : "None yet", active: tab === "past", onClick: () => pickTab("past") },
    { key: "hidden", label: "Hidden", icon: "fa-eye-slash", count: counts.hidden, note: counts.hidden ? "Only admins can see these" : "Everything is live", active: tab === "hidden", onClick: () => pickTab("hidden") },
    { key: "needs", label: "Needs details", icon: "fa-wand-magic-sparkles", count: counts.needs, note: counts.needs ? "Missing an image or place" : "Every event has both", active: needs, onClick: () => setNeeds((value) => !value) },
  ];

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "upcoming", label: "Upcoming", count: counts.upcoming },
    { key: "past", label: "Past", count: counts.past },
    { key: "hidden", label: "Hidden", count: counts.hidden },
    { key: "all", label: "All events", count: enriched.length },
  ];

  return (
    <div className="app-page apl pg-admin aev">
      <PageHeader
        kicker="Events & gallery"
        icon="fa-calendar-days"
        title="Events"
        description="Open days, sports galas, graduations and everything else on the school calendar. What you publish here appears on the website's events calendar."
        actions={
          <>
            {editable ? (
              <Link className="admin-hero-btn is-primary" href="/admin/content/events/new"><i className="fa-solid fa-plus" aria-hidden="true" /> Add event</Link>
            ) : (
              <span className="admin-hero-btn is-disabled" aria-disabled="true" title="Connect Supabase first"><i className="fa-solid fa-plus" aria-hidden="true" /> Add event</span>
            )}
            <a className="admin-hero-btn" href="/events" target="_blank" rel="noopener noreferrer">
              <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> View calendar
            </a>
          </>
        }
      >
        <div className="apl-pipeline aev-next">
          <p className="apl-pipeline-head">
            <span>{next ? "Next up" : "Calendar"}</span>
            <strong>{next ? relative(next.days, next.phase) : "Nothing scheduled"}</strong>
          </p>
          {next ? (
            <div className="aev-next-body">
              <DateTile start={next.start} end={next.end} dark />
              <div>
                <h2>{next.title}</h2>
                <p><i className="fa-regular fa-clock" aria-hidden="true" /> {next.time}</p>
                {next.location ? <p><i className="fa-solid fa-location-dot" aria-hidden="true" /> {next.location}</p> : null}
              </div>
            </div>
          ) : (
            <div className="aev-next-body is-empty">
              <span className="aev-next-icon"><i className="fa-regular fa-calendar-plus" aria-hidden="true" /></span>
              <div>
                <h2>No upcoming events</h2>
                <p>{last ? `The last event was “${last.title}”, ${relative(last.days, last.phase).toLowerCase()}.` : "Add the first event to start the calendar."}</p>
              </div>
            </div>
          )}
          <p className="pg-mix-foot">
            <span><i className="fa-solid fa-calendar-week" aria-hidden="true" /> {soon ? `${soon} in the next 30 days` : "None in the next 30 days"}</span>
            <span><i className="fa-solid fa-calendar-day" aria-hidden="true" /> {counts.month} this month</span>
          </p>
        </div>
      </PageHeader>

      {!editable ? (
        <div className="admin-card app-notice apl-notice">
          <i className="fa-solid fa-database" aria-hidden="true" />
          <div>
            <h2>Events are read-only for now</h2>
            <p>You&apos;re seeing the events imported with the website. Connect Supabase and import the content to edit them here.</p>
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
        <nav className="apl-tabs pg-tabs" aria-label="Filter events">
          {tabs.map((item) => (
            <button key={item.key} type="button" className={tab === item.key ? "active" : ""} aria-pressed={tab === item.key} onClick={() => setTab(item.key)}>
              {item.label}
              <em>{item.count}</em>
            </button>
          ))}
        </nav>

        <div className="app-filters" role="search">
          <label className="app-search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <span className="visually-hidden">Search events</span>
            <input type="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search by title, place or summary" />
          </label>
          <select aria-label="Campus" value={campus} onChange={(event) => setCampus(event.target.value)}>
            <option value="all">Every campus</option>
            {campuses.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          {needs ? (
            <span className="aev-chip">
              <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" /> Needs details
              <button type="button" onClick={() => setNeeds(false)} aria-label="Remove filter"><i className="fa-solid fa-xmark" aria-hidden="true" /></button>
            </span>
          ) : null}
          {filtered ? (
            <button type="button" className="app-clear app-link-btn" onClick={() => { setQ(""); setCampus("all"); setNeeds(false); }}>
              Clear
            </button>
          ) : null}
        </div>

        {feedback?.ok ? <p className="app-feedback" role="status"><i className="fa-solid fa-check" /> {feedback.ok}</p> : null}
        {feedback?.error ? <p className="app-feedback is-error" role="alert"><i className="fa-solid fa-circle-exclamation" /> {feedback.error}</p> : null}

        {groups.length ? (
          <div className={`aev-groups${pending ? " is-busy" : ""}`}>
            {groups.map((group) => (
              <section key={group.key} className="aev-group" aria-label={group.label}>
                <h2 className="aev-month">
                  <span>{group.label}</span>
                  {group.current ? <b>This month</b> : null}
                  <em>{group.items.length} {group.items.length === 1 ? "event" : "events"}</em>
                </h2>
                <ul className="aev-list">
                  {group.items.map((row) => {
                    const editHref = row.id ? `/admin/content/events/${row.id}` : null;
                    const href = `/event/${row.slug}`;
                    return (
                      <li
                        key={row.id ?? row.slug}
                        className={`aev-row is-${row.phase}${row.published ? "" : " is-hidden"}${busy && busy === row.id ? " is-busy" : ""}`}
                        onClick={(event) => {
                          if (!editHref || (event.target as HTMLElement).closest("a, button, input, label")) return;
                          router.push(editHref);
                        }}
                      >
                        <DateTile start={row.start} end={row.end} />
                        <span className="aev-thumb">
                          {row.image ? <img src={row.image} alt="" loading="lazy" /> : <i className="fa-regular fa-image" aria-hidden="true" />}
                        </span>
                        <div className="aev-main">
                          <div className="aev-title">
                            {editHref ? <Link href={editHref}>{row.title}</Link> : <strong>{row.title}</strong>}
                            {row.phase === "now" ? <span className="aev-badge is-now">{row.days !== null && row.days < 0 ? "On now" : "Today"}</span> : null}
                            {row.phase === "upcoming" && row.days === 1 ? <span className="aev-badge is-soon">Tomorrow</span> : null}
                            {!row.published ? <span className="aev-badge is-hidden"><i className="fa-solid fa-eye-slash" aria-hidden="true" /> Hidden</span> : null}
                          </div>
                          <p className="aev-meta">
                            <span><i className="fa-regular fa-clock" aria-hidden="true" /> {row.time}</span>
                            {row.end && row.end !== row.start ? <span><i className="fa-solid fa-calendar-week" aria-hidden="true" /> Until {shortDate(row.end)}</span> : null}
                            {row.location ? (
                              <span className="apl-campus"><i className="fa-solid fa-location-dot" aria-hidden="true" /> {row.location}</span>
                            ) : (
                              <span className="apl-unassigned">No place set</span>
                            )}
                          </p>
                          {row.excerpt ? <p className="aev-excerpt">{row.excerpt}</p> : null}
                          {row.missing.length ? (
                            <p className="aev-missing"><i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> Missing {row.missing.join(", ")}</p>
                          ) : null}
                        </div>
                        <div className="aev-side">
                          <span className="aev-when">{relative(row.days, row.phase)}</span>
                          <div className="story-actions">
                            <label className="story-switch" title={row.published ? "Hide from the website" : "Show on the website"}>
                              <input type="checkbox" checked={row.published} disabled={!row.id || pending} onChange={(event) => togglePublished(row, event.target.checked)} />
                              <span aria-hidden="true" />
                              <span className="visually-hidden">Live on the website</span>
                            </label>
                            <a
                              className={`story-icon${row.published ? "" : " is-off"}`}
                              href={row.published ? href : undefined}
                              target="_blank"
                              rel="noreferrer"
                              title={row.published ? "View on website" : "Hidden from the website"}
                              aria-disabled={!row.published}
                            >
                              <i className="fa-solid fa-arrow-up-right-from-square" />
                            </a>
                            {editHref ? (
                              <Link className="story-icon" href={editHref} title="Edit event"><i className="fa-solid fa-pen" /></Link>
                            ) : null}
                            <button type="button" className="story-icon is-danger" title="Delete event" disabled={!row.id || pending} onClick={() => remove(row)}>
                              <i className="fa-regular fa-trash-can" />
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <div className="apl-empty">
            <span><i className="fa-regular fa-calendar" aria-hidden="true" /></span>
            <h2>{filtered || tab !== "upcoming" ? "No events match" : "Nothing on the calendar yet"}</h2>
            <p>
              {filtered || tab !== "upcoming"
                ? "Try a different search or clear the filters."
                : "Parents see an empty calendar until the next event is added."}
            </p>
            {!filtered && tab === "upcoming" && editable ? (
              <Link className="admin-btn aev-empty-btn" href="/admin/content/events/new"><i className="fa-solid fa-plus" aria-hidden="true" /> Add the next event</Link>
            ) : null}
          </div>
        )}

        <div className="apl-pager">
          <span>Showing {visible.length} of {enriched.length} {enriched.length === 1 ? "event" : "events"}</span>
          <span className="pg-legend">
            <i className="fa-solid fa-circle-info" aria-hidden="true" /> Click an event to edit it. The switch shows or hides it instantly.
          </span>
        </div>
      </section>
    </div>
  );
}
