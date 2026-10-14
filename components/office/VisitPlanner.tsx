"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { moveApplication } from "@/app/admin/(panel)/applications/actions";
import { Feedback, useOfficeAction } from "@/components/office/client";
import { PARENT_UPDATES, initials, timeAgo, toKampalaInput, whatsappLink, type ApplicationStatus } from "@/lib/applications";
import type { ActionResult } from "@/lib/office-forms";
import { OFFICE, displayPhone, telHref } from "@/lib/students";

export type VisitView = "upcoming" | "today" | "past";

export type VisitRow = {
  id: string;
  child: string;
  age: string | null;
  parent: string | null;
  phone: string | null;
  email: string | null;
  grade: string | null;
  campus: string | null;
  at: string;
  host: string | null;
};

export type WaitingRow = {
  id: string;
  child: string;
  parent: string | null;
  email: string | null;
  grade: string | null;
  campus: string | null;
  applied: string;
};

type Stage = "booked" | "live" | "done";
type Open = { id: string; mode: "outcome" | "move" | "book" } | null;
type Toast = { tone: "ok" | "warn"; text: string } | null;

const ZONE = "Africa/Kampala";
const SCHOOL = "Kampala Junior Academy";
const MINUTE = 60_000;
const DAY = 86_400_000;
/** A visit stays on the agenda for two hours after it starts, then waits for an outcome. */
const GRACE = 2 * 60 * MINUTE;

const VIEWS: { value: VisitView; label: string; icon: string }[] = [
  { value: "upcoming", label: "Upcoming", icon: "fa-calendar-days" },
  { value: "today", label: "Today", icon: "fa-calendar-day" },
  { value: "past", label: "Awaiting outcome", icon: "fa-clipboard-question" },
];

const OUTCOMES: { status: ApplicationStatus; label: string; hint: string; icon: string; tone: string; note: string }[] = [
  { status: "offered", label: "Offer a place", hint: "The family can accept and enrol", icon: "fa-envelope-open-text", tone: "offer", note: "Visit done. Offered a place." },
  { status: "waitlisted", label: "Waiting list", hint: "No place yet, keep them in line", icon: "fa-hourglass-half", tone: "wait", note: "Visit done. Added to the waiting list." },
  { status: "declined", label: "Decline", hint: "A place can't be offered", icon: "fa-circle-xmark", tone: "decline", note: "Declined after the school visit." },
  { status: "withdrawn", label: "Family withdrew", hint: "They are no longer interested", icon: "fa-person-walking-arrow-right", tone: "withdrawn", note: "Family withdrew after the school visit." },
];

const dayKey = (value: number | string) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(new Date(value));
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: ZONE });
const keyDate = (key: string, options: Intl.DateTimeFormatOptions) => new Date(`${key}T12:00:00+03:00`).toLocaleDateString("en-GB", { ...options, timeZone: ZONE });
const shiftKey = (key: string, days: number) => new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const weekdayOf = (key: string) => new Date(`${key}T12:00:00Z`).getUTCDay();
const inputTime = (value: string) => Date.parse(`${value}:00+03:00`);
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function stageOf(visit: VisitRow, now: number): Stage {
  const at = Date.parse(visit.at);
  if (at > now) return "booked";
  return at > now - GRACE ? "live" : "done";
}

function dayName(key: string, today: string) {
  if (key === today) return "Today";
  if (key === shiftKey(today, 1)) return "Tomorrow";
  if (key === shiftKey(today, -1)) return "Yesterday";
  return keyDate(key, { weekday: "long" });
}

function countdown(iso: string, now: number, today: string) {
  const at = Date.parse(iso);
  const minutes = Math.round((at - now) / MINUTE);
  if (minutes <= 0) return minutes > -GRACE / MINUTE ? "Happening now" : "";
  if (minutes < 60) return `in ${minutes} min`;
  const key = dayKey(iso);
  if (key === today) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `in ${hours} h${rest ? ` ${rest} min` : ""}`;
  }
  if (key === shiftKey(today, 1)) return "tomorrow";
  const days = Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
  return `in ${days} days`;
}

function whenText(iso: string, today: string) {
  const key = dayKey(iso);
  const day = key === today ? "today" : key === shiftKey(today, 1) ? "tomorrow" : `on ${keyDate(key, { weekday: "long", day: "numeric", month: "long" })}`;
  return `${day} at ${timeOf(iso)}`;
}

function messageFor(visit: VisitRow, now: number, today: string) {
  const greeting = `Dear ${visit.parent || "parent"}, `;
  if (Date.parse(visit.at) <= now) {
    return `${greeting}thank you for visiting ${SCHOOL} with ${visit.child}. We hope you enjoyed meeting the team. Please let us know if you have any questions.`;
  }
  const place = visit.campus ? ` at our ${visit.campus} campus` : "";
  return `${greeting}this is a friendly reminder from ${SCHOOL} about ${visit.child}'s school visit${place} ${whenText(visit.at, today)}. We look forward to welcoming you!`;
}

/** The next weekday at 10:00, as a datetime-local value. */
function nextSchoolDay(today: string) {
  let key = shiftKey(today, 1);
  while (weekdayOf(key) === 0 || weekdayOf(key) === 6) key = shiftKey(key, 1);
  return `${key}T10:00`;
}

