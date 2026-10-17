"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createClub, recordClubPayment, saveClub } from "@/app/accounts/(desk)/clubs/actions";
import { Dialog, Feedback, useOfficeAction } from "@/components/accounts/client";
import { Empty } from "@/components/office/ui";
import { StudentFace } from "@/components/StudentFace";
import { CLUB_CATEGORIES, CLUB_SECTIONS, clubListHref, type ClubListFilters } from "@/lib/clubs";
import { ACCOUNTS_BASE, PAYMENT_METHODS, amount, day, methodInfo, ugx } from "@/lib/accounts-format";
import { SCHOOL_CLASSES, className } from "@/lib/students";

export type CatalogueClub = {
  id: string;
  title: string;
  category: string;
  fee: number;
  section: string;
  description: string | null;
  active: boolean;
};

export type ClubStripItem = CatalogueClub & { audience: string; icon: string };

export function ClubEdit({ club }: { club: CatalogueClub }) {
  const [open, setOpen] = useState(false);
  const { result, setResult, pending, run } = useOfficeAction();
  const categories = CLUB_CATEGORIES.includes(club.category as (typeof CLUB_CATEGORIES)[number])
    ? CLUB_CATEGORIES
    : [club.category, ...CLUB_CATEGORIES];

  return (
    <>
      <button type="button" className="admin-btn admin-btn-ghost" onClick={() => { setResult(null); setOpen(true); }}>Edit</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={club.title} description="Parents see this name, fee and who the club is for.">
        <form
          className="ofc-form is-compact"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => saveClub(new FormData(event.currentTarget)), () => setOpen(false));
          }}
        >
          <input type="hidden" name="id" value={club.id} />
          <label className="ofc-field">
            <span>Name</span>
            <input name="title" defaultValue={club.title} required maxLength={80} autoFocus />
          </label>
          <label className="ofc-field">
            <span>Category</span>
            <select name="category" defaultValue={club.category} required>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <label className="ofc-field">
            <span>Fee for the current term (UGX)</span>
            <input name="fee_amount" inputMode="numeric" defaultValue={String(club.fee)} required />
          </label>
          <label className="ofc-field">
            <span>Who it is for</span>
            <select name="section" defaultValue={club.section}>
              {CLUB_SECTIONS.map((section) => <option key={section.value} value={section.value}>{section.label}</option>)}
            </select>
          </label>
          <label className="ofc-field">
            <span>Note</span>
            <textarea name="description" rows={2} maxLength={400} defaultValue={club.description ?? ""} />
          </label>
          <label className="ofc-check">
            <input type="checkbox" name="active" defaultChecked={club.active} /> Open for parents to join
          </label>
          <Feedback result={result} />
          <div className="acc-dialog-foot">
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="admin-btn" disabled={pending}>{pending ? "Saving…" : "Save club"}</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function ClubCreate() {
  const [open, setOpen] = useState(false);
  const { result, setResult, pending, run } = useOfficeAction();

  return (
    <>
      <button type="button" className="clb-new" onClick={() => { setResult(null); setOpen(true); }}>
        <i className="fa-solid fa-plus" aria-hidden="true" /> New club
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="New club" description="Parents see this name, fee and who the club is for.">
        <form
          className="ofc-form is-compact"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => createClub(new FormData(event.currentTarget)), () => setOpen(false));
          }}
        >
          <label className="ofc-field">
            <span>Name</span>
            <input name="title" required maxLength={80} autoFocus placeholder="Club name" />
          </label>
          <label className="ofc-field">
            <span>Category</span>
            <select name="category" defaultValue={CLUB_CATEGORIES[0]} required>
              {CLUB_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <label className="ofc-field">
            <span>Fee for the current term (UGX)</span>
            <input name="fee_amount" inputMode="numeric" required placeholder="40000" />
          </label>
          <label className="ofc-field">
            <span>Who it is for</span>
            <select name="section" defaultValue="both">
              {CLUB_SECTIONS.map((section) => <option key={section.value} value={section.value}>{section.label}</option>)}
            </select>
          </label>
          <label className="ofc-field">
            <span>Note</span>
            <textarea name="description" rows={2} maxLength={400} />
          </label>
          <label className="ofc-check">
            <input type="checkbox" name="active" defaultChecked /> Open for parents to join
          </label>
          <Feedback result={result} />
          <div className="acc-dialog-foot">
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="admin-btn" disabled={pending}>{pending ? "Adding…" : "Add club"}</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function ClubStrip({ clubs }: { clubs: ClubStripItem[] }) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const needle = deferred.trim().toLowerCase();
  const visible = useMemo(() => {
    const words = needle.split(/\s+/).filter(Boolean);
    if (!words.length) return clubs;
    return clubs.filter((club) => {
      const hay = `${club.title} ${club.category} ${club.audience} ${club.description || ""}`.toLowerCase();
      return words.every((word) => hay.includes(word));
    });
  }, [clubs, needle]);

  return (
    <>
      <label className="clb-find">
        <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
        <span className="visually-hidden">Search clubs</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query) {
              event.preventDefault();
              setQuery("");
            }
          }}
          placeholder="Find a club"
          autoComplete="off"
          aria-controls="club-strip"
        />
      </label>
      <p className="clb-find-count" aria-live="polite">
        {needle
          ? `${visible.length} of ${clubs.length} ${clubs.length === 1 ? "club" : "clubs"}`
          : `${clubs.length} ${clubs.length === 1 ? "club" : "clubs"}. Each fee is for this term.`}
      </p>
      {visible.length ? (
        <ul className="clb-strip" id="club-strip">
          {visible.map((club) => (
            <li key={club.id}>
              <article className={`clb-card${club.active ? "" : " is-closed"}`} title={club.description || undefined}>
                <header>
                  <h4>{club.title}</h4>
                  <span className={`clb-state${club.active ? " is-open" : ""}`}>{club.active ? "Open" : "Closed"}</span>
                </header>
                <p className="clb-aud">
                  <i className={`fa-solid ${club.icon}`} aria-hidden="true" />
                  <span>{club.category}</span>
                  <span className="clb-aud-sep" aria-hidden="true">·</span>
                  <span>{club.audience}</span>
                </p>
                <footer>
                  <p className="clb-price">
                    <strong>{amount(club.fee)}</strong>
                    <span>UGX</span>
                  </p>
                  <ClubEdit club={club} />
                </footer>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <p className="clb-find-empty">No clubs match “{query.trim()}”.</p>
      )}
    </>
  );
}

export function RecordClubPayment({
  studentId,
  studentName,
  clubId,
  clubTitle,
  fee,
}: {
  studentId: string;
  studentName: string;
  clubId: string;
  clubTitle: string;
  fee: number;
}) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState("cash");
  const { result, setResult, pending, run } = useOfficeAction();
  const needsReference = methodInfo(method).needsReference;

  return (
    <>
      <button type="button" className="admin-btn admin-btn-ghost" onClick={() => { setResult(null); setOpen(true); }}>Record payment</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Record a club payment" description={`${studentName} · ${clubTitle}`}>
        <form
          className="ofc-form is-compact"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => recordClubPayment(new FormData(event.currentTarget)), () => setOpen(false));
          }}
        >
          <input type="hidden" name="student_id" value={studentId} />
          <input type="hidden" name="club_id" value={clubId} />
          <p className="app-muted">Amount received: <strong>{ugx(fee)}</strong> for the current term.</p>
          <label className="ofc-field">
            <span>Method</span>
            <select name="method" value={method} onChange={(event) => setMethod(event.target.value)}>
              {PAYMENT_METHODS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
            </select>
          </label>
          {needsReference ? (
            <label className="ofc-field">
              <span>Reference</span>
              <input name="reference" required maxLength={80} placeholder="Slip or transaction number" />
            </label>
          ) : null}
          <label className="ofc-field">
            <span>Paid by</span>
            <input name="payer_name" maxLength={120} placeholder="Parent's name" />
          </label>
          <Feedback result={result} />
          <div className="acc-dialog-foot">
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="admin-btn" disabled={pending}>{pending ? "Recording…" : `Record ${amount(fee)}`}</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

const FILTER_EVENT = "clb-filters";
const LIST_BASE = `${ACCOUNTS_BASE}/clubs`;
const EMPTY_FILTERS: ClubListFilters = { q: "", pay: "", club: "", classCode: "", stream: "", campus: "" };

export type ClubConsentRow = {
  id: string;
  studentId: string;
  studentName: string;
  studentNumber: string;
  classCode: string;
  stream: string;
  classLabel: string;
  campus: string | null;
  photoPath: string | null;
  clubId: string;
  clubTitle: string;
  fee: number;
  status: "paid" | "waiting" | "unpaid";
  receiptNo: string | null;
  consentedAt: string;
};

export type { ClubListFilters };

const PAY_LABEL: Record<string, string> = {
  unpaid: "Not paid",
  waiting: "Waiting",
  paid: "Paid",
};

function cleanPay(value: string) {
  return value === "paid" || value === "unpaid" || value === "waiting" ? value : "";
}

function sameFilters(a: ClubListFilters, b: ClubListFilters) {
  return a.q === b.q && a.pay === b.pay && a.club === b.club && a.classCode === b.classCode && a.stream === b.stream && a.campus === b.campus;
}

function readFilters(): ClubListFilters {
  const params = new URLSearchParams(window.location.search);
  return {
    q: params.get("q") ?? "",
    pay: cleanPay(params.get("pay") || ""),
    club: params.get("club") || "",
    classCode: params.get("class") || "",
    stream: params.get("stream") || "",
    campus: params.get("campus") || "",
  };
}

function writeFilters(filters: ClubListFilters) {
  const query = clubListHref(filters).slice(LIST_BASE.length);
  const url = `${window.location.pathname}${query}${window.location.hash}`;
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new Event(FILTER_EVENT));
}

