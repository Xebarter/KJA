"use client";

import { useState } from "react";
import { InterventionsDesk, type InterventionCase, type InterventionPupil, type InterventionReason } from "@/components/academics/InterventionsDesk";
import { PointsBoard } from "@/components/academics/PointsBoard";
import type { PointRow } from "@/lib/points";

type Save = (formData: FormData) => Promise<{ error?: string; ok?: string; href?: string }>;
type VoidSave = (formData: FormData) => Promise<{ error?: string; ok?: string }>;
type TermChoice = { id: string; label: string; current: boolean };
type View = "cases" | "points";

const nf = (value: number) => value.toLocaleString("en-GB");

export function InterventionsWorkbench({
  initialView,
  openCount,
  dueCount,
  cases,
  pupils,
  reasons,
  termId,
  saveCase,
  points,
}: {
  initialView: View;
  openCount: number;
  dueCount: number;
  cases: InterventionCase[];
  pupils: InterventionPupil[];
  reasons: InterventionReason[];
  termId: string;
  saveCase: Save;
  points: {
    termId: string;
    termLabel: string;
    terms: TermChoice[];
    rows: PointRow[];
    save: VoidSave;
  } | null;
}) {
  const [view, setView] = useState<View>(initialView);

  return (
    <div className="ivn-work">
      <div className="ivn-tabs" role="tablist" aria-label="Interventions">
        <button
          type="button"
          role="tab"
          aria-selected={view === "cases"}
          className={view === "cases" ? "is-on" : ""}
          onClick={() => setView("cases")}
        >
          <i className="fa-solid fa-hand-holding-heart" aria-hidden="true" />
          Cases
          {openCount ? <em>{nf(openCount)}</em> : null}
          {dueCount ? <span className="ivn-tab-due">{nf(dueCount)} due</span> : null}
        </button>
        {points ? (
          <button
            type="button"
            role="tab"
            aria-selected={view === "points"}
            className={view === "points" ? "is-on" : ""}
            onClick={() => setView("points")}
          >
            <i className="fa-solid fa-star" aria-hidden="true" />
            Points
          </button>
        ) : null}
      </div>

      {view === "cases" ? (
        <div className="ivn-cases" role="tabpanel">
          <section className="ivn-strip" aria-label="Follow-up cases">
            <div className={openCount ? "is-warn" : "is-ok"}>
              <span className="ivn-stat-icon" aria-hidden="true"><i className="fa-solid fa-folder-open" /></span>
              <span className="ivn-stat-copy"><span>Open</span><strong>{nf(openCount)}</strong><small>Still being followed</small></span>
            </div>
            <div className={dueCount ? "is-warn" : "is-ok"}>
              <span className="ivn-stat-icon" aria-hidden="true"><i className="fa-regular fa-calendar" /></span>
              <span className="ivn-stat-copy"><span>Due</span><strong>{nf(dueCount)}</strong><small>Today or overdue</small></span>
            </div>
            <div className={cases.length && cases.every((row) => row.status === "done") ? "is-ok" : ""}>
              <span className="ivn-stat-icon" aria-hidden="true"><i className="fa-solid fa-circle-check" /></span>
              <span className="ivn-stat-copy">
                <span>Done</span>
                <strong>{nf(cases.filter((row) => row.status === "done").length)}</strong>
                <small>Closed this term</small>
              </span>
            </div>
            <div>
              <span className="ivn-stat-icon" aria-hidden="true"><i className="fa-solid fa-user-group" /></span>
              <span className="ivn-stat-copy">
                <span>Pupils</span>
                <strong>{nf(new Set(cases.map((row) => row.studentId)).size)}</strong>
                <small>With a case</small>
              </span>
            </div>
          </section>
          <InterventionsDesk cases={cases} pupils={pupils} reasons={reasons} termId={termId} save={saveCase} />
        </div>
      ) : points ? (
        <div role="tabpanel">
          <PointsBoard
            key={points.termId}
            termId={points.termId}
            termLabel={points.termLabel}
            terms={points.terms}
            rows={points.rows}
            save={points.save}
          />
        </div>
      ) : null}
    </div>
  );
}