function matches(visit: { child: string; parent: string | null; grade: string | null; campus: string | null; phone?: string | null; email?: string | null; host?: string | null }, words: string[]) {
  if (!words.length) return true;
  const text = [visit.child, visit.parent, visit.grade, visit.campus, visit.email, visit.host].filter(Boolean).join(" ").toLowerCase();
  const digits = (visit.phone ?? "").replace(/\D/g, "");
  return words.every((word) => {
    if (text.includes(word)) return true;
    const wordDigits = word.replace(/\D/g, "").replace(/^0/, "");
    return wordDigits.length >= 3 && digits.includes(wordDigits);
  });
}

function Highlight({ text, words }: { text: string; words: string[] }) {
  if (!words.length || !text) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.map(escape).join("|")})`, "gi"));
  return <>{parts.map((part, index) => (index % 2 ? <mark key={index}>{part}</mark> : part))}</>;
}

export function VisitPlanner({ visits, waiting, campuses, initialView, initialCampus, serverNow, printedBy }: {
  visits: VisitRow[];
  waiting: WaitingRow[];
  campuses: string[];
  initialView: VisitView;
  initialCampus: string;
  serverNow: number;
  printedBy: string;
}) {
  const [now, setNow] = useState(serverNow);
  const [view, setView] = useState<VisitView>(initialView);
  const [campus, setCampus] = useState(initialCampus);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Open>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [jump, setJump] = useState("");
  const [printedAt, setPrintedAt] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const deferred = useDeferredValue(query);
  const stale = deferred !== query;
  const today = dayKey(now);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const stamp = () => setPrintedAt(new Date().toLocaleString("en-GB", {
      day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: ZONE,
    }));
    stamp();
    window.addEventListener("beforeprint", stamp);
    return () => window.removeEventListener("beforeprint", stamp);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (view !== "upcoming") params.set("range", view);
    if (campus) params.set("campus", campus);
    const next = `${OFFICE}/visits${params.size ? `?${params}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", next);
  }, [view, campus]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === "/" && !/input|textarea|select/i.test(target.tagName) && !target.isContentEditable) {
        event.preventDefault();
        search.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.tone === "warn" ? 9000 : 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!jump) return;
    document.getElementById(jump)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setJump("");
  }, [jump]);

  const words = useMemo(() => deferred.trim().toLowerCase().split(/\s+/).filter(Boolean), [deferred]);

  const inCampus = (row: { campus: string | null }) => !campus || row.campus === campus;
  const scoped = visits.filter(inCampus);
  const searched = scoped.filter((visit) => matches(visit, words));
  const isUpcoming = (visit: VisitRow) => Date.parse(visit.at) > now - GRACE;
  const isToday = (visit: VisitRow) => dayKey(visit.at) === today;
  const inView = (visit: VisitRow, which: VisitView) => (which === "past" ? !isUpcoming(visit) : which === "today" ? isToday(visit) : isUpcoming(visit));

  const rows = searched.filter((visit) => inView(visit, view));
  const byDay = new Map<string, VisitRow[]>();
  for (const visit of rows) byDay.set(dayKey(visit.at), [...(byDay.get(dayKey(visit.at)) ?? []), visit]);
  const groups = [...byDay.entries()].map(([key, items]) => ({ key, items }));
  if (view === "past") groups.reverse();

  const viewCounts = Object.fromEntries(VIEWS.map((entry) => [entry.value, searched.filter((visit) => inView(visit, entry.value)).length])) as Record<VisitView, number>;
  const campusCounts = new Map<string, number>();
  let campusTotal = 0;
  for (const visit of visits) {
    if (!matches(visit, words) || !inView(visit, view)) continue;
    campusTotal += 1;
    campusCounts.set(visit.campus ?? "", (campusCounts.get(visit.campus ?? "") ?? 0) + 1);
  }

  const upcomingAll = scoped.filter(isUpcoming);
  const pastAll = scoped.filter((visit) => !isUpcoming(visit));
  const todayAll = scoped.filter(isToday);
  const weekEnd = Date.parse(`${shiftKey(today, 7)}T00:00:00+03:00`);
  const weekAll = upcomingAll.filter((visit) => Date.parse(visit.at) < weekEnd);
  const todayLeft = todayAll.filter((visit) => Date.parse(visit.at) > now);
  const waitingScoped = waiting.filter(inCampus);
  const next = upcomingAll[0] ?? null;

  const goView = (value: VisitView) => {
    setView(value);
    setOpen(null);
  };

  const recordOutcome = (id: string) => {
    setQuery("");
    setView(view === "past" ? "upcoming" : view);
    setOpen({ id, mode: "outcome" });
    setJump(`vst-visit-${id}`);
  };

  const stats = [
    {
      key: "today", label: "Today", value: todayAll.length, icon: "fa-calendar-day", tone: "navy", on: view === "today",
      note: todayAll.length ? (todayLeft.length ? `Next at ${timeOf(todayLeft[0].at)}` : "All visits have started") : "No visits today",
      go: () => goView("today"),
    },
    {
      key: "week", label: "Next 7 days", value: weekAll.length, icon: "fa-calendar-week", tone: "teal", on: view === "upcoming",
      note: `${plural(upcomingAll.length, "visit")} booked in total`,
      go: () => goView("upcoming"),
    },
    {
      key: "past", label: "Awaiting outcome", value: pastAll.length, icon: "fa-clipboard-question", tone: pastAll.length ? "warn" : "ok", on: view === "past",
      note: pastAll.length ? "Visit done, decision needed" : "Every visit followed up",
      go: () => goView("past"),
    },
    {
      key: "waiting", label: "Need a visit", value: waitingScoped.length, icon: "fa-calendar-plus", tone: "violet", on: false,
      note: waitingScoped.length ? "In review, no visit booked" : "Everyone in review is booked",
      go: () => setJump("vst-waiting"),
    },
  ];

  const done = (outcome: ActionResult) => {
    setOpen(null);
    if (outcome.warning) setToast({ tone: "warn", text: `${outcome.ok ?? "Saved."} ${outcome.warning}` });
    else setToast({ tone: "ok", text: outcome.ok ?? "Saved." });
  };

  const reset = () => {
    setQuery("");
    setCampus("");
    search.current?.focus();
  };

  const filtered = Boolean(words.length || campus);
  const campusLabel = campus || "All campuses";
  const viewTitle = view === "today" ? `Today, ${keyDate(today, { day: "numeric", month: "long" })}` : view === "past" ? "Awaiting an outcome" : "Upcoming visits";

  return (
    <div className="vst">
      <div className="vst-stats no-print">
        {stats.map((stat, index) => (
          <button
            key={stat.key}
            type="button"
            className={`vst-stat is-${stat.tone}${stat.on ? " is-on" : ""}`}
            style={{ "--i": index } as React.CSSProperties}
            onClick={stat.go}
            aria-pressed={stat.key === "waiting" ? undefined : stat.on}
          >
            <span className="vst-stat-icon" aria-hidden="true"><i className={`fa-solid ${stat.icon}`} /></span>
            <span className="vst-stat-body">
              <strong>{stat.value.toLocaleString("en-GB")}</strong>
              <span>{stat.label}</span>
              <small>{stat.note}</small>
            </span>
          </button>
        ))}
      </div>

      {next ? (
        <Spotlight
          visit={next}
          now={now}
          today={today}
          later={todayAll.filter((visit) => visit.id !== next.id && Date.parse(visit.at) > Date.parse(next.at))}
          onOutcome={() => recordOutcome(next.id)}
        />
      ) : (
        <p className="vst-quiet no-print">
          <span className="vst-quiet-icon" aria-hidden="true"><i className="fa-regular fa-calendar" /></span>
          <span>
            <strong>No visits booked{campus ? ` at ${campus}` : ""}.</strong>{" "}
            {waitingScoped.length
              ? <>{plural(waitingScoped.length, "family")} in review {waitingScoped.length === 1 ? "is" : "are"} waiting for one. <button type="button" onClick={() => setJump("vst-waiting")}>Book a visit</button></>
              : "When an application moves to Visit booked, it appears here."}
          </span>
        </p>
      )}

      {pastAll.length && view !== "past" ? (
        <div className="vst-alert no-print" role="status">
          <span className="vst-alert-icon" aria-hidden="true"><i className="fa-solid fa-clipboard-question" /></span>
          <p>
            <strong>{plural(pastAll.length, "visit")} {pastAll.length === 1 ? "is" : "are"} waiting for an outcome.</strong>{" "}
            Record how {pastAll.length === 1 ? "it" : "they"} went so the {pastAll.length === 1 ? "family isn't" : "families aren't"} left waiting.
          </p>
          <button type="button" onClick={() => goView("past")}>Record outcomes <i className="fa-solid fa-arrow-right" aria-hidden="true" /></button>
        </div>
      ) : null}

      <div className="vst-bar no-print">
        <div className="vst-bar-top">
          <div className="vst-search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <label className="visually-hidden" htmlFor="visit-search">Search visits</label>
            <input
              ref={search}
              id="visit-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && query) {
                  event.preventDefault();
                  setQuery("");
                }
              }}
              placeholder="Search by child, parent, phone, class or host"
              autoComplete="off"
              spellCheck={false}
            />
            {query ? (
              <button type="button" className="vst-search-clear" onClick={() => { setQuery(""); search.current?.focus(); }} aria-label="Clear search">
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            ) : <kbd aria-hidden="true">/</kbd>}
          </div>
          <div className="vst-views" role="tablist" aria-label="Which visits">
            {VIEWS.map((entry) => (
              <button
                key={entry.value}
                type="button"
                role="tab"
                aria-selected={view === entry.value}
                className={`${view === entry.value ? "is-on" : ""}${entry.value === "past" && viewCounts.past ? " is-alert" : ""}`}
                onClick={() => goView(entry.value)}
              >
                <i className={`fa-solid ${entry.icon}`} aria-hidden="true" />
                <span>{entry.label}</span>
                <em>{viewCounts[entry.value]}</em>
              </button>
            ))}
          </div>
        </div>
        <div className="vst-campuses" role="group" aria-label="Campus">
          <button type="button" className={campus ? "" : "is-on"} aria-pressed={!campus} onClick={() => setCampus("")}>
            All campuses <span>{campusTotal}</span>
          </button>
          {campuses.map((option) => {
            const count = campusCounts.get(option) ?? 0;
            return (
              <button
                key={option}
                type="button"
                className={`${campus === option ? "is-on" : ""}${count ? "" : " is-empty"}`}
                aria-pressed={campus === option}
                onClick={() => setCampus(campus === option ? "" : option)}
              >
                <i className="fa-solid fa-location-dot" aria-hidden="true" /> {option} <span>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <VisitPrint groups={groups} today={today} title={viewTitle} scope={`${campusLabel}${words.length ? ` · matching “${deferred.trim()}”` : ""}`} printedAt={printedAt} printedBy={printedBy} />

      <div className="vst-split">
        <section className={`vst-panel vst-agenda${stale ? " is-stale" : ""}`} aria-labelledby="vst-agenda-title">
          <header className="vst-panel-head">
            <span className={`vst-panel-icon is-${view}`} aria-hidden="true"><i className={`fa-solid ${VIEWS.find((entry) => entry.value === view)?.icon}`} /></span>
            <div>
              <h2 id="vst-agenda-title">{viewTitle}</h2>
              <p aria-live="polite">
                {plural(rows.length, "visit")} · {campusLabel}
                {words.length ? <> · matching <q>{deferred.trim()}</q></> : null}
              </p>
            </div>
          </header>

          {groups.length ? (
            <ol className="vst-days">
              {groups.map((group, groupIndex) => {
                const campusSplit = [...new Set(group.items.map((visit) => visit.campus).filter(Boolean))] as string[];
                return (
                  <li key={group.key} id={`vst-day-${group.key}`} className={`vst-day${group.key === today ? " is-today" : ""}`}>
                    <header className="vst-day-head">
                      <span className="vst-tile" aria-hidden="true">
                        <small>{keyDate(group.key, { month: "short" })}</small>
                        <strong>{keyDate(group.key, { day: "numeric" })}</strong>
                      </span>
                      <div>
                        <h3>{dayName(group.key, today)}</h3>
                        <p>
                          {keyDate(group.key, group.key === today || group.key === shiftKey(today, 1) || group.key === shiftKey(today, -1)
                            ? { weekday: "long", day: "numeric", month: "long" }
                            : { day: "numeric", month: "long", year: "numeric" })}
                          {" · "}{plural(group.items.length, "visit")}
                        </p>
                      </div>
                      {!campus && campusSplit.length > 1 ? (
                        <span className="vst-day-campuses">
                          {campusSplit.map((name) => (
                            <span key={name}>{name} <b>{group.items.filter((visit) => visit.campus === name).length}</b></span>
                          ))}
                        </span>
                      ) : null}
                    </header>
                    <ul className="vst-rows">
                      {group.items.map((visit, index) => (
                        <VisitItem
                          key={visit.id}
                          visit={visit}
                          now={now}
                          today={today}
                          words={words}
                          order={Math.min(groupIndex + index, 10)}
                          open={open?.id === visit.id && open.mode !== "book" ? open.mode : null}
                          setOpen={(mode) => setOpen(mode ? { id: visit.id, mode } : null)}
                          onDone={done}
                        />
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ol>
          ) : (
            <AgendaEmpty
              view={view}
              filtered={filtered}
              next={next}
              today={today}
              waiting={waitingScoped.length}
              onReset={reset}
              onView={goView}
              onWaiting={() => setJump("vst-waiting")}
            />
          )}
        </section>

        <aside className="vst-side no-print">
          <WeekStrip
            today={today}
            visits={upcomingAll}
            onPick={(key) => { goView("upcoming"); setQuery(""); setJump(`vst-day-${key}`); }}
          />
          <WaitingList
            items={waitingScoped}
            today={today}
            now={now}
            open={open?.mode === "book" ? open.id : null}
            setOpen={(id) => setOpen(id ? { id, mode: "book" } : null)}
            onDone={done}
          />
          <section className="vst-panel" aria-labelledby="vst-campus-title">
            <header className="vst-panel-head is-small">
              <div>
                <h2 id="vst-campus-title">By campus</h2>
                <p>Upcoming visits at each campus</p>
              </div>
            </header>
            <ul className="vst-bars">
              {campuses.map((option) => {
                const count = visits.filter((visit) => visit.campus === option && isUpcoming(visit)).length;
                const max = Math.max(1, ...campuses.map((name) => visits.filter((visit) => visit.campus === name && isUpcoming(visit)).length));
                return (
                  <li key={option}>
                    <button
                      type="button"
                      className={campus === option ? "is-on" : ""}
                      aria-pressed={campus === option}
                      onClick={() => { setCampus(campus === option ? "" : option); goView("upcoming"); }}
                      title={campus === option ? "Show every campus" : `Show only ${option}`}
                    >
                      <span>{option}</span>
                      <span className="vst-bar-track" aria-hidden="true"><span style={{ width: `${(count / max) * 100}%` }} /></span>
                      <strong>{count}</strong>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </div>

      {toast ? (
        <div className={`vst-toast is-${toast.tone} no-print`} role="status">
          <i className={`fa-solid ${toast.tone === "warn" ? "fa-triangle-exclamation" : "fa-circle-check"}`} aria-hidden="true" />
          <span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss"><i className="fa-solid fa-xmark" aria-hidden="true" /></button>
        </div>
      ) : null}
    </div>
  );
}

function Contact({ visit, now, today, wide = false }: { visit: VisitRow; now: number; today: string; wide?: boolean }) {
  const whatsapp = whatsappLink(visit.phone);
  const who = visit.parent || "the parent";
  const after = Date.parse(visit.at) <= now;
  if (!visit.phone && !visit.email) return <span className="vst-nocontact">No phone or email</span>;
  return (
    <div className={`vst-contact${wide ? " is-wide" : ""}`}>
      {whatsapp ? (
        <a
          className="vst-wa"
          href={`${whatsapp}?text=${encodeURIComponent(messageFor(visit, now, today))}`}
          target="_blank"
          rel="noopener noreferrer"
          title={after ? `Thank ${who} for visiting on WhatsApp` : `Send ${who} a reminder on WhatsApp`}
        >
          <i className="fa-brands fa-whatsapp" aria-hidden="true" />
          <span>{after ? "Follow up" : "Remind"}</span>
        </a>
      ) : null}
      {visit.phone ? (
        <a className="vst-icon-btn" href={telHref(visit.phone) || `tel:${visit.phone.replace(/\s/g, "")}`} title={`Call ${who} on ${displayPhone(visit.phone)}`} aria-label={`Call ${who} on ${displayPhone(visit.phone)}`}>
          <i className="fa-solid fa-phone" aria-hidden="true" />
        </a>
      ) : null}
      {visit.email ? (
        <a className="vst-icon-btn" href={`mailto:${visit.email}?subject=${encodeURIComponent(`Your visit to ${SCHOOL}`)}`} title={`Email ${who} at ${visit.email}`} aria-label={`Email ${who} at ${visit.email}`}>
          <i className="fa-regular fa-envelope" aria-hidden="true" />
        </a>
      ) : null}
    </div>
  );
}

function Spotlight({ visit, now, today, later, onOutcome }: { visit: VisitRow; now: number; today: string; later: VisitRow[]; onOutcome: () => void }) {
  const stage = stageOf(visit, now);
  const key = dayKey(visit.at);
  const sameDay = key === today;
  const when = countdown(visit.at, now, today);
  return (
    <section className={`vst-next no-print${stage === "live" ? " is-live" : ""}`} aria-labelledby="vst-next-title">
      <div className="vst-next-when">
        <span className="vst-next-time">{timeOf(visit.at)}</span>
        <span className="vst-next-day">{sameDay ? "Today" : `${dayName(key, today)}, ${keyDate(key, { day: "numeric", month: "short" })}`}</span>
        {when ? <span className="vst-next-count">{stage === "live" ? <i className="vst-pulse" aria-hidden="true" /> : null}{when}</span> : null}
      </div>
      <div className="vst-next-main">
        <p className="vst-next-kicker">{stage === "live" ? "Visit in progress" : "Next visit"}{visit.campus ? ` · ${visit.campus} campus` : ""}</p>
        <h2 id="vst-next-title"><Link href={`${OFFICE}/applications/${visit.id}`}>{visit.child}</Link></h2>
        <p className="vst-next-meta">
          {[visit.grade, visit.age, visit.parent ? `with ${visit.parent}` : null].filter(Boolean).join(" · ")}
        </p>
        <p className="vst-next-host">
          <span className="vst-host-dot" aria-hidden="true">{visit.host ? initials(visit.host) : <i className="fa-solid fa-user" />}</span>
          {visit.host ? <>Hosted by <strong>{visit.host}</strong></> : "No host assigned yet"}
        </p>
      </div>
      <div className="vst-next-actions">
        <Contact visit={visit} now={now} today={today} wide />
        {stage === "live" ? (
          <button type="button" className="vst-next-primary" onClick={onOutcome}>
            <i className="fa-solid fa-clipboard-check" aria-hidden="true" /> Record outcome
          </button>
        ) : (
          <Link className="vst-next-open" href={`${OFFICE}/applications/${visit.id}`}>
            Open application <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </Link>
        )}
      </div>
      {later.length ? (
        <p className="vst-next-later">
          <span>Later today</span>
          {later.slice(0, 4).map((item) => (
            <a key={item.id} href={`#vst-visit-${item.id}`}><b>{timeOf(item.at)}</b> {item.child}</a>
          ))}
          {later.length > 4 ? <em>+{later.length - 4} more</em> : null}
        </p>
      ) : null}
    </section>
  );
}

