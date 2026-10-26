"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { prepareReports } from "@/app/academics_office/(desk)/actions";
import { DeskForm } from "@/components/academics/Form";
import type { ReportSitting } from "@/lib/academics-reports";
import { DEFAULT_REPORT_TITLE } from "@/lib/report-title";

const nf = (value: number) => value.toLocaleString("en-GB");

function roundShare(value: number) {
  return Math.round(value * 10) / 10;
}

export function GenerateReportsDialog({
  termId,
  classCode,
  stream,
  sittings,
  defaultTitle = DEFAULT_REPORT_TITLE,
}: {
  termId: string;
  classCode: string;
  stream: string;
  sittings: ReportSitting[];
  defaultTitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(() => new Set(sittings.map((row) => row.key)));
  const [shares, setShares] = useState(() => Object.fromEntries(sittings.map((row) => [row.key, String(row.share)])));
  const [title, setTitle] = useState(defaultTitle || DEFAULT_REPORT_TITLE);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setPicked(new Set(sittings.map((row) => row.key)));
    setShares(Object.fromEntries(sittings.map((row) => [row.key, String(row.share)])));
  }, [sittings]);

  useEffect(() => {
    setTitle(defaultTitle || DEFAULT_REPORT_TITLE);
  }, [defaultTitle]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const chosen = useMemo(() => sittings.filter((row) => picked.has(row.key)), [sittings, picked]);
  const total = useMemo(
    () => roundShare(chosen.reduce((sum, row) => sum + (Number(shares[row.key]) || 0), 0)),
    [chosen, shares],
  );
  const ready = chosen.length > 0 && Math.abs(total - 100) <= 0.05;

  function toggle(key: string, on: boolean) {
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function toggleAll(on: boolean) {
    setPicked(on ? new Set(sittings.map((row) => row.key)) : new Set());
  }

  function spreadEven() {
    if (!chosen.length) return;
    const base = Math.floor((1000 / chosen.length)) / 10;
    const next = { ...shares };
    let used = 0;
    chosen.forEach((row, index) => {
      const value = index === chosen.length - 1 ? roundShare(100 - used) : base;
      used = roundShare(used + value);
      next[row.key] = String(value);
    });
    setShares(next);
  }

  if (!sittings.length) {
    return (
      <button className="rpt-btn" type="button" disabled title="Set assessments for this class before generating report cards">
        Generate
      </button>
    );
  }

  return (
    <>
      <button className="rpt-btn" type="button" onClick={() => setOpen(true)} title="Choose which assessments go on the cards">
        Generate
      </button>
      {open ? (
        <div
          className="rpt-modal"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="rpt-dialog" role="dialog" aria-modal="true" aria-labelledby="rpt-generate-title">
            <header>
              <p>Report cards</p>
              <h2 id="rpt-generate-title">Prepare report cards</h2>
              <span>Set the title printed on each card, then choose which assessments count and their shares.</span>
            </header>
            <DeskForm
              action={prepareReports}
              className="rpt-generate-form"
              status="Generating reports"
            >
              <input type="hidden" name="term_id" value={termId} />
              <input type="hidden" name="class_code" value={classCode} />
              <input type="hidden" name="stream" value={stream} />
              <label className="rpt-generate-title">
                <span>Title on the card</span>
                <input
                  name="report_title"
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={80}
                  required
                  placeholder={DEFAULT_REPORT_TITLE}
                  aria-describedby="rpt-generate-title-hint"
                />
                <small id="rpt-generate-title-hint">Printed under the school heading, for example End of Term Report.</small>
              </label>
              <div className="rpt-generate-tools">
                <label className="rpt-generate-all">
                  <input
                    type="checkbox"
                    checked={picked.size === sittings.length}
                    ref={(node) => {
                      if (node) node.indeterminate = picked.size > 0 && picked.size < sittings.length;
                    }}
                    onChange={(event) => toggleAll(event.target.checked)}
                  />
                  <span>All assessments</span>
                </label>
                <button type="button" className="rpt-generate-even" onClick={spreadEven} disabled={!chosen.length}>
                  Split evenly
                </button>
              </div>
              <ul className="rpt-generate-list">
                {sittings.map((row) => {
                  const on = picked.has(row.key);
                  return (
                    <li key={row.key} className={on ? "is-on" : ""}>
                      <label className="rpt-generate-pick">
                        <input
                          type="checkbox"
                          name={on ? "set" : undefined}
                          value={row.key}
                          checked={on}
                          onChange={(event) => toggle(row.key, event.target.checked)}
                        />
                        <span>
                          <strong>{row.label}</strong>
                          <small>{row.kindLabel} · {nf(row.papers)} {row.papers === 1 ? "subject" : "subjects"}</small>
                        </span>
                      </label>
                      <label className="rpt-generate-share">
                        <span>Share</span>
                        <input
                          name={on ? `share:${row.key}` : undefined}
                          type="number"
                          min={1}
                          max={100}
                          step={0.1}
                          value={shares[row.key] ?? ""}
                          disabled={!on}
                          onChange={(event) => setShares((current) => ({ ...current, [row.key]: event.target.value }))}
                          aria-label={`Share of the total for ${row.label}`}
                        />
                        <em>%</em>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <p className={`rpt-generate-total${ready ? " is-ok" : ""}`}>
                {chosen.length
                  ? <>Chosen shares add up to <strong>{total}%</strong>{ready ? "" : ". They must total 100%"}.</>
                  : "Choose at least one assessment."}
              </p>
              <footer>
                <button ref={closeRef} type="button" className="rpt-btn is-ghost" onClick={() => setOpen(false)}>Cancel</button>
                <button className="rpt-btn" type="submit" disabled={!ready}>Generate cards</button>
              </footer>
            </DeskForm>
          </div>
        </div>
      ) : null}
    </>
  );
}
