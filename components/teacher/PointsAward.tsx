"use client";

import { useMemo, useState } from "react";
import { DeskForm } from "@/components/academics/Form";
import { formatPoints, pointPolarity, type PointReason } from "@/lib/points";

export type AwardPupil = {
  id: string;
  name: string;
  number: string;
  total: number;
};

type Mode = "class" | "chosen";
type Amounts = Record<string, number>;
type Reasons = Record<string, string>;

const STEPS = [-10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function reasonsFor(reasons: PointReason[], points: number) {
  const polarity = pointPolarity(points);
  return reasons.filter((reason) => reason.polarity === polarity);
}

export function PointsAward({
  classes,
  pupilsByClass,
  reasons,
  termLabel,
  award,
}: {
  classes: { key: string; label: string; count: number }[];
  pupilsByClass: Record<string, AwardPupil[]>;
  reasons: PointReason[];
  termLabel: string;
  award: (formData: FormData) => Promise<{ error?: string; ok?: string }>;
}) {
  const [classKey, setClassKey] = useState(classes[0]?.key || "");
  const [mode, setMode] = useState<Mode>("class");
  const [classPoints, setClassPoints] = useState(1);
  const [classReason, setClassReason] = useState("");
  const [amounts, setAmounts] = useState<Amounts>({});
  const [rowReasons, setRowReasons] = useState<Reasons>({});
  const [sharedReason, setSharedReason] = useState("");
  const pupils = pupilsByClass[classKey] || [];

  const chosen = useMemo(() => {
    return pupils
      .map((pupil) => ({ pupil, points: amounts[pupil.id] || 0 }))
      .filter((row) => row.points !== 0);
  }, [pupils, amounts]);
  const signs = new Set(chosen.map((row) => (row.points < 0 ? "negative" : "positive")));
  const mixed = signs.size > 1;
  const sharedPoints = chosen[0]?.points || classPoints;
  const sharedList = reasonsFor(reasons, mode === "class" ? classPoints : sharedPoints);

  function setAmount(id: string, points: number) {
    setAmounts((current) => ({ ...current, [id]: points }));
    setRowReasons((current) => {
      const next = { ...current };
      const reason = reasons.find((item) => item.id === current[id]);
      if (reason && reason.polarity !== pointPolarity(points)) delete next[id];
      return next;
    });
  }

  function setWholePoints(points: number) {
    setClassPoints(points);
    const reason = reasons.find((item) => item.id === classReason);
    if (reason && reason.polarity !== pointPolarity(points)) setClassReason("");
  }

  function entries() {
    if (mode === "class") {
      if (!classReason || !pupils.length) return [];
      return pupils.map((pupil) => ({ student_id: pupil.id, points: classPoints, reason_id: classReason }));
    }
    return chosen.map((row) => ({
      student_id: row.pupil.id,
      points: row.points,
      reason_id: mixed ? rowReasons[row.pupil.id] || "" : sharedReason,
    }));
  }

  const ready = entries().every((row) => row.reason_id && row.points !== 0) && entries().length > 0;

  return (
    <section className="pts-award">
      <header className="pts-hero">
        <div>
          <p className="pts-kicker"><i className="fa-solid fa-star" aria-hidden="true" /> {termLabel}</p>
          <h2>Award points</h2>
          <p>Give the whole class the same number, or choose pupils and set each amount from 1 to 10. A negative number switches to the other list of reasons.</p>
        </div>
      </header>

      <div className="pts-tools">
        <label className="pts-pick"><span>Class</span>
          <select value={classKey} onChange={(event) => { setClassKey(event.target.value); setAmounts({}); setRowReasons({}); setSharedReason(""); }}>
            {classes.map((item) => <option key={item.key} value={item.key}>{item.label} · {item.count}</option>)}
          </select>
        </label>
        <div className="pts-modes" role="group" aria-label="Who receives points">
          <button type="button" className={mode === "class" ? "is-on" : ""} onClick={() => setMode("class")}>Whole class</button>
          <button type="button" className={mode === "chosen" ? "is-on" : ""} onClick={() => setMode("chosen")}>Choose pupils</button>
        </div>
      </div>

      {mode === "class" ? (
        <div className="pts-panel">
          <AmountPicker value={classPoints} onChange={setWholePoints} />
          <ReasonPicker reasons={sharedList} value={classReason} onChange={setClassReason} />
          <p className="pts-note">This goes to all {pupils.length} {pupils.length === 1 ? "pupil" : "pupils"} in the class. The pupil and their parents are notified.</p>
        </div>
      ) : (
        <div className="pts-panel">
          {!mixed && chosen.length ? <ReasonPicker reasons={sharedList} value={sharedReason} onChange={setSharedReason} /> : null}
          <ul className="pts-roster">
            {pupils.map((pupil) => {
              const points = amounts[pupil.id] || 0;
              const list = reasonsFor(reasons, points || 1);
              return (
                <li key={pupil.id}>
                  <div className="pts-who">
                    <strong>{pupil.name}</strong>
                    <small>{pupil.number} · this term {formatPoints(pupil.total)}</small>
                  </div>
                  <AmountPicker value={points} allowZero onChange={(next) => setAmount(pupil.id, next)} />
                  {mixed && points !== 0 ? (
                    <ReasonPicker reasons={list} value={rowReasons[pupil.id] || ""} onChange={(id) => setRowReasons((current) => ({ ...current, [pupil.id]: id }))} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <DeskForm action={award} className="pts-send">
        <input type="hidden" name="entries" value={JSON.stringify(entries())} />
        <button className="pts-commit" type="submit" disabled={!ready}>Award points</button>
      </DeskForm>
    </section>
  );
}

function AmountPicker({ value, onChange, allowZero = false }: { value: number; onChange: (points: number) => void; allowZero?: boolean }) {
  return (
    <div className="pts-amounts" role="group" aria-label="Points">
      {allowZero ? <button type="button" className={value === 0 ? "is-on" : ""} onClick={() => onChange(0)}>Skip</button> : null}
      {STEPS.map((step) => (
        <button key={step} type="button" className={`${value === step ? "is-on" : ""} ${step < 0 ? "is-down" : "is-up"}`} onClick={() => onChange(step)}>
          {step > 0 ? `+${step}` : step}
        </button>
      ))}
    </div>
  );
}

function ReasonPicker({ reasons, value, onChange }: { reasons: PointReason[]; value: string; onChange: (id: string) => void }) {
  return (
    <label className="pts-pick"><span>{reasons[0]?.polarity === "negative" ? "Why these points were taken" : "Why these points were given"}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} required>
        <option value="">Choose a reason</option>
        {reasons.map((reason) => <option key={reason.id} value={reason.id}>{reason.label}</option>)}
      </select>
    </label>
  );
}