/** Jumps to the register and keeps the search, club, class and campus already chosen. */
export function ClubPayLink({
  href,
  value,
  initialPay,
  className = "",
  mark = true,
  children,
}: {
  href: string;
  value: string;
  initialPay: string;
  className?: string;
  mark?: boolean;
  children: React.ReactNode;
}) {
  const [pay, setPay] = useState(initialPay);
  useEffect(() => {
    const read = () => setPay(cleanPay(new URLSearchParams(window.location.search).get("pay") || ""));
    window.addEventListener(FILTER_EVENT, read);
    window.addEventListener("popstate", read);
    return () => {
      window.removeEventListener(FILTER_EVENT, read);
      window.removeEventListener("popstate", read);
    };
  }, []);

  return (
    <a
      className={[className, mark && pay === value ? "is-on" : ""].filter(Boolean).join(" ")}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        const params = new URLSearchParams(window.location.search);
        if (value) params.set("pay", value);
        else params.delete("pay");
        const query = params.toString();
        window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}#register`);
        window.dispatchEvent(new Event(FILTER_EVENT));
        const motion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        document.getElementById("register")?.scrollIntoView({ behavior: motion ? "auto" : "smooth", block: "start" });
      }}
    >
      {children}
    </a>
  );
}

function classMatches(row: ClubConsentRow, classCode: string) {
  if (!classCode) return true;
  if (classCode === "none") return !row.classCode;
  return row.classCode === classCode;
}