function VisitItem({ visit, now, today, words, order, open, setOpen, onDone }: {
  visit: VisitRow;
  now: number;
  today: string;
  words: string[];
  order: number;
  open: "outcome" | "move" | null;
  setOpen: (mode: "outcome" | "move" | null) => void;
  onDone: (outcome: ActionResult) => void;
}) {
  const stage = stageOf(visit, now);
  const when = stage === "booked" && dayKey(visit.at) === today ? countdown(visit.at, now, today) : "";
  const label = stage === "live" ? "Now" : stage === "done" ? "Done" : when;
  return (
    <li id={`vst-visit-${visit.id}`} className={`vst-row is-${stage}${open ? " is-open" : ""}`} style={{ "--i": order } as React.CSSProperties}>
      <div className="vst-time">
        <time dateTime={visit.at}>{timeOf(visit.at)}</time>
        {label ? <small>{stage === "live" ? <i className="vst-pulse" aria-hidden="true" /> : null}{label}</small> : null}
      </div>
      <div className="vst-who">
        <p>
          <Link href={`${OFFICE}/applications/${visit.id}`}><Highlight text={visit.child} words={words} /></Link>
          {visit.age ? <span className="vst-age">{visit.age}</span> : null}
        </p>
        <small>
          {visit.grade ? <Highlight text={visit.grade} words={words} /> : "Class not given"}
          {visit.parent ? <> · <Highlight text={visit.parent} words={words} /></> : null}
          {visit.phone ? <> · {displayPhone(visit.phone)}</> : null}
        </small>
        <span className="vst-tags">
          {visit.campus ? <span className="vst-campus"><i className="fa-solid fa-location-dot" aria-hidden="true" /> {visit.campus}</span> : null}
          <span className={`vst-host${visit.host ? "" : " is-none"}`}>
            <span className="vst-host-dot" aria-hidden="true">{visit.host ? initials(visit.host) : <i className="fa-solid fa-user" />}</span>
            {visit.host ? <Highlight text={visit.host} words={words} /> : "No host yet"}
          </span>
        </span>
      </div>
      <Contact visit={visit} now={now} today={today} />
      <div className="vst-do">
        {stage !== "booked" ? (
          <button type="button" className={`vst-btn is-primary${open === "outcome" ? " is-on" : ""}`} aria-expanded={open === "outcome"} onClick={() => setOpen(open === "outcome" ? null : "outcome")}>
            <i className="fa-solid fa-clipboard-check" aria-hidden="true" /> Record outcome
          </button>
        ) : null}
        <button type="button" className={`vst-btn${open === "move" ? " is-on" : ""}`} aria-expanded={open === "move"} onClick={() => setOpen(open === "move" ? null : "move")}>
          <i className="fa-regular fa-calendar" aria-hidden="true" /> {stage === "done" ? "Rebook" : "Reschedule"}
        </button>
      </div>
      {open === "outcome" ? <OutcomeEditor visit={visit} onDone={onDone} onCancel={() => setOpen(null)} /> : null}
      {open === "move" ? (
        <MoveEditor
          id={visit.id}
          parent={visit.parent}
          email={visit.email}
          now={now}
          today={today}
          initial={Date.parse(visit.at) > now ? toKampalaInput(visit.at) : `${shiftKey(today, 1)}T${toKampalaInput(visit.at).slice(11)}`}
          quick={quickTimes(visit.at, now, today)}
          verb={stage === "done" ? "Rebook the visit" : "Move the visit"}
          onDone={onDone}
          onCancel={() => setOpen(null)}
        />
      ) : null}
    </li>
  );
}

