"use client";

import { DateField } from "@/components/ui/DateField";

import { useMemo, useState } from "react";
import { saveBand, saveDivisionBand, saveNextTermStart } from "@/app/academics_office/(desk)/actions";
import { DeskForm } from "@/components/academics/Form";
import {
  DEFAULT_DIVISION_BANDS,
  bandsForSection,
  divisionFor,
  gradeFor,
  type BandRow,
  type DivisionBand,
  type DivisionTrack,
  type GradeBandSection,
} from "@/lib/grading-scale";
import { formatReportDate } from "@/lib/report-format";

type DeskTab = GradeBandSection | "date";

type NextTerm = {
  ready: boolean;
  current: string;
  label: string;
  startsOn: string | null;
};

const SECTIONS: {
  value: GradeBandSection;
  title: string;
  short: string;
  range: string;
  blurb: string;
  icon: string;
  samples: number[];
  placeholder: string;
  division?: DivisionTrack;
  divisionBlurb?: string;
  divisionSamples?: number[];
}[] = [
  {
    value: "nursery",
    title: "Nursery",
    short: "Early years",
    range: "Reception · Baby · Middle · Top",
    blurb: "Teachers choose a progress band. The markbook stores the middle of that range so reports stay consistent.",
    icon: "fa-seedling",
    samples: [88, 60, 30, 10],
    placeholder: "Secure",
  },
  {
    value: "lower",
    title: "Lower section",
    short: "P1–P3",
    range: "Primary One to Primary Three",
    blurb: "Letter grades from marks. Lower points mean a stronger grade. Aggregate ceilings below decide the report GRADE when a class has more than four academic subjects.",
    icon: "fa-book-open",
    samples: [92, 72, 55, 36],
    placeholder: "D1",
    division: "lower",
    divisionBlurb: "More than four academic subjects. AGG is the sum of subject points; GRADE uses these ceilings.",
    divisionSamples: [12, 24, 40, 50, 70],
  },
  {
    value: "upper",
    title: "Upper section",
    short: "P4–P7",
    range: "Primary Four to Primary Seven",
    blurb: "PLE-style letter grades from marks. Aggregate ceilings below decide the report GRADE for four-subject classes.",
    icon: "fa-graduation-cap",
    samples: [92, 72, 55, 36],
    placeholder: "D1",
    division: "upper",
    divisionBlurb: "Four academic subjects (PLE-style). AGG is the sum of subject points; GRADE is 1–4 or U.",
    divisionSamples: [8, 16, 26, 32, 40],
  },
];

