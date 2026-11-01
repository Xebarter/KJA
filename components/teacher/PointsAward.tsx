"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { DeskForm } from "@/components/academics/Form";
import { formatPoints, type PointPolarity, type PointReason } from "@/lib/points";

export type AwardPupil = {
  id: string;
  name: string;
  number: string;
  total: number;
};

const AMOUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

function reasonsFor(reasons: PointReason[], polarity: PointPolarity) {
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
  const searchRef = useRef<HTMLInputElement>(null);
  const [classKey, setClassKey] = useState(classes[0]?.key || "");
  const [polarity, setPolarity] = useState<PointPolarity>("positive");
  const [amount, setAmount] = useState(1);
  const [reasonId, setReasonId] = useState("");
  const [everyone, setEveryone] = useState(false);
  const [selected, setSelected] = useState<Record<string, true>>({});
  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();

  const pupils = pupilsByClass[classKey] || [];
  const reasonList = useMemo(() => reasonsFor(reasons, polarity), [reasons, polarity]);
  const signed = polarity === "negative" ? -amount : amount;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pupils;
    return pupils.filter(
      (pupil) => pupil.name.toLowerCase().includes(q) || pupil.number.toLowerCase().includes(q),
    );
  }, [pupils, query]);

  const picked = useMemo(() => {
    if (everyone) return pupils;
    return pupils.filter((pupil) => selected[pupil.id]);
  }, [pupils, everyone, selected]);

  const ready = Boolean(reasonId && amount > 0 && picked.length > 0);
  const entries = ready
    ? picked.map((pupil) => ({
        student_id: pupil.id,
        points: signed,
        reason_id: reasonId,
      }))
    : [];

  useEffect(() => {
    searchRef.current?.focus({ preventScroll: true });
  }, [classKey]);

  function switchClass(next: string) {
    setClassKey(next);
    setSelected({});
    setEveryone(false);
    setQuery("");
  }

  function switchPolarity(next: PointPolarity) {
    if (next === polarity) return;
    setPolarity(next);
    setReasonId("");
  }

  function togglePupil(id: string) {
    setEveryone(false);
    startTransition(() => {
      setSelected((current) => {
        const next = { ...current };
        if (next[id]) delete next[id];
        else next[id] = true;
        return next;
      });
    });
  }

  function selectVisible() {
    setEveryone(false);
    setSelected((current) => {
      const next = { ...current };
      for (const pupil of filtered) next[pupil.id] = true;
      return next;
    });
  }

  function clearPicks() {
    setEveryone(false);
    setSelected({});
  }

  function onSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || filtered.length !== 1) return;
    event.preventDefault();
    togglePupil(filtered[0].id);
  }

  const pickCount = everyone ? pupils.length : Object.keys(selected).length;
  const summary = ready
    ? `${formatPoints(signed)} · ${picked.length}`
    : pickCount
      ? "Choose amount & reason"
      : "Find pupils";

  return (
    <section className="pts-award">
      <div className="pts-toolbar">
        <label className="pts-class">
          <span className="pts-sr">Class</span>
          <select value={classKey} onChange={(event) => switchClass(event.target.value)} aria-label="Class">
            {classes.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label} ({item.count})
              </option>
            ))}
          </select>
        </label>
        <p className="pts-term" title={termLabel}>{termLabel}</p>
      </div>

      <label className="pts-search">
        <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onSearchKey}
          placeholder="Search name or number…"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Search pupils"
        />
        {query ? (
          <button type="button" className="pts-search-clear" onClick={() => setQuery("")} aria-label="Clear search">
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        ) : null}
      </label>

      <div className="pts-pick-bar">
        <button type="button" className={everyone ? "is-on" : ""} onClick={() => { setEveryone(true); setSelected({}); }}>
          Everyone
        </button>
        <button type="button" onClick={selectVisible} disabled={!filtered.length || everyone}>
          Visible
        </button>
        <button type="button" onClick={clearPicks} disabled={!pickCount}>
          Clear
        </button>
        <span className="pts-pick-count">{pickCount || "—"}</span>
      </div>

      {filtered.length ? (
        <ul className="pts-roster" role="listbox" aria-label="Pupils" aria-multiselectable="true">
          {filtered.map((pupil) => {
            const on = everyone || Boolean(selected[pupil.id]);
            return (
              <li key={pupil.id}>
                <button
                  type="button"
                  className={`pts-pupil${on ? " is-on" : ""}`}
                  onClick={() => togglePupil(pupil.id)}
                  aria-selected={on}
                  role="option"
                >
                  <span className="pts-check" aria-hidden="true">
                    <i className={`fa-solid ${on ? "fa-check" : ""}`} />
                  </span>
                  <span className="pts-who">
                    <strong>{pupil.name}</strong>
                    <small>{pupil.number}</small>
                  </span>
                  <span className={`pts-total${pupil.total < 0 ? " is-down" : pupil.total > 0 ? " is-up" : ""}`}>
                    {formatPoints(pupil.total)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="pts-empty">{pupils.length ? "No match" : "No pupils"}</p>
      )}

      <div className="pts-controls">
        <div className="pts-seg" role="group" aria-label="Give or take">
          <button type="button" className={`is-give${polarity === "positive" ? " is-on" : ""}`} onClick={() => switchPolarity("positive")}>
            Give
          </button>
          <button type="button" className={`is-take${polarity === "negative" ? " is-on" : ""}`} onClick={() => switchPolarity("negative")}>
            Take
          </button>
        </div>

        <div className="pts-amounts" role="group" aria-label="Amount">
          {AMOUNTS.map((step) => (
            <button
              key={step}
              type="button"
              className={`${amount === step ? "is-on" : ""} ${polarity === "negative" ? "is-take" : "is-give"}`}
              onClick={() => setAmount(step)}
            >
              {polarity === "negative" ? `−${step}` : step}
            </button>
          ))}
        </div>

        <label className="pts-reason">
          <span className="pts-sr">Reason</span>
          <select value={reasonId} onChange={(event) => setReasonId(event.target.value)} aria-label="Reason">
            <option value="">Reason…</option>
            {reasonList.map((reason) => (
              <option key={reason.id} value={reason.id}>
                {reason.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <DeskForm action={award} className="pts-send" status={polarity === "negative" ? "Take points" : "Give points"}>
        <input type="hidden" name="entries" value={JSON.stringify(entries)} />
        <div className="pts-footer">
          <p className={`pts-summary${ready ? " is-ready" : ""}`}>{summary}</p>
          <button className={`pts-commit${polarity === "negative" ? " is-take" : ""}`} type="submit" disabled={!ready}>
            {polarity === "negative" ? "Take" : "Give"}
          </button>
        </div>
      </DeskForm>
    </section>
  );
}
