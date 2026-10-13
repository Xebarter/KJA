"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { bulkUpdateStudents, type BulkChange } from "@/app/admissions_office/(office)/students/actions";
import { Feedback, useOfficeAction } from "@/components/office/client";
import { StudentPhoto } from "@/components/office/StudentPhoto";
import {
  HOUSES,
  OFFICE,
  PAGE_SIZES,
  SCHOOL_CLASSES,
  SECTIONS,
  STREAMS,
  STUDENT_SORTS,
  STUDENT_STATUSES,
  className,
  displayPhone,
  studentFilterHref,
  studentStatusInfo,
  telHref,
  type StudentFilters,
} from "@/lib/students";
import { CAMPUS_OPTIONS, formatDate } from "@/lib/applications";

function activeFilters(filters: StudentFilters) {
  const pills: { key: string; label: string; changes: Partial<StudentFilters> }[] = [];
  if (filters.q) pills.push({ key: "q", label: `Search: “${filters.q}”`, changes: { q: "" } });
  if (filters.status !== "active") {
    pills.push({ key: "status", label: filters.status === "all" ? "Any status" : `Status: ${studentStatusInfo(filters.status).label}`, changes: { status: "active" } });
  }
  if (filters.section) pills.push({ key: "section", label: `Section: ${SECTIONS.find((entry) => entry.value === filters.section)?.label ?? filters.section}`, changes: { section: "", class: "" } });
  if (filters.class) pills.push({ key: "class", label: `Class: ${className(filters.class)}`, changes: { class: "" } });
  if (filters.stream) pills.push({ key: "stream", label: `Stream ${filters.stream}`, changes: { stream: "" } });
  if (filters.house) pills.push({ key: "house", label: filters.house === "none" ? "No house" : `House: ${filters.house}`, changes: { house: "" } });
  if (filters.sex) pills.push({ key: "sex", label: filters.sex === "M" ? "Boys" : "Girls", changes: { sex: "" } });
  if (filters.medical) pills.push({ key: "medical", label: "Medical notes", changes: { medical: false } });
  if (filters.staff) pills.push({ key: "staff", label: "Staff children", changes: { staff: false } });
  if (filters.review) pills.push({ key: "review", label: "Needs review", changes: { review: false } });
  return pills;
}

const SEARCH_DELAY_MS = 180;

