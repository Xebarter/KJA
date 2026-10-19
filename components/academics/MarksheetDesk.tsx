"use client";

import { useState } from "react";
import Link from "next/link";
import { setMarksheetLocks } from "@/app/academics_office/(desk)/actions";
import { DeskForm } from "@/components/academics/Form";
import { StudentFace } from "@/components/StudentFace";

export type MarksheetStatus = "open" | "submitted" | "approved";

export type MarksheetSubject = {
  id: string;
  name: string;
  href: string;
  status: MarksheetStatus;
  entered: number;
  blank: number;
  average: number | null;
};

export type MarksheetMark = {
  text: string;
  tone: "blank" | "missed" | "low" | "mid" | "high";
};

export type MarksheetPupil = {
  id: string;
  name: string;
  number: string;
  photoPath: string | null;
  href: string;
  average: number | null;
  position: number | null;
  gaps: number;
  marks: MarksheetMark[];
};

export type MarksheetIdentity = {
  termId: string;
  name: string;
  kind: string;
  heldOn: string;
  classCode: string;
  stream: string;
};

const nf = (value: number) => value.toLocaleString("en-GB");

function percentText(value: number | null) {
  if (value === null) return "—";
  return `${value.toLocaleString("en-GB", { maximumFractionDigits: 1 })}%`;
}

function shownStatus(subject: MarksheetSubject): MarksheetStatus {
  if (subject.status === "approved") return "approved";
  if (subject.status === "submitted" || subject.entered > 0) return "submitted";
  return "open";
}

function stateLabel(subject: MarksheetSubject) {
  if (subject.status === "approved") return "Locked";
  if (shownStatus(subject) === "submitted") return subject.blank ? `Submitted · ${nf(subject.blank)} blank` : "Submitted";
  if (subject.blank) return `${nf(subject.blank)} blank`;
  return "Ready";
}

