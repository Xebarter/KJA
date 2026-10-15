"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { copyRates, saveRates } from "@/app/accounts/(desk)/settings/actions";
import { Feedback, useOfficeAction } from "@/components/accounts/client";
import { ACCOUNTS_BASE, amount, type FeeItem, type FeeRate } from "@/lib/accounts-format";
import { SCHOOL_CLASSES } from "@/lib/students";

type TermOption = { id: string; label: string };

const key = (itemId: string, classCode: string) => `${itemId}:${classCode}`;
const digits = (text: string) => text.replace(/[^\d]/g, "").slice(0, 12);
const pretty = (text: string) => (text ? Number(text).toLocaleString("en-US") : "");

export function FeeRateGrid({
  terms,
  termId,
  campus,
  campuses,
  items,
  rates,
  prefill,
}: {
  terms: TermOption[];
  termId: string;
  campus: string;
  campuses: string[];
  items: FeeItem[];
  rates: FeeRate[];
  /** Tuition per class from the website fee page, for each campus name (lower case). */
  prefill: Record<string, Record<string, number>>;
}) {
  const router = useRouter();
  const here = useMemo(() => rates.filter((rate) => rate.campus === campus), [rates, campus]);
  const shared = useMemo(() => new Map(rates.filter((rate) => rate.campus === "").map((rate) => [key(rate.item_id, rate.class_code), rate.amount])), [rates]);
  const initial = useMemo(() => Object.fromEntries(here.map((rate) => [key(rate.item_id, rate.class_code), String(rate.amount)])), [here]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [copyFrom, setCopyFrom] = useState("");
  const { result, setResult, pending, run } = useOfficeAction();
  const dirty = useMemo(() => {
    const keys = new Set([...Object.keys(values), ...Object.keys(initial)]);
    return [...keys].some((k) => (values[k] ?? "") !== (initial[k] ?? ""));
  }, [values, initial]);

  useEffect(() => setValues(initial), [initial]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const go = (next: { term?: string; campus?: string }) => {
    if (dirty && !window.confirm("You have unsaved fee changes. Leave without saving?")) return;
    const params = new URLSearchParams({ term: next.term ?? termId });
    const place = next.campus ?? campus;
    if (place) params.set("campus", place);
    setResult(null);
    router.push(`${ACCOUNTS_BASE}/settings?${params.toString()}#rates`, { scroll: false });
  };

  const tuition = items.find((item) => item.kind === "tuition");
  const website = prefill[campus.toLowerCase()];
  const sections = [
    { name: "Nursery", classes: SCHOOL_CLASSES.filter((entry) => entry.section === "nursery") },
    { name: "Primary", classes: SCHOOL_CLASSES.filter((entry) => entry.section === "primary") },
  ];
  const rowTotal = (classCode: string) =>
    items.reduce((sum, item) => {
      const own = values[key(item.id, classCode)];
      const fallback = campus ? shared.get(key(item.id, classCode)) : undefined;
      return sum + (own ? Number(own) : fallback ?? 0);
    }, 0);

  if (!items.length) {
    return <p className="app-muted">Add a fee item such as Tuition first, then set what each class pays here.</p>;
  }

  return (
    <div className="set-grid">
      <div className="set-finder">
        <div className="set-finder-row">
          <label className="ofc-finder-field">
            <span>Term</span>
            <select value={termId} onChange={(event) => go({ term: event.target.value })}>
              {terms.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}
            </select>
          </label>
          <div className="set-campuses">
            <span>Campus</span>
            <div role="tablist" aria-label="Campus">
              {["", ...campuses].map((name) => (
                <button
                  key={name || "all"}
                  type="button"
                  role="tab"
                  aria-selected={campus === name}
                  className={campus === name ? "is-on" : ""}
                  onClick={() => go({ campus: name })}
                >
                  {name || "All campuses"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="set-finder-note">
          <i className="fa-solid fa-circle-info" aria-hidden="true" />
          <span>
            {campus
              ? <>Amounts here apply to pupils at <strong>{campus}</strong>. Leave a cell empty to use the All campuses amount shown in grey.</>
              : <>These amounts apply to every campus, unless a campus has its own. Leave a cell empty when a class does not pay that item.</>}
          </span>
        </p>
      </div>

      <div className="ofc-table-scroll">
        <table className="app-table acc-grid">
          <thead>
            <tr>
              <th scope="col">Class</th>
              {items.map((item) => <th key={item.id} scope="col" className="is-num">{item.name}</th>)}
              <th scope="col" className="is-num">Per pupil</th>
            </tr>
          </thead>
          {sections.map((section) => (
            <tbody key={section.name}>
              <tr className="acc-grid-section"><th colSpan={items.length + 2} scope="rowgroup">{section.name}</th></tr>
              {section.classes.map((entry) => (
                <tr key={entry.code}>
                  <th scope="row">
                    <strong>{entry.code}</strong>
                    <small>{entry.name}</small>
                  </th>
                  {items.map((item) => {
                    const k = key(item.id, entry.code);
                    const fallback = campus ? shared.get(k) : undefined;
                    return (
                      <td key={item.id} className="is-num">
                        <input
                          className={`acc-cell${values[k] && values[k] !== (initial[k] ?? "") ? " is-changed" : ""}`}
                          inputMode="numeric"
                          aria-label={`${item.name} for ${entry.name}`}
                          placeholder={fallback !== undefined ? amount(fallback) : "–"}
                          value={pretty(values[k] ?? "")}
                          onChange={(event) => setValues((current) => ({ ...current, [k]: digits(event.target.value) }))}
                        />
                      </td>
                    );
                  })}
                  <td className="is-num acc-grid-total">{rowTotal(entry.code) ? amount(rowTotal(entry.code)) : "–"}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      <div className="set-foot">
        <div className="set-extras">
          {tuition && website ? (
            <button
              type="button"
              className="admin-btn admin-btn-ghost"
              title="Fills the Tuition column from the fees published on the website. Check whether they are per term before saving."
              onClick={() => {
                setValues((current) => {
                  const next = { ...current };
                  for (const [classCode, value] of Object.entries(website)) next[key(tuition.id, classCode)] = String(value);
                  return next;
                });
                setResult({ warning: "Tuition filled from the website fee page. Check the amounts are per term, then save." });
              }}
            >
              <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" /> Fill tuition from website
            </button>
          ) : null}
          {terms.length > 1 ? (
            <span className="set-copy">
              <select value={copyFrom} onChange={(event) => setCopyFrom(event.target.value)} aria-label="Copy rates from another term">
                <option value="">Copy every campus from…</option>
                {terms.filter((term) => term.id !== termId).map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}
              </select>
              <button
                type="button"
                className="admin-btn admin-btn-ghost"
                disabled={!copyFrom || pending}
                onClick={() => {
                  const from = terms.find((term) => term.id === copyFrom)?.label;
                  if (!window.confirm(`Replace every rate in this term with the rates from ${from}?`)) return;
                  run(() => copyRates(copyFrom, termId), () => setCopyFrom(""));
                }}
              >
                Copy
              </button>
            </span>
          ) : null}
          <Feedback result={result} />
        </div>
        <div>
          {dirty ? <span className="set-dirty"><i className="fa-solid fa-circle" aria-hidden="true" /> Unsaved changes</span> : null}
          <button type="button" className="admin-btn admin-btn-ghost" disabled={!dirty || pending} onClick={() => { setValues(initial); setResult(null); }}>
            Undo
          </button>
          <button
            type="button"
            className="admin-btn"
            disabled={!dirty || pending}
            onClick={() => {
              const payload = items.flatMap((item) =>
                SCHOOL_CLASSES.map((entry) => {
                  const value = values[key(item.id, entry.code)];
                  return { item_id: item.id, class_code: entry.code, amount: value ? Number(value) : null };
                }),
              );
              run(() => saveRates(termId, campus, payload));
            }}
          >
            {pending ? "Saving…" : "Save fees"}
          </button>
        </div>
      </div>
      {tuition ? null : <p className="app-feedback is-warning">Add a fee item of kind Tuition so discounts have something to come off.</p>}
    </div>
  );
}