const INK = ["#19232b", "#24323c", "#3d4c58", "#8a5a12", "#c9a227", "#d4bc6a", "#e6d7a4", "#efeae2"];

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
  const [tab, setTab] = useState<DeskTab>("nursery");

  const reviews = useMemo(
    () =>
      SECTIONS.map((item) => ({
        section: item,
        review: reviewScale(bandsForSection(bands, item.value)),
      })),
    [bands],
  );
  const openIssues = reviews.reduce((sum, item) => sum + item.review.issues.length, 0);
  const active = SECTIONS.find((item) => item.value === tab) ?? null;
  const activeReview = active ? reviews.find((item) => item.section.value === active.value)!.review : null;
  const readySections = reviews.filter((item) => !item.review.issues.length && item.review.ranked.length).length;

  return (
    <div className="grd-desk">
      <div className={`grd-status${openIssues ? " is-warn" : " is-ok"}`}>
        <i className={`fa-solid ${openIssues ? "fa-triangle-exclamation" : "fa-circle-check"}`} aria-hidden="true" />
        <div>
          <strong>{openIssues ? "Subject grades need a quick look" : "Section grading looks complete"}</strong>
          <p>
            {openIssues
              ? `${openIssues} gap${openIssues === 1 ? "" : "s"} across Nursery, Lower and Upper. Fix them on the matching section. Approved report cards keep the rules they already have.`
              : `${readySections} of 3 sections ready. New draft report cards will use these rules. Approved cards keep the rules they already have.`}
          </p>
        </div>
      </div>

      <nav className="grd-tabs" aria-label="Grading settings">
        {SECTIONS.map((item) => {
          const review = reviews.find((row) => row.section.value === item.value)!.review;
          const watch = review.issues.length > 0 || review.ranked.length === 0;
          return (
            <button
              key={item.value}
              type="button"
              className={tab === item.value ? "is-active" : undefined}
              aria-current={tab === item.value ? "page" : undefined}
              onClick={() => setTab(item.value)}
            >
              <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
              <span>
                <strong>{item.title}</strong>
                <em>{item.short}</em>
              </span>
              <b className={watch ? "is-watch" : "is-set"}>{watch ? "Review" : "Ready"}</b>
            </button>
          );
        })}
        <button
          type="button"
          className={tab === "date" ? "is-active" : undefined}
          aria-current={tab === "date" ? "page" : undefined}
          onClick={() => setTab("date")}
        >
          <i className="fa-solid fa-calendar-day" aria-hidden="true" />
          <span>
            <strong>Next term date</strong>
            <em>Printed on reports</em>
          </span>
          <b className={nextTerm.startsOn ? "is-set" : "is-watch"}>{nextTerm.startsOn ? "Set" : "Needed"}</b>
        </button>
      </nav>

      {active && activeReview ? (
        <section className="grd-panel" aria-label={active.title}>
          <header className="grd-panel-head">
            <div className="grd-panel-intro">
              <p className="grd-kicker">
                <i className={`fa-solid ${active.icon}`} aria-hidden="true" />
                {active.range}
              </p>
              <h2>{active.title} grading</h2>
              <p>{active.blurb}</p>
            </div>
            <div className="grd-panel-meta">
              <span className={activeReview.issues.length || !activeReview.ranked.length ? "grd-pill is-watch" : "grd-pill is-set"}>
                {activeReview.issues.length || !activeReview.ranked.length ? "Needs review" : "Ready"}
              </span>
              <span className="grd-meta-count">
                {activeReview.ranked.length} subject band{activeReview.ranked.length === 1 ? "" : "s"}
                {active.division ? " · report GRADE cutoffs" : ""}
              </span>
            </div>
          </header>

          <div className="grd-stack">
            <Scale
              section={active}
              bands={bandsForSection(bands, active.value)}
              ranked={activeReview.ranked}
              issues={activeReview.issues}
            />

            {active.division ? (
              <div className="grd-subpanel">
                <header className="grd-subhead">
                  <div>
                    <h3>Report grade · AGG → GRADE</h3>
                    <p>{active.divisionBlurb}</p>
                  </div>
                </header>
                {divisionReady ? (
                  <DivisionScale
                    track={active.division}
                    title={active.title}
                    blurb={active.divisionBlurb || ""}
                    samples={active.divisionSamples || []}
                    bands={divisions.filter((band) => band.track === active.division)}
                  />
                ) : (
                  <p className="grd-quiet">
                    Run <code>supabase/0032_report_aggregate.sql</code> to set AGG → GRADE cutoffs for lower and upper primary.
                  </p>
                )}
              </div>
            ) : (
              <aside className="grd-aside">
                <i className="fa-solid fa-info-circle" aria-hidden="true" />
                <div>
                  <strong>No aggregate grade</strong>
                  <p>Nursery reports use progress bands only. Overall GRADE from AGG is for Lower and Upper primary.</p>
                </div>
              </aside>
            )}
          </div>
        </section>
      ) : null}

      {tab === "date" ? <NextTermPanel nextTerm={nextTerm} /> : null}
    </div>
  );
}

