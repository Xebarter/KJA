"use client";

import Link from "next/link";
import { useState } from "react";
import { bulkUpdateStudents } from "@/app/admissions_office/(office)/students/actions";
import { Feedback, useOfficeAction } from "@/components/office/client";
import { HOUSES, OFFICE, STREAMS, displayPhone } from "@/lib/students";

export type RosterRow = {
  id: string;
  student_number: string;
  full_name: string;
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
  outlier: string | null;
};

/** A class list with checkboxes for moving pupils between streams and houses. Prints as a clean register. */
export function ClassRoster({ rows, streams }: { rows: RosterRow[]; streams: string[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");
  const [mode, setMode] = useState<"stream" | "house">("stream");
  const { result, pending, run } = useOfficeAction();
  const all = rows.length > 0 && selected.size === rows.length;
  const streamOptions = [...new Set([...streams, ...STREAMS])];

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <>
      <div className="ofc-roster-tools no-print">
        <span>{selected.size ? <strong>{selected.size} selected</strong> : "Select pupils to move them"}</span>
        <select aria-label="Change" value={mode} onChange={(event) => { setMode(event.target.value as "stream" | "house"); setTarget(""); }}>
          <option value="stream">Move to stream</option>
          <option value="house">Place in house</option>
        </select>
        {mode === "stream" ? (
          <>
            <input
              aria-label="Stream"
              list="roster-streams"
              value={target}
              onChange={(event) => setTarget(event.target.value.toUpperCase())}
              placeholder="Stream, e.g. A"
              maxLength={20}
            />
            <datalist id="roster-streams">{streamOptions.map((stream) => <option key={stream} value={stream} />)}</datalist>
          </>
        ) : (
          <select aria-label="House" value={target} onChange={(event) => setTarget(event.target.value)}>
            <option value="">No house</option>
            {HOUSES.map((house) => <option key={house} value={house}>{house}</option>)}
          </select>
        )}
        <button
          type="button"
          className="admin-btn"
          disabled={!selected.size || pending}
          onClick={() => {
            const label = mode === "stream" ? (target ? `stream ${target}` : "no stream") : target || "no house";
            if (!window.confirm(`Move ${selected.size} pupil${selected.size === 1 ? "" : "s"} to ${label}?`)) return;
            run(() => bulkUpdateStudents([...selected], { [mode]: target }), () => setSelected(new Set()));
          }}
        >
          {pending ? "Moving…" : "Apply"}
        </button>
        <Feedback result={result} className="ofc-flush" />
      </div>
      <div className="ofc-table-scroll">
        <table className={`app-table ofc-table ofc-roster${pending ? " is-busy" : ""}`}>
          <thead>
            <tr>
              <th className="app-col-check no-print">
                <input type="checkbox" aria-label="Select the whole class" checked={all} onChange={() => setSelected(all ? new Set() : new Set(rows.map((row) => row.id)))} />
              </th>
              <th className="ofc-col-n">#</th>
              <th>Name</th>
              <th>No.</th>
              <th>Sex</th>
              <th>Age</th>
              <th>Stream</th>
              <th>House</th>
              <th>Parent contact</th>
              <th className="ofc-print-col">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id} className={selected.has(row.id) ? "is-selected" : ""}>
                <td className="app-col-check no-print">
                  <input type="checkbox" aria-label={`Select ${row.full_name}`} checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                </td>
                <td className="ofc-col-n">{index + 1}</td>
                <td className="app-col-child">
                  <Link href={`${OFFICE}/students/${row.id}`}>{row.full_name}</Link>
                  {row.medical_notes ? <i className="fa-solid fa-notes-medical ofc-med-icon" title={row.medical_notes} aria-label="Has medical notes" /> : null}
                </td>
                <td className="ofc-num">{row.student_number}</td>
                <td>{row.sex ?? "–"}</td>
                <td>
                  {row.age ?? "–"}
                  {row.outlier ? <i className="fa-solid fa-circle-exclamation ofc-warn-icon no-print" title={row.outlier} aria-label={row.outlier} /> : null}
                </td>
                <td>{row.stream ?? "–"}</td>
                <td>{row.house ?? "–"}</td>
                <td className="ofc-parents">
                  {row.mother_phone || row.father_phone ? (
                    <>
                      {row.mother_phone ? <span>{displayPhone(row.mother_phone)}<small>{row.mother_name ?? "Mother"}</small></span> : null}
                      {row.father_phone ? <span>{displayPhone(row.father_phone)}<small>{row.father_name ?? "Father"}</small></span> : null}
                    </>
                  ) : <span className="app-muted">–</span>}
                </td>
                <td className="ofc-print-col">{row.medical_notes ? "Medical" : ""}{row.panadol_allowed === false ? " · No Panadol" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
