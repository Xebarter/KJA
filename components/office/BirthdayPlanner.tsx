"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { whatsappLink } from "@/lib/applications";
import {
  BIRTHDAY_RANGES,
  MONTH_NAMES,
  addDays,
  birthdayIn,
  classDay,
  daysBetween,
  dobParts,
  fromIso,
  longDate,
  ordinal,
  shortDate,
  type BirthdayRange,
} from "@/lib/birthdays";
import { OFFICE, SCHOOL_CLASSES, displayPhone, telHref } from "@/lib/students";

export type BirthdayRow = {
  id: string;
  name: string;
  preferred: string | null;
  number: string;
  sex: string | null;
  dob: string | null;
  classCode: string | null;
  stream: string | null;
  house: string | null;
  parent: string | null;
  phone: string | null;
  photo: string | null;
};

export type BirthdayView = "upcoming" | "calendar" | "missing";

type Entry = BirthdayRow & { born: number; month: number; day: number; next: Date; days: number; turns: number | null };
type Dated = Entry & { on: Date; age: number | null };
type PrintItem = { row: BirthdayRow; date: Date | null; turns: number | null };

const VIEWS: { value: BirthdayView; label: string; icon: string }[] = [
  { value: "upcoming", label: "Upcoming", icon: "fa-list-ul" },
  { value: "calendar", label: "Calendar", icon: "fa-calendar-days" },
  { value: "missing", label: "No date of birth", icon: "fa-circle-question" },
];

const RANGE_LABELS: Record<BirthdayRange, string> = { 7: "7 days", 14: "2 weeks", 30: "30 days", 60: "60 days", 90: "90 days", 365: "Year" };
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SHORT_MONTHS = MONTH_NAMES.map((name) => name.slice(0, 3));

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

/** The register stores "Surname Given Names", so the first given name is the second word. */
function firstName(row: BirthdayRow) {
  if (row.preferred) return row.preferred;
  const words = row.name.trim().split(/\s+/);
  return words[1] ?? words[0];
}

function placeOf(row: BirthdayRow) {
  return row.classCode ? `${row.classCode}${row.stream ? ` ${row.stream}` : ""}` : "No class";
}

function inClass(row: BirthdayRow, cls: string) {
  return !cls || (cls === "none" ? !row.classCode : row.classCode === cls);
}

function matches(row: BirthdayRow, words: string[]) {
  if (!words.length) return true;
  const text = [row.name, row.preferred, row.number, row.classCode, row.classCode && row.stream ? `${row.classCode} ${row.stream}` : null, row.house, row.parent]
    .filter(Boolean).join(" ").toLowerCase();
  const digits = (row.phone ?? "").replace(/\D/g, "");
  return words.every((word) => {
    if (text.includes(word)) return true;
    const wordDigits = word.replace(/\D/g, "");
    return wordDigits.length >= 3 && wordDigits.length === word.replace(/[\s+-]/g, "").length && digits.includes(wordDigits.replace(/^0/, ""));
  });
}

