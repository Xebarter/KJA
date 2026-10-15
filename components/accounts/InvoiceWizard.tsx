"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { generateInvoices, type GenerateResult, type GenerateRow } from "@/app/accounts/(desk)/invoices/actions";
import { Feedback } from "@/components/accounts/client";
import { ACCOUNTS_BASE, amount, day, ugx } from "@/lib/accounts-format";
import type { ActionResult } from "@/lib/office-forms";
import { SCHOOL_CLASSES, className } from "@/lib/students";

type TermOption = { id: string; label: string; due_on: string | null; billed: number };

const STEPS = ["Choose", "Preview", "Done"];

export function InvoiceWizard({ terms, termId, ratedClasses, activeByClass }: {
  terms: TermOption[];
  termId: string;
  /** Classes that have at least one fee rate, per term id. */
  ratedClasses: Record<string, string[]>;
  activeByClass: Record<string, number>;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [term, setTerm] = useState(termId);
  const [classes, setClasses] = useState<string[]>(SCHOOL_CLASSES.map((entry) => entry.code));
  const [status, setStatus] = useState<"issued" | "draft">("issued");
  const [rows, setRows] = useState<GenerateRow[]>([]);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const chosen = terms.find((entry) => entry.id === term);
  const rated = new Set(ratedClasses[term] ?? []);

  const totals = rows.reduce(
    (sum, row) => ({
      pupils: sum.pupils + row.pupils,
      toBill: sum.toBill + row.to_bill,
      billed: sum.billed + row.already_billed,
      noRates: sum.noRates + row.no_rates,
      gross: sum.gross + row.gross,
      discounts: sum.discounts + row.discounts,
      net: sum.net + row.net,
    }),
    { pupils: 0, toBill: 0, billed: 0, noRates: 0, gross: 0, discounts: 0, net: 0 },
  );

  const runRpc = (dryRun: boolean) => {
    setResult(null);
    start(async () => {
      const outcome: GenerateResult = await generateInvoices(term, classes, dryRun, status).catch(() => ({ error: "Something went wrong. Check your connection and try again." }));
      if ("rows" in outcome && outcome.rows) setRows(outcome.rows);
      setResult(outcome.error ? { error: outcome.error } : outcome.ok ? { ok: outcome.ok } : null);
      if (!outcome.error) {
        setStep(dryRun ? 1 : 2);
        if (!dryRun) router.refresh();
      }
    });
  };

  const toggle = (codes: string[], on: boolean) =>
    setClasses((current) => (on ? [...new Set([...current, ...codes])] : current.filter((code) => !codes.includes(code))));

  return (
    <div className="acc-wizard">
      <ol className="acc-steps" aria-label="Progress">
        {STEPS.map((label, index) => (
          <li key={label} className={index === step ? "is-on" : index < step ? "is-done" : ""} aria-current={index === step ? "step" : undefined}>
            <span>{index < step ? <i className="fa-solid fa-check" aria-hidden="true" /> : index + 1}</span> {label}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <section className="ofc-fieldset">
          <header>
            <h2><i className="fa-solid fa-calendar" aria-hidden="true" /> Which term and classes?</h2>
            <p>Every active pupil in the chosen classes gets one term invoice from the fees in Fee setup. Pupils already billed for the term are skipped, so it is safe to run again.</p>
          </header>
          <div className="ofc-fields">
            <label className="ofc-field">
              <span>Term</span>
              <select value={term} onChange={(event) => setTerm(event.target.value)}>
                {terms.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.label}{entry.billed ? ` · ${entry.billed} already billed` : ""}</option>
                ))}
              </select>
            </label>
            <div className="ofc-field">
              <span>Due date</span>
              <p className="acc-static">{chosen?.due_on ? day(chosen.due_on) : <>Not set. <Link href={`${ACCOUNTS_BASE}/settings#terms`}>Set it in Fee setup</Link></>}</p>
            </div>
          </div>

          <div className="acc-class-pick">
            {(["nursery", "primary"] as const).map((section) => {
              const codes = SCHOOL_CLASSES.filter((entry) => entry.section === section).map((entry) => entry.code as string);
              const all = codes.every((code) => classes.includes(code));
              return (
                <fieldset key={section}>
                  <legend>
                    <label className="ofc-check">
                      <input type="checkbox" checked={all} onChange={(event) => toggle(codes, event.target.checked)} />
                      {section === "nursery" ? "Nursery" : "Primary"}
                    </label>
                  </legend>
                  <div>
                    {codes.map((code) => (
                      <label key={code} className={`acc-class-chip${classes.includes(code) ? " is-on" : ""}${rated.has(code) ? "" : " is-missing"}`}>
                        <input type="checkbox" checked={classes.includes(code)} onChange={(event) => toggle([code], event.target.checked)} />
                        <strong>{code}</strong>
                        <small>{activeByClass[code] ?? 0} pupils</small>
                        {rated.has(code) ? null : <em title="No fees set for this class in this term">No fees</em>}
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </div>

          <div className="ofc-field">
            <span>When they are created</span>
            <div className="ofc-segmented">
              <label>
                <input type="radio" name="status" checked={status === "issued"} onChange={() => setStatus("issued")} />
                <span><i className="fa-solid fa-paper-plane" aria-hidden="true" /> Issue straight away</span>
              </label>
              <label>
                <input type="radio" name="status" checked={status === "draft"} onChange={() => setStatus("draft")} />
                <span><i className="fa-regular fa-file" aria-hidden="true" /> Save as drafts to check first</span>
              </label>
            </div>
            <small className="acc-hint">{status === "issued" ? "Issued invoices count towards balances and show in the parent portal." : "Drafts don't count towards balances until you issue them from the Invoices page."}</small>
          </div>

          <Feedback result={result} />
          <div className="acc-wizard-foot">
            <Link className="admin-btn admin-btn-ghost" href={`${ACCOUNTS_BASE}/invoices`}>Cancel</Link>
            <button type="button" className="admin-btn" disabled={pending || !classes.length || !term} onClick={() => runRpc(true)}>
              {pending ? "Working it out…" : "Preview invoices"} <i className="fa-solid fa-arrow-right" aria-hidden="true" />
            </button>
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="ofc-fieldset">
          <header>
            <h2><i className="fa-solid fa-magnifying-glass-dollar" aria-hidden="true" /> Check before creating</h2>
            <p>Nothing has been saved yet. This is what {chosen?.label} billing will create.</p>
          </header>

          <div className="acc-preview-stats">
            <div><span>Invoices to create</span><strong>{totals.toBill.toLocaleString("en-GB")}</strong></div>
            <div><span>Total billed</span><strong>{ugx(totals.net)}</strong></div>
            <div><span>Discounts</span><strong>{ugx(totals.discounts)}</strong></div>
            <div><span>Already billed</span><strong>{totals.billed.toLocaleString("en-GB")}</strong></div>
          </div>

          {totals.noRates ? (
            <p className="app-feedback is-warning">
              <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> {totals.noRates} pupil{totals.noRates === 1 ? "" : "s"} won&apos;t be billed because their class has no fees for this term
              {" "}(or none for their campus). <Link href={`${ACCOUNTS_BASE}/settings?term=${term}#rates`}>Set the fees</Link> and preview again.
            </p>
          ) : null}

          <div className="ofc-table-scroll">
            <table className="app-table ofc-compact acc-table">
              <thead>
                <tr>
                  <th scope="col">Class</th>
                  <th scope="col" className="is-num">Pupils</th>
                  <th scope="col" className="is-num">To bill</th>
                  <th scope="col" className="is-num">Skipped</th>
                  <th scope="col" className="is-num">Fees</th>
                  <th scope="col" className="is-num">Discounts</th>
                  <th scope="col" className="is-num">Net</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.class_code}>
                    <td><strong>{row.class_code}</strong> <small>{className(row.class_code)}</small></td>
                    <td className="is-num">{row.pupils}</td>
                    <td className="is-num"><strong>{row.to_bill}</strong></td>
                    <td className="is-num">
                      {row.already_billed ? <span title="Already have a term invoice">{row.already_billed} billed</span> : null}
                      {row.already_billed && row.no_rates ? " · " : null}
                      {row.no_rates ? <span className="acc-warn-text" title="No fees set">{row.no_rates} no fees</span> : null}
                      {!row.already_billed && !row.no_rates ? "–" : null}
                    </td>
                    <td className="is-num">{amount(row.gross)}</td>
                    <td className="is-num">{row.discounts ? `-${amount(row.discounts)}` : "–"}</td>
                    <td className="is-num"><strong>{amount(row.net)}</strong></td>
                  </tr>
                ))}
                {!rows.length ? <tr><td colSpan={7} className="app-muted">No active pupils in these classes.</td></tr> : null}
              </tbody>
              <tfoot>
                <tr className="ofc-total-row">
                  <td>Total</td>
                  <td className="is-num">{totals.pupils}</td>
                  <td className="is-num">{totals.toBill}</td>
                  <td className="is-num">{totals.billed + totals.noRates || "–"}</td>
                  <td className="is-num">{amount(totals.gross)}</td>
                  <td className="is-num">{totals.discounts ? `-${amount(totals.discounts)}` : "–"}</td>
                  <td className="is-num">{amount(totals.net)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <Feedback result={result} />
          <div className="acc-wizard-foot">
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => { setStep(0); setResult(null); }}>
              <i className="fa-solid fa-arrow-left" aria-hidden="true" /> Back
            </button>
            <button
              type="button"
              className="admin-btn"
              disabled={pending || !totals.toBill}
              onClick={() => {
                if (!window.confirm(`Create ${totals.toBill} ${status === "draft" ? "draft " : ""}invoices for ${chosen?.label} totalling ${ugx(totals.net)}?`)) return;
                runRpc(false);
              }}
            >
              {pending ? "Creating invoices…" : `${status === "draft" ? "Save" : "Issue"} ${totals.toBill.toLocaleString("en-GB")} invoices`}
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="ofc-fieldset acc-done">
          <span className="acc-done-icon" aria-hidden="true"><i className="fa-solid fa-circle-check" /></span>
          <h2>{result?.ok ?? "Invoices created."}</h2>
          <p>{ugx(totals.net)} billed for {chosen?.label}. {status === "draft" ? "Check the drafts, then issue them from the Invoices page." : "Balances and the parent portal are up to date."}</p>
          <div className="acc-wizard-foot is-center">
            <Link className="admin-btn" href={`${ACCOUNTS_BASE}/invoices?term=${term}${status === "draft" ? "&status=draft" : ""}`}>See the invoices</Link>
            <Link className="admin-btn admin-btn-ghost" href={`${ACCOUNTS_BASE}/debtors`}>Debtors</Link>
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => { setStep(0); setRows([]); setResult(null); }}>Bill more classes</button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
