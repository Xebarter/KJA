"use client";

import { useMemo, useState } from "react";
import { saveBand, saveDivisionBand, saveNextTermStart } from "@/app/academics_office/(desk)/actions";
import { DeskForm } from "@/components/academics/Form";
import {
  DEFAULT_DIVISION_BANDS,
  divisionFor,
  gradeFor,
  type BandRow,
  type DivisionBand,
  type DivisionTrack,
} from "@/lib/grading-scale";
import { formatReportDate } from "@/lib/report-format";

const SECTIONS = [
  {
    value: "primary" as const,
    title: "Primary",
    blurb: "Marks become letter grades like D1. Lower points mean a stronger grade.",
    icon: "fa-graduation-cap",
    samples: [92, 72, 55, 36],
    placeholder: "D1",
  },
  {
    value: "nursery" as const,
    title: "Nursery",
    blurb: "Teachers pick a band such as Secure. The markbook stores the middle of that range.",
    icon: "fa-seedling",
    samples: [88, 60, 30, 10],
    placeholder: "Secure",
  },
];

const DIVISION_TRACKS = [
  {
    value: "upper" as const,
    title: "Upper primary",
    blurb: "Four academic subjects (PLE-style). AGG is the sum of subject points; GRADE is 1–4 or U.",
    samples: [8, 16, 26, 32, 40],
  },
  {
    value: "lower" as const,
    title: "Lower primary",
    blurb: "More than four academic subjects. AGG still sums points; GRADE uses these ceilings.",
    samples: [12, 24, 40, 50, 70],
  },
];

const INK = ["#19232b", "#24323c", "#3d4c58", "#8a5a12", "#c9a227", "#d4bc6a", "#e6d7a4", "#efeae2"];

type Tab = "marks" | "aggregate" | "date";

type NextTerm = {
  ready: boolean;
  current: string;
  label: string;
  startsOn: string | null;
};