export function StudentFinder({ filters, streams }: { filters: StudentFilters; streams: string[] }) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q);
  const [searching, startSearch] = useTransition();
  // The search last sent to the server, so results arriving late don't overwrite what is being typed.
  const sent = useRef(filters.q);
  useEffect(() => {
    if (filters.q === sent.current) return;
    sent.current = filters.q;
    setQ(filters.q);
  }, [filters.q]);

  const go = (changes: Partial<StudentFilters>) => {
    const next = { q: q.trim(), ...changes };
    sent.current = next.q;
    router.push(studentFilterHref(filters, next), { scroll: false });
  };

  const search = (needle: string) => {
    sent.current = needle;
    startSearch(() => router.replace(studentFilterHref(filters, { q: needle }), { scroll: false }));
  };

  useEffect(() => {
    const needle = q.trim();
    if (needle === sent.current) return;
    const timer = window.setTimeout(() => search(needle), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [q]);

  const pills = activeFilters(filters);
  const streamOptions = [...new Set([...STREAMS, ...streams])].sort();

  return (
    <div className="ofc-finder">
      <div className="ofc-finder-top">
        <form
          className={`ofc-finder-search${searching ? " is-searching" : ""}`}
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            search(q.trim());
          }}
        >
          <label className="visually-hidden" htmlFor="student-search">Search students</label>
          <i className={`fa-solid ${searching ? "fa-spinner fa-spin" : "fa-magnifying-glass"}`} aria-hidden="true" />
          <input
            id="student-search"
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && q) {
                event.preventDefault();
                setQ("");
              }
            }}
            placeholder="Start typing a name, student number, family code, parent or phone"
            autoComplete="off"
            aria-busy={searching}
          />
          <button type="submit" className="admin-btn">Search</button>
        </form>
        <label className="ofc-finder-field is-inline">
          <span>Sort</span>
          <select value={filters.sort} onChange={(event) => go({ sort: event.target.value as StudentFilters["sort"] })}>
            {STUDENT_SORTS.map((sort) => <option key={sort.value} value={sort.value}>{sort.label}</option>)}
          </select>
        </label>
        <label className="ofc-finder-field is-inline">
          <span>Show</span>
          <select value={filters.size} onChange={(event) => go({ size: Number(event.target.value) })}>
            {PAGE_SIZES.map((size) => <option key={size} value={size}>{size} rows</option>)}
          </select>
        </label>
      </div>

      <div className="ofc-finder-grid">
        <label className="ofc-finder-field">
          <span>Status</span>
          <select value={filters.status} onChange={(event) => go({ status: event.target.value })}>
            {STUDENT_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            <option value="all">Any status</option>
          </select>
        </label>
        <label className="ofc-finder-field">
          <span>Section</span>
          <select value={filters.section} onChange={(event) => go({ section: event.target.value, class: "" })}>
            <option value="">Nursery and primary</option>
            {SECTIONS.map((section) => <option key={section.value} value={section.value}>{section.label}</option>)}
          </select>
        </label>
        <label className="ofc-finder-field">
          <span>Class</span>
          <select value={filters.class} onChange={(event) => go({ class: event.target.value })}>
            <option value="">Every class</option>
            {SCHOOL_CLASSES.filter((entry) => !filters.section || entry.section === filters.section).map((entry) => (
              <option key={entry.code} value={entry.code}>{entry.name} ({entry.code})</option>
            ))}
          </select>
        </label>
        <label className="ofc-finder-field">
          <span>Stream</span>
          <select value={filters.stream} onChange={(event) => go({ stream: event.target.value })}>
            <option value="">Any stream</option>
            {streamOptions.map((stream) => <option key={stream} value={stream}>Stream {stream}</option>)}
          </select>
        </label>
        <label className="ofc-finder-field">
          <span>House</span>
          <select value={filters.house} onChange={(event) => go({ house: event.target.value })}>
            <option value="">Any house</option>
            {HOUSES.map((house) => <option key={house} value={house}>{house}</option>)}
            <option value="none">No house</option>
          </select>
        </label>
        <label className="ofc-finder-field">
          <span>Sex</span>
          <select value={filters.sex} onChange={(event) => go({ sex: event.target.value })}>
            <option value="">Boys and girls</option>
            <option value="M">Boys</option>
            <option value="F">Girls</option>
          </select>
        </label>
      </div>

      {pills.length ? (
        <div className="ofc-finder-active" aria-label="Active filters">
          <span>Filtered by</span>
          <ul>
            {pills.map((pill) => (
              <li key={pill.key}>
                <Link href={studentFilterHref(filters, pill.changes)} scroll={false} aria-label={`Remove filter ${pill.label}`}>
                  {pill.label} <i className="fa-solid fa-xmark" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          {pills.length > 1 ? (
            <Link
              className="ofc-finder-clear"
              href={studentFilterHref(filters, { q: "", status: "active", section: "", class: "", stream: "", house: "", sex: "", staff: false, medical: false, review: false })}
              scroll={false}
            >
              Clear all
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export type RegisterRow = {
  id: string;
  student_number: string;
  full_name: string;
  preferred_name: string | null;
  sex: string | null;
  age: number | null;
  date_of_birth: string | null;
  class_code: string | null;
  stream: string | null;
  house: string | null;
  campus: string | null;
  status: string;
  staff_child: boolean;
  medical_notes: string | null;
  needs_review: boolean;
  family_id: string | null;
  family_code: string | null;
  father_name: string | null;
  father_phone: string | null;
  mother_name: string | null;
  mother_phone: string | null;
  siblings: number;
  photo_path?: string | null;
  photo_url?: string | null;
};

type BulkKind = "class_code" | "stream" | "house" | "campus" | "status";

const BULK_LABELS: Record<BulkKind, string> = {
  class_code: "Move to class",
  stream: "Set stream",
  house: "Set house",
  campus: "Set campus",
  status: "Change status",
};

export function StudentTable({ rows, exportHref }: { rows: RegisterRow[]; exportHref: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<BulkKind>("class_code");
  const [value, setValue] = useState("");
  const { result, setResult, pending, run } = useOfficeAction();
  const ids = useMemo(() => rows.map((row) => row.id), [rows]);
  useEffect(() => setSelected((current) => new Set([...current].filter((id) => ids.includes(id)))), [ids]);

  const all = rows.length > 0 && selected.size === rows.length;
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const options: { value: string; label: string }[] =
    kind === "class_code" ? SCHOOL_CLASSES.map((entry) => ({ value: entry.code, label: `${entry.code} · ${entry.name}` }))
    : kind === "stream" ? [...STREAMS.map((stream) => ({ value: stream, label: `Stream ${stream}` })), { value: "", label: "No stream" }]
    : kind === "house" ? [...HOUSES.map((house) => ({ value: house, label: house })), { value: "", label: "No house" }]
    : kind === "campus" ? [...CAMPUS_OPTIONS.map((campus) => ({ value: campus, label: campus })), { value: "", label: "No campus" }]
    : STUDENT_STATUSES.map((status) => ({ value: status.value, label: status.label }));

  const apply = () => {
    const chosen = value || (kind === "class_code" || kind === "status" ? options[0].value : "");
    const label = options.find((option) => option.value === chosen)?.label ?? chosen;
    if (!window.confirm(`${BULK_LABELS[kind]}: ${label || "none"} for ${selected.size} student${selected.size === 1 ? "" : "s"}?`)) return;
    const change: BulkChange = { [kind]: chosen };
    run(() => bulkUpdateStudents([...selected], change), () => setSelected(new Set()));
  };

  const exportSelected = `${exportHref}${exportHref.includes("?") ? "&" : "?"}ids=${[...selected].join(",")}`;

  return (
    <div className="app-table-wrap">
      {selected.size ? (
        <div className="app-bulk ofc-bulk" role="region" aria-label="Bulk actions">
          <strong>{selected.size} selected</strong>
          <select aria-label="What to change" value={kind} onChange={(event) => { setKind(event.target.value as BulkKind); setValue(""); setResult(null); }}>
            {(Object.keys(BULK_LABELS) as BulkKind[]).map((key) => <option key={key} value={key}>{BULK_LABELS[key]}</option>)}
          </select>
          <select aria-label="New value" value={value} onChange={(event) => setValue(event.target.value)}>
            {options.map((option) => <option key={option.value || "none"} value={option.value}>{option.label}</option>)}
          </select>
          <button type="button" className="admin-btn admin-btn-gold" disabled={pending} onClick={apply}>
            {pending ? "Saving…" : "Apply"}
          </button>
          <a className="app-link-btn" href={exportSelected}><i className="fa-solid fa-file-csv" aria-hidden="true" /> Export selected</a>
          <button type="button" className="app-link-btn app-bulk-close" onClick={() => setSelected(new Set())} aria-label="Clear selection">
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <Feedback result={result} />
      <div className="ofc-table-scroll">
        <table className={`app-table ofc-table ofc-reg-table${pending ? " is-busy" : ""}`}>
          <thead>
            <tr>
              <th className="app-col-check">
                <input
                  type="checkbox"
                  aria-label="Select every student on this page"
                  checked={all}
                  onChange={() => setSelected(all ? new Set() : new Set(ids))}
                />
              </th>
              <th>Student</th>
              <th>Class</th>
              <th className="ofc-col-age">Age</th>
              <th className="ofc-col-parents">Parents</th>
              <th className="ofc-col-house">House</th>
              <th>Status</th>
              <th className="ofc-col-go"><span className="visually-hidden">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const status = studentStatusInfo(row.status);
              const parents = [
                { role: "Father", name: row.father_name, phone: row.father_phone },
                { role: "Mother", name: row.mother_name, phone: row.mother_phone },
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
                  <td className="ofc-col-student">
                    <div className="ofc-who">
                      <StudentPhoto id={row.id} name={row.full_name} url={row.photo_url ?? null} sex={row.sex} />
                      <div>
                        <Link href={`${OFFICE}/students/${row.id}`} className="ofc-who-name">{row.full_name}</Link>
                        <span className="ofc-who-meta">
                          <span className="ofc-num">{row.student_number}</span>
                          {row.preferred_name ? <span>Known as {row.preferred_name}</span> : null}
                          {row.siblings && row.family_id ? (
                            <Link href={`${OFFICE}/families/${row.family_id}`}>
                              {row.siblings} sibling{row.siblings === 1 ? "" : "s"}
                            </Link>
                          ) : null}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="ofc-col-class">
                    <span className="ofc-class-name">{row.class_code ? className(row.class_code) : <span className="app-muted">No class</span>}</span>
                    <span className="ofc-class-meta">
                      {row.class_code ? <span className="ofc-num">{row.class_code}</span> : null}
                      {row.stream ? <span className="ofc-stream">Stream {row.stream}</span> : null}
                      {row.campus ? <span>{row.campus}</span> : null}
                    </span>
                  </td>
                  <td className="ofc-col-age">
                    {row.age !== null ? <span className="ofc-age">{row.age} <span>yrs</span></span> : <span className="app-muted">–</span>}
                    {row.date_of_birth ? <small>{formatDate(row.date_of_birth)}</small> : null}
                  </td>
                  <td className="ofc-col-parents">
                    {parents.length ? (
                      <dl className="ofc-reg-contacts">
                        {parents.map((parent) => (
                          <div key={parent.role}>
                            <dt>{parent.role}</dt>
                            <dd>
                              <span>{parent.name || <span className="app-muted">Name not recorded</span>}</span>
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
                  <td className="ofc-col-house">
                    {row.house ? <span className={`ofc-house is-${row.house.toLowerCase()}`}>{row.house}</span> : <span className="app-muted">–</span>}
                  </td>
                  <td className="ofc-col-status">
                    <span className={`app-status app-status-${status.tone}`}>{status.label}</span>
                    {row.needs_review || row.medical_notes || row.staff_child ? (
                      <span className="ofc-row-flags">
                        {row.medical_notes ? (
                          <span className="ofc-row-flag is-med" title={row.medical_notes}><i className="fa-solid fa-notes-medical" aria-hidden="true" /> Medical</span>
                        ) : null}
                        {row.staff_child ? (
                          <span className="ofc-row-flag is-staff"><i className="fa-solid fa-id-badge" aria-hidden="true" /> Staff child</span>
                        ) : null}
                        {row.needs_review ? (
                          <span className="ofc-row-flag is-warn" title="Imported details that need checking"><i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> Review</span>
                        ) : null}
                      </span>
                    ) : null}
                  </td>
                  <td className="ofc-col-go" aria-hidden="true"><i className="fa-solid fa-chevron-right" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
