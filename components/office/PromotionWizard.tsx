"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { previewPromotion, runPromotion, type PromotionRow } from "@/app/admissions_office/(office)/promotions/actions";
import { OFFICE, SCHOOL_CLASSES, className } from "@/lib/students";

export type PromotionPupil = { id: string; full_name: string; class_code: string | null; stream: string | null; student_number: string };

const STEPS = ["Review", "Repeaters", "Confirm"] as const;

export function PromotionWizard({ pupils, initial }: { pupils: PromotionPupil[]; initial: PromotionRow[] }) {
  const [step, setStep] = useState(0);
  const [rows, setRows] = useState(initial);
  const [exclude, setExclude] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ ok: string; rows: PromotionRow[] } | null>(null);
  const [pending, startTransition] = useTransition();

  const moving = rows.reduce((sum, row) => sum + row.moving, 0);
  const repeating = rows.reduce((sum, row) => sum + row.repeating, 0);
  const graduating = rows.filter((row) => row.to_class === "Graduated").reduce((sum, row) => sum + row.moving, 0);
  const byId = useMemo(() => new Map(pupils.map((pupil) => [pupil.id, pupil])), [pupils]);
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle && !cls) return [];
    return pupils
      .filter((pupil) => !exclude.includes(pupil.id))
      .filter((pupil) => !cls || pupil.class_code === cls)
      .filter((pupil) => !needle || pupil.full_name.toLowerCase().includes(needle) || pupil.student_number.toLowerCase().includes(needle))
      .slice(0, 40);
  }, [pupils, q, cls, exclude]);

  const refresh = (next: string[]) => {
    setExclude(next);
    startTransition(async () => {
      const result = await previewPromotion(next);
      if (result.error) setError(result.error);
      else {
        setError("");
        setRows(result.rows ?? []);
      }
    });
  };

  if (done) {
    return (
      <section className="admin-card ofc-wizard-done">
        <span className="ofc-wizard-badge"><i className="fa-solid fa-circle-check" aria-hidden="true" /></span>
        <h2>{done.ok}</h2>
        <p>Every move is on each pupil&apos;s timeline. Primary Seven leavers are marked as graduated.</p>
        <PromotionTable rows={done.rows} />
        <div className="ofc-row-actions">
          <Link className="admin-btn" href={`${OFFICE}/classes`}>See the new classes</Link>
          <Link className="admin-btn admin-btn-ghost" href={`${OFFICE}/reports#leavers`}>Leavers report</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-card ofc-wizard">
      <ol className="ofc-steps">
        {STEPS.map((label, index) => (
          <li key={label} className={index === step ? "is-on" : index < step ? "is-done" : ""}>
            <span>{index < step ? <i className="fa-solid fa-check" aria-hidden="true" /> : index + 1}</span> {label}
          </li>
        ))}
      </ol>

      {error ? <p className="app-feedback is-error ofc-flush" role="alert"><i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {error}</p> : null}

      {step === 0 ? (
        <div className="ofc-wizard-body">
          <p>
            Every active pupil moves up one class. Primary Seven pupils graduate and leave the active register. Nothing changes until the last step.
          </p>
          <PromotionTable rows={rows} />
          <div className="ofc-row-actions">
            <button type="button" className="admin-btn" onClick={() => setStep(1)}>Next: choose repeaters <i className="fa-solid fa-arrow-right" aria-hidden="true" /></button>
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="ofc-wizard-body">
          <p>Pick any pupils who will repeat their class next year. They stay where they are; everyone else moves up.</p>
          <div className="ofc-wizard-pick">
            <div>
              <div className="ofc-filter-row">
                <div className="app-search">
                  <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                  <label className="visually-hidden" htmlFor="repeater-search">Find a pupil</label>
                  <input id="repeater-search" type="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Name or student number" autoFocus />
                </div>
                <select aria-label="Class" value={cls} onChange={(event) => setCls(event.target.value)}>
                  <option value="">Any class</option>
                  {SCHOOL_CLASSES.map((entry) => <option key={entry.code} value={entry.code}>{entry.code} · {entry.name}</option>)}
                </select>
              </div>
              {matches.length ? (
                <ul className="ofc-pick-list">
                  {matches.map((pupil) => (
                    <li key={pupil.id}>
                      <span>{pupil.full_name}<small>{pupil.student_number} · {pupil.class_code ?? "No class"}{pupil.stream ? ` ${pupil.stream}` : ""}</small></span>
                      <button type="button" className="app-link-btn" disabled={pending} onClick={() => refresh([...exclude, pupil.id])}>Repeats</button>
                    </li>
                  ))}
                </ul>
              ) : <p className="app-muted ofc-tiny">{q || cls ? "No pupils match." : "Search, or choose a class to see its pupils."}</p>}
            </div>
            <div className="ofc-repeaters">
              <h3>Repeating <span className="app-count">{exclude.length}</span></h3>
              {exclude.length ? (
                <ul className="ofc-pick-list">
                  {exclude.map((id) => {
                    const pupil = byId.get(id);
                    return (
                      <li key={id}>
                        <span>{pupil?.full_name ?? "Unknown"}<small>Stays in {className(pupil?.class_code)}</small></span>
                        <button type="button" className="app-link-btn" disabled={pending} onClick={() => refresh(exclude.filter((item) => item !== id))}>Undo</button>
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="app-muted ofc-tiny">No repeaters. Everyone moves up.</p>}
            </div>
          </div>
          <div className="ofc-row-actions">
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setStep(0)}>Back</button>
            <button type="button" className="admin-btn" disabled={pending} onClick={() => setStep(2)}>
              {pending ? "Updating…" : <>Next: confirm <i className="fa-solid fa-arrow-right" aria-hidden="true" /></>}
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <form
          className="ofc-wizard-body"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const result = await runPromotion(exclude, confirmation, moving).catch(() => ({ error: "Something went wrong. Check your connection and try again." } as { error: string; ok?: string; rows?: PromotionRow[] }));
              if (result.error) setError(result.error);
              else setDone({ ok: result.ok ?? "Promotion complete.", rows: result.rows ?? rows });
            });
          }}
        >
          <div className="ofc-banner is-warn">
            <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
            <p>
              This moves <strong>{moving - graduating}</strong> pupils up a class, graduates <strong>{graduating}</strong> from Primary Seven and keeps{" "}
              <strong>{repeating}</strong> back. It can&apos;t be undone in one click, so run it once, at the end of the school year.
            </p>
          </div>
          <PromotionTable rows={rows} />
          <label className="ofc-field ofc-confirm">
            <span>Type <strong>{moving}</strong> to confirm</span>
            <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} inputMode="numeric" autoComplete="off" />
          </label>
          <div className="ofc-row-actions">
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setStep(1)}>Back</button>
            <button type="submit" className="admin-btn ofc-danger" disabled={pending || confirmation.trim() !== String(moving) || !moving}>
              <i className="fa-solid fa-stairs" aria-hidden="true" /> {pending ? "Promoting…" : `Promote ${moving} pupils`}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function PromotionTable({ rows }: { rows: PromotionRow[] }) {
  if (!rows.length) return <p className="app-muted">No active pupils with a class to promote.</p>;
  return (
    <table className="app-table ofc-table ofc-promo-table">
      <thead>
        <tr><th>From</th><th aria-hidden="true" /><th>To</th><th>Moving</th><th>Repeating</th></tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.from_class}>
            <td><strong>{row.from_class}</strong> <small>{className(row.from_class)}</small></td>
            <td aria-hidden="true"><i className="fa-solid fa-arrow-right-long" /></td>
            <td>
              {row.to_class === "Graduated"
                ? <span className="app-status app-status-offer"><i className="fa-solid fa-graduation-cap" aria-hidden="true" /> Graduates</span>
                : <><strong>{row.to_class}</strong> <small>{className(row.to_class)}</small></>}
            </td>
            <td>{row.moving}</td>
            <td>{row.repeating || <span className="app-muted">0</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