function Highlight({ text, words }: { text: string; words: string[] }) {
  if (!words.length || !text) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.map(escape).join("|")})`, "gi"));
  return <>{parts.map((part, index) => (index % 2 ? <mark key={index}>{part}</mark> : part))}</>;
}

function Avatar({ row, size = "md" }: { row: BirthdayRow; size?: "md" | "lg" }) {
  const tone = row.sex === "M" ? " is-boy" : row.sex === "F" ? " is-girl" : "";
  return (
    <span className={`bdy-avatar is-${size}${tone}${row.photo ? " has-photo" : ""}`} aria-hidden="true">
      {row.photo ? <img src={row.photo} alt="" loading="lazy" /> : initials(row.name)}
    </span>
  );
}

function wishText(row: BirthdayRow, turns: number | null, date: Date, days: number) {
  const age = turns ? `${ordinal(turns)} ` : "";
  const child = firstName(row);
  const greeting = `Dear ${row.parent || "parent"}, `;
  if (days < 0) return `${greeting}everyone at Kampala Junior Academy sends ${child} belated wishes for a very happy ${age}birthday. We hope it was a wonderful day!`;
  return `${greeting}everyone at Kampala Junior Academy wishes ${child} a very happy ${age}birthday ${days === 0 ? "today" : `on ${longDate(date)}`}. Have a wonderful day!`;
}

/** WhatsApp wishes to the parent, written for the day, plus a call button. */
function Contact({ row, turns, date, days, wide = false }: { row: BirthdayRow; turns: number | null; date: Date; days: number; wide?: boolean }) {
  const whatsapp = whatsappLink(row.phone);
  if (!row.phone || !whatsapp) return <span className="bdy-nophone">No parent phone</span>;
  const who = row.parent || "the parent";
  return (
    <div className={`bdy-contact${wide ? " is-wide" : ""}`}>
      <a
        className="bdy-wish"
        href={`${whatsapp}?text=${encodeURIComponent(wishText(row, turns, date, days))}`}
        target="_blank"
        rel="noopener noreferrer"
        title={`Send birthday wishes to ${who} on WhatsApp`}
      >
        <i className="fa-brands fa-whatsapp" aria-hidden="true" />
        <span>Send wishes</span>
      </a>
      <a className="bdy-call" href={telHref(row.phone)} title={`Call ${who} on ${displayPhone(row.phone)}`} aria-label={`Call ${who} on ${displayPhone(row.phone)}`}>
        <i className="fa-solid fa-phone" aria-hidden="true" />
      </a>
    </div>
  );
}

export function BirthdayPlanner({ rows, today, initialView, initialClass, initialMonth, initialRange, printedBy }: {
  rows: BirthdayRow[];
  today: string;
  initialView: BirthdayView;
  initialClass: string;
  initialMonth: number;
  initialRange: BirthdayRange;
  printedBy: string;
}) {
  const now = useMemo(() => fromIso(today), [today]);
  const thisMonth = now.getMonth() + 1;
  const [query, setQuery] = useState("");
  const [view, setView] = useState<BirthdayView>(initialView);
  const [cls, setCls] = useState(initialClass);
  const [range, setRange] = useState<BirthdayRange>(initialRange);
  const [month, setMonth] = useState(initialMonth || thisMonth);
  const [picked, setPicked] = useState<number | null>(null);
  const [paged, setPaged] = useState(false);
  const [printedAt, setPrintedAt] = useState("");
  const [copied, setCopied] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const deferred = useDeferredValue(query);
  const stale = deferred !== query;

  useEffect(() => {
    const stamp = () => setPrintedAt(new Date().toLocaleString("en-GB", {
      day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kampala",
    }));
    stamp();
    window.addEventListener("beforeprint", stamp);
    return () => window.removeEventListener("beforeprint", stamp);
  }, []);

  // Keep the address shareable without reloading the page.
  useEffect(() => {
    const params = new URLSearchParams();
    if (view !== "upcoming") params.set("view", view);
    if (cls) params.set("class", cls);
    if (view === "calendar" && month !== thisMonth) params.set("month", String(month));
    if (view === "upcoming" && range !== 30) params.set("range", String(range));
    const next = `${OFFICE}/birthdays${params.size ? `?${params}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", next);
  }, [view, cls, month, range, thisMonth]);

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

  const words = useMemo(() => deferred.trim().toLowerCase().split(/\s+/).filter(Boolean), [deferred]);

  const entries = useMemo<Entry[]>(() => rows.flatMap((row) => {
    const parts = dobParts(row.dob);
    if (!parts) return [];
    let next = birthdayIn(now.getFullYear(), parts.month, parts.day);
    if (next < now) next = birthdayIn(now.getFullYear() + 1, parts.month, parts.day);
    const turns = parts.year > 1900 ? next.getFullYear() - parts.year : 0;
    return [{ ...row, born: parts.year, month: parts.month, day: parts.day, next, days: daysBetween(now, next), turns: turns > 0 ? turns : null }];
  }).sort((a, b) => a.days - b.days || a.name.localeCompare(b.name)), [rows, now]);

  const searched = useMemo(() => entries.filter((entry) => matches(entry, words)), [entries, words]);
  const searchedMissing = useMemo(() => rows.filter((row) => !dobParts(row.dob) && matches(row, words)), [rows, words]);
  const scoped = useMemo(() => searched.filter((row) => inClass(row, cls)), [searched, cls]);
  const missing = useMemo(() => searchedMissing.filter((row) => inClass(row, cls)), [searchedMissing, cls]);

  const upcoming = useMemo(() => scoped.filter((entry) => entry.days < range), [scoped, range]);
  const upcomingGroups = useMemo(() => {
    const groups: { days: number; date: Date; items: Entry[] }[] = [];
    for (const entry of upcoming) {
      const last = groups[groups.length - 1];
      if (last && last.days === entry.days) last.items.push(entry);
      else groups.push({ days: entry.days, date: entry.next, items: [entry] });
    }
    return groups;
  }, [upcoming]);

  const calYear = month < thisMonth ? now.getFullYear() + 1 : now.getFullYear();
  const inMonth = useMemo<Dated[]>(() => scoped
    .filter((entry) => entry.month === month)
    .map((entry) => {
      const age = entry.born > 1900 ? calYear - entry.born : 0;
      return { ...entry, on: birthdayIn(calYear, entry.month, entry.day), age: age > 0 ? age : null };
    })
    .sort((a, b) => a.on.getTime() - b.on.getTime() || a.name.localeCompare(b.name)), [scoped, month, calYear]);
  const selectedDay = picked ?? (month === thisMonth && calYear === now.getFullYear() ? now.getDate() : inMonth[0]?.on.getDate() ?? 1);
  const byDay = useMemo(() => {
    const map = new Map<number, Dated[]>();
    for (const entry of inMonth) map.set(entry.on.getDate(), [...(map.get(entry.on.getDate()) ?? []), entry]);
    return map;
  }, [inMonth]);
  const monthCounts = useMemo(() => {
    const counts = Array<number>(12).fill(0);
    for (const entry of scoped) counts[entry.month - 1] += 1;
    return counts;
  }, [scoped]);

  // Class chips count what the current view would show for each class.
  const classCounts = useMemo(() => {
    const base: BirthdayRow[] = view === "upcoming"
      ? searched.filter((entry) => entry.days < range)
      : view === "calendar" ? searched.filter((entry) => entry.month === month) : searchedMissing;
    const counts = new Map<string, number>();
    for (const row of base) counts.set(row.classCode ?? "none", (counts.get(row.classCode ?? "none") ?? 0) + 1);
    return { counts, total: base.length };
  }, [view, searched, searchedMissing, range, month]);

  const todays = scoped.filter((entry) => entry.days === 0);
  const nextUp = scoped.find((entry) => entry.days > 0);
  const nextSameDay = nextUp ? scoped.filter((entry) => entry.days === nextUp.days).length : 0;
  const week = scoped.filter((entry) => entry.days < 7);
  const month30 = scoped.filter((entry) => entry.days < 30);
  const thisMonthAll = scoped.filter((entry) => entry.month === thisMonth);
  const thisMonthLeft = thisMonthAll.filter((entry) => entry.next.getMonth() + 1 === thisMonth && entry.next.getFullYear() === now.getFullYear()).length;

  const goUpcoming = (days: BirthdayRange) => { setView("upcoming"); setRange(days); };
  const goMonth = (value: number) => { setView("calendar"); setMonth(value); setPicked(null); };

  const stats = [
    {
      key: "today", label: "Today", value: todays.length, icon: "fa-gift", tone: "red", on: false,
      note: todays.length ? todays.slice(0, 2).map(firstName).join(", ") + (todays.length > 2 ? ` and ${todays.length - 2} more` : "") : "No birthdays today",
      go: () => goUpcoming(7),
    },
    {
      key: "week", label: "Next 7 days", value: week.length, icon: "fa-calendar-week", tone: "gold", on: view === "upcoming" && range === 7,
      note: `Today to ${shortDate(addDays(now, 6))}`,
      go: () => goUpcoming(7),
    },
    {
      key: "month", label: `In ${MONTH_NAMES[thisMonth - 1]}`, value: thisMonthAll.length, icon: "fa-calendar-days", tone: "violet", on: view === "calendar" && month === thisMonth,
      note: thisMonthAll.length ? `${thisMonthLeft} still to come` : "None this month",
      go: () => goMonth(thisMonth),
    },
    {
      key: "30", label: "Next 30 days", value: month30.length, icon: "fa-cake-candles", tone: "teal", on: view === "upcoming" && range === 30,
      note: (() => { const weekend = month30.filter((entry) => classDay(entry.next)).length; return weekend ? `${weekend} on a weekend` : "All on school days"; })(),
      go: () => goUpcoming(30),
    },
    {
      key: "missing", label: "No date of birth", value: missing.length, icon: "fa-circle-question", tone: missing.length ? "warn" : "ok", on: view === "missing",
      note: missing.length ? "Not on any birthday list" : "Everyone has a date",
      go: () => setView("missing"),
    },
  ];

  const copyAssembly = async () => {
    const text = `Birthdays today, ${longDate(now)}: ${todays.map((entry) => `${entry.name} (${placeOf(entry)}${entry.turns ? `, turning ${entry.turns}` : ""})`).join("; ")}.`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy the list for assembly", text);
    }
  };

  // What printing and the CSV export contain: exactly what the current view shows.
  const scopeLabel = cls ? (cls === "none" ? "Pupils with no class set" : SCHOOL_CLASSES.find((entry) => entry.code === cls)?.name ?? cls) : "All classes";
  const viewTitle = view === "upcoming"
    ? range === 365 ? "Next 12 months" : `Next ${RANGE_LABELS[range]}`
    : view === "calendar" ? `${MONTH_NAMES[month - 1]} ${calYear}` : "Pupils with no date of birth";
  const printItems: PrintItem[] = view === "upcoming"
    ? upcoming.map((entry) => ({ row: entry, date: entry.next, turns: entry.turns }))
    : view === "calendar"
      ? inMonth.map((entry) => ({ row: entry, date: entry.on, turns: entry.age }))
      : missing.map((row) => ({ row, date: null, turns: null }));

  const download = () => {
    const cell = (value: string | number | null) => {
      let text = String(value ?? "");
      if (/^[=+\-@]/.test(text)) text = `'${text}`;
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const dated = view !== "missing";
    const header = dated
      ? ["Date", "Weekday", "Pupil", "Preferred name", "Student number", "Class", "Stream", "Turns", "Parent", "Phone"]
      : ["Pupil", "Preferred name", "Student number", "Class", "Stream", "Parent", "Phone"];
    const lines = printItems.map(({ row, date, turns }) => {
      const common = [row.name, row.preferred, row.number, row.classCode, row.stream];
      const contact = [row.parent, row.phone ? displayPhone(row.phone) : ""];
      return dated && date
        ? [date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), date.toLocaleDateString("en-GB", { weekday: "long" }), ...common, turns, ...contact]
        : [...common, ...contact];
    });
    const csv = [header, ...lines].map((line) => line.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `birthdays-${viewTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}${cls ? `-${cls.toLowerCase()}` : ""}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const reset = () => {
    setQuery("");
    setCls("");
    search.current?.focus();
  };

  return (
    <div className="bdy">
      <div className="bdy-stats no-print">
        {stats.map((stat, index) => (
          <button
            key={stat.key}
            type="button"
            className={`bdy-stat is-${stat.tone}${stat.on ? " is-on" : ""}`}
            style={{ "--i": index } as React.CSSProperties}
            onClick={stat.go}
            aria-pressed={stat.on}
          >
            <span className="bdy-stat-icon" aria-hidden="true"><i className={`fa-solid ${stat.icon}`} /></span>
            <span className="bdy-stat-body">
              <strong>{stat.value.toLocaleString("en-GB")}</strong>
              <span>{stat.label}</span>
              <small>{stat.note}</small>
            </span>
          </button>
        ))}
      </div>

      {view !== "missing" ? (
        todays.length ? (
          <section className="bdy-today no-print" aria-labelledby="bdy-today-title">
            <span className="bdy-confetti" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span>
            <header className="bdy-today-head">
              <div>
                <p className="bdy-today-kicker"><i className="fa-solid fa-gift" aria-hidden="true" /> Birthdays today · {longDate(now)}</p>
                <h2 id="bdy-today-title">
                  {todays.length === 1 ? `Happy birthday, ${firstName(todays[0])}` : `${todays.length} pupils are celebrating today`}
                </h2>
              </div>
              <button type="button" className={`bdy-copy${copied ? " is-copied" : ""}`} onClick={copyAssembly}>
                <i className={`fa-solid ${copied ? "fa-check" : "fa-bullhorn"}`} aria-hidden="true" />
                {copied ? "Copied" : "Copy for assembly"}
              </button>
            </header>
            <ul className="bdy-stars">
              {todays.map((entry, index) => (
                <li key={entry.id} className="bdy-star" style={{ "--i": Math.min(index, 8) } as React.CSSProperties}>
                  <Avatar row={entry} size="lg" />
                  <div className="bdy-star-main">
                    <span className="bdy-star-turns">{entry.turns ? `Turns ${entry.turns} today` : "Birthday today"}</span>
                    <Link href={`${OFFICE}/students/${entry.id}`}>{entry.name}</Link>
                    <small>{placeOf(entry)}{entry.house ? ` · ${entry.house}` : ""}</small>
                  </div>
                  <Contact row={entry} turns={entry.turns} date={entry.next} days={0} />
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="bdy-next no-print">
            <span className="bdy-next-icon" aria-hidden="true"><i className="fa-regular fa-calendar" /></span>
            <span>
              <strong>No birthdays today{cls || words.length ? " in this selection" : ""}.</strong>{" "}
              {nextUp ? (
                <>
                  Next is <Link href={`${OFFICE}/students/${nextUp.id}`}>{nextUp.name}</Link> ({placeOf(nextUp)}){" "}
                  {nextUp.days === 1 ? "tomorrow" : `on ${longDate(nextUp.next)}`}
                  {nextSameDay > 1 ? `, with ${nextSameDay - 1} other${nextSameDay > 2 ? "s" : ""}` : ""}.
                </>
              ) : "Nobody in this selection has a date of birth yet."}
            </span>
          </p>
        )
      ) : null}

      <div className="bdy-bar no-print">
        <div className="bdy-bar-top">
          <div className="bdy-search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <label className="visually-hidden" htmlFor="birthday-search">Search birthdays</label>
            <input
              ref={search}
              id="birthday-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && query) {
                  event.preventDefault();
                  setQuery("");
                }
              }}
              placeholder="Search by name, student number, house, parent or phone"
              autoComplete="off"
              spellCheck={false}
            />
            {query ? (
              <button type="button" className="bdy-search-clear" onClick={() => { setQuery(""); search.current?.focus(); }} aria-label="Clear search">
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            ) : <kbd aria-hidden="true">/</kbd>}
          </div>
          <div className="bdy-views" role="tablist" aria-label="Birthday views">
            {VIEWS.map((entry) => (
              <button
                key={entry.value}
                type="button"
                role="tab"
                aria-selected={view === entry.value}
                className={view === entry.value ? "is-on" : ""}
                onClick={() => setView(entry.value)}
              >
                <i className={`fa-solid ${entry.icon}`} aria-hidden="true" />
                <span>{entry.label}</span>
                {entry.value === "missing" && searchedMissing.length ? <em>{searchedMissing.length}</em> : null}
              </button>
            ))}
          </div>
        </div>

        <div className="bdy-classes" aria-label="Class">
          <button type="button" className={cls ? "" : "is-on"} aria-pressed={!cls} onClick={() => setCls("")}>
            All classes <span>{classCounts.total}</span>
          </button>
          {SCHOOL_CLASSES.map((entry) => {
            const count = classCounts.counts.get(entry.code) ?? 0;
            return (
              <button
                key={entry.code}
                type="button"
                className={`${cls === entry.code ? "is-on" : ""}${count ? "" : " is-empty"}`}
                aria-pressed={cls === entry.code}
                title={entry.name}
                onClick={() => setCls(cls === entry.code ? "" : entry.code)}
              >
                {entry.code} <span>{count}</span>
              </button>
            );
          })}
          {classCounts.counts.get("none") ? (
            <button type="button" className={cls === "none" ? "is-on" : ""} aria-pressed={cls === "none"} onClick={() => setCls(cls === "none" ? "" : "none")}>
              No class <span>{classCounts.counts.get("none")}</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="bdy-meta no-print">
        {view === "upcoming" ? (
          <div className="bdy-range" role="group" aria-label="How far ahead">
            {BIRTHDAY_RANGES.map((value) => (
              <button key={value} type="button" className={range === value ? "is-on" : ""} aria-pressed={range === value} onClick={() => setRange(value)}>
                {RANGE_LABELS[value]}
              </button>
            ))}
          </div>
        ) : (
          <p className="bdy-summary" aria-live="polite">
            <strong>{printItems.length}</strong> {printItems.length === 1 ? "pupil" : "pupils"} · {view === "missing" ? "no date of birth" : viewTitle}
            {cls ? ` · ${scopeLabel}` : ""}
            {words.length ? <> · matching <q>{deferred.trim()}</q></> : null}
          </p>
        )}
        <div className="bdy-tools">
          <label className="bdy-paged" title="Gives each class teacher their own sheet">
            <input type="checkbox" checked={paged} onChange={(event) => setPaged(event.target.checked)} />
            <span className="bdy-switch" aria-hidden="true" />
            Print each class on its own page
          </label>
          <button type="button" className="bdy-tool" onClick={download} disabled={!printItems.length}>
            <i className="fa-solid fa-file-csv" aria-hidden="true" /> Export CSV
          </button>
        </div>
      </div>

      <BirthdayPrint
        items={printItems}
        dated={view !== "missing"}
        title={viewTitle}
        scope={`${scopeLabel}${words.length ? ` · matching “${deferred.trim()}”` : ""}`}
        printedAt={printedAt}
        printedBy={printedBy}
        paged={paged}
      />

      <div className={`bdy-content${stale ? " is-stale" : ""}`}>
        {view === "upcoming" ? (
          <div className="bdy-split">
            <section className="bdy-panel" aria-labelledby="bdy-upcoming-title">
              <header className="bdy-panel-head">
                <span className="bdy-panel-icon" aria-hidden="true"><i className="fa-solid fa-cake-candles" /></span>
                <div>
                  <h2 id="bdy-upcoming-title">{range === 365 ? "The next 12 months" : `The next ${RANGE_LABELS[range]}`}</h2>
                  <p>
                    {upcoming.length} {upcoming.length === 1 ? "birthday" : "birthdays"}
                    {cls ? ` in ${scopeLabel}` : ""}
                    {words.length ? <> matching <q>{deferred.trim()}</q></> : null}
                  </p>
                </div>
              </header>
              {upcomingGroups.length ? (
                <ol className="bdy-days">
                  {upcomingGroups.map((group, groupIndex) => {
                    const newMonth = groupIndex === 0 || group.date.getMonth() !== upcomingGroups[groupIndex - 1].date.getMonth();
                    const weekend = classDay(group.date);
                    return (
                      <li key={group.days} className={`bdy-day${group.days === 0 ? " is-today" : ""}`}>
                        {newMonth && range > 14 ? <p className="bdy-month-label">{MONTH_NAMES[group.date.getMonth()]} {group.date.getFullYear()}</p> : null}
                        <header className="bdy-day-head">
                          <span className="bdy-tile" aria-hidden="true">
                            <small>{SHORT_MONTHS[group.date.getMonth()]}</small>
                            <strong>{group.date.getDate()}</strong>
                          </span>
                          <div>
                            <h3>{group.days === 0 ? "Today" : group.days === 1 ? "Tomorrow" : group.date.toLocaleDateString("en-GB", { weekday: "long" })}</h3>
                            <p>
                              {group.days <= 1 ? longDate(group.date) : group.date.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}
                              {group.days > 1 ? ` · in ${group.days} days` : ""}
                            </p>
                          </div>
                          {weekend ? (
                            <span className="bdy-weekend" title="Celebrate in class on the nearest school day">
                              <i className="fa-solid fa-mug-hot" aria-hidden="true" /> Weekend · celebrate {shortDate(weekend)}
                            </span>
                          ) : null}
                        </header>
                        <ul className="bdy-rows">
                          {group.items.map((entry, index) => (
                            <li key={entry.id} className="bdy-row" style={{ "--i": Math.min(groupIndex + index, 10) } as React.CSSProperties}>
                              <Avatar row={entry} />
                              <div className="bdy-who">
                                <Link href={`${OFFICE}/students/${entry.id}`}><Highlight text={entry.name} words={words} /></Link>
                                <small>
                                  <Highlight text={entry.number} words={words} /> · {placeOf(entry)}
                                  {entry.house ? <> · <Highlight text={entry.house} words={words} /></> : null}
                                  {entry.preferred ? <> · “<Highlight text={entry.preferred} words={words} />”</> : null}
                                </small>
                              </div>
                              <span className={`bdy-turns${entry.days === 0 ? " is-today" : ""}`}>
                                {entry.turns ? <>Turns <b>{entry.turns}</b></> : "Birthday"}
                              </span>
                              <Contact row={entry} turns={entry.turns} date={entry.next} days={entry.days} />
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <Empty
                  icon={words.length ? "fa-magnifying-glass" : "fa-calendar-check"}
                  title={words.length ? "No pupils match your search" : `No birthdays in the next ${range === 365 ? "12 months" : RANGE_LABELS[range]}`}
                  text={words.length ? "Check the spelling or try part of a name, a class such as “P3” or a parent’s phone number." : range < 365 ? "Look further ahead or open the calendar." : "No pupils in this selection have a date of birth."}
                  action={words.length || cls ? <button type="button" className="admin-btn admin-btn-ghost" onClick={reset}>Clear search and filters</button>
                    : range < 365 ? <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setRange(BIRTHDAY_RANGES[BIRTHDAY_RANGES.indexOf(range) + 1])}>Look further ahead</button> : null}
                />
              )}
            </section>

            <aside className="bdy-side">
              <section className="bdy-panel bdy-months-card" aria-labelledby="bdy-months-title">
                <header className="bdy-panel-head is-small">
                  <div>
                    <h2 id="bdy-months-title">Birthdays by month</h2>
                    <p>Open a month in the calendar</p>
                  </div>
                </header>
                <ul className="bdy-months">
                  {monthCounts.map((count, index) => {
                    const max = Math.max(1, ...monthCounts);
                    return (
                      <li key={MONTH_NAMES[index]}>
                        <button type="button" className={index + 1 === thisMonth ? "is-now" : ""} onClick={() => goMonth(index + 1)} aria-label={`${MONTH_NAMES[index]}: ${count} birthdays`}>
                          <span>{SHORT_MONTHS[index]}</span>
                          <span className="bdy-bar-track" aria-hidden="true"><span style={{ width: `${(count / max) * 100}%` }} /></span>
                          <strong>{count}</strong>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
              <ClassBreakdown items={upcoming} cls={cls} setCls={setCls} label={range === 365 ? "the next 12 months" : `the next ${RANGE_LABELS[range]}`} />
            </aside>
          </div>
        ) : null}

        {view === "calendar" ? (
          <div className="bdy-split is-calendar">
            <section className="bdy-panel bdy-cal" aria-labelledby="bdy-cal-title">
              <header className="bdy-cal-head">
                <button type="button" className="bdy-cal-step" onClick={() => goMonth(month === 1 ? 12 : month - 1)} aria-label={`Previous month, ${MONTH_NAMES[(month + 10) % 12]}`}>
                  <i className="fa-solid fa-chevron-left" aria-hidden="true" />
                </button>
                <div>
                  <h2 id="bdy-cal-title">{MONTH_NAMES[month - 1]} <span>{calYear}</span></h2>
                  <p>{inMonth.length} {inMonth.length === 1 ? "birthday" : "birthdays"}{cls ? ` in ${scopeLabel}` : ""}</p>
                </div>
                <button type="button" className="bdy-cal-step" onClick={() => goMonth(month === 12 ? 1 : month + 1)} aria-label={`Next month, ${MONTH_NAMES[month % 12]}`}>
                  <i className="fa-solid fa-chevron-right" aria-hidden="true" />
                </button>
                {month !== thisMonth || picked !== null ? (
                  <button type="button" className="bdy-cal-today" onClick={() => goMonth(thisMonth)}>Today</button>
                ) : null}
              </header>

              <div className="bdy-monthstrip" role="group" aria-label="Months">
                {SHORT_MONTHS.map((name, index) => (
                  <button
                    key={name}
                    type="button"
                    className={`${month === index + 1 ? "is-on" : ""}${index + 1 === thisMonth ? " is-now" : ""}`}
                    aria-pressed={month === index + 1}
                    onClick={() => goMonth(index + 1)}
                  >
                    {name}
                    <span>{monthCounts[index]}</span>
                  </button>
                ))}
              </div>

              <CalendarGrid
                year={calYear}
                month={month}
                now={now}
                byDay={byDay}
                selected={selectedDay}
                onPick={setPicked}
              />
            </section>

            <DayPanel date={new Date(calYear, month - 1, selectedDay)} now={now} items={byDay.get(selectedDay) ?? []} />
          </div>
        ) : null}

        {view === "missing" ? <MissingList rows={missing} words={words} hasFilters={Boolean(words.length || cls)} onReset={reset} /> : null}
      </div>
    </div>
  );
}

function Empty({ icon, title, text, action }: { icon: string; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="bdy-empty">
      <span><i className={`fa-solid ${icon}`} aria-hidden="true" /></span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

function ClassBreakdown({ items, cls, setCls, label }: { items: Entry[]; cls: string; setCls: (value: string) => void; label: string }) {
  const counts = SCHOOL_CLASSES.map((entry) => ({ code: entry.code as string, name: entry.name as string, count: items.filter((item) => item.classCode === entry.code).length }));
  const none = items.filter((item) => !item.classCode).length;
  if (none) counts.push({ code: "none", name: "No class set", count: none });
  const shown = counts.filter((entry) => entry.count || entry.code === cls);
  const max = Math.max(1, ...shown.map((entry) => entry.count));
  return (
    <section className="bdy-panel" aria-labelledby="bdy-classes-title">
      <header className="bdy-panel-head is-small">
        <div>
          <h2 id="bdy-classes-title">By class</h2>
          <p>Birthdays in {label}</p>
        </div>
      </header>
      {shown.length ? (
        <ul className="bdy-months is-classes">
          {shown.map((entry) => (
            <li key={entry.code}>
              <button
                type="button"
                className={cls === entry.code ? "is-on" : ""}
                aria-pressed={cls === entry.code}
                onClick={() => setCls(cls === entry.code ? "" : entry.code)}
                title={cls === entry.code ? "Show every class" : `Show only ${entry.name}`}
              >
                <span>{entry.code === "none" ? "None" : entry.code}</span>
                <span className="bdy-bar-track" aria-hidden="true"><span style={{ width: `${(entry.count / max) * 100}%` }} /></span>
                <strong>{entry.count}</strong>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="bdy-side-empty">No birthdays in this range.</p>}
    </section>
  );
}

function CalendarGrid({ year, month, now, byDay, selected, onPick }: {
  year: number;
  month: number;
  now: Date;
  byDay: Map<number, Dated[]>;
  selected: number;
  onPick: (day: number) => void;
}) {
  const lead = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const length = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length }, (_, index) => index + 1)];
  while (cells.length % 7) cells.push(null);
  const isNowMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  return (
    <div className="bdy-grid" role="group" aria-label={`Days in ${MONTH_NAMES[month - 1]} ${year}`}>
      {WEEKDAYS.map((name, index) => <span key={name} className={`bdy-weekday${index > 4 ? " is-weekend" : ""}`} aria-hidden="true">{name}</span>)}
      {cells.map((day, index) => {
        if (day === null) return <span key={`blank-${index}`} className="bdy-cell is-blank" aria-hidden="true" />;
        const items = byDay.get(day) ?? [];
        const date = new Date(year, month - 1, day);
        const weekend = date.getDay() === 0 || date.getDay() === 6;
        const isToday = isNowMonth && day === now.getDate();
        const past = isNowMonth && day < now.getDate();
        return (
          <button
            key={day}
            type="button"
            className={`bdy-cell${weekend ? " is-weekend" : ""}${isToday ? " is-today" : ""}${past ? " is-past" : ""}${items.length ? " has-items" : ""}${selected === day ? " is-on" : ""}`}
            aria-pressed={selected === day}
            aria-label={`${longDate(date)}${isToday ? ", today" : ""}: ${items.length ? `${items.length} ${items.length === 1 ? "birthday" : "birthdays"}` : "no birthdays"}`}
            onClick={() => onPick(day)}
          >
            <span className="bdy-cell-top">
              <span className="bdy-cell-day">{day}</span>
              {items.length ? <span className="bdy-cell-count">{items.length}</span> : null}
            </span>
            {items.length ? (
              <span className="bdy-cell-names">
                {items.slice(0, 2).map((entry) => (
                  <span key={entry.id} className={entry.sex === "M" ? "is-boy" : entry.sex === "F" ? "is-girl" : ""}>{firstName(entry)}</span>
                ))}
                {items.length > 2 ? <em>+{items.length - 2} more</em> : null}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function DayPanel({ date, now, items }: { date: Date; now: Date; items: Dated[] }) {
  const days = daysBetween(now, date);
  const weekend = classDay(date);
  const when = days === 0 ? "Today" : days === 1 ? "Tomorrow" : days === -1 ? "Yesterday" : days > 0 ? `In ${days} days` : `${-days} days ago`;
  return (
    <aside className="bdy-panel bdy-dayside" aria-live="polite">
      <header className="bdy-dayside-head">
        <span className="bdy-tile is-big" aria-hidden="true">
          <small>{SHORT_MONTHS[date.getMonth()]}</small>
          <strong>{date.getDate()}</strong>
        </span>
        <div>
          <h2>{date.toLocaleDateString("en-GB", { weekday: "long" })}</h2>
          <p>{date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} · {when}</p>
        </div>
      </header>
      {weekend ? (
        <p className="bdy-dayside-note"><i className="fa-solid fa-mug-hot" aria-hidden="true" /> A weekend. Celebrate in class on {longDate(weekend)}.</p>
      ) : null}
      {items.length ? (
        <ul className="bdy-daylist">
          {items.map((entry, index) => (
            <li key={entry.id} style={{ "--i": Math.min(index, 8) } as React.CSSProperties}>
              <Avatar row={entry} />
              <div className="bdy-who">
                <Link href={`${OFFICE}/students/${entry.id}`}>{entry.name}</Link>
                <small>
                  {placeOf(entry)}
                  {entry.age ? ` · ${days < 0 ? "Turned" : "Turns"} ${entry.age}` : ""}
                  {entry.day === 29 && entry.month === 2 && date.getDate() === 28 ? " · born 29 February" : ""}
                </small>
              </div>
              <Contact row={entry} turns={entry.age} date={date} days={days} wide />
            </li>
          ))}
        </ul>
      ) : (
        <div className="bdy-dayside-empty">
          <i className="fa-regular fa-calendar" aria-hidden="true" />
          <p>No birthdays on this day.</p>
          <small>Pick a day with a number on it to see who is celebrating.</small>
        </div>
      )}
    </aside>
  );
}

function MissingList({ rows, words, hasFilters, onReset }: { rows: BirthdayRow[]; words: string[]; hasFilters: boolean; onReset: () => void }) {
  const groups = [
    ...SCHOOL_CLASSES.map((entry) => ({ code: entry.code as string, name: entry.name as string, rows: rows.filter((row) => row.classCode === entry.code) })),
    { code: "none", name: "No class set", rows: rows.filter((row) => !row.classCode) },
  ].filter((group) => group.rows.length);

  if (!groups.length) {
    return (
      <Empty
        icon={words.length ? "fa-magnifying-glass" : "fa-circle-check"}
        title={words.length ? "No pupils match your search" : "Every pupil has a date of birth"}
        text={words.length ? "Check the spelling or clear the search." : hasFilters ? "Nobody in this class is missing a date of birth." : "Every active pupil will appear on the birthday lists."}
        action={hasFilters ? <button type="button" className="admin-btn admin-btn-ghost" onClick={onReset}>Clear search and filters</button> : null}
      />
    );
  }

  return (
    <div className="bdy-missing">
      <p className="bdy-missing-note">
        <i className="fa-solid fa-circle-info" aria-hidden="true" />
        These pupils are left off every birthday list until their date of birth is added. Print the list to collect dates from parents, then add them on each pupil’s Edit tab.
      </p>
      {groups.map((group) => (
        <section key={group.code} className="bdy-panel bdy-class" aria-labelledby={`bdy-missing-${group.code}`}>
          <header className="bdy-class-head">
            <span className="bdy-class-code">{group.code === "none" ? "–" : group.code}</span>
            <div>
              <h2 id={`bdy-missing-${group.code}`}>{group.name}</h2>
              <p>{group.rows.length} {group.rows.length === 1 ? "pupil" : "pupils"} without a date of birth</p>
            </div>
            {group.code !== "none" ? (
              <Link className="bdy-class-link" href={`${OFFICE}/classes/${group.code}`}>Class list <i className="fa-solid fa-arrow-right" aria-hidden="true" /></Link>
            ) : null}
          </header>
          <ul className="bdy-rows">
            {group.rows.map((row, index) => (
              <li key={row.id} className="bdy-row is-missing" style={{ "--i": Math.min(index, 10) } as React.CSSProperties}>
                <Avatar row={row} />
                <div className="bdy-who">
                  <Link href={`${OFFICE}/students/${row.id}`}><Highlight text={row.name} words={words} /></Link>
                  <small><Highlight text={row.number} words={words} /> · {placeOf(row)}</small>
                </div>
                {row.phone ? (
                  <a className="bdy-parent" href={telHref(row.phone)} title={`Call ${row.parent || "the parent"}`}>
                    <i className="fa-solid fa-phone" aria-hidden="true" />
                    <span>{displayPhone(row.phone)}<small>{row.parent || "Parent"}</small></span>
                  </a>
                ) : <span className="bdy-nophone">No parent phone</span>}
                <Link className="bdy-fix" href={`${OFFICE}/students/${row.id}?tab=edit`}>
                  <i className="fa-solid fa-pen" aria-hidden="true" /> Add date of birth
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** The paper copy: hidden on screen, it replaces the page when printing. */
function BirthdayPrint({ items, dated, title, scope, printedAt, printedBy, paged }: {
  items: PrintItem[];
  dated: boolean;
  title: string;
  scope: string;
  printedAt: string;
  printedBy: string;
  paged: boolean;
}) {
  const groups = paged
    ? [
        ...SCHOOL_CLASSES.map((entry) => ({ key: entry.code as string, code: entry.code as string, name: entry.name as string, items: items.filter((item) => item.row.classCode === entry.code) })),
        { key: "none", code: "–", name: "No class set", items: items.filter((item) => !item.row.classCode) },
      ].filter((group) => group.items.length)
    : [{ key: "all", code: "", name: "", items }];

  return (
    <div className={`bdy-print${paged ? " is-paged" : ""}`} aria-hidden="true">
      <header className="bdy-print-head">
        <img src="/images/kja-logo.png" alt="" />
        <div className="bdy-print-title">
          <p>Admissions office</p>
          <h1>{dated ? "Birthday list" : "Dates of birth to collect"}</h1>
          <span>{title} · {scope}</span>
        </div>
      </header>
      <dl className="bdy-print-meta">
        <div><dt>Pupils</dt><dd>{items.length}</dd></div>
        <div><dt>Printed</dt><dd>{printedAt}</dd></div>
        <div><dt>Printed by</dt><dd>{printedBy}</dd></div>
      </dl>

      {items.length ? groups.map((group) => (
        <section key={group.key} className="bdy-print-group">
          {group.name ? (
            <h2>
              <span className="bdy-print-code">{group.code}</span>
              <span>{group.name}</span>
              <small>{group.items.length} {group.items.length === 1 ? "pupil" : "pupils"}</small>
            </h2>
          ) : null}
          <table>
            <thead>
              {dated
                ? <tr><th className="is-n">#</th><th className="is-date">Date</th><th>Pupil</th><th className="is-class">Class</th><th className="is-turns">Turns</th><th className="is-parent">Parent to contact</th></tr>
                : <tr><th className="is-n">#</th><th>Pupil</th><th className="is-class">Class</th><th className="is-parent">Parent to contact</th><th className="is-fill">Date of birth</th></tr>}
            </thead>
            <tbody>
              {group.items.map(({ row, date, turns }, index) => (
                <tr key={row.id}>
                  <td className="is-n">{index + 1}</td>
                  {dated && date ? (
                    <td className="is-date">
                      <strong>{date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</strong>
                      <small>{date.toLocaleDateString("en-GB", { weekday: "long" })}</small>
                    </td>
                  ) : null}
                  <td>
                    <strong>{row.name}</strong>
                    <small>{row.number}{row.preferred ? ` · “${row.preferred}”` : ""}</small>
                  </td>
                  <td className="is-class">{placeOf(row)}</td>
                  {dated ? <td className="is-turns">{turns ?? "–"}</td> : null}
                  <td className="is-parent">
                    {row.phone ? <><strong>{displayPhone(row.phone)}</strong><small>{row.parent || "Parent"}</small></> : <span className="bdy-print-none">No phone on file</span>}
                  </td>
                  {dated ? null : <td className="is-fill"><span /></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )) : <p className="bdy-print-empty">No pupils are on this list.</p>}
    </div>
  );
}