function quickTimes(iso: string, now: number, today: string) {
  const time = toKampalaInput(iso).slice(11);
  const base = Date.parse(iso) > now ? dayKey(iso) : today;
  return [
    { label: "Next day, same time", value: `${shiftKey(base, 1)}T${time}` },
    { label: "A week later", value: `${shiftKey(base, 7)}T${time}` },
  ];
}

function OutcomeEditor({ visit, onDone, onCancel }: { visit: VisitRow; onDone: (outcome: ActionResult) => void; onCancel: () => void }) {
  const { result, pending, run } = useOfficeAction();
  const [choice, setChoice] = useState<ApplicationStatus | "">("");
  const [notes, setNotes] = useState("");
  const [notify, setNotify] = useState(false);
  const picked = OUTCOMES.find((entry) => entry.status === choice);
  const update = choice ? PARENT_UPDATES[choice] : undefined;

  return (
    <form
      className="vst-editor"
      onKeyDown={(event) => { if (event.key === "Escape") onCancel(); }}
      onSubmit={(event) => {
        event.preventDefault();
        if (!picked) return;
        const note = notes.trim() ? `${picked.note}\n\n${notes.trim()}` : picked.note;
        run(() => moveApplication({ id: visit.id, status: picked.status, note, notify: Boolean(update && visit.email && notify) }), onDone);
      }}
    >
      <fieldset className="vst-outcomes">
        <legend>How did the visit go?</legend>
        <div className="vst-outcome-grid">
          {OUTCOMES.map((entry, index) => (
            <label key={entry.status} className={`vst-outcome is-${entry.tone}${choice === entry.status ? " is-on" : ""}`}>
              <input
                type="radio"
                name={`outcome-${visit.id}`}
                value={entry.status}
                checked={choice === entry.status}
                autoFocus={index === 0}
                onChange={() => { setChoice(entry.status); setNotify(PARENT_UPDATES[entry.status]?.notify ?? false); }}
              />
              <span className="vst-outcome-icon" aria-hidden="true"><i className={`fa-solid ${entry.icon}`} /></span>
              <span className="vst-outcome-text">
                <strong>{entry.label}</strong>
                <small>{entry.hint}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="vst-field">
        <span>Notes from the visit <em>Only the team sees these</em></span>
        <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="How the visit went, questions the family asked, anything to follow up" maxLength={3000} />
      </label>
      <div className="vst-editor-foot">
        {update ? (
          visit.email ? (
            <label className="vst-check">
              <input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} />
              <span className="vst-switch" aria-hidden="true" />
              <span>Email {visit.parent || "the parent"} {update.summary}</span>
            </label>
          ) : <p className="vst-hint"><i className="fa-solid fa-circle-info" aria-hidden="true" /> No email on this application. Let the family know by phone or WhatsApp.</p>
        ) : choice ? <p className="vst-hint"><i className="fa-solid fa-circle-info" aria-hidden="true" /> The family won&apos;t be emailed about this.</p> : <span />}
        <div className="vst-editor-btns">
          <button type="button" className="vst-btn is-quiet" onClick={onCancel} disabled={pending}>Cancel</button>
          <button type="submit" className="vst-btn is-primary" disabled={!picked || pending}>
            {pending ? <><i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" /> Saving…</> : picked ? `Save: ${picked.label}` : "Choose an outcome"}
          </button>
        </div>
      </div>
      <Feedback result={result?.error ? result : null} className="vst-feedback" />
    </form>
  );
}

function MoveEditor({ id, parent, email, now, today, initial, quick, verb, onDone, onCancel }: {
  id: string;
  parent: string | null;
  email: string | null;
  now: number;
  today: string;
  initial: string;
  quick: { label: string; value: string }[];
  verb: string;
  onDone: (outcome: ActionResult) => void;
  onCancel: () => void;
}) {
  const { result, setResult, pending, run } = useOfficeAction();
  const [when, setWhen] = useState(initial);
  const [notify, setNotify] = useState(Boolean(email));
  const at = inputTime(when);
  const valid = Number.isFinite(at) && at > now;
  const day = Number.isFinite(at) ? weekdayOf(dayKey(at)) : -1;

  return (
    <form
      className="vst-editor is-move"
      onKeyDown={(event) => { if (event.key === "Escape") onCancel(); }}
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) {
          setResult({ error: "Choose a date and time in the future." });
          return;
        }
        run(() => moveApplication({ id, status: "visit_scheduled", visitAt: when, notify: Boolean(email && notify) }), onDone);
      }}
    >
      <div className="vst-move">
        <label className="vst-field">
          <span>{verb}</span>
          <input type="datetime-local" value={when} min={toKampalaInput(new Date(now).toISOString())} onChange={(event) => setWhen(event.target.value)} required autoFocus />
        </label>
        <div className="vst-quick" role="group" aria-label="Quick picks">
          {quick.map((entry) => (
            <button key={entry.label} type="button" className={when === entry.value ? "is-on" : ""} onClick={() => setWhen(entry.value)}>{entry.label}</button>
          ))}
        </div>
      </div>
      {Number.isFinite(at) ? (
        <p className={`vst-preview${valid ? "" : " is-bad"}`}>
          <i className={`fa-solid ${valid ? "fa-calendar-check" : "fa-triangle-exclamation"}`} aria-hidden="true" />
          {valid ? <>{whenText(new Date(at).toISOString(), today).replace(/^./, (c) => c.toUpperCase())}{day === 0 || day === 6 ? " · a weekend" : ""}</> : "That time has already passed."}
        </p>
      ) : null}
      <div className="vst-editor-foot">
        {email ? (
          <label className="vst-check">
            <input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} />
            <span className="vst-switch" aria-hidden="true" />
            <span>Email {parent || "the parent"} the date, time and campus</span>
          </label>
        ) : <p className="vst-hint"><i className="fa-solid fa-circle-info" aria-hidden="true" /> No email on this application. Confirm the time by phone or WhatsApp.</p>}
        <div className="vst-editor-btns">
          <button type="button" className="vst-btn is-quiet" onClick={onCancel} disabled={pending}>Cancel</button>
          <button type="submit" className="vst-btn is-primary" disabled={pending || !when}>
            {pending ? <><i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" /> Saving…</> : "Save visit"}
          </button>
        </div>
      </div>
      <Feedback result={result?.error ? result : null} className="vst-feedback" />
    </form>
  );
}

