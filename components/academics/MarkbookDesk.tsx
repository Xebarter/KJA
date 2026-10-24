"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { reopenAssessment, saveScores } from "@/app/academics_office/(desk)/actions";
import { DeskForm } from "@/components/academics/Form";
import { StudentFace } from "@/components/StudentFace";

export type MarkbookPupil = {
  id: string;
  name: string;
  number: string;
  photoPath: string | null;
  href: string;
  score: string;
  band: string;
  missed: boolean;
};

export type MarkbookBand = { id: string; label: string; midpoint: number };

type MarkOutcome = { error?: string; ok?: string };
type Entry = { score: string; band: string; missed: boolean };
type Focus = "all" | "blank" | "marked" | "missed";

const nf = (value: number) => value.toLocaleString("en-GB");

function countLabel(count: number, one: string, many: string) {
  return `${nf(count)} ${count === 1 ? one : many}`;
}

function pupilIdFromField(field: HTMLElement) {
  const name = field.getAttribute("name") || "";
  return name.startsWith("pupil:") ? name.slice(6) : "";
}

export function MarkbookDesk({
  assessmentId,
  pupils,
  bands,
  nursery,
  maxScore,
  weight,
  heldOn,
  locked,
  phase = "open",
  office,
  saveAction,
}: {
  assessmentId: string;
  pupils: MarkbookPupil[];
  bands: MarkbookBand[];
  nursery: boolean;
  maxScore: number;
  weight: number;
  heldOn: string;
  locked: boolean;
  phase?: "open" | "submitted" | "approved";
  office: boolean;
  /** Defaults to academics office saveScores. Teacher desk passes saveTeacherScores. */
  saveAction?: (formData: FormData) => Promise<MarkOutcome>;
}) {
  const onSave = saveAction || saveScores;
  const rapid = !office;
  const tableRef = useRef<HTMLDivElement>(null);
  const focusedOnce = useRef(false);

  const [entries, setEntries] = useState<Record<string, Entry>>(() =>
    Object.fromEntries(pupils.map((pupil) => [pupil.id, { score: pupil.score, band: pupil.band, missed: pupil.missed }])),
  );
  const [search, setSearch] = useState("");
  // Keep "all" while entering so rows don't vanish under the caret as marks are typed.
  const [focus, setFocus] = useState<Focus>("all");

  const rows = useMemo(() => pupils.map((pupil) => {
    const entry = entries[pupil.id] || { score: "", band: "", missed: false };
    const score = nursery ? null : entry.score.trim() === "" ? null : Number(entry.score);
    const valid = nursery
      ? Boolean(entry.band)
      : score !== null && Number.isFinite(score) && score >= 0 && score <= maxScore;
    const value = nursery
      ? bands.find((band) => band.id === entry.band)?.midpoint ?? null
      : valid ? score : null;
    return { pupil, entry, valid, value, blank: !entry.missed && !valid };
  }), [pupils, entries, nursery, maxScore, bands]);

  const marked = rows.filter((row) => row.entry.missed || row.valid).length;
  const missed = rows.filter((row) => row.entry.missed).length;
  const blank = rows.length - marked;
  const scored = rows.filter((row) => !row.entry.missed && row.value !== null);
  const average = scored.length
    ? Math.round((scored.reduce((sum, row) => sum + (row.value || 0), 0) / scored.length) * 10) / 10
    : null;
  const ready = blank === 0 && rows.every((row) => row.entry.missed || row.valid);
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);

  function shows(row: (typeof rows)[number]) {
    if (focus === "blank" && !row.blank) return false;
    if (focus === "marked" && (row.blank || row.entry.missed)) return false;
    if (focus === "missed" && !row.entry.missed) return false;
    if (!words.length) return true;
    const hay = `${row.pupil.name} ${row.pupil.number}`.toLowerCase();
    return words.every((word) => hay.includes(word));
  }

  const visible = rows.filter(shows).length;

  function patch(id: string, next: Partial<Entry>) {
    setEntries((current) => ({ ...current, [id]: { ...current[id], score: "", band: "", missed: false, ...next } }));
  }

  function fieldList() {
    return [
      ...(tableRef.current?.querySelectorAll<HTMLElement>("li:not([hidden]) .mkb-field:not(:disabled):not([readonly])") || []),
    ];
  }

  function focusField(field: HTMLElement | undefined | null) {
    if (!field) return;
    field.focus();
    if (field instanceof HTMLInputElement) field.select();
  }

  function advanceFrom(current: HTMLElement, delta: number) {
    const fields = fieldList();
    const index = fields.indexOf(current);
    if (index < 0) return;
    focusField(fields[index + delta]);
  }

  function focusNextAfter(li: Element | null | undefined, skipId?: string) {
    requestAnimationFrame(() => {
      let sibling = li?.nextElementSibling as HTMLElement | null;
      while (sibling) {
        if (!sibling.hidden) {
          const field = sibling.querySelector<HTMLElement>(".mkb-field:not(:disabled):not([readonly])");
          if (field && (!skipId || pupilIdFromField(field) !== skipId)) {
            focusField(field);
            return;
          }
        }
        sibling = sibling.nextElementSibling as HTMLElement | null;
      }
      focusField(fieldList()[0]);
    });
  }

  function markMissedAndAdvance(current: HTMLElement) {
    const id = pupilIdFromField(current);
    if (!id) return;
    const li = current.closest("li");
    patch(id, { missed: true });
    focusNextAfter(li, id);
  }

  function move(event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) {
    if (event.key === "Enter" || event.key === "ArrowDown") {
      event.preventDefault();
      advanceFrom(event.currentTarget, 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      advanceFrom(event.currentTarget, -1);
      return;
    }
    if (locked) return;
    if (event.key === "-" || event.key === "m" || event.key === "M") {
      // Number fields: treat "-" / m as "missed" so teachers never hunt for the chip.
      if (event.currentTarget instanceof HTMLInputElement && event.key === "-" && event.currentTarget.value !== "") return;
      event.preventDefault();
      markMissedAndAdvance(event.currentTarget);
    }
  }

  function onBandChange(id: string, band: string, current: HTMLSelectElement) {
    patch(id, { band });
    if (!rapid || !band) return;
    requestAnimationFrame(() => advanceFrom(current, 1));
  }

  useEffect(() => {
    if (locked || focusedOnce.current) return;
    const frame = requestAnimationFrame(() => {
      const firstBlank = tableRef.current?.querySelector<HTMLElement>(
        "li:not([hidden]).is-blank .mkb-field:not(:disabled):not([readonly])",
      );
      const firstAny = tableRef.current?.querySelector<HTMLElement>(
        "li:not([hidden]) .mkb-field:not(:disabled):not([readonly])",
      );
      const target = firstBlank || firstAny;
      if (!target) return;
      focusedOnce.current = true;
      focusField(target);
    });
    return () => cancelAnimationFrame(frame);
  }, [locked, focus, assessmentId]);

  return (
    <>
      <section className={`mkb-strip${rapid ? " is-rapid" : ""}`} aria-label="This markbook">
        <div>
          <span className="mkb-stat-icon" aria-hidden="true"><i className="fa-solid fa-user-group" /></span>
          <span className="mkb-stat-copy"><span>On roll</span><strong>{nf(rows.length)}</strong><small>{heldOn}</small></span>
        </div>
        <div className={blank ? "is-warn" : "is-ok"}>
          <span className="mkb-stat-icon" aria-hidden="true"><i className="fa-solid fa-list-check" /></span>
          <span className="mkb-stat-copy"><span>Marked</span><strong>{nf(marked)}</strong><small>{blank ? `${nf(blank)} still blank` : "Every pupil entered"}</small></span>
        </div>
        <div>
          <span className="mkb-stat-icon" aria-hidden="true"><i className="fa-solid fa-chart-simple" /></span>
          <span className="mkb-stat-copy"><span>Average</span><strong>{average === null ? "—" : nf(average)}</strong><small>{nursery ? "From the band midpoints" : `Out of ${nf(maxScore)}`}</small></span>
        </div>
        <div className={missed ? "is-warn" : ""}>
          <span className="mkb-stat-icon" aria-hidden="true"><i className="fa-solid fa-user-slash" /></span>
          <span className="mkb-stat-copy"><span>Missed</span><strong>{nf(missed)}</strong><small>{missed ? "Left out of the average" : "None missed"}</small></span>
        </div>
        <div className="mkb-meter">
          <span className="mkb-meter-bar" aria-hidden="true"><span style={{ width: `${rows.length ? Math.round((marked / rows.length) * 100) : 0}%` }} /></span>
          <p>
            {weight ? `${nf(weight)}% of the subject total · ` : ""}
            {nursery ? "Progress bands" : `Marks out of ${nf(maxScore)}`}.
            {locked
              ? ""
              : rapid
                ? " Type a mark, Enter for next, − or M for missed."
                : " Press Enter to move to the next pupil."}
          </p>
        </div>
      </section>

      <section className={`mkb-sheet${rapid ? " is-rapid" : ""}`} aria-label="Marks">
        <DeskForm action={onSave} className="mkb-form">
          <input type="hidden" name="assessment_id" value={assessmentId} />
          <input type="hidden" name="max_score" value={maxScore} />
          {nursery ? <input type="hidden" name="nursery" value="1" /> : null}
          <div className="mkb-tools">
            <label className="mkb-search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
              <span className="mkb-sr">Search this class</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
                placeholder="Search this class"
              />
            </label>
            <div className="mkb-focus" role="group" aria-label="Show pupils">
              {([
                ["all", "All", rows.length],
                ["blank", "Blank", blank],
                ["marked", "Marked", marked - missed],
                ["missed", "Missed", missed],
              ] as const).map(([value, label, count]) => (
                <button key={value} type="button" className={focus === value ? "is-on" : ""} aria-pressed={focus === value} onClick={() => setFocus(value)}>
                  {label}<em>{nf(count)}</em>
                </button>
              ))}
            </div>
          </div>
          <div className="mkb-table" ref={tableRef}>
            <div className="mkb-cols" aria-hidden="true"><span>Pupil</span><span>{nursery ? "Progress" : "Mark"}</span><span /></div>
            <ul>
              {rows.map((row, index) => {
                const { pupil, entry } = row;
                const percent = !nursery && row.valid && row.value !== null && maxScore > 0 ? Math.round((row.value / maxScore) * 100) : null;
                const rowClass = entry.missed ? "is-missed" : row.blank ? "is-blank" : row.valid ? "is-marked" : "is-bad";
                return (
                  <li key={pupil.id} hidden={!shows(row)} className={rowClass}>
                    <span className="mkb-who">
                      <StudentFace id={pupil.id} name={pupil.name} photoPath={pupil.photoPath} className="mkb-face" />
                      <span>
                        <Link href={pupil.href} tabIndex={-1}>{pupil.name}</Link>
                        <small>{String(index + 1).padStart(2, "0")} · {pupil.number}</small>
                      </span>
                    </span>
                    <span className="mkb-score">
                      {nursery ? (
                        <select
                          className="mkb-field"
                          name={`pupil:${pupil.id}`}
                          value={entry.missed ? "" : entry.band}
                          aria-label={`Progress for ${pupil.name}`}
                          disabled={locked || entry.missed}
                          onChange={(event) => onBandChange(pupil.id, event.target.value, event.currentTarget)}
                          onKeyDown={move}
                        >
                          <option value="">Choose</option>
                          {bands.map((band) => <option key={band.id} value={band.id}>{band.label}</option>)}
                        </select>
                      ) : (
                        <input
                          className="mkb-field"
                          name={`pupil:${pupil.id}`}
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          enterKeyHint="next"
                          value={entry.missed ? "" : entry.score}
                          placeholder="—"
                          aria-label={`Mark for ${pupil.name}, out of ${maxScore}`}
                          readOnly={locked}
                          disabled={entry.missed}
                          onChange={(event) => {
                            const raw = event.target.value.replace(/[^\d.]/g, "");
                            const parts = raw.split(".");
                            const clean = parts.length > 1 ? `${parts[0]}.${parts.slice(1).join("").slice(0, 2)}` : parts[0];
                            patch(pupil.id, { score: clean });
                          }}
                          onKeyDown={move}
                          onFocus={(event) => event.currentTarget.select()}
                        />
                      )}
                      {nursery ? null : <small>/ {nf(maxScore)}</small>}
                      {entry.missed ? <input type="hidden" name={`pupil:${pupil.id}`} value="" /> : null}
                    </span>
                    <span className="mkb-side">
                      {percent !== null ? <em>{percent}%</em> : null}
                      <label className={`mkb-miss${entry.missed ? " is-on" : ""}`}>
                        <input
                          type="checkbox"
                          name={`missed:${pupil.id}`}
                          value="1"
                          checked={entry.missed}
                          disabled={locked}
                          onChange={(event) => {
                            const on = event.target.checked;
                            const li = event.currentTarget.closest("li");
                            patch(pupil.id, { missed: on });
                            if (rapid && on) focusNextAfter(li, pupil.id);
                          }}
                        />
                        Missed
                      </label>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          {visible ? null : <p className="mkb-quiet">{search.trim() ? `No pupil matches “${search.trim()}”.` : "No pupil in this view."}</p>}
          {locked ? null : (
            <footer className="mkb-foot">
              <p>{blank ? `${countLabel(blank, "pupil still blank", "pupils still blank")}` : "Every pupil has a mark"}</p>
              <div>
                <button className="mkb-ghost" type="submit" name="intent" value="save">Save</button>
                <button className="mkb-go" type="submit" name="intent" value="submit" disabled={!ready}>Submit</button>
              </div>
            </footer>
          )}
        </DeskForm>
        {locked ? (
          <footer className="mkb-foot">
            <p>
              {phase === "approved"
                ? "Approved and locked."
                : office
                  ? "Submitted for approval. Marks stay locked until unlocked."
                  : "Submitted. Marks stay locked until the office unlocks this markbook."}
            </p>
            {office ? (
              <DeskForm action={reopenAssessment} className="mkb-reopen">
                <input type="hidden" name="assessment_id" value={assessmentId} />
                <button className="mkb-ghost" type="submit">Unlock</button>
              </DeskForm>
            ) : null}
          </footer>
        ) : null}
      </section>
    </>
  );
}