export function GradingDesk({
  bands,
  divisions,
  divisionReady,
  nextTerm,
}: {
  bands: BandRow[];
  divisions: DivisionBand[];
  divisionReady: boolean;
  nextTerm: NextTerm;
}) {
  const [tab, setTab] = useState<Tab>("marks");
  const [section, setSection] = useState<"primary" | "nursery">("primary");
  const [track, setTrack] = useState<"upper" | "lower">("upper");

  const reviews = useMemo(
    () =>
      SECTIONS.map((item) => ({
        section: item,
        review: reviewScale(bands.filter((band) => band.section === item.value)),
      })),
    [bands],
  );
  const openIssues = reviews.reduce((sum, item) => sum + item.review.issues.length, 0);
  const activeSection = SECTIONS.find((item) => item.value === section)!;
  const activeReview = reviews.find((item) => item.section.value === section)!.review;
  const activeTrack = DIVISION_TRACKS.find((item) => item.value === track)!;
  const trackBands = divisions.filter((band) => band.track === track);

  return (
    <div className="grd-desk">
      <div className={`grd-status${openIssues ? " is-warn" : " is-ok"}`}>
        <i className={`fa-solid ${openIssues ? "fa-triangle-exclamation" : "fa-circle-check"}`} aria-hidden="true" />
        <div>
          <strong>{openIssues ? "Subject grades need a quick look" : "Subject grades look complete"}</strong>
          <p>
            {openIssues
              ? `${openIssues} gap${openIssues === 1 ? "" : "s"} on the mark scale. Fix them under Subject grades — approved report cards keep the rules they already have.`
              : "New draft report cards will use these rules. Approved cards keep the rules they already have."}
          </p>
        </div>
      </div>

      <nav className="grd-tabs" aria-label="Grading settings">
        {(
          [
            { id: "marks" as const, label: "Subject grades", icon: "fa-percent", hint: "Primary & nursery marks" },
            { id: "aggregate" as const, label: "Report grade", icon: "fa-layer-group", hint: "AGG → GRADE" },
            { id: "date" as const, label: "Next term date", icon: "fa-calendar-day", hint: "Printed on reports" },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? "is-active" : undefined}
            aria-current={tab === item.id ? "page" : undefined}
            onClick={() => setTab(item.id)}
          >
            <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
            <span>
              <strong>{item.label}</strong>
              <em>{item.hint}</em>
            </span>
          </button>
        ))}
      </nav>

      {tab === "marks" ? (
        <section className="grd-panel" aria-label="Subject grades">
          <header className="grd-panel-head">
            <div>
              <h2>Subject grades</h2>
              <p>Choose Primary or Nursery, check the colour bar, then edit a band if something is wrong.</p>
            </div>
            <div className="grd-switch" role="tablist" aria-label="School section">
              {SECTIONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="tab"
                  aria-selected={section === item.value}
                  className={section === item.value ? "is-active" : undefined}
                  onClick={() => setSection(item.value)}
                >
                  <i className={`fa-solid ${item.icon}`} aria-hidden="true" /> {item.title}
                </button>
              ))}
            </div>
          </header>
          <Scale
            section={activeSection}
            bands={bands.filter((band) => band.section === activeSection.value)}
            ranked={activeReview.ranked}
            issues={activeReview.issues}
          />
        </section>
      ) : null}

      {tab === "aggregate" ? (
        <section className="grd-panel" aria-label="Report grade">
          <header className="grd-panel-head">
            <div>
              <h2>Report grade (AGG → GRADE)</h2>
              <p>After subject points are added up, these ceilings decide the overall grade on the report card.</p>
            </div>
            {divisionReady ? (
              <div className="grd-switch" role="tablist" aria-label="Primary track">
                {DIVISION_TRACKS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    role="tab"
                    aria-selected={track === item.value}
                    className={track === item.value ? "is-active" : undefined}
                    onClick={() => setTrack(item.value)}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            ) : null}
          </header>
          {divisionReady ? (
            <DivisionScale track={activeTrack} bands={trackBands} />
          ) : (
            <p className="grd-quiet">
              Run <code>supabase/0032_report_aggregate.sql</code> to set AGG → GRADE cutoffs for upper and lower primary.
            </p>
          )}
        </section>
      ) : null}

      {tab === "date" ? (
        <section className="grd-panel" aria-label="Next term date">
          <header className="grd-panel-head">
            <div>
              <h2>Next term starts</h2>
              <p>
                This date is printed beside the fees on every report card
                {nextTerm.current ? <> for the term after <strong>{nextTerm.current}</strong></> : null}.
              </p>
            </div>
          </header>
          {nextTerm.ready ? (
            <DeskForm action={saveNextTermStart} className="grd-next-form">
              <label className="ofc-field">
                <span>Next term starts on</span>
                <input name="starts_on" type="date" required defaultValue={nextTerm.startsOn ?? ""} />
              </label>
              <button className="grd-save" type="submit">Save date</button>
            </DeskForm>
          ) : (
            <p className="grd-quiet">Set a current term in Accounts before choosing when the next one starts.</p>
          )}
          {nextTerm.startsOn ? <p className="grd-next-when">{formatReportDate(nextTerm.startsOn)}</p> : null}
        </section>
      ) : null}
    </div>
  );
}

