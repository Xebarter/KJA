"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AmountInput, Dialog, Feedback, useOfficeAction } from "@/components/accounts/client";
import { StudentPicker } from "@/components/accounts/StudentPicker";
import { pupilTerms, recordPayment, type PupilHit, type PupilTerm } from "@/app/accounts/(desk)/payments/actions";
import { ACCOUNTS_BASE, PAYMENT_METHODS, kampalaToday, methodInfo, ugx, type PaymentMethod } from "@/lib/accounts-format";
import type { ActionResult } from "@/lib/office-forms";

const REFERENCE_LABEL: Record<PaymentMethod, string> = {
  bank: "Bank slip or transaction number",
  mobile_money: "Mobile money transaction ID",
  schoolpay: "SchoolPay receipt number",
  cheque: "Cheque number",
  cash: "Reference (optional)",
  other: "Reference (optional)",
};

/** A button that opens the payment form in a dialog, with the pupil already chosen. */
export function RecordPaymentButton({ terms, termId, pupil, className = "admin-hero-btn is-primary", label = "Record payment" }: {
  terms: { id: string; label: string }[];
  termId: string;
  pupil: PupilHit;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <i className="fa-solid fa-hand-holding-dollar" aria-hidden="true" /> {label}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Record a payment" description={`For ${pupil.full_name}. A numbered receipt is created when you save.`} wide>
        <PaymentForm terms={terms} termId={termId} pupil={pupil} lockPupil onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

export function PaymentForm({ terms, termId, pupil: initialPupil = null, lockPupil = false, onDone }: {
  terms: { id: string; label: string }[];
  termId: string;
  pupil?: PupilHit | null;
  lockPupil?: boolean;
  onDone?: () => void;
}) {
  const [pupil, setPupil] = useState<PupilHit | null>(initialPupil);
  const [term, setTerm] = useState(termId);
  const [balances, setBalances] = useState<PupilTerm[]>([]);
  const [value, setValue] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("bank");
  const [saved, setSaved] = useState<ActionResult | null>(null);
  const [formKey, setFormKey] = useState(0);
  const { result, setResult, pending, run } = useOfficeAction();

  const studentId = pupil?.student_id;
  useEffect(() => {
    let live = true;
    setBalances([]);
    if (studentId) pupilTerms(studentId).then((rows) => live && setBalances(rows)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [studentId]);

  const owing = (id: string) => balances.find((row) => row.term_id === id)?.balance ?? 0;
  const termBalance = owing(term);
  const label = (id: string) => terms.find((entry) => entry.id === id)?.label ?? "another term";
  const older = balances.filter((row) => row.term_id !== term && row.balance > 0);
  const info = methodInfo(method);

  if (saved?.id) {
    return (
      <div className="acc-done">
        <span className="acc-done-icon"><i className="fa-solid fa-check" aria-hidden="true" /></span>
        <h2>{saved.ok}</h2>
        <p>{ugx(value)} from {pupil?.full_name} by {info.label.toLowerCase()}.</p>
        {saved.warning ? <p className="app-feedback is-warning">{saved.warning}</p> : null}
        <div className="acc-wizard-foot is-center">
          <a className="admin-btn" href={`${ACCOUNTS_BASE}/payments/${saved.id}/receipt`} target="_blank" rel="noreferrer">
            <i className="fa-solid fa-print" aria-hidden="true" /> Print receipt
          </a>
          <Link className="admin-btn admin-btn-ghost" href={`${ACCOUNTS_BASE}/payments/${saved.id}`}>Open payment</Link>
          <button
            type="button"
            className="admin-btn admin-btn-ghost"
            onClick={() => {
              setSaved(null);
              setResult(null);
              setValue(0);
              if (!lockPupil) setPupil(null);
              setFormKey((n) => n + 1);
            }}
          >
            <i className="fa-solid fa-plus" aria-hidden="true" /> Record another
          </button>
          {onDone ? <button type="button" className="admin-btn admin-btn-ghost" onClick={onDone}>Close</button> : null}
        </div>
      </div>
    );
  }

  return (
    <form
      key={formKey}
      className="ofc-form acc-pay-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!pupil) {
          setResult({ error: "Choose the pupil this payment is for." });
          return;
        }
        const data = new FormData(event.currentTarget);
        data.set("student_id", pupil.student_id);
        data.set("term_id", term);
        data.set("method", method);
        data.set("amount", String(value));
        run(() => recordPayment(data), (outcome) => setSaved(outcome));
      }}
    >
      <fieldset className="ofc-fieldset">
        <legend>Pupil</legend>
        {lockPupil && pupil ? (
          <div className="acc-picked">
            <div>
              <strong>{pupil.full_name}</strong>
              <small>{pupil.student_number} · {pupil.class_code ?? "No class"}</small>
            </div>
          </div>
        ) : (
          <StudentPicker value={pupil} onChange={setPupil} autoFocus={!pupil} />
        )}
      </fieldset>

      <fieldset className="ofc-fieldset">
        <legend>Payment</legend>
        <div className="ofc-fields">
          <label className="ofc-field">
            <span>Term</span>
            <select value={term} onChange={(event) => setTerm(event.target.value)} required>
              {terms.map((entry) => {
                const due = owing(entry.id);
                return (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}{pupil && due > 0 ? ` (owes ${ugx(due)})` : pupil && due < 0 ? " (in credit)" : ""}
                  </option>
                );
              })}
            </select>
          </label>
          <label className="ofc-field">
            <span>Date paid</span>
            <input type="date" name="paid_on" defaultValue={kampalaToday()} max={kampalaToday()} required />
          </label>
          <div className="ofc-field is-wide">
            <span>Amount received</span>
            <AmountInput name="amount_display" value={value} onValue={setValue} required />
            {pupil && termBalance > 0 ? (
              <span className="acc-quick-amounts">
                <button type="button" className={value === termBalance ? "is-on" : ""} onClick={() => setValue(termBalance)}>
                  Full term balance · {ugx(termBalance)}
                </button>
                {termBalance >= 200_000 ? (
                  <button type="button" className={value === Math.round(termBalance / 2) ? "is-on" : ""} onClick={() => setValue(Math.round(termBalance / 2))}>
                    Half · {ugx(Math.round(termBalance / 2))}
                  </button>
                ) : null}
              </span>
            ) : null}
            {pupil && value > 0 && termBalance > 0 && value > termBalance ? (
              <small className="acc-hint is-warn">{ugx(value - termBalance)} more than the term balance. The extra will show as credit.</small>
            ) : null}
            {pupil && older.length ? (
              <small className="acc-hint">
                Also owes {older.map((row) => `${ugx(row.balance)} for ${label(row.term_id)}`).join(", ")}.{" "}
                <button type="button" className="acc-text-btn" onClick={() => setTerm(older[0].term_id)}>Put it towards {label(older[0].term_id)}</button>
              </small>
            ) : null}
          </div>
        </div>
      </fieldset>

      <fieldset className="ofc-fieldset">
        <legend>How it was paid</legend>
        <div className="ofc-segmented acc-methods" role="radiogroup" aria-label="Payment method">
          {PAYMENT_METHODS.map((entry) => (
            <label key={entry.value}>
              <input type="radio" name="method_choice" checked={method === entry.value} onChange={() => setMethod(entry.value)} />
              <span><i className={`fa-solid ${entry.icon}`} aria-hidden="true" /> {entry.label}</span>
            </label>
          ))}
        </div>
        <div className="ofc-fields">
          <label className="ofc-field">
            <span>{REFERENCE_LABEL[method]}</span>
            <input name="reference" maxLength={80} required={info.needsReference} autoComplete="off" placeholder={info.needsReference ? "Required" : ""} />
          </label>
          <label className="ofc-field">
            <span>Paid by (optional)</span>
            <input name="payer_name" maxLength={120} placeholder={pupil?.mailing_name ?? "Name of the person who paid"} />
          </label>
          <label className="ofc-field is-wide">
            <span>Notes (optional)</span>
            <input name="notes" maxLength={500} placeholder="Anything the office should know" />
          </label>
        </div>
      </fieldset>

      <Feedback result={result} />
      <div className="ofc-form-foot">
        {onDone ? <button type="button" className="admin-btn admin-btn-ghost" onClick={onDone}>Cancel</button> : null}
        <button className="admin-btn admin-btn-gold" type="submit" disabled={pending || !pupil || value <= 0}>
          <i className={`fa-solid fa-receipt${pending ? " fa-fade" : ""}`} aria-hidden="true" /> {pending ? "Saving…" : value > 0 ? `Save receipt for ${ugx(value)}` : "Save receipt"}
        </button>
      </div>
    </form>
  );
}
