"use client";

import { useMemo, useState } from "react";
import { DeskForm } from "@/components/academics/Form";
import { StudentFace } from "@/components/StudentFace";
import { ACADEMICS_BASE, classLabel, classOrder } from "@/lib/academics";
import {
  POINT_BALANCES,
  POINT_SORTS,
  emptyPointFilter,
  filterPointRows,
  formatPoints,
  pointFilterQuery,
  type PointListFilter,
  type PointRow,
} from "@/lib/points";

type Save = (formData: FormData) => Promise<{ error?: string; ok?: string }>;

type TermChoice = { id: string; label: string; current: boolean };

const nf = (value: number) => value.toLocaleString("en-GB");

function when(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Kampala",
  });
}

export function PointsBoard({
  termId,
  termLabel,
  terms,
  rows,
  save,
}: {
  termId: string;
  termLabel: string;
  terms: TermChoice[];
  rows: PointRow[];
  save: Save;
}) {
  const [filter, setFilter] = useState<PointListFilter>(emptyPointFilter);
  const [openId, setOpenId] = useState<string | null>(null);
  const visible = useMemo(() => filterPointRows(rows, filter), [rows, filter]);
  const given = visible.reduce((sum, row) => sum + row.given, 0);
  const taken = visible.reduce((sum, row) => sum + row.taken, 0);
  const scored = visible.filter((row) => row.total !== 0).length;
  const classes = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) if (row.pupil.classCode) map.set(row.pupil.classCode, classLabel(row.pupil.classCode));
    return [...map.entries()].sort((a, b) => (classOrder(a[0]) ?? 99) - (classOrder(b[0]) ?? 99));
  }, [rows]);
  const streams = useMemo(() => {
    const values = new Set<string>();
    for (const row of rows) {
      if (filter.classCode && row.pupil.classCode !== filter.classCode) continue;
      if (row.pupil.stream) values.add(row.pupil.stream);
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [rows, filter.classCode]);
  const exportHref = `${ACADEMICS_BASE}/interventions/export?${pointFilterQuery(filter, termId)}`;

  function patch(next: Partial<PointListFilter>) {
    setFilter((current) => ({ ...current, ...next }));
  }

  return (
    <section className="ivn-points" aria-label="Points">
      <header className="ivn-points-hero">
        <div>
          <p className="ivn-kicker"><i className="fa-solid fa-star" aria-hidden="true" /> Rewards</p>
          <h2>Points this term</h2>
          <p>Search a class, then open a pupil to void a mistaken award. Export or print the list you see.</p>
        </div>
        <div className="ivn-points-actions no-print">
          <label className="ivn-term">
            <span>Term</span>
            <select value={termId} onChange={(event) => { window.location.href = `${ACADEMICS_BASE}/interventions?view=points&term=${event.target.value}`; }}>
              {terms.map((term) => <option key={term.id} value={term.id}>{term.label}{term.current ? " · current" : ""}</option>)}
            </select>
          </label>
          <a className="ivn-btn ivn-btn-gold" href={exportHref}><i className="fa-solid fa-file-excel" aria-hidden="true" /> Excel</a>
          <button className="ivn-btn" type="button" onClick={() => window.print()}><i className="fa-solid fa-print" aria-hidden="true" /> Print</button>
        </div>
      </header>

      <p className="ivn-print-only">{termLabel} · {nf(visible.length)} {visible.length === 1 ? "pupil" : "pupils"}</p>

      <div className="ivn-point-strip" aria-label="Points summary">
        <div className="is-navy">
          <span className="ivn-stat-icon" aria-hidden="true"><i className="fa-solid fa-user-group" /></span>
          <span className="ivn-stat-copy"><span>Pupils</span><strong>{nf(scored)}</strong><small>With a balance in this list</small></span>
        </div>
        <div className="is-mint">
          <span className="ivn-stat-icon" aria-hidden="true"><i className="fa-solid fa-plus" /></span>
          <span className="ivn-stat-copy"><span>Given</span><strong>{nf(given)}</strong><small>Points awarded</small></span>
        </div>
        <div className="is-coral">
          <span className="ivn-stat-icon" aria-hidden="true"><i className="fa-solid fa-minus" /></span>
          <span className="ivn-stat-copy"><span>Taken</span><strong>{nf(taken)}</strong><small>Points removed</small></span>
        </div>
      </div>

      <div className="ivn-points-tools no-print">
        <label className="ivn-search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <input value={filter.q} onChange={(event) => patch({ q: event.target.value })} placeholder="Search name or admission number" aria-label="Search pupils" />
        </label>
        <label className="ivn-pick"><span>Class</span>
          <select value={filter.classCode} onChange={(event) => patch({ classCode: event.target.value, stream: "" })}>
            <option value="">All classes</option>
            {classes.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        </label>
        <label className="ivn-pick"><span>Stream</span>
          <select value={filter.stream} onChange={(event) => patch({ stream: event.target.value })}>
            <option value="">All streams</option>
            {streams.map((stream) => <option key={stream} value={stream}>{stream}</option>)}
          </select>
        </label>
        <label className="ivn-pick"><span>Balance</span>
          <select value={filter.balance} onChange={(event) => patch({ balance: event.target.value as PointListFilter["balance"] })}>
            {POINT_BALANCES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className="ivn-pick"><span>Sort</span>
          <select value={filter.sort} onChange={(event) => patch({ sort: event.target.value as PointListFilter["sort"] })}>
            {POINT_SORTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </div>

      <div className="ivn-sheet-wrap">
        <table className="ivn-sheet">
          <thead>
            <tr>
              <th>Pupil</th>
              <th>Class</th>
              <th>Points</th>
              <th>Given</th>
              <th>Taken</th>
              <th className="no-print">Awards</th>
            </tr>
          </thead>
          <tbody>
            {visible.length ? visible.map((row) => {
              const open = openId === row.pupil.id;
              const live = row.awards.filter((award) => !award.voidedAt).length;
              return (
                <tr key={row.pupil.id} className={open ? "is-open" : ""}>
                  <td>
                    <button className="ivn-pupil" type="button" onClick={() => setOpenId(open ? null : row.pupil.id)} aria-expanded={open}>
                      <StudentFace id={row.pupil.id} name={row.pupil.name} photoPath={row.pupil.photoPath} className="ivn-face" />
                      <span>
                        <strong>{row.pupil.name}</strong>
                        <small>{row.pupil.number}</small>
                      </span>
                    </button>
                    {open ? (
                      <div className="ivn-ledger no-print">
                        {row.awards.length ? row.awards.map((award) => (
                          <div key={award.id} className={award.voidedAt ? "is-void" : ""}>
                            <b className={award.points > 0 ? "is-up" : "is-down"}>{formatPoints(award.points)}</b>
                            <span>
                              <strong>{award.reasonLabel}</strong>
                              <small>{award.teacherName} · {when(award.createdAt)}{award.voidedAt ? " · void" : ""}</small>
                            </span>
                            {award.voidedAt ? null : (
                              <DeskForm action={save} className="ivn-void">
                                <input type="hidden" name="id" value={award.id} />
                                <button type="submit">Void award</button>
                              </DeskForm>
                            )}
                          </div>
                        )) : <p>No awards this term.</p>}
                      </div>
                    ) : null}
                  </td>
                  <td>{row.pupil.classLabel}</td>
                  <td className={row.total > 0 ? "is-up" : row.total < 0 ? "is-down" : ""}>{formatPoints(row.total)}</td>
                  <td>{nf(row.given)}</td>
                  <td>{nf(row.taken)}</td>
                  <td className="no-print">{nf(live)}</td>
                </tr>
              );
            }) : (
              <tr><td colSpan={6} className="ivn-empty">No pupils match this list.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