export function MarksheetDesk({
  subjects,
  pupils,
  identity,
  office,
  nursery,
}: {
  subjects: MarksheetSubject[];
  pupils: MarksheetPupil[];
  identity: MarksheetIdentity;
  office: boolean;
  nursery: boolean;
}) {
  const [search, setSearch] = useState("");
  const [gapsOnly, setGapsOnly] = useState(false);
  const [confirmUnlock, setConfirmUnlock] = useState(false);
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const gapCount = pupils.filter((pupil) => pupil.gaps > 0).length;
  const visible = pupils.filter((pupil) => {
    if (gapsOnly && pupil.gaps === 0) return false;
    if (!words.length) return true;
    const hay = `${pupil.name} ${pupil.number}`.toLowerCase();
    return words.every((word) => hay.includes(word));
  });
  const readyCount = subjects.filter((subject) => subject.status !== "approved" && subject.blank === 0).length;
  const heldCount = subjects.filter((subject) => subject.status !== "open").length;
  const scored = pupils.filter((pupil) => pupil.average !== null);
  const classAverage = scored.length
    ? Math.round((scored.reduce((sum, pupil) => sum + (pupil.average || 0), 0) / scored.length) * 10) / 10
    : null;
  const columns = subjects.length + 3;

  return (
    <section className="msh-card" aria-label="Class marksheet">
      <div className="msh-tools">
        <label className="asm-search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <span className="msh-sr">Search this class</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search this class"
            aria-label="Search this class"
          />
        </label>
        <div className="asm-statuses" role="group" aria-label="Show pupils">
          <button type="button" className={gapsOnly ? "is-on" : ""} aria-pressed={gapsOnly} onClick={() => setGapsOnly((current) => !current)}>
            Gaps only<em>{nf(gapCount)}</em>
          </button>
        </div>
        <button type="button" className="msh-print" onClick={() => window.print()}>
          <i className="fa-solid fa-print" aria-hidden="true" /> Print
        </button>
      </div>
      <p className="msh-lead">{office ? "Approve a subject once every pupil has a mark or is marked absent. Approved marks stay locked." : "Marks handed in so far. The office approves and locks them here."}</p>
      <DeskForm action={setMarksheetLocks} className="msh-form">
        <input type="hidden" name="term_id" value={identity.termId} />
        <input type="hidden" name="name" value={identity.name} />
        <input type="hidden" name="kind" value={identity.kind} />
        <input type="hidden" name="held_on" value={identity.heldOn} />
        <input type="hidden" name="class_code" value={identity.classCode} />
        <input type="hidden" name="stream" value={identity.stream} />
        <div className="msh-scroll">
          <table className="msh-table">
            <caption className="msh-sr">{identity.name}</caption>
            <thead>
              <tr>
                <th className="msh-pupil" scope="col">Pupil</th>
                {subjects.map((subject) => {
                  const canApprove = office && subject.status !== "approved" && subject.blank === 0;
                  const canUnlock = office && subject.status !== "open";
                  return (
                    <th key={subject.id} className={`msh-col is-${shownStatus(subject)}`} scope="col">
                      <Link href={subject.href}>{subject.name}</Link>
                      <small>{subject.average === null ? "No average yet" : `${percentText(subject.average)} avg`}</small>
                      <em className={`msh-state is-${subject.status}`}>{stateLabel(subject)}</em>
                      {canApprove ? <button className="msh-approve" type="submit" name="intent" value={`approve:${subject.id}`}>Approve</button> : null}
                      {canUnlock ? <button className="msh-unlock" type="submit" name="intent" value={`unlock:${subject.id}`}>Unlock</button> : null}
                    </th>
                  );
                })}
                <th className="msh-num" scope="col">Average</th>
                <th className="msh-num" scope="col">Pos</th>
              </tr>
            </thead>
            <tbody>
              {visible.length ? visible.map((pupil) => (
                <tr key={pupil.id}>
                  <th className="msh-pupil" scope="row">
                    <span className="msh-who">
                      <StudentFace id={pupil.id} name={pupil.name} photoPath={pupil.photoPath} className="msh-face" />
                      <span>
                        <Link href={pupil.href}>{pupil.name}</Link>
                        <small>{String(pupils.findIndex((row) => row.id === pupil.id) + 1).padStart(2, "0")}{pupil.number ? ` · ${pupil.number}` : ""}</small>
                      </span>
                    </span>
                  </th>
                  {pupil.marks.map((mark, markIndex) => (
                    <td key={subjects[markIndex]?.id || markIndex} className={`msh-mark is-${mark.tone}${subjects[markIndex]?.status === "approved" ? " is-locked" : ""}`}>
                      {mark.text || "—"}
                    </td>
                  ))}
                  <td className={`msh-mark is-avg${pupil.average !== null && pupil.average < 50 ? " is-low" : ""}`}>{percentText(pupil.average)}</td>
                  <td className="msh-mark is-pos">{pupil.position ? nf(pupil.position) : "—"}</td>
                </tr>
              )) : (
                <tr>
                  <td className="msh-empty" colSpan={columns}>{search.trim() ? "No pupil matches that search." : "Every pupil in this view has a mark."}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <th className="msh-pupil" scope="row">Class average</th>
                {subjects.map((subject) => (
                  <td key={subject.id} className={subject.status === "approved" ? "is-locked" : ""}>{percentText(subject.average)}</td>
                ))}
                <td>{percentText(classAverage)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <footer className="msh-foot">
          <p>
            {confirmUnlock
              ? `Unlock ${nf(heldCount)} ${heldCount === 1 ? "subject" : "subjects"}? Marks can be edited again.`
              : gapCount
                ? `${nf(gapCount)} ${gapCount === 1 ? "pupil is" : "pupils are"} still missing a mark.`
                : "Every pupil has a mark in every subject."}
            {confirmUnlock ? "" : nursery ? " Averages use the band midpoints." : " Averages are weighted."}
          </p>
          {office ? (
            <div>
              {heldCount && confirmUnlock ? (
                <>
                  <button className="msh-ghost" type="submit" name="intent" value="unlock:all">Unlock {nf(heldCount)}</button>
                  <button className="msh-ghost" type="button" onClick={() => setConfirmUnlock(false)}>Cancel</button>
                </>
              ) : heldCount ? (
                <button className="msh-ghost" type="button" onClick={() => setConfirmUnlock(true)}>Unlock</button>
              ) : null}
              <button className="msh-go" type="submit" name="intent" value="approve:all" disabled={!readyCount} title={readyCount ? "Lock every subject that has a mark for each pupil." : "A subject can be approved once every pupil has a mark or is marked absent."}>
                Approve ready{readyCount ? ` · ${nf(readyCount)}` : ""}
              </button>
            </div>
          ) : <p>The office approves and locks marks from this sheet.</p>}
        </footer>
      </DeskForm>
    </section>
  );
}
