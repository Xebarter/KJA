"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useRef, useState, useTransition } from "react";
import { runPromotion, type PromotionRow } from "@/app/admissions_office/(office)/promotions/actions";
import { Highlight, fold, queryWords } from "@/components/office/ClassFinder";
import type { PromotionSeason } from "@/lib/promotions";
import { OFFICE, SCHOOL_CLASSES, SECTIONS, className } from "@/lib/students";

export type PromotionPupil = { id: string; full_name: string; class_code: string | null; stream: string | null; student_number: string };

const STEPS = [
  { label: "Automatic moves", note: "Everyone moves up" },
  { label: "Who repeats", note: "Optional exceptions" },
  { label: "Confirm", note: "Run once" },
] as const;

const SHOWN = 80;
const ORDER = new Map<string, number>(SCHOOL_CLASSES.map((entry, index) => [entry.code, index]));
const SECTION_OF = new Map<string, string>(SCHOOL_CLASSES.map((entry) => [entry.code, entry.section]));
const nf = (value: number) => value.toLocaleString("en-GB");
const plural = (count: number, one: string, many = `${one}s`) => `${nf(count)} ${count === 1 ? one : many}`;

export function PromotionWizard({
  pupils,
  initial,
  unplaced,
  season,
}: {
  pupils: PromotionPupil[];
  initial: PromotionRow[];
  unplaced: number;
  season: PromotionSeason;
}) {
  const [step, setStep] = useState(0);
  const [exclude, setExclude] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ ok: string; rows: PromotionRow[] } | null>(null);
  const [pending, startTransition] = useTransition();
  const top = useRef<HTMLDivElement>(null);
  const deferred = useDeferredValue(q);

  const rows = useMemo(() => {
    const kept = new Map<string, number>();
    const chosen = new Set(exclude);
    for (const pupil of pupils) {
      if (chosen.has(pupil.id) && pupil.class_code) kept.set(pupil.class_code, (kept.get(pupil.class_code) ?? 0) + 1);
    }
    return [...initial]
      .sort((a, b) => (ORDER.get(a.from_class) ?? 99) - (ORDER.get(b.from_class) ?? 99))
      .map((row) => {
        const total = row.moving + row.repeating;
        const repeating = Math.min(total, kept.get(row.from_class) ?? 0);
        return { ...row, moving: total - repeating, repeating };
      });
  }, [initial, pupils, exclude]);

  const moving = rows.reduce((sum, row) => sum + row.moving, 0);
  const repeating = rows.reduce((sum, row) => sum + row.repeating, 0);
  const graduating = rows.filter((row) => row.to_class === "Graduated").reduce((sum, row) => sum + row.moving, 0);
  const byId = useMemo(() => new Map(pupils.map((pupil) => [pupil.id, pupil])), [pupils]);
  const classCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const pupil of pupils) if (pupil.class_code) counts.set(pupil.class_code, (counts.get(pupil.class_code) ?? 0) + 1);
    return counts;
  }, [pupils]);

  const index = useMemo(() => pupils.map((pupil) => ({ pupil, hay: fold(`${pupil.full_name} ${pupil.student_number}`) })), [pupils]);
  const words = useMemo(() => queryWords(deferred), [deferred]);
  const found = useMemo(() => {
    if (!words.length && !cls) return [];
    return index
      .filter(({ pupil, hay }) => (!cls || pupil.class_code === cls) && words.every((word) => hay.includes(word)))
      .map(({ pupil }) => pupil);
  }, [index, words, cls]);
  const matches = found.slice(0, SHOWN);

  const chosen = new Set(exclude);
  const toggle = (id: string) => setExclude((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  const go = (next: number) => {
    setError("");
    setStep(next);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const ready = confirmation.trim() === String(moving);
  const canRun = season.open;

  if (done) {
    const moved = done.rows.reduce((sum, row) => sum + row.moving, 0);
    const graduated = done.rows.filter((row) => row.to_class === "Graduated").reduce((sum, row) => sum + row.moving, 0);
    const kept = done.rows.reduce((sum, row) => sum + row.repeating, 0);
    return (
      <section className="admin-card opr-done">
        <span className="opr-done-badge" aria-hidden="true"><i className="fa-solid fa-check" /></span>
        <h2>{done.ok}</h2>
        <p>Every move is on each pupil&apos;s timeline. Primary Seven leavers are now marked as graduated.</p>
        <dl className="opr-done-stats">
          <div><dt>Moved up</dt><dd>{nf(moved - graduated)}</dd></div>
          <div><dt>Graduated</dt><dd>{nf(graduated)}</dd></div>
          <div><dt>Repeating</dt><dd>{nf(kept)}</dd></div>
        </dl>
        <Flow rows={done.rows} compact />
        <div className="opr-done-actions">
          <Link className="opr-btn opr-btn-primary" href={`${OFFICE}/classes`}><i className="fa-solid fa-chalkboard" aria-hidden="true" /> See the new classes</Link>
          <Link className="opr-btn opr-btn-ghost" href={`${OFFICE}/reports#leavers`}>Leavers report</Link>
        </div>
      </section>
    );
  }

  if (!rows.length) {
    return (
      <section className="admin-card opr-done">
        <span className="opr-done-badge is-muted" aria-hidden="true"><i className="fa-solid fa-chalkboard" /></span>
        <h2>No pupils to promote</h2>
        <p>There are no active pupils with a class on the register.</p>
      </section>
    );
  }

  if (!canRun) {
    return (
      <div className="opr" ref={top}>
        <Glance moving={moving} graduating={graduating} repeating={0} unplaced={unplaced} />
        <section className="admin-card opr-wizard is-locked" aria-label="Promotion locked">
          <div className="opr-lock">
            <span className="opr-lock-icon" aria-hidden="true">
              <i className={`fa-solid ${season.status === "done" ? "fa-circle-check" : "fa-lock"}`} />
            </span>
            <div>
              <h2>
                {season.status === "done"
                  ? `${season.academicYear} promotion already ran`
                  : "Opens at the beginning of the new year"}
              </h2>
              <p>
                {season.status === "done"
                  ? "Learners were promoted automatically for this academic year. Choosing who repeats is only available at the start of the next year."
                  : "When Term 1 of the new academic year begins, every learner moves up automatically. You can mark anyone who should repeat their class at that time only."}
              </p>
            </div>
          </div>
          <div className="opr-body">
            <header className="opr-body-head">
              <h3>Planned moves for the next run</h3>
              <p>Preview only. Nothing changes until promotion opens in Term 1.</p>
            </header>
            <Flow rows={initial} />
          </div>
          <footer className="opr-foot">
            <Link className="opr-btn opr-btn-ghost" href={`${OFFICE}/classes`}>
              <i className="fa-solid fa-chalkboard" aria-hidden="true" /> Classes
            </Link>
            <span className="opr-foot-note">
              {season.status === "done" ? "Completed for this year" : "Waiting for Term 1"}
            </span>
            <Link className="opr-btn opr-btn-soft" href={`${OFFICE}/students/export`}>
              <i className="fa-solid fa-download" aria-hidden="true" /> Export register
            </Link>
          </footer>
        </section>
      </div>
    );
  }

  return (
    <div className="opr" ref={top}>
      <Glance moving={moving} graduating={graduating} repeating={repeating} unplaced={unplaced} />

      <section className="admin-card opr-wizard" aria-label="Promotion steps">
        <div className="opr-head">
          <ol className="opr-steps">
            {STEPS.map((entry, position) => (
              <li key={entry.label} className={position === step ? "is-on" : position < step ? "is-done" : ""}>
                <button type="button" onClick={() => position < step && go(position)} disabled={position >= step} aria-current={position === step ? "step" : undefined}>
                  <span className="opr-step-dot">{position < step ? <i className="fa-solid fa-check" aria-hidden="true" /> : position + 1}</span>
                  <span className="opr-step-text">
                    <strong>{entry.label}</strong>
                    <small>{entry.note}</small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="opr-progress" aria-hidden="true"><span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
        </div>

        {error ? <p className="opr-error" role="alert"><i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {error}</p> : null}

        {step === 0 ? (
          <div className="opr-body" key="review">
            <header className="opr-body-head">
              <h2>Everyone moves up automatically</h2>
              <p>
                For <strong>{season.academicYear}</strong>, every active pupil moves one class higher and Primary Seven graduates.
                On the next step you can keep selected learners in their current class.
              </p>
            </header>
            <Flow rows={rows} />
          </div>
        ) : null}

        {step === 1 ? (
          <div className="opr-body" key="repeaters">
            <header className="opr-body-head">
              <h2>Who should repeat</h2>
              <p>
                Optional. Choose learners who stay in their current class. Everyone else is promoted automatically.
                This choice is only available at the beginning of the new academic year.
              </p>
            </header>
            <div className="opr-pick">
              <div className="opr-pick-main">
                <div className="opr-search">
                  <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                  <label className="visually-hidden" htmlFor="repeater-search">Find a pupil</label>
                  <input
                    id="repeater-search"
                    type="search"
                    value={q}
                    onChange={(event) => setQ(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Escape") setQ(""); }}
                    placeholder="Find a pupil by name or student number"
                    autoComplete="off"
                    spellCheck={false}
                    autoFocus
                  />
                </div>
                <div className="opr-class-chips" role="group" aria-label="Show a class">
                  <button type="button" className={cls ? "" : "is-on"} onClick={() => setCls("")}>Any class</button>
                  {SCHOOL_CLASSES.filter((entry) => classCounts.get(entry.code)).map((entry) => (
                    <button key={entry.code} type="button" className={cls === entry.code ? "is-on" : ""} onClick={() => setCls(cls === entry.code ? "" : entry.code)} title={entry.name}>
                      {entry.code} <span>{classCounts.get(entry.code)}</span>
                    </button>
                  ))}
                </div>
                {matches.length ? (
                  <>
                    <ul className={`opr-pupils${q !== deferred ? " is-stale" : ""}`}>
                      {matches.map((pupil) => {
                        const on = chosen.has(pupil.id);
                        return (
                          <li key={pupil.id}>
                            <button type="button" className={on ? "is-on" : ""} aria-pressed={on} onClick={() => toggle(pupil.id)}>
                              <span className="opr-check" aria-hidden="true"><i className="fa-solid fa-check" /></span>
                              <span className="opr-pupil">
                                <strong><Highlight text={pupil.full_name} words={words} /></strong>
                                <small><span className="ofc-num"><Highlight text={pupil.student_number} words={words} /></span> · {pupil.class_code ?? "No class"}{pupil.stream ? ` ${pupil.stream}` : ""}</small>
                              </span>
                              <span className="opr-pupil-tag">{on ? `Stays in ${pupil.class_code}` : "Moves up"}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {found.length > SHOWN ? (
                      <p className="opr-more">Showing the first {SHOWN} of {nf(found.length)}. Type more of a name to narrow it down.</p>
                    ) : null}
                  </>
                ) : (
                  <p className="opr-hint">
                    <span aria-hidden="true"><i className={`fa-solid ${q || cls ? "fa-user-xmark" : "fa-magnifying-glass"}`} /></span>
                    {q || cls ? "No pupils match." : "Search for a pupil, or choose a class. Leave empty if nobody repeats."}
                  </p>
                )}
              </div>

              <aside className="opr-repeaters" aria-label="Repeaters">
                <header>
                  <h3>Repeating</h3>
                  <span className="opr-count">{exclude.length}</span>
                  {exclude.length ? (
                    <button type="button" className="opr-btn opr-btn-text" onClick={() => setExclude([])}>Clear all</button>
                  ) : null}
                </header>
                {exclude.length ? (
                  <ul>
                    {exclude.map((id) => {
                      const pupil = byId.get(id);
                      return (
                        <li key={id}>
                          <span>
                            <strong>{pupil?.full_name ?? "Unknown pupil"}</strong>
                            <small>Stays in {className(pupil?.class_code)}</small>
                          </span>
                          <button type="button" className="opr-icon-btn" onClick={() => toggle(id)} aria-label={`Undo: ${pupil?.full_name ?? "pupil"} moves up`} title="Undo">
                            <i className="fa-solid fa-xmark" aria-hidden="true" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="opr-hint is-small"><i className="fa-regular fa-circle-check" aria-hidden="true" /> No repeaters. Everyone moves up automatically.</p>
                )}
              </aside>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <form
            id="promotion-confirm"
            className="opr-body"
            key="confirm"
            onSubmit={(event) => {
              event.preventDefault();
              startTransition(async () => {
                const result = await runPromotion(exclude, confirmation, moving).catch(() => ({ error: "Something went wrong. Check your connection and try again." } as { error: string; ok?: string; rows?: PromotionRow[] }));
                if (result.error) setError(result.error);
                else setDone({ ok: result.ok ?? "Promotion complete.", rows: result.rows ?? rows });
              });
            }}
          >
            <header className="opr-body-head">
              <h2>Confirm automatic promotion</h2>
              <p>
                This will move <strong>{plural(moving - graduating, "pupil")}</strong> up a class, graduate <strong>{plural(graduating, "pupil")}</strong> from Primary Seven
                {repeating ? <> and keep <strong>{plural(repeating, "pupil")}</strong> in their class</> : null}.
              </p>
            </header>
            <Flow rows={rows} compact />
            <ul className="opr-checks">
              <li><i className="fa-solid fa-calendar-check" aria-hidden="true" /> Run once at the start of the academic year. It can&apos;t be undone in one click.</li>
              <li>
                <i className="fa-solid fa-download" aria-hidden="true" /> Keep a copy first:{" "}
                <a href={`${OFFICE}/students/export`}>download the register as a spreadsheet</a>.
              </li>
              <li><i className="fa-solid fa-code-branch" aria-hidden="true" /> Streams and houses stay the same; only the class changes.</li>
            </ul>
            <label className={`opr-confirm${ready ? " is-ready" : ""}`}>
              <span>To confirm, type the number of pupils being promoted: <strong>{nf(moving)}</strong></span>
              <span className="opr-confirm-field">
                <input
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={String(moving)}
                  aria-invalid={confirmation.trim() !== "" && !ready}
                  autoFocus
                />
                {ready ? <small><i className="fa-solid fa-check" aria-hidden="true" /> Ready</small> : null}
              </span>
            </label>
          </form>
        ) : null}

        <footer className="opr-foot">
          {step > 0 ? (
            <button type="button" className="opr-btn opr-btn-ghost" onClick={() => go(step - 1)} disabled={pending}>
              <i className="fa-solid fa-arrow-left" aria-hidden="true" /> Back
            </button>
          ) : <span />}
          <span className="opr-foot-note">
            <strong>{nf(moving)}</strong> promoted automatically{repeating ? <> · <strong>{nf(repeating)}</strong> repeating</> : null}
          </span>
          {step < 2 ? (
            <button type="button" className="opr-btn opr-btn-primary" onClick={() => go(step + 1)}>
              {step === 0 ? "Next: who repeats" : "Next: confirm"} <i className="fa-solid fa-arrow-right" aria-hidden="true" />
            </button>
          ) : (
            <button type="submit" form="promotion-confirm" className="opr-btn opr-btn-accent" disabled={pending || !ready || !moving}>
              <i className={`fa-solid ${pending ? "fa-spinner fa-spin" : "fa-stairs"}`} aria-hidden="true" />
              {pending ? "Promoting…" : `Promote ${nf(moving)} learners`}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

function Glance({
  moving,
  graduating,
  repeating,
  unplaced,
}: {
  moving: number;
  graduating: number;
  repeating: number;
  unplaced: number;
}) {
  return (
    <dl className="opr-stats" aria-label="The promotion at a glance">
      <div className="is-up">
        <dt><span className="opr-stat-icon" aria-hidden="true"><i className="fa-solid fa-arrow-up" /></span> Moving up</dt>
        <dd>{nf(moving - graduating)}</dd>
        <small>Promoted automatically</small>
      </div>
      <div className="is-grad">
        <dt><span className="opr-stat-icon" aria-hidden="true"><i className="fa-solid fa-graduation-cap" /></span> Graduating</dt>
        <dd>{nf(graduating)}</dd>
        <small>Leaving Primary Seven</small>
      </div>
      <div className={repeating ? "is-stay" : "is-quiet"}>
        <dt><span className="opr-stat-icon" aria-hidden="true"><i className="fa-solid fa-rotate-left" /></span> Repeating</dt>
        <dd>{nf(repeating)}</dd>
        <small>{repeating ? "Staying in their class" : "Nobody stays back yet"}</small>
      </div>
      <div className={unplaced ? "is-warn" : "is-quiet"}>
        <dt><span className="opr-stat-icon" aria-hidden="true"><i className="fa-solid fa-user-slash" /></span> Without a class</dt>
        <dd>{nf(unplaced)}</dd>
        <small>{unplaced ? <Link href={`${OFFICE}/data-quality#missing`}>Not moved. Place them first <i className="fa-solid fa-arrow-right" aria-hidden="true" /></Link> : "Everyone has a class"}</small>
      </div>
    </dl>
  );
}

function Flow({ rows, compact = false }: { rows: PromotionRow[]; compact?: boolean }) {
  if (compact) {
    return (
      <ol className="opr-flow is-compact">
        {rows.map((row) => <FlowCard key={row.from_class} row={row} compact />)}
      </ol>
    );
  }
  const groups = [
    ...SECTIONS.map((section) => ({ label: section.label, rows: rows.filter((row) => SECTION_OF.get(row.from_class) === section.value) })),
    { label: "Other", rows: rows.filter((row) => !SECTION_OF.has(row.from_class)) },
  ].filter((group) => group.rows.length);
  return (
    <div className="opr-flow-groups">
      {groups.map((group) => (
        <section key={group.label} className="opr-flow-group">
          <h3>
            {group.label}
            <span>{plural(group.rows.reduce((sum, row) => sum + row.moving + row.repeating, 0), "pupil")}</span>
          </h3>
          <ol className="opr-flow">
            {group.rows.map((row) => <FlowCard key={row.from_class} row={row} />)}
          </ol>
        </section>
      ))}
    </div>
  );
}

function FlowCard({ row, compact = false }: { row: PromotionRow; compact?: boolean }) {
  const graduates = row.to_class === "Graduated";
  const to = graduates ? "graduation" : className(row.to_class);
  return (
    <li className={graduates ? "is-grad" : ""}>
      <div className="opr-flow-route" aria-label={`${className(row.from_class)} to ${to}`}>
        <span className="opr-flow-code">{row.from_class}</span>
        <span className="opr-flow-line" aria-hidden="true" />
        <span className="opr-flow-code is-to" aria-hidden="true">{graduates ? <i className="fa-solid fa-graduation-cap" /> : row.to_class}</span>
      </div>
      <p className="opr-flow-figure">
        <strong>{nf(row.moving)}</strong>
        {compact ? null : <span>{graduates ? "graduating" : "moving up"}</span>}
      </p>
      {compact ? null : <small className="opr-flow-names">{className(row.from_class)} to {to}</small>}
      {row.repeating ? (
        <span className="opr-flow-stay"><i className="fa-solid fa-rotate-left" aria-hidden="true" /> {nf(row.repeating)} stay{row.repeating === 1 ? "s" : ""}</span>
      ) : null}
    </li>
  );
}