function Scale({
  section,
  bands,
  ranked,
  issues,
}: {
  section: (typeof SECTIONS)[number];
  bands: BandRow[];
  ranked: BandRow[];
  issues: string[];
}) {
  const [editing, setEditing] = useState(issues.length > 0 || ranked.length === 0);

  return (
    <div className="grd-body">
      <p className="grd-note">{section.blurb}</p>
      <span className={issues.length ? "grd-pill is-watch" : "grd-pill is-set"}>
        {issues.length ? "Needs review" : "Ready"}
      </span>

      {ranked.length ? (
        <>
          <div className="grd-ruler">
            <div className="grd-track" aria-hidden="true">
              {ranked.map((band, index) => {
                const left = clamp(band.min_score);
                const width = Math.max(0, clamp(band.max_score) - left);
                if (!width) return null;
                return (
                  <i
                    key={band.id}
                    style={{ left: `${left}%`, width: `${width}%`, background: bandInk(index, ranked.length).background }}
                    title={`${band.label}: ${mark(band.min_score)}–${mark(band.max_score)}`}
                  />
                );
              })}
            </div>
            <div className="grd-axis" aria-hidden="true">
              {[0, 25, 50, 75, 100].map((tick) => (
                <span key={tick} style={{ left: `${tick}%` }}>{tick}</span>
              ))}
            </div>
            <ul className="grd-key">
              {ranked.map((band, index) => (
                <li key={band.id}>
                  <i style={bandInk(index, ranked.length)}>{band.label}</i>
                  <span>{mark(band.min_score)}–{mark(band.max_score)}%</span>
                  <em>{band.points} {band.points === 1 ? "pt" : "pts"}</em>
                </li>
              ))}
            </ul>
          </div>

          <div className="grd-readout" aria-label="Example marks">
            {section.samples.map((score) => {
              const band = gradeFor(bands, section.value, score);
              return (
                <div key={score} className={band ? undefined : "is-open"}>
                  <strong>{score}<small>%</small></strong>
                  <span>{band ? band.label : "No grade"}</span>
                  <em>{band ? `${band.points} ${band.points === 1 ? "pt" : "pts"}` : "Uncovered"}</em>
                </div>
              );
            })}
          </div>

          {issues.length ? (
            <ul className="grd-issues">
              {issues.map((issue) => (
                <li key={issue}>
                  <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                  {issue}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <p className="grd-quiet">No {section.title.toLowerCase()} bands yet. Add the first range below.</p>
      )}

      <div className="grd-edit-toggle">
        <button type="button" className="grd-edit-btn" aria-expanded={editing} onClick={() => setEditing((value) => !value)}>
          <i className={`fa-solid ${editing ? "fa-chevron-up" : "fa-pen"}`} aria-hidden="true" />
          {editing ? "Hide band editor" : "Edit bands"}
        </button>
        <span>{ranked.length} band{ranked.length === 1 ? "" : "s"}</span>
      </div>

      {editing ? (
        <div className="grd-ledger">
          {ranked.length ? (
            <div className="grd-head" aria-hidden="true">
              <span>Grade</span>
              <span>From %</span>
              <span>To %</span>
              <span>Points</span>
              <span />
              <span />
            </div>
          ) : null}
          {ranked.map((band) => (
            <DeskForm key={band.id} action={saveBand} className="grd-form">
              <input type="hidden" name="id" value={band.id} />
              <input type="hidden" name="section" value={band.section} />
              <label className="ofc-field">
                <span>Grade</span>
                <input name="label" defaultValue={band.label} required />
              </label>
              <label className="ofc-field">
                <span>From %</span>
                <input name="min_score" type="number" step="0.1" defaultValue={band.min_score} required />
              </label>
              <label className="ofc-field">
                <span>To %</span>
                <input name="max_score" type="number" step="0.1" defaultValue={band.max_score} required />
              </label>
              <label className="ofc-field">
                <span>Points</span>
                <input name="points" type="number" defaultValue={band.points} required />
              </label>
              <button className="grd-save" type="submit">Save</button>
              <button className="grd-remove" type="submit" name="intent" value="delete">Remove</button>
            </DeskForm>
          ))}
          <DeskForm action={saveBand} className="grd-form is-new">
            <input type="hidden" name="section" value={section.value} />
            <label className="ofc-field">
              <span>Grade</span>
              <input name="label" required placeholder={section.placeholder} />
            </label>
            <label className="ofc-field">
              <span>From %</span>
              <input name="min_score" type="number" step="0.1" required placeholder="0" />
            </label>
            <label className="ofc-field">
              <span>To %</span>
              <input name="max_score" type="number" step="0.1" required placeholder="100" />
            </label>
            <label className="ofc-field">
              <span>Points</span>
              <input name="points" type="number" required placeholder="1" />
            </label>
            <button className="grd-save" type="submit">Add band</button>
          </DeskForm>
        </div>
      ) : null}
    </div>
  );
}

function DivisionScale({
  track,
  bands,
}: {
  track: (typeof DIVISION_TRACKS)[number];
  bands: DivisionBand[];
}) {
  const ranked = [...bands].sort((a, b) => a.sort_order - b.sort_order || (a.max_aggregate ?? 9999) - (b.max_aggregate ?? 9999));
  const active = ranked.length
    ? ranked
    : DEFAULT_DIVISION_BANDS[track.value].map((band, index) => ({
        id: `default-${track.value}-${index}`,
        track: track.value as DivisionTrack,
        ...band,
      }));
  const [editing, setEditing] = useState(ranked.length === 0);

  return (
    <div className="grd-body">
      <p className="grd-note">{track.blurb}</p>
      <span className={ranked.length ? "grd-pill is-set" : "grd-pill is-watch"}>
        {ranked.length ? "Custom cutoffs" : "Using built-in defaults"}
      </span>

      <div className="grd-readout" aria-label="Example aggregates">
        {track.samples.map((agg) => {
          const grade = divisionFor(active, track.value, agg);
          return (
            <div key={agg}>
              <strong>{agg}<small> AGG</small></strong>
              <span>Grade {grade}</span>
              <em>Ceiling match</em>
            </div>
          );
        })}
      </div>

      <div className="grd-edit-toggle">
        <button type="button" className="grd-edit-btn" aria-expanded={editing} onClick={() => setEditing((value) => !value)}>
          <i className={`fa-solid ${editing ? "fa-chevron-up" : "fa-pen"}`} aria-hidden="true" />
          {editing ? "Hide cutoff editor" : "Edit cutoffs"}
        </button>
        <span>{ranked.length ? `${ranked.length} cutoff${ranked.length === 1 ? "" : "s"}` : "Defaults until you save"}</span>
      </div>

      {editing ? (
        <div className="grd-ledger">
          {ranked.length ? (
            <div className="grd-head is-division" aria-hidden="true">
              <span>Grade</span>
              <span>Max AGG</span>
              <span>Order</span>
              <span />
              <span />
            </div>
          ) : null}
          {ranked.map((band) => (
            <DeskForm key={band.id} action={saveDivisionBand} className="grd-form is-division">
              <input type="hidden" name="id" value={band.id} />
              <input type="hidden" name="track" value={band.track} />
              <label className="ofc-field">
                <span>Grade</span>
                <input name="label" defaultValue={band.label} required />
              </label>
              <label className="ofc-field">
                <span>Max AGG</span>
                <input name="max_aggregate" type="number" defaultValue={band.max_aggregate ?? ""} placeholder="Catch-all" />
              </label>
              <label className="ofc-field">
                <span>Order</span>
                <input name="sort_order" type="number" defaultValue={band.sort_order} required />
              </label>
              <button className="grd-save" type="submit">Save</button>
              <button className="grd-remove" type="submit" name="intent" value="delete">Remove</button>
            </DeskForm>
          ))}
          <DeskForm action={saveDivisionBand} className="grd-form is-division is-new">
            <input type="hidden" name="track" value={track.value} />
            <label className="ofc-field">
              <span>Grade</span>
              <input name="label" required placeholder="1" />
            </label>
            <label className="ofc-field">
              <span>Max AGG</span>
              <input name="max_aggregate" type="number" placeholder="Catch-all" />
            </label>
            <label className="ofc-field">
              <span>Order</span>
              <input name="sort_order" type="number" required placeholder={String((ranked.at(-1)?.sort_order ?? 0) + 1)} />
            </label>
            <button className="grd-save" type="submit">Add cutoff</button>
          </DeskForm>
        </div>
      ) : null}
    </div>
  );
}

function reviewScale(bands: BandRow[]) {
  const ranked = [...bands].sort((a, b) => b.min_score - a.min_score || a.max_score - b.max_score);
  const issues: string[] = [];
  const holes = uncovered(bands);
  if (holes.length === 1) issues.push(`${mark(holes[0].from)}–${mark(holes[0].to)}% is not in a grade.`);
  else if (holes.length > 1) issues.push(`${holes.length} gaps in the scale. ${mark(holes[0].from)}% would not receive a grade.`);
  for (let index = 0; index < ranked.length; index += 1) {
    for (let next = index + 1; next < ranked.length; next += 1) {
      const left = ranked[index];
      const right = ranked[next];
      const overlap = Math.min(left.max_score, right.max_score) - Math.max(left.min_score, right.min_score);
      if (overlap >= 0) issues.push(`${left.label} and ${right.label} overlap. The lower points win.`);
    }
  }
  return { ranked, issues: issues.slice(0, 4) };
}

function uncovered(bands: BandRow[]) {
  const holes: { from: number; to: number }[] = [];
  let start: number | null = null;
  for (let step = 0; step <= 1000; step += 1) {
    const score = step / 10;
    const covered = bands.some((band) => score + 1e-9 >= band.min_score && score - 1e-9 <= band.max_score);
    if (!covered && start === null) start = score;
    if (covered && start !== null) {
      holes.push({ from: start, to: (step - 1) / 10 });
      start = null;
    }
  }
  if (start !== null) holes.push({ from: start, to: 100 });
  return holes.filter((hole) => hole.to >= hole.from);
}

function bandInk(index: number, count: number) {
  const slot = count <= 1 ? 0 : Math.round((index / (count - 1)) * (INK.length - 1));
  return { background: INK[slot], color: slot <= 3 ? "#fff" : "#19232b" };
}

function clamp(value: number) {
  return Math.min(100, Math.max(0, value));
}

function mark(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}
