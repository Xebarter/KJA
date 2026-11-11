"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { combinedMarksheetHref, type CombinedSitting } from "@/lib/marksheet";

export type MarksheetSittingChoice = {
  key: string;
  name: string;
  kind: string;
  heldOn: string;
  kindLabel: string;
  heldLabel: string;
  subjects: number;
  open: number;
  href: string;
};

function nf(value: number) {
  return value.toLocaleString("en-GB");
}

export function MarksheetSittingCombine({
  sittings,
  classCode,
  stream,
  campus,
  basePath,
}: {
  sittings: MarksheetSittingChoice[];
  classCode: string;
  stream: string;
  campus: string;
  basePath: string;
}) {
  const [combining, setCombining] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const byKey = useMemo(() => new Map(sittings.map((sitting) => [sitting.key, sitting])), [sittings]);
  const canCombine = sittings.length >= 2;
  const selectedCount = selected.length;
  const openHref =
    selectedCount >= 2
      ? combinedMarksheetHref({
          classCode,
          stream,
          campus,
          basePath,
          sittings: selected
            .map((key) => byKey.get(key))
            .filter(Boolean)
            .map(
              (sitting): CombinedSitting => ({
                name: sitting!.name,
                kind: sitting!.kind,
                held: sitting!.heldOn,
              }),
            ),
        })
      : "";

  function toggle(key: string) {
    setSelected((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }

  function leaveCombine() {
    setCombining(false);
    setSelected([]);
  }

  return (
    <>
      <div className="tch-msh-panel-head">
        <div>
          <h2>Assessments</h2>
          <p>
            {combining
              ? "Select two or more sittings to open on one worksheet."
              : "Pick one sitting to open the full class marksheet."}
          </p>
        </div>
        {canCombine ? (
          <div className="tch-msh-combine-tools">
            {combining ? (
              <button type="button" className="tch-msh-combine-btn" onClick={leaveCombine}>
                Cancel
              </button>
            ) : (
              <button type="button" className="tch-msh-combine-btn is-accent" onClick={() => setCombining(true)}>
                <i className="fa-solid fa-layer-group" aria-hidden="true" />
                Combine assessments
              </button>
            )}
          </div>
        ) : null}
      </div>

      <ul className={`tch-msh-grid${combining ? " is-combining" : ""}`}>
        {sittings.map((sitting, index) => {
          const locked = Math.max(0, sitting.subjects - sitting.open);
          const ready = sitting.open > 0;
          const checked = selected.includes(sitting.key);

          if (combining) {
            return (
              <li key={sitting.key}>
                <button
                  type="button"
                  className={`tch-msh-card is-select${checked ? " is-selected" : ""}`}
                  data-tone={String(index % 8)}
                  aria-pressed={checked}
                  onClick={() => toggle(sitting.key)}
                >
                  <div className="tch-msh-card-top">
                    <span className="tch-msh-card-icon" aria-hidden="true">
                      <i className="fa-solid fa-clipboard-list" />
                    </span>
                    <span className={`tch-msh-check${checked ? " is-on" : ""}`} aria-hidden="true">
                      <i className="fa-solid fa-check" />
                    </span>
                  </div>
                  <div>
                    <h3>{sitting.name}</h3>
                    <p>
                      {sitting.kindLabel} · {sitting.heldLabel}
                    </p>
                  </div>
                  <ul className="tch-msh-meta">
                    <li>
                      <i className="fa-solid fa-book" aria-hidden="true" />
                      {nf(sitting.subjects)} {sitting.subjects === 1 ? "subject" : "subjects"}
                    </li>
                    {sitting.open ? (
                      <li>
                        <i className="fa-solid fa-pen" aria-hidden="true" />
                        {nf(sitting.open)} editable
                      </li>
                    ) : null}
                    {locked ? (
                      <li>
                        <i className="fa-solid fa-lock" aria-hidden="true" />
                        {nf(locked)} locked
                      </li>
                    ) : null}
                  </ul>
                  <div className="tch-msh-card-foot">
                    <span className="tch-msh-go">{checked ? "Selected" : "Tap to select"}</span>
                  </div>
                </button>
              </li>
            );
          }

          return (
            <li key={sitting.key}>
              <Link className="tch-msh-card" href={sitting.href} data-tone={String(index % 8)}>
                <div className="tch-msh-card-top">
                  <span className="tch-msh-card-icon" aria-hidden="true">
                    <i className="fa-solid fa-clipboard-list" />
                  </span>
                  <span className={`tch-msh-badge ${ready ? "is-open" : "is-locked"}`}>
                    {ready ? "Open" : "Locked"}
                  </span>
                </div>
                <div>
                  <h3>{sitting.name}</h3>
                  <p>
                    {sitting.kindLabel} · {sitting.heldLabel}
                  </p>
                </div>
                <ul className="tch-msh-meta">
                  <li>
                    <i className="fa-solid fa-book" aria-hidden="true" />
                    {nf(sitting.subjects)} {sitting.subjects === 1 ? "subject" : "subjects"}
                  </li>
                  {sitting.open ? (
                    <li>
                      <i className="fa-solid fa-pen" aria-hidden="true" />
                      {nf(sitting.open)} editable
                    </li>
                  ) : null}
                  {locked ? (
                    <li>
                      <i className="fa-solid fa-lock" aria-hidden="true" />
                      {nf(locked)} locked
                    </li>
                  ) : null}
                </ul>
                <div className="tch-msh-card-foot">
                  <span className="tch-msh-go">
                    Open marksheet <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {combining ? (
        <div className="tch-msh-combine-bar" role="status">
          <p>
            {selectedCount === 0
              ? "Choose at least two assessments."
              : selectedCount === 1
                ? "Select one more assessment."
                : `${selectedCount} assessments selected.`}
          </p>
          {openHref ? (
            <Link className="tch-msh-combine-open" href={openHref}>
              Open combined marksheet ({selectedCount})
              <i className="fa-solid fa-arrow-right" aria-hidden="true" />
            </Link>
          ) : (
            <span className="tch-msh-combine-open is-disabled" aria-disabled="true">
              Open combined marksheet
            </span>
          )}
        </div>
      ) : null}
    </>
  );
}
