"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { bulkUpdateStudents, type BulkChange } from "@/app/admissions_office/(office)/students/actions";
import { Feedback, useOfficeAction } from "@/components/office/client";
import {
  HOUSES,
  OFFICE,
  PAGE_SIZES,
  SCHOOL_CLASSES,
  SECTIONS,
  STREAMS,
  STUDENT_SORTS,
  STUDENT_STATUSES,
  displayPhone,
  studentFilterHref,
  studentStatusInfo,
  type StudentFilters,
} from "@/lib/students";
import { CAMPUS_OPTIONS } from "@/lib/applications";

export function StudentFiltersBar({ filters, streams }: { filters: StudentFilters; streams: string[] }) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q);
  useEffect(() => setQ(filters.q), [filters.q]);
  const go = (changes: Partial<StudentFilters>) => router.push(studentFilterHref(filters, changes));
  const active = [filters.q, filters.section, filters.class, filters.stream, filters.house, filters.sex, filters.staff, filters.medical, filters.review, filters.status !== "active"].filter(Boolean).length;
  const streamOptions = [...new Set([...STREAMS, ...streams])].sort();

  return (
    <div className="ofc-filters">
      <form
        className="app-search ofc-filter-search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          go({ q: q.trim() });
        }}
      >
        <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
        <label className="visually-hidden" htmlFor="student-search">Search students</label>
        <input
          id="student-search"
          type="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Name, student number, family code, parent or phone"
        />
      </form>
      <div className="ofc-filter-row">
        <select aria-label="Status" value={filters.status} onChange={(event) => go({ status: event.target.value })}>
          {STUDENT_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          <option value="all">Any status</option>
        </select>
        <select aria-label="Section" value={filters.section} onChange={(event) => go({ section: event.target.value, class: "" })}>
          <option value="">Nursery and primary</option>
          {SECTIONS.map((section) => <option key={section.value} value={section.value}>{section.label}</option>)}
        </select>
        <select aria-label="Class" value={filters.class} onChange={(event) => go({ class: event.target.value })}>
          <option value="">Every class</option>
          {SCHOOL_CLASSES.filter((entry) => !filters.section || entry.section === filters.section).map((entry) => (
            <option key={entry.code} value={entry.code}>{entry.code} · {entry.name}</option>
          ))}
        </select>
        <select aria-label="Stream" value={filters.stream} onChange={(event) => go({ stream: event.target.value })}>
          <option value="">Any stream</option>
          {streamOptions.map((stream) => <option key={stream} value={stream}>Stream {stream}</option>)}
        </select>
        <select aria-label="House" value={filters.house} onChange={(event) => go({ house: event.target.value })}>
          <option value="">Any house</option>
          {HOUSES.map((house) => <option key={house} value={house}>{house}</option>)}
          <option value="none">No house</option>
        </select>
        <select aria-label="Sex" value={filters.sex} onChange={(event) => go({ sex: event.target.value })}>
          <option value="">Boys and girls</option>
          <option value="M">Boys</option>
          <option value="F">Girls</option>
        </select>
        <select aria-label="Sort" value={filters.sort} onChange={(event) => go({ sort: event.target.value as StudentFilters["sort"] })}>
          {STUDENT_SORTS.map((sort) => <option key={sort.value} value={sort.value}>{sort.label}</option>)}
        </select>
      </div>
      <div className="ofc-chips">
        <button type="button" className={filters.staff ? "is-on" : ""} aria-pressed={filters.staff} onClick={() => go({ staff: !filters.staff })}>
          <i className="fa-solid fa-id-badge" aria-hidden="true" /> Staff children
        </button>
        <button type="button" className={filters.medical ? "is-on" : ""} aria-pressed={filters.medical} onClick={() => go({ medical: !filters.medical })}>
          <i className="fa-solid fa-notes-medical" aria-hidden="true" /> Medical notes
        </button>
        <button type="button" className={filters.review ? "is-on" : ""} aria-pressed={filters.review} onClick={() => go({ review: !filters.review })}>
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> Needs review
        </button>
        <select aria-label="Rows per page" value={filters.size} onChange={(event) => go({ size: Number(event.target.value) })}>
          {PAGE_SIZES.map((size) => <option key={size} value={size}>{size} per page</option>)}
        </select>
        {active ? (
          <Link className="app-clear" href={`${OFFICE}/students`}>
            <i className="fa-solid fa-xmark" aria-hidden="true" /> Clear {active} filter{active === 1 ? "" : "s"}
          </Link>
        ) : null}
      </div>
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
        <table className={`app-table ofc-table${pending ? " is-busy" : ""}`}>
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
              <th>Age</th>
              <th>Parents</th>
              <th>House</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const status = studentStatusInfo(row.status);
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
                  <td className="app-col-child">
                    <Link href={`${OFFICE}/students/${row.id}`}>
                      <span className={`ofc-sex is-${row.sex === "M" ? "boy" : row.sex === "F" ? "girl" : "none"}`} aria-hidden="true">{row.sex ?? "?"}</span>
                      {row.full_name}
                    </Link>
                    <small>
                      <span className="ofc-num">{row.student_number}</span>
                      {row.preferred_name ? ` · “${row.preferred_name}”` : ""}
                      {row.siblings ? ` · ${row.siblings} sibling${row.siblings === 1 ? "" : "s"}` : ""}
                    </small>
                  </td>
                  <td>
                    <strong>{row.class_code ?? "–"}</strong>{row.stream ? <span className="ofc-stream">{row.stream}</span> : null}
                    {row.campus ? <small>{row.campus}</small> : null}
                  </td>
                  <td>{row.age ?? <span className="app-muted">–</span>}</td>
                  <td className="ofc-parents">
                    {row.father_name || row.mother_name ? (
                      <>
                        {row.father_name ? <span>{row.father_name}{row.father_phone ? <small>{displayPhone(row.father_phone)}</small> : null}</span> : null}
                        {row.mother_name ? <span>{row.mother_name}{row.mother_phone ? <small>{displayPhone(row.mother_phone)}</small> : null}</span> : null}
                      </>
                    ) : <span className="app-muted">No parents on file</span>}
                  </td>
                  <td>{row.house ? <span className={`ofc-house is-${row.house.toLowerCase()}`}>{row.house}</span> : <span className="app-muted">–</span>}</td>
                  <td>
                    <span className={`app-status app-status-${status.tone}`}>{status.label}</span>
                    <span className="ofc-flags">
                      {row.needs_review ? <i className="fa-solid fa-triangle-exclamation is-warn" title="Has import warnings to check" aria-label="Needs review" /> : null}
                      {row.medical_notes ? <i className="fa-solid fa-notes-medical is-med" title={row.medical_notes} aria-label="Has medical notes" /> : null}
                      {row.staff_child ? <i className="fa-solid fa-id-badge" title="Staff child" aria-label="Staff child" /> : null}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