function NextTermPanel({ nextTerm }: { nextTerm: NextTerm }) {
  const [preview, setPreview] = useState(nextTerm.startsOn ?? "");
  const formatted = preview ? formatReportDate(preview) : "";
  const parts = preview ? preview.split("-").map(Number) : [];
  const day = parts[2] ? String(parts[2]) : "—";
  const month = preview
    ? new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : "Choose a date";
  const weekday = formatted ? formatted.split(",")[0] : "Not set";

  return (
    <section className="grd-panel grd-date-panel" aria-label="Next term date">
      <header className="grd-panel-head">
        <div className="grd-panel-intro">
          <p className="grd-kicker">
            <i className="fa-solid fa-calendar-day" aria-hidden="true" />
            Printed beside fees on every report card
          </p>
          <h2>Next term starts</h2>
          <p>
            Set the opening day for{" "}
            <strong>{nextTerm.label || "the following term"}</strong>
            {nextTerm.current ? (
              <>
                {" "}
                after the current term, <strong>{nextTerm.current}</strong>
              </>
            ) : null}
            . Parents see this date on paper and online reports.
          </p>
        </div>
        <span className={nextTerm.startsOn ? "grd-pill is-set" : "grd-pill is-watch"}>
          {nextTerm.startsOn ? "On reports" : "Not set"}
        </span>
      </header>

      <div className="grd-date-body">
        {!nextTerm.ready ? (
          <p className="grd-quiet">Set a current term in Accounts before choosing when the next one starts.</p>
        ) : (
          <>
            <div className="grd-date-layout">
              <div className="grd-date-card" aria-hidden={formatted ? undefined : true}>
                <span className="grd-date-weekday">{weekday}</span>
                <strong className="grd-date-day">{day}</strong>
                <span className="grd-date-month">{month}</span>
                <em className="grd-date-label">{nextTerm.label || "Next term"}</em>
              </div>

              <div className="grd-date-editor">
                <ol className="grd-date-steps">
                  <li>
                    <span>1</span>
                    <div>
                      <strong>Current term</strong>
                      <p>{nextTerm.current || "Not set in Accounts"}</p>
                    </div>
                  </li>
                  <li>
                    <span>2</span>
                    <div>
                      <strong>Next term</strong>
                      <p>{nextTerm.label || "Following term"}</p>
                    </div>
                  </li>
                  <li>
                    <span>3</span>
                    <div>
                      <strong>Opening day</strong>
                      <p>{formatted || "Pick the date pupils return"}</p>
                    </div>
                  </li>
                </ol>

                <DeskForm action={saveNextTermStart} className="grd-next-form">
                  <label className="ofc-field grd-date-field">
                    <span>Next term starts on</span>
                    <DateField name="starts_on" required defaultValue={nextTerm.startsOn ?? ""} onChange={(event) => setPreview(event.target.value)}
                    />
                  </label>
                  <button className="grd-save grd-save-lg" type="submit">
                    <i className="fa-solid fa-floppy-disk" aria-hidden="true" />
                    Save date
                  </button>
                </DeskForm>
              </div>
            </div>

            <aside className="grd-date-preview">
              <p className="grd-date-preview-kicker">On the report card</p>
              <div className="grd-date-preview-sheet">
                <small>School fees for next term</small>
                <strong>{formatted || "Date appears here once saved"}</strong>
                <p>Shown with the fee schedule for {nextTerm.label || "the next term"}.</p>
              </div>
            </aside>
          </>
        )}
      </div>
    </section>
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
      <div className="grd-body-top">
        <div>
          <h3>Subject grades</h3>
          <p className="grd-note">Check the colour bar, then edit a band if a range is wrong or missing.</p>
        </div>
      </div>

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
                <span key={tick} style={{ left: `${tick}%` }}>
                  {tick}
                </span>
              ))}
            </div>
            <ul className="grd-key">
              {ranked.map((band, index) => (
                <li key={band.id}>
                  <i style={bandInk(index, ranked.length)}>{band.label}</i>
                  <span>
                    {mark(band.min_score)}–{mark(band.max_score)}%
                  </span>
                  <em>
                    {band.points} {band.points === 1 ? "pt" : "pts"}
                  </em>
                </li>
              ))}
            </ul>
          </div>

          <div className="grd-readout" aria-label="Example marks">
            {section.samples.map((score) => {
              const band = gradeFor(bands, section.value, score);
              return (
                <div key={score} className={band ? undefined : "is-open"}>
                  <strong>
                    {score}
                    <small>%</small>
                  </strong>
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
        <span>
          {ranked.length} band{ranked.length === 1 ? "" : "s"}
        </span>
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
              <input type="hidden" name="section" value={section.value} />
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
              <button className="grd-save" type="submit">
                Save
              </button>
              <button className="grd-remove" type="submit" name="intent" value="delete">
                Remove
              </button>
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
            <button className="grd-save" type="submit">
              Add band
            </button>
          </DeskForm>
        </div>
      ) : null}
    </div>
  );
}

function DivisionScale({
  track,
  title,
  blurb,
  samples,
  bands,
}: {
  track: DivisionTrack;
  title: string;
  blurb: string;
  samples: number[];
  bands: DivisionBand[];
}) {
  const ranked = [...bands].sort((a, b) => a.sort_order - b.sort_order || (a.max_aggregate ?? 9999) - (b.max_aggregate ?? 9999));
  const active = ranked.length
    ? ranked
    : DEFAULT_DIVISION_BANDS[track].map((band, index) => ({
        id: `default-${track}-${index}`,
        track,
        ...band,
      }));
  const [editing, setEditing] = useState(ranked.length === 0);

  return (
    <div className="grd-body grd-body-tight">
      <p className="grd-note visually-hidden">{blurb}</p>
      <span className={ranked.length ? "grd-pill is-set" : "grd-pill is-watch"}>
        {ranked.length ? `${title} cutoffs` : "Using built-in defaults"}
      </span>

      <div className="grd-readout is-agg" aria-label="Example aggregates">
        {samples.map((agg) => {
          const grade = divisionFor(active, track, agg);
          return (
            <div key={agg}>
              <strong>
                {agg}
                <small> AGG</small>
              </strong>
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
              <button className="grd-save" type="submit">
                Save
              </button>
              <button className="grd-remove" type="submit" name="intent" value="delete">
                Remove
              </button>
            </DeskForm>
          ))}
          <DeskForm action={saveDivisionBand} className="grd-form is-division is-new">
            <input type="hidden" name="track" value={track} />
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
            <button className="grd-save" type="submit">
              Add cutoff
            </button>
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