function rowMatches(row: ClubConsentRow, filters: ClubListFilters, query: string, ignorePay = false) {
  if (!ignorePay && filters.pay && row.status !== filters.pay) return false;
  if (filters.club && row.clubId !== filters.club) return false;
  if (!classMatches(row, filters.classCode)) return false;
  if (filters.stream && row.stream !== filters.stream) return false;
  if (filters.campus && (row.campus || "") !== filters.campus) return false;
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return `${row.studentName} ${row.studentNumber} ${row.clubTitle} ${row.classLabel} ${row.campus ?? ""}`.toLowerCase().includes(needle);
}

export function ClubRegister({
  rows,
  termLabel,
  canRecord,
  filters: initial,
}: {
  rows: ClubConsentRow[];
  termLabel: string;
  canRecord: boolean;
  filters: ClubListFilters;
}) {
  const [filters, setFilters] = useState(initial);
  const deferredQuery = useDeferredValue(filters.q);
  const searching = deferredQuery !== filters.q;
  const echo = useRef(false);

  const apply = (next: ClubListFilters) => {
    echo.current = true;
    setFilters(next);
    writeFilters(next);
    echo.current = false;
  };

  useEffect(() => {
    const sync = () => {
      if (echo.current) return;
      const next = readFilters();
      setFilters((current) => (sameFilters(current, next) ? current : next));
    };
    window.addEventListener(FILTER_EVENT, sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener(FILTER_EVENT, sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  const clubs = useMemo(() => {
    const titles = new Map<string, string>();
    for (const row of rows) titles.set(row.clubId, row.clubTitle);
    return [...titles.entries()]
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [rows]);

  const classes = useMemo(() => {
    const codes = [...new Set(rows.map((row) => row.classCode).filter(Boolean))];
    codes.sort((a, b) => {
      const left = SCHOOL_CLASSES.find((entry) => entry.code === a)?.order ?? 99;
      const right = SCHOOL_CLASSES.find((entry) => entry.code === b)?.order ?? 99;
      return left - right || a.localeCompare(b);
    });
    return codes;
  }, [rows]);
  const hasUnclassed = rows.some((row) => !row.classCode);
  const streams = useMemo(() => {
    const source = filters.classCode ? rows.filter((row) => classMatches(row, filters.classCode)) : rows;
    return [...new Set(source.map((row) => row.stream).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [rows, filters.classCode]);

  const campuses = useMemo(
    () => [...new Set(rows.map((row) => row.campus?.trim()).filter((campus): campus is string => Boolean(campus)))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const narrowed = useMemo(
    () => rows.filter((row) => rowMatches(row, filters, deferredQuery, true)),
    [rows, filters, deferredQuery],
  );
  const visible = useMemo(
    () => (filters.pay ? narrowed.filter((row) => row.status === filters.pay) : narrowed),
    [narrowed, filters.pay],
  );
  const counts = {
    "": narrowed.length,
    unpaid: narrowed.filter((row) => row.status === "unpaid").length,
    waiting: narrowed.filter((row) => row.status === "waiting").length,
    paid: narrowed.filter((row) => row.status === "paid").length,
  };
  const tabs = [
    { value: "", label: "All", count: counts[""] },
    { value: "unpaid", label: "Not paid", count: counts.unpaid },
    { value: "waiting", label: "Waiting", count: counts.waiting },
    { value: "paid", label: "Paid", count: counts.paid },
  ];

  const clubTitle = clubs.find((club) => club.id === filters.club)?.title;
  const classLabel = filters.classCode === "none" ? "No class" : filters.classCode ? className(filters.classCode) : "";
  const pills: { key: string; label: string; next: ClubListFilters }[] = [];
  if (filters.q) pills.push({ key: "q", label: `Search: “${filters.q.trim()}”`, next: { ...filters, q: "" } });
  if (clubTitle) pills.push({ key: "club", label: clubTitle, next: { ...filters, club: "" } });
  if (classLabel) pills.push({ key: "class", label: `Class: ${classLabel}`, next: { ...filters, classCode: "" } });
  if (filters.stream) pills.push({ key: "stream", label: `Stream ${filters.stream}`, next: { ...filters, stream: "" } });
  if (filters.campus) pills.push({ key: "campus", label: filters.campus, next: { ...filters, campus: "" } });
  if (filters.pay) pills.push({ key: "pay", label: PAY_LABEL[filters.pay] ?? "Payment", next: { ...filters, pay: "" } });
  const filtered = Boolean(filters.q || filters.pay || filters.club || filters.classCode || filters.stream || filters.campus);
  const needle = deferredQuery.trim();

  return (
    <>
      <div className="clb-results">
        <div>
          <h2>{termLabel}</h2>
          <p aria-live="polite">
            {visible.length} {visible.length === 1 ? "consent" : "consents"}
            {needle ? ` matching “${needle}”` : ""}
          </p>
        </div>
        <div className="clb-results-tools">
          <a className="clb-print" href={`${ACCOUNTS_BASE}/clubs/roll/pdf`} target="_blank" rel="noreferrer" title="Print consented learners, one club to a page">
            <i className="fa-solid fa-print" aria-hidden="true" /> Print
          </a>
          <ul className="clb-tabs">
            {tabs.map((tab) => (
              <li key={tab.label}>
                <button type="button" className={filters.pay === tab.value ? "is-on" : ""} onClick={() => apply({ ...filters, pay: tab.value })}>
                  {tab.label} <span>{tab.count}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <form
        className="ofc-finder"
        role="search"
        aria-label="Filter club consents"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="ofc-finder-top">
          <label className={`ofc-finder-search${searching ? " is-searching" : ""}`}>
            <i className={`fa-solid ${searching ? "fa-spinner fa-spin" : "fa-magnifying-glass"}`} aria-hidden="true" />
            <span className="visually-hidden">Search pupils</span>
            <input
              type="search"
              value={filters.q}
              onChange={(event) => apply({ ...filters, q: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Escape" && filters.q) {
                  event.preventDefault();
                  apply({ ...filters, q: "" });
                }
              }}
              placeholder="Pupil name, number or club"
              autoComplete="off"
              aria-busy={searching}
              aria-controls="club-register"
            />
          </label>
          {clubs.length > 1 ? (
            <label className="ofc-finder-field is-inline">
              <span>Club</span>
              <select value={filters.club} onChange={(event) => apply({ ...filters, club: event.target.value })}>
                <option value="">All clubs</option>
                {clubs.map((club) => <option key={club.id} value={club.id}>{club.title}</option>)}
              </select>
            </label>
          ) : null}
          {classes.length > 1 || (classes.length === 1 && hasUnclassed) ? (
            <label className="ofc-finder-field is-inline">
              <span>Class</span>
              <select value={filters.classCode} onChange={(event) => apply({ ...filters, classCode: event.target.value, stream: "" })}>
                <option value="">All classes</option>
                {classes.map((code) => <option key={code} value={code}>{className(code)}</option>)}
                {hasUnclassed ? <option value="none">No class</option> : null}
              </select>
            </label>
          ) : null}
          {streams.length > 1 || (filters.stream && !streams.includes(filters.stream)) ? (
            <label className="ofc-finder-field is-inline">
              <span>Stream</span>
              <select value={filters.stream} onChange={(event) => apply({ ...filters, stream: event.target.value })}>
                <option value="">Any stream</option>
                {(filters.stream && !streams.includes(filters.stream) ? [filters.stream, ...streams] : streams).map((stream) => (
                  <option key={stream} value={stream}>Stream {stream}</option>
                ))}
              </select>
            </label>
          ) : null}
          {campuses.length > 1 ? (
            <label className="ofc-finder-field is-inline">
              <span>Campus</span>
              <select value={filters.campus} onChange={(event) => apply({ ...filters, campus: event.target.value })}>
                <option value="">All campuses</option>
                {campuses.map((campus) => <option key={campus} value={campus}>{campus}</option>)}
              </select>
            </label>
          ) : null}
          {filtered ? (
            <button type="button" className="clb-clear" onClick={() => apply(EMPTY_FILTERS)}>Clear</button>
          ) : null}
        </div>
        {pills.length ? (
          <div className="ofc-finder-active" aria-label="Active filters">
            <span>Filtered by</span>
            <ul>
              {pills.map((pill) => (
                <li key={pill.key}>
                  <button type="button" onClick={() => apply(pill.next)} aria-label={`Remove filter ${pill.label}`}>
                    {pill.label} <i className="fa-solid fa-xmark" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
            {pills.length > 1 ? (
              <button type="button" className="ofc-finder-clear" onClick={() => apply(EMPTY_FILTERS)}>Clear all</button>
            ) : null}
          </div>
        ) : null}
      </form>
      {visible.length ? (
        <div className="ofc-table-scroll">
          <table className="app-table acc-table clb-table" id="club-register">
            <thead>
              <tr>
                <th scope="col">Pupil</th>
                <th scope="col">Club</th>
                <th scope="col">Consented</th>
                <th scope="col" className="is-num">Fee</th>
                <th scope="col">Payment</th>
                <th scope="col"><span className="visually-hidden">Record</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  <td data-label="Pupil">
                    <span className="clb-who">
                      <StudentFace className="clb-face" id={row.studentId} name={row.studentName} photoPath={row.photoPath} />
                      <span>
                        <Link className="clb-name" href={`${ACCOUNTS_BASE}/students/${row.studentId}`}>{row.studentName}</Link>
                        <small>{[row.studentNumber, row.classLabel, row.campus].filter(Boolean).join(" · ")}</small>
                      </span>
                    </span>
                  </td>
                  <td data-label="Club"><span className="clb-club">{row.clubTitle}</span></td>
                  <td data-label="Consented">{day(row.consentedAt)}</td>
                  <td data-label="Fee" className="is-num"><strong>{amount(row.fee)}</strong></td>
                  <td data-label="Payment">
                    {row.status === "paid" ? <span className="clb-pay is-paid"><i className="fa-solid fa-circle-check" aria-hidden="true" /> Paid{row.receiptNo ? <small>{row.receiptNo}</small> : null}</span> : null}
                    {row.status === "waiting" ? <span className="clb-pay is-waiting"><i className="fa-solid fa-mobile-screen" aria-hidden="true" /> Waiting on a phone</span> : null}
                    {row.status === "unpaid" ? <span className="clb-pay">Not paid</span> : null}
                  </td>
                  <td data-label="Record">
                    {row.status === "unpaid" && canRecord ? (
                      <RecordClubPayment studentId={row.studentId} studentName={row.studentName} clubId={row.clubId} clubTitle={row.clubTitle} fee={row.fee} />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon="fa-folder-open" title={filtered ? "No matches" : "No consents yet"}>
          {filtered ? "Try another name, club, class or payment filter." : "Consents appear here when a parent agrees on the portal."}
        </Empty>
      )}
    </>
  );
}