function AgendaEmpty({ view, filtered, next, today, waiting, onReset, onView, onWaiting }: {
  view: VisitView;
  filtered: boolean;
  next: VisitRow | null;
  today: string;
  waiting: number;
  onReset: () => void;
  onView: (view: VisitView) => void;
  onWaiting: () => void;
}) {
  let icon = "fa-calendar";
  let title = "No visits booked";
  let text = waiting ? `${plural(waiting, "application")} in review ${waiting === 1 ? "is" : "are"} waiting for a visit.` : "Book a visit from an application by moving it to Visit booked.";
  let action: React.ReactNode = waiting ? <button type="button" className="vst-btn is-primary" onClick={onWaiting}><i className="fa-solid fa-calendar-plus" aria-hidden="true" /> Book a visit</button> : null;
  if (filtered) {
    icon = "fa-magnifying-glass";
    title = "No visits match";
    text = "Check the spelling, or try part of a name, a class or a phone number.";
    action = <button type="button" className="vst-btn" onClick={onReset}>Clear search and campus</button>;
  } else if (view === "today") {
    icon = "fa-mug-hot";
    title = "No visits today";
    text = next ? `The next visit is ${next.child} ${whenText(next.at, today)}.` : "Nothing is booked yet.";
    action = <button type="button" className="vst-btn" onClick={() => onView("upcoming")}>See upcoming visits</button>;
  } else if (view === "past") {
    icon = "fa-circle-check";
    title = "Every visit has an outcome";
    text = "No family is waiting for a decision after their visit.";
    action = null;
  }
  return (
    <div className={`vst-empty${view === "past" && !filtered ? " is-ok" : ""}`}>
      <span><i className={`fa-solid ${icon}`} aria-hidden="true" /></span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

function WeekStrip({ today, visits, onPick }: { today: string; visits: VisitRow[]; onPick: (key: string) => void }) {
  const days = Array.from({ length: 7 }, (_, index) => shiftKey(today, index));
  const counts = days.map((key) => visits.filter((visit) => dayKey(visit.at) === key).length);
  const max = Math.max(1, ...counts);
  const total = counts.reduce((sum, count) => sum + count, 0);
  return (
    <section className="vst-panel" aria-labelledby="vst-week-title">
      <header className="vst-panel-head is-small">
        <div>
          <h2 id="vst-week-title">The week ahead</h2>
          <p>{total ? `${plural(total, "visit")} in the next 7 days` : "Nothing booked in the next 7 days"}</p>
        </div>
      </header>
      <ol className="vst-week">
        {days.map((key, index) => {
          const weekend = weekdayOf(key) === 0 || weekdayOf(key) === 6;
          return (
            <li key={key}>
              <button
                type="button"
                className={`${index === 0 ? "is-today" : ""}${weekend ? " is-weekend" : ""}${counts[index] ? " has-items" : ""}`}
                disabled={!counts[index]}
                onClick={() => onPick(key)}
                aria-label={`${dayName(key, today)}, ${keyDate(key, { day: "numeric", month: "long" })}: ${plural(counts[index], "visit")}`}
              >
                <small>{index === 0 ? "Today" : keyDate(key, { weekday: "short" })}</small>
                <span className="vst-week-track" aria-hidden="true"><span style={{ height: `${(counts[index] / max) * 100}%` }} /></span>
                <strong>{counts[index] || "–"}</strong>
                <em>{keyDate(key, { day: "numeric" })}</em>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function WaitingList({ items, today, now, open, setOpen, onDone }: {
  items: WaitingRow[];
  today: string;
  now: number;
  open: string | null;
  setOpen: (id: string | null) => void;
  onDone: (outcome: ActionResult) => void;
}) {
  return (
    <section className="vst-panel vst-waiting" id="vst-waiting" aria-labelledby="vst-waiting-title">
      <header className="vst-panel-head is-small">
        <div>
          <h2 id="vst-waiting-title">Waiting for a visit</h2>
          <p>In review with no visit booked</p>
        </div>
        <Link className="vst-head-link" href={`${OFFICE}/applications?status=reviewing`}>All <i className="fa-solid fa-arrow-right" aria-hidden="true" /></Link>
      </header>
      {items.length ? (
        <ul className="vst-wait-list">
          {items.map((app) => (
            <li key={app.id} className={open === app.id ? "is-open" : ""}>
              <div className="vst-wait-row">
                <span className="vst-wait-dot" aria-hidden="true">{initials(app.child)}</span>
                <div className="vst-wait-who">
                  <Link href={`${OFFICE}/applications/${app.id}`}>{app.child}</Link>
                  <small>{[app.grade, app.campus, `Applied ${timeAgo(app.applied, now)}`].filter(Boolean).join(" · ")}</small>
                </div>
                <button type="button" className={`vst-btn is-small${open === app.id ? " is-on" : ""}`} aria-expanded={open === app.id} onClick={() => setOpen(open === app.id ? null : app.id)}>
                  {open === app.id ? "Close" : "Book"}
                </button>
              </div>
              {open === app.id ? (
                <MoveEditor
                  id={app.id}
                  parent={app.parent}
                  email={app.email}
                  now={now}
                  today={today}
                  initial={nextSchoolDay(today)}
                  quick={[
                    { label: "Next school day, 10:00", value: nextSchoolDay(today) },
                    { label: "Next school day, 14:00", value: nextSchoolDay(today).replace("T10:00", "T14:00") },
                  ]}
                  verb={`Book a visit for ${app.child}`}
                  onDone={onDone}
                  onCancel={() => setOpen(null)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : <p className="vst-side-empty"><i className="fa-solid fa-circle-check" aria-hidden="true" /> Every application in review has a visit booked.</p>}
    </section>
  );
}

/** The paper agenda: hidden on screen, it replaces the page when printing. */
function VisitPrint({ groups, today, title, scope, printedAt, printedBy }: {
  groups: { key: string; items: VisitRow[] }[];
  today: string;
  title: string;
  scope: string;
  printedAt: string;
  printedBy: string;
}) {
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  return (
    <div className="vst-print" aria-hidden="true">
      <header className="vst-print-head">
        <img src="/images/kja-logo.png" alt="" />
        <div className="vst-print-title">
          <p>Admissions office</p>
          <h1>School visits</h1>
          <span>{title} · {scope}</span>
        </div>
      </header>
      <dl className="vst-print-meta">
        <div><dt>Visits</dt><dd>{total}</dd></div>
        <div><dt>Printed</dt><dd>{printedAt}</dd></div>
        <div><dt>Printed by</dt><dd>{printedBy}</dd></div>
      </dl>
      {total ? groups.map((group) => (
        <section key={group.key} className="vst-print-group">
          <h2>
            {dayName(group.key, today)}, {keyDate(group.key, { day: "numeric", month: "long", year: "numeric" })}
            <small>{plural(group.items.length, "visit")}</small>
          </h2>
          <table>
            <thead>
              <tr>
                <th className="is-time">Time</th>
                <th>Child</th>
                <th className="is-parent">Parent</th>
                <th className="is-campus">Campus</th>
                <th className="is-host">Host</th>
                <th className="is-notes">Outcome and notes</th>
              </tr>
            </thead>
            <tbody>
              {group.items.map((visit) => (
                <tr key={visit.id}>
                  <td className="is-time"><strong>{timeOf(visit.at)}</strong></td>
                  <td>
                    <strong>{visit.child}</strong>
                    <small>{[visit.grade, visit.age].filter(Boolean).join(" · ") || "Class not given"}</small>
                  </td>
                  <td className="is-parent">
                    <strong>{visit.parent || "Not given"}</strong>
                    <small>{visit.phone ? displayPhone(visit.phone) : "No phone"}</small>
                  </td>
                  <td className="is-campus">{visit.campus || "–"}</td>
                  <td className="is-host">{visit.host || "–"}</td>
                  <td className="is-notes"><span /><span /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )) : <p className="vst-print-empty">No visits on this list.</p>}
    </div>
  );
}
