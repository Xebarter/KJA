"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { bulkUpdateStudents, type BulkChange } from "@/app/admissions_office/(office)/students/actions";
import { Highlight, fold, queryWords } from "@/components/office/ClassFinder";
import { Feedback, useOfficeAction } from "@/components/office/client";
import { StudentPhoto } from "@/components/office/StudentPhoto";
import { formatDate } from "@/lib/applications";
import { HOUSES, OFFICE, SCHOOL_CLASSES, STREAMS, displayPhone, telHref } from "@/lib/students";

export type RosterRow = {
  id: string;
  student_number: string;
  full_name: string;
  preferred_name: string | null;
  sex: string | null;
  date_of_birth: string | null;
  age: number | null;
  stream: string | null;
  house: string | null;
  medical_notes: string | null;
  panadol_allowed: boolean | null;
  father_name: string | null;
  father_phone: string | null;
  mother_name: string | null;
  mother_phone: string | null;
  needs_review: boolean | null;
  photo_url: string | null;
  outlier: string | null;
};

type Sort = "default" | "name" | "age" | "number";
type Mode = "stream" | "house" | "class_code";

const MODE_LABELS: Record<Mode, string> = { stream: "Move to stream", house: "Place in house", class_code: "Move to class" };

/** A class list with instant filtering and a bar for moving selected pupils between streams, houses and classes. Prints as a clean register. */
export function ClassRoster({ rows, streams, classCode, showStream, initialQuery = "", wholeClassHref = null }: {
  rows: RosterRow[];
  streams: string[];
  classCode: string;
  showStream: boolean;
  initialQuery?: string;
  /** Set on a stream's list, to widen a search to the whole class. */
  wholeClassHref?: string | null;
}) {
  const router = useRouter();
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const deferred = useDeferredValue(query);
  const [sex, setSex] = useState<"" | "M" | "F">("");
  const [sort, setSort] = useState<Sort>("default");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>("stream");
  const [target, setTarget] = useState("");
  const { result, setResult, pending, run } = useOfficeAction();

  const ids = useMemo(() => rows.map((row) => row.id), [rows]);
  useEffect(() => setSelected((current) => new Set([...current].filter((id) => ids.includes(id)))), [ids]);

  // Each pupil's searchable text is folded once, so filtering on every key press stays instant.
  const index = useMemo(
    () => rows.map((row) => ({ row, hay: fold([row.full_name, row.preferred_name, row.student_number, row.father_name, row.mother_name].filter(Boolean).join(" ")) })),
    [rows],
  );
  const words = useMemo(() => queryWords(deferred), [deferred]);
  const shown = useMemo(() => {
    const list = index
      .filter(({ row, hay }) => (!sex || row.sex === sex) && words.every((word) => hay.includes(word)))
      .map(({ row }) => row);
    if (sort === "name") list.sort((a, b) => a.full_name.localeCompare(b.full_name));
    if (sort === "age") list.sort((a, b) => (b.date_of_birth ?? "").localeCompare(a.date_of_birth ?? ""));
    if (sort === "number") list.sort((a, b) => a.student_number.localeCompare(b.student_number, undefined, { numeric: true }));
    return list;
  }, [index, sex, sort, words]);

  // Keep the search in the address bar, so a refresh or the back button returns to it.
  useEffect(() => {
    const url = new URL(window.location.href);
    const needle = deferred.trim();
    if ((url.searchParams.get("q") ?? "") === needle) return;
    if (needle) url.searchParams.set("q", needle);
    else url.searchParams.delete("q");
    window.history.replaceState(window.history.state, "", url);
  }, [deferred]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      event.preventDefault();
      search.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const boys = rows.filter((row) => row.sex === "M").length;
  const girls = rows.filter((row) => row.sex === "F").length;
  const allShown = shown.length > 0 && shown.every((row) => selected.has(row.id));
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const streamOptions = [...new Set([...streams, ...STREAMS])];
  const options: { value: string; label: string }[] =
    mode === "stream" ? [...streamOptions.map((value) => ({ value, label: `Stream ${value}` })), { value: "", label: "No stream" }]
    : mode === "house" ? [...HOUSES.map((value) => ({ value, label: value })), { value: "", label: "No house" }]
    : SCHOOL_CLASSES.filter((entry) => entry.code !== classCode).map((entry) => ({ value: entry.code, label: `${entry.code} · ${entry.name}` }));

  const apply = () => {
    const chosen = target || (mode === "class_code" ? options[0].value : "");
    const label = options.find((option) => option.value === chosen)?.label ?? "none";
    if (!window.confirm(`${MODE_LABELS[mode]}: ${label} for ${selected.size} pupil${selected.size === 1 ? "" : "s"}?`)) return;
    const change: BulkChange = { [mode]: chosen };
    run(() => bulkUpdateStudents([...selected], change), () => setSelected(new Set()));
  };

  const filtered = Boolean(words.length || sex);
  const widen = wholeClassHref && words.length ? `${wholeClassHref}?q=${encodeURIComponent(deferred.trim())}` : null;

  return (
    <div className="ofc-cls-roster">
      <div className="ofc-cls-tools no-print">
        <label className="ofc-cls-search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <span className="visually-hidden">Find a pupil in this list</span>
          <input
            ref={search}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setQuery("");
              if (event.key === "Enter" && query.trim() && shown[0]) {
                event.preventDefault();
                router.push(`${OFFICE}/students/${shown[0].id}`);
              }
            }}
            placeholder="Find a pupil, number or parent"
            autoComplete="off"
            spellCheck={false}
          />
          {query ? null : <kbd className="ocl-finder-key" aria-hidden="true">/</kbd>}
        </label>
        <div className="ofc-cls-seg" role="group" aria-label="Boys or girls">
          {([["", `All ${rows.length}`], ["M", `Boys ${boys}`], ["F", `Girls ${girls}`]] as const).map(([value, label]) => (
            <button key={value || "all"} type="button" className={sex === value ? "is-on" : ""} aria-pressed={sex === value} onClick={() => setSex(value)}>
              {label}
            </button>
          ))}
        </div>
        <label className="ofc-cls-sort">
          <span>Sort</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
            <option value="default">{showStream ? "Stream, then name" : "Name"}</option>
            {showStream ? <option value="name">Name</option> : null}
            <option value="age">Youngest first</option>
            <option value="number">Student number</option>
          </select>
        </label>
      </div>

      {selected.size ? (
        <div className="app-bulk ofc-bulk ofc-cls-bulk no-print" role="region" aria-label="Move selected pupils">
          <strong>{selected.size} selected</strong>
          <select aria-label="What to change" value={mode} onChange={(event) => { setMode(event.target.value as Mode); setTarget(""); setResult(null); }}>
            {(Object.keys(MODE_LABELS) as Mode[]).map((key) => <option key={key} value={key}>{MODE_LABELS[key]}</option>)}
          </select>
          <select aria-label="Move to" value={target} onChange={(event) => setTarget(event.target.value)}>
            {options.map((option) => <option key={option.value || "none"} value={option.value}>{option.label}</option>)}
          </select>
          <button type="button" className="admin-btn admin-btn-gold" disabled={pending} onClick={apply}>
            {pending ? "Moving…" : "Apply"}
          </button>
          <button type="button" className="app-link-btn app-bulk-close" onClick={() => setSelected(new Set())} aria-label="Clear selection">
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <Feedback result={result} className="ofc-cls-feedback" />

      {filtered ? (
        <p className="ofc-cls-count no-print">
          Showing {shown.length} of {rows.length}
          {words.length && shown.length ? <span className="ofc-cls-enter"><kbd>Enter</kbd> opens {shown[0].preferred_name || shown[0].full_name.split(/\s+/)[0]}</span> : null}
          {widen ? <Link href={widen} className="app-link-btn">Search the whole class</Link> : null}
          <button type="button" className="app-link-btn" onClick={() => { setQuery(""); setSex(""); }}>Show everyone</button>
        </p>
      ) : null}

      {shown.length ? (
        <div className="ofc-table-scroll">
          <table className={`app-table ofc-table ofc-reg-table ofc-cls-table${pending ? " is-busy" : ""}`}>
            <thead>
              <tr>
                <th className="app-col-check">
                  <input
                    type="checkbox"
                    aria-label="Select every pupil shown"
                    checked={allShown}
                    onChange={() => setSelected((current) => {
                      const next = new Set(current);
                      for (const row of shown) {
                        if (allShown) next.delete(row.id);
                        else next.add(row.id);
                      }
                      return next;
                    })}
                  />
                </th>
                <th className="ofc-col-n">#</th>
                <th>Pupil</th>
                <th className="ofc-col-age">Age</th>
                {showStream ? <th className="ofc-col-stream">Stream</th> : null}
                <th className="ofc-col-house">House</th>
                <th className="ofc-col-parents">Parents</th>
                <th className="ofc-print-col">Notes</th>
                <th className="ofc-col-go"><span className="visually-hidden">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row, index) => {
                const parents = [
                  { role: "Mother", name: row.mother_name, phone: row.mother_phone },
                  { role: "Father", name: row.father_name, phone: row.father_phone },
                ].filter((parent) => parent.name || parent.phone);
                return (
                  <tr
                    key={row.id}
                    className={selected.has(row.id) ? "is-selected" : ""}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("a, button, input, label")) return;
                      router.push(`${OFFICE}/students/${row.id}`);
                    }}
                  >
                    <td className="app-col-check">
                      <input type="checkbox" aria-label={`Select ${row.full_name}`} checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                    </td>
                    <td className="ofc-col-n">{index + 1}</td>
                    <td className="ofc-col-student">
                      <div className="ofc-who">
                        <StudentPhoto id={row.id} name={row.full_name} url={row.photo_url} sex={row.sex} />
                        <div>
                          <Link href={`${OFFICE}/students/${row.id}`} className="ofc-who-name"><Highlight text={row.full_name} words={words} /></Link>
                          <span className="ofc-who-meta">
                            <span className="ofc-num"><Highlight text={row.student_number} words={words} /></span>
                            {row.preferred_name ? <span>Known as <Highlight text={row.preferred_name} words={words} /></span> : null}
                          </span>
                          {row.medical_notes || row.panadol_allowed === false || row.outlier || row.needs_review ? (
                            <span className="ofc-row-flags">
                              {row.medical_notes ? (
                                <Link href={`${OFFICE}/students/${row.id}?tab=medical`} className="ofc-row-flag is-med" title={row.medical_notes}>
                                  <i className="fa-solid fa-notes-medical" aria-hidden="true" /> Medical
                                </Link>
                              ) : null}
                              {row.panadol_allowed === false ? <span className="ofc-row-flag is-danger"><i className="fa-solid fa-ban" aria-hidden="true" /> No Panadol</span> : null}
                              {row.outlier ? <span className="ofc-row-flag is-warn" title={row.outlier}><i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> Age</span> : null}
                              {row.needs_review ? <span className="ofc-row-flag is-warn" title="Imported details that need checking"><i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> Review</span> : null}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="ofc-col-age">
                      {row.age !== null ? <span className="ofc-age">{row.age} <span>yrs</span></span> : <span className="app-muted">–</span>}
                      {row.date_of_birth ? <small>{formatDate(row.date_of_birth)}</small> : null}
                    </td>
                    {showStream ? (
                      <td className="ofc-col-stream">{row.stream ? <span className="ofc-cls-stream">{row.stream}</span> : <span className="app-muted">–</span>}</td>
                    ) : null}
                    <td className="ofc-col-house">
                      {row.house ? <span className={`ofc-house is-${row.house.toLowerCase()}`}>{row.house}</span> : <span className="app-muted">–</span>}
                    </td>
                    <td className="ofc-col-parents">
                      {parents.length ? (
                        <dl className="ofc-reg-contacts">
                          {parents.map((parent) => (
                            <div key={parent.role}>
                              <dt>{parent.role}</dt>
                              <dd>
                                <span>{parent.name ? <Highlight text={parent.name} words={words} /> : <span className="app-muted">Name not recorded</span>}</span>
                                {parent.phone ? (
                                  <a href={telHref(parent.phone)} title={`Call ${parent.name || parent.role.toLowerCase()}`}>
                                    <i className="fa-solid fa-phone" aria-hidden="true" /> {displayPhone(parent.phone)}
                                  </a>
                                ) : null}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      ) : <span className="app-muted">No parents on file</span>}
                    </td>
                    <td className="ofc-print-col">{row.medical_notes ? "Medical" : ""}{row.panadol_allowed === false ? " · No Panadol" : ""}</td>
                    <td className="ofc-col-go" aria-hidden="true"><i className="fa-solid fa-chevron-right" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="ofc-cls-none">
          <i className="fa-regular fa-face-meh" aria-hidden="true" /> No pupils match{wholeClassHref ? " in this stream" : ""}.{" "}
          {widen ? <><Link href={widen} className="app-link-btn">Search the whole class</Link>{" · "}</> : null}
          <button type="button" className="app-link-btn" onClick={() => { setQuery(""); setSex(""); }}>Show everyone</button>
        </p>
      )}
    </div>
  );
}
