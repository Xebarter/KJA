"use client";

import Link from "next/link";
import { memo, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { OFFICE, SCHOOL_CLASSES, displayPhone, telHref } from "@/lib/students";

export type MedicalRow = {
  id: string;
  name: string;
  preferred: string | null;
  number: string;
  sex: string | null;
  classCode: string | null;
  stream: string | null;
  age: number | null;
  notes: string | null;
  panadol: boolean | null;
  phone: string | null;
  phoneName: string | null;
  /** Both parents' names and numbers, so either can be searched. */
  contacts: string;
  photo: string | null;
};

export type MedicalView = "notes" | "allergy" | "no-panadol" | "unknown" | "all";

const ALLERGY = /allerg|anaphyl|epipen|peanut|nut\b|bee sting|penicillin/i;
const CHRONIC = /asthma|epilep|seizure|diabet|sickle|heart|inhaler/i;

const VIEWS: { value: MedicalView; label: string; icon: string; test: (row: MedicalRow) => boolean }[] = [
  { value: "notes", label: "Medical notes", icon: "fa-notes-medical", test: (row) => Boolean(row.notes) },
  { value: "allergy", label: "Allergies", icon: "fa-triangle-exclamation", test: (row) => ALLERGY.test(row.notes ?? "") },
  { value: "no-panadol", label: "No Panadol", icon: "fa-ban", test: (row) => row.panadol === false },
  { value: "unknown", label: "Panadol not asked", icon: "fa-circle-question", test: (row) => row.panadol === null },
  { value: "all", label: "All pupils", icon: "fa-users", test: () => true },
];

/** Rows drawn at a time. Hundreds of rows per keystroke made typing lag, so more are added on scroll. */
const BATCH = 80;

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

/** Wraps every search word found in the text in <mark>. */
function Highlight({ text, words }: { text: string; words: string[] }) {
  if (!words.length || !text) return <>{text}</>;
  const pattern = new RegExp(`(${words.map(escape).join("|")})`, "gi");
  const parts = text.split(pattern);
  return <>{parts.map((part, index) => (index % 2 ? <mark key={index}>{part}</mark> : part))}</>;
}

export function MedicalRegister({ rows, initialView, initialClass, printedBy }: { rows: MedicalRow[]; initialView: MedicalView; initialClass: string; printedBy: string }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<MedicalView>(initialView);
  const [cls, setCls] = useState(initialClass);
  const [paged, setPaged] = useState(false);
  const [printedAt, setPrintedAt] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const deferred = useDeferredValue(query);
  const stale = deferred !== query;

  // The paper copy holds every row, so it is only built for the moment of printing.
  useEffect(() => {
    const before = () => flushSync(() => setPrintedAt(new Date().toLocaleString("en-GB", {
      day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kampala",
    })));
    const after = () => setPrintedAt("");
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  // Keep the address shareable without reloading the page.
  useEffect(() => {
    const params = new URLSearchParams();
    if (view !== "notes") params.set("view", view);
    if (cls) params.set("class", cls);
    const next = `${OFFICE}/medical${params.size ? `?${params}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", next);
  }, [view, cls]);

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

  const words = useMemo(() => fold(deferred).split(/\s+/).filter(Boolean), [deferred]);

  // Built once per load rather than on every keystroke.
  const index = useMemo(() => rows.map((row) => ({
    row,
    text: fold([row.name, row.preferred, row.number, row.notes, row.classCode, row.stream && `${row.classCode} ${row.stream}`, row.contacts].filter(Boolean).join(" ")),
    digits: row.contacts.replace(/[^\d ]/g, " "),
  })), [rows]);

  const matched = useMemo(() => {
    if (!words.length) return rows;
    return index.filter(({ text, digits }) => words.every((word) => {
      if (text.includes(word)) return true;
      const number = word.replace(/[\s+()-]/g, "");
      return /^\d{3,}$/.test(number) && digits.includes(number.replace(/^(256|0)/, ""));
    })).map(({ row }) => row);
  }, [index, rows, words]);

  const chosen = VIEWS.find((entry) => entry.value === view) ?? VIEWS[0];
  const inChosen = useMemo(() => matched.filter(chosen.test), [matched, chosen]);
  // A search that finds nobody in the chosen list widens to every pupil instead of showing nothing.
  const widened = words.length > 0 && !inChosen.length && matched.length > 0 && view !== "all";
  const active = widened ? VIEWS[VIEWS.length - 1] : chosen;
  const inView = widened ? matched : inChosen;
  const shown = useMemo(() => (cls ? inView.filter((row) => (cls === "none" ? !row.classCode : row.classCode === cls)) : inView), [inView, cls]);
  const viewCounts = useMemo(() => {
    const scoped = cls ? matched.filter((row) => (cls === "none" ? !row.classCode : row.classCode === cls)) : matched;
    return Object.fromEntries(VIEWS.map((entry) => [entry.value, scoped.filter(entry.test).length])) as Record<MedicalView, number>;
  }, [matched, cls]);

  const groups = useMemo(() => {
    const list = SCHOOL_CLASSES.map((entry) => ({ code: entry.code as string, name: entry.name as string, rows: shown.filter((row) => row.classCode === entry.code) }));
    list.push({ code: "none", name: "No class set", rows: shown.filter((row) => !row.classCode) });
    return list.filter((group) => group.rows.length);
  }, [shown]);

  const classCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of inView) counts.set(row.classCode ?? "none", (counts.get(row.classCode ?? "none") ?? 0) + 1);
    return counts;
  }, [inView]);

  // Start again from the first batch whenever the search or filters change.
  const batchKey = `${deferred}|${view}|${cls}`;
  const [batch, setBatch] = useState({ key: batchKey, limit: BATCH });
  const limit = batch.key === batchKey ? batch.limit : BATCH;
  const remaining = Math.max(0, shown.length - limit);
  const showMore = () => setBatch({ key: batchKey, limit: limit + BATCH });

  const visible = useMemo(() => {
    let budget = limit;
    return groups.map((group) => {
      const rowsShown = group.rows.slice(0, Math.max(0, budget));
      budget -= rowsShown.length;
      return { ...group, rowsShown };
    }).filter((group) => group.rowsShown.length);
  }, [groups, limit]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !remaining) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setBatch({ key: batchKey, limit: limit + BATCH });
    }, { rootMargin: "800px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [batchKey, limit, remaining]);

  const wordsKey = words.join(" ");

  const reset = () => {
    setQuery("");
    setCls("");
    search.current?.focus();
  };

  return (
    <div className="omd">
      <div className="omd-bar no-print">
        <div className="omd-search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <label className="visually-hidden" htmlFor="medical-search">Search the medical register</label>
          <input
            ref={search}
            id="medical-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.preventDefault();
                setQuery("");
              }
            }}
            placeholder="Search by name, student number, condition, parent or phone"
            autoComplete="off"
            spellCheck={false}
          />
          {query ? (
            <button type="button" className="omd-search-clear" onClick={() => { setQuery(""); search.current?.focus(); }} aria-label="Clear search">
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          ) : <kbd aria-hidden="true">/</kbd>}
        </div>

        <div className="omd-views" role="tablist" aria-label="Medical lists">
          {VIEWS.map((entry) => (
            <button
              key={entry.value}
              type="button"
              role="tab"
              aria-selected={view === entry.value}
              className={`omd-view is-${entry.value}${view === entry.value ? " is-on" : ""}`}
              onClick={() => setView(entry.value)}
            >
              <i className={`fa-solid ${entry.icon}`} aria-hidden="true" />
              <span>{entry.label}</span>
              <em>{viewCounts[entry.value]}</em>
            </button>
          ))}
        </div>

        <div className="omd-classes" aria-label="Class">
          <button type="button" className={cls ? "" : "is-on"} aria-pressed={!cls} onClick={() => setCls("")}>
            All classes <span>{inView.length}</span>
          </button>
          {SCHOOL_CLASSES.map((entry) => {
            const count = classCounts.get(entry.code) ?? 0;
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
          {classCounts.get("none") ? (
            <button type="button" className={cls === "none" ? "is-on" : ""} aria-pressed={cls === "none"} onClick={() => setCls(cls === "none" ? "" : "none")}>
              No class <span>{classCounts.get("none")}</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="omd-meta no-print">
        <p className="omd-summary" aria-live="polite">
          {shown.length ? (
            <>
              {widened ? <span className="omd-widened"><i className="fa-solid fa-circle-info" aria-hidden="true" /> Nobody on “{chosen.label}” matches, so here is everyone who does.</span> : null}
              <strong>{shown.length}</strong> {shown.length === 1 ? "pupil" : "pupils"} · {active.label.toLowerCase()}
              {cls ? ` · ${cls === "none" ? "no class set" : SCHOOL_CLASSES.find((entry) => entry.code === cls)?.name}` : groups.length > 1 ? ` · ${groups.length} classes` : ""}
              {words.length ? <> · matching <q>{deferred.trim()}</q></> : null}
            </>
          ) : "No pupils match"}
        </p>
        <label className="omd-paged" title="Useful for handing each class teacher their own sheet">
          <input type="checkbox" checked={paged} onChange={(event) => setPaged(event.target.checked)} />
          <span className="omd-switch" aria-hidden="true" />
          Print each class on its own page
        </label>
      </div>

      {printedAt ? (
        <MedicalPrint
          groups={groups}
          total={shown.length}
          list={active.label}
          scope={cls ? (cls === "none" ? "Pupils with no class set" : SCHOOL_CLASSES.find((entry) => entry.code === cls)?.name ?? cls) : "All classes"}
          search={deferred.trim()}
          printedAt={printedAt}
          printedBy={printedBy}
          paged={paged}
        />
      ) : null}

      {groups.length ? (
        <div className={`omd-groups${stale ? " is-stale" : ""}`}>
          {visible.map((group) => {
            const allergies = group.rows.filter((row) => ALLERGY.test(row.notes ?? "")).length;
            const noPanadol = group.rows.filter((row) => row.panadol === false).length;
            return (
              <section key={group.code} className="omd-class" aria-labelledby={`omd-${group.code}`}>
                <header className="omd-class-head">
                  <span className="omd-class-code">{group.code === "none" ? "–" : group.code}</span>
                  <div>
                    <h2 id={`omd-${group.code}`}>{group.name}</h2>
                    <p>
                      {group.rows.length} {group.rows.length === 1 ? "pupil" : "pupils"}
                      {allergies ? <span className="omd-dot is-allergy">{allergies} {allergies === 1 ? "allergy" : "allergies"}</span> : null}
                      {noPanadol ? <span className="omd-dot is-ban">{noPanadol} no Panadol</span> : null}
                    </p>
                  </div>
                  {group.code !== "none" ? (
                    <Link className="omd-class-link no-print" href={`${OFFICE}/classes/${group.code}`} aria-label={`Open ${group.name}`}>
                      Class list <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                    </Link>
                  ) : null}
                </header>
                <ul className="omd-list">
                  {group.rowsShown.map((row, index) => <PupilRow key={row.id} row={row} words={wordsKey} index={index} />)}
                </ul>
              </section>
            );
          })}
          {remaining ? (
            <div ref={sentinel} className="omd-more">
              <button type="button" className="admin-btn admin-btn-ghost" onClick={showMore}>
                Show {Math.min(BATCH, remaining)} more <span>· {remaining} not shown yet</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="omd-empty">
          <span><i className={`fa-solid ${words.length ? "fa-magnifying-glass" : "fa-heart-circle-check"}`} aria-hidden="true" /></span>
          <h2>{words.length ? "No pupils match your search" : "Nobody on this list"}</h2>
          <p>
            {words.length
              ? "Check the spelling, try part of a name or a condition such as “asthma”, or search every class."
              : cls ? "No pupils in this class are on this list." : "No pupils are on this list."}
          </p>
          {words.length || cls ? <button type="button" className="admin-btn admin-btn-ghost" onClick={reset}>Clear search and filters</button> : null}
        </div>
      )}
    </div>
  );
}

/** One pupil. Memoised so rows that stay on screen are not redrawn on every keystroke. */
const PupilRow = memo(function PupilRow({ row, words: wordsKey, index }: { row: MedicalRow; words: string; index: number }) {
  const words = wordsKey ? wordsKey.split(" ") : [];
  const allergy = ALLERGY.test(row.notes ?? "");
  const chronic = CHRONIC.test(row.notes ?? "");
  const tone = row.sex === "M" ? " is-boy" : row.sex === "F" ? " is-girl" : "";
  return (
    <li className={`omd-row${allergy ? " is-allergy" : ""}`} style={{ "--i": Math.min(index, 10) } as CSSProperties}>
      <span className={`omd-avatar${tone}${row.photo ? " has-photo" : ""}`} aria-hidden="true">
        {row.photo ? <img src={row.photo} alt="" loading="lazy" /> : initials(row.name)}
      </span>
      <div className="omd-who">
        <Link href={`${OFFICE}/students/${row.id}?tab=medical`}><Highlight text={row.name} words={words} /></Link>
        <small>
          <span className="omd-num"><Highlight text={row.number} words={words} /></span>
          {row.stream ? ` · ${row.classCode ?? ""} ${row.stream}` : ""}
          {row.age !== null ? ` · ${row.age} yrs` : ""}
          {row.preferred ? <> · “<Highlight text={row.preferred} words={words} />”</> : null}
        </small>
      </div>
      <div className="omd-notes">
        {allergy || chronic ? (
          <span className="omd-tags">
            {allergy ? <span className="omd-tag is-allergy"><i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> Allergy</span> : null}
            {chronic ? <span className="omd-tag is-condition"><i className="fa-solid fa-heart-pulse" aria-hidden="true" /> Condition</span> : null}
          </span>
        ) : null}
        {row.notes ? <p><Highlight text={row.notes} words={words} /></p> : <p className="omd-none">No medical notes</p>}
      </div>
      <span className={`omd-panadol is-${row.panadol === true ? "yes" : row.panadol === false ? "no" : "unknown"}`}>
        <i className={`fa-solid ${row.panadol === true ? "fa-check" : row.panadol === false ? "fa-ban" : "fa-question"}`} aria-hidden="true" />
        {row.panadol === true ? "Panadol OK" : row.panadol === false ? "No Panadol" : "Not asked"}
      </span>
      <div className="omd-call">
        {row.phone ? (
          <a href={telHref(row.phone)} title={`Call ${row.phoneName ?? "parent"}`}>
            <i className="fa-solid fa-phone" aria-hidden="true" />
            <span>
              {displayPhone(row.phone)}
              <small>{row.phoneName ? <Highlight text={row.phoneName} words={words} /> : "Parent"}</small>
            </span>
          </a>
        ) : <span className="omd-none">No phone on file</span>}
      </div>
    </li>
  );
});

type PrintGroup = { code: string; name: string; rows: MedicalRow[] };

/** The paper copy: hidden on screen, it replaces the whole page when printing. */
function MedicalPrint({ groups, total, list, scope, search, printedAt, printedBy, paged }: {
  groups: PrintGroup[];
  total: number;
  list: string;
  scope: string;
  search: string;
  printedAt: string;
  printedBy: string;
  paged: boolean;
}) {
  const everyone = groups.flatMap((group) => group.rows);
  const summary = [
    { label: "Pupils listed", value: total },
    { label: "Allergies", value: everyone.filter((row) => ALLERGY.test(row.notes ?? "")).length, tone: "allergy" },
    { label: "Ongoing conditions", value: everyone.filter((row) => CHRONIC.test(row.notes ?? "")).length, tone: "condition" },
    { label: "No Panadol", value: everyone.filter((row) => row.panadol === false).length, tone: "no" },
    { label: "Panadol not asked", value: everyone.filter((row) => row.panadol === null).length },
  ];

  return (
    <div className={`omd-print${paged ? " is-paged" : ""}`} aria-hidden="true">
      <header className="omd-print-head">
        <img src="/images/kja-logo.png" alt="" />
        <div className="omd-print-title">
          <p>Admissions office</p>
          <h1>Medical register</h1>
          <span>{list} · {scope}{search ? ` · matching “${search}”` : ""}</span>
        </div>
        <div className="omd-print-stamp">
          <strong>Confidential</strong>
          <span>Staff use only</span>
        </div>
      </header>

      <dl className="omd-print-meta">
        <div><dt>Printed</dt><dd>{printedAt}</dd></div>
        <div><dt>Printed by</dt><dd>{printedBy}</dd></div>
        <div><dt>Copy for</dt><dd>{paged ? "Class teachers" : "Sick bay"}</dd></div>
      </dl>

      <ul className="omd-print-summary">
        {summary.map((item) => (
          <li key={item.label} className={item.tone ? `is-${item.tone}` : ""}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>

      <p className="omd-print-key">
        <span><b className="omd-print-tag is-allergy">Allergy</b> notes mention an allergy</span>
        <span><b className="omd-print-tag is-condition">Condition</b> asthma, epilepsy, diabetes and similar</span>
        <span><b className="omd-print-pan is-no">✕ No</b> do not give Panadol</span>
        <span><b className="omd-print-pan is-unknown">?</b> parents not yet asked</span>
      </p>

      {groups.length ? groups.map((group) => {
        const allergies = group.rows.filter((row) => ALLERGY.test(row.notes ?? "")).length;
        const noPanadol = group.rows.filter((row) => row.panadol === false).length;
        return (
          <section key={group.code} className="omd-print-class">
            <h2>
              <span className="omd-print-code">{group.code === "none" ? "–" : group.code}</span>
              <span className="omd-print-name">{group.name}</span>
              <small>
                {group.rows.length} {group.rows.length === 1 ? "pupil" : "pupils"}
                {allergies ? ` · ${allergies} ${allergies === 1 ? "allergy" : "allergies"}` : ""}
                {noPanadol ? ` · ${noPanadol} no Panadol` : ""}
              </small>
            </h2>
            <table>
              <colgroup>
                <col className="omd-pc-n" />
                <col className="omd-pc-pupil" />
                <col className="omd-pc-notes" />
                <col className="omd-pc-pan" />
                <col className="omd-pc-call" />
              </colgroup>
              <thead>
                <tr><th>#</th><th>Pupil</th><th>Medical notes</th><th>Panadol</th><th>Parent to call</th></tr>
              </thead>
              <tbody>
                {group.rows.map((row, index) => {
                  const allergy = ALLERGY.test(row.notes ?? "");
                  const chronic = CHRONIC.test(row.notes ?? "");
                  return (
                    <tr key={row.id} className={allergy ? "is-allergy" : ""}>
                      <td className="omd-print-n">{index + 1}</td>
                      <td>
                        <strong>{row.name}</strong>
                        <small>{[row.number, row.stream ? `${row.classCode ?? ""} ${row.stream}`.trim() : null, row.age !== null ? `${row.age} yrs` : null].filter(Boolean).join(" · ")}</small>
                      </td>
                      <td>
                        {allergy ? <b className="omd-print-tag is-allergy">Allergy</b> : null}
                        {chronic ? <b className="omd-print-tag is-condition">Condition</b> : null}
                        {row.notes ? <span className="omd-print-note">{row.notes}</span> : <span className="omd-print-none">No medical notes</span>}
                      </td>
                      <td>
                        <b className={`omd-print-pan is-${row.panadol === true ? "yes" : row.panadol === false ? "no" : "unknown"}`}>
                          {row.panadol === true ? "✓ Yes" : row.panadol === false ? "✕ No" : "? Not asked"}
                        </b>
                      </td>
                      <td>
                        {row.phone ? (
                          <>
                            <strong className="omd-print-phone">{displayPhone(row.phone)}</strong>
                            <small>{row.phoneName ?? "Parent"}</small>
                          </>
                        ) : <span className="omd-print-none">No phone on file</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      }) : <p className="omd-print-empty">No pupils are on this list.</p>}

      <footer className="omd-print-sign">
        <p>Tell the admissions office about any change to a pupil’s health so the register stays up to date. Keep this sheet out of sight of pupils and visitors.</p>
        <div>
          <span>Checked by</span>
          <span>Signature</span>
          <span>Date</span>
        </div>
      </footer>
    </div>
  );
}
