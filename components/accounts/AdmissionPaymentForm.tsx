"use client";

import { DateField } from "@/components/ui/DateField";

import { useEffect, useState } from "react";
import { AmountInput, Feedback, useOfficeAction, useScrollTopWhen } from "@/components/accounts/client";
import { loadAdmissionFees, recordDeskAdmissionPayment } from "@/app/accounts/(desk)/payments/actions";
import { PAYMENT_METHODS, kampalaToday, methodInfo, ugx, type PaymentMethod } from "@/lib/accounts-format";
import { CAMPUS_OPTIONS } from "@/lib/campuses";
import type { ActionResult } from "@/lib/office-forms";

const REFERENCE_LABEL: Record<PaymentMethod, string> = {
  bank: "Bank slip or transaction number",
  mobile_money: "Mobile money transaction ID",
  schoolpay: "SchoolPay receipt number",
  cheque: "Cheque number",
  cash: "Reference (optional)",
  other: "Reference (optional)",
};

export function AdmissionPaymentForm({ onDone }: { onDone?: () => void }) {
  const [campus, setCampus] = useState("");
  const [fees, setFees] = useState<{ campus: string; fee: number }[]>([]);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [saved, setSaved] = useState<(ActionResult & { amount?: number; childName?: string }) | null>(null);
  const [formKey, setFormKey] = useState(0);
  const { result, setResult, pending, run } = useOfficeAction();
  useScrollTopWhen(Boolean(saved?.id));

  const info = methodInfo(method);
  const campusFee = fees.find((row) => row.campus === campus)?.fee ?? 0;

  useEffect(() => {
    let live = true;
    loadAdmissionFees()
      .then((res) => {
        if (!live) return;
        setFees(res.rows || []);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (campusFee > 0) setAmount(campusFee);
  }, [campusFee]);

  if (saved?.id) {
    const receiptNo = String(saved.ok || "").match(/receipt\s+(\S+)\s+saved/i)?.[1] || "Receipt";
    const printHref = `/apply/receipt/${saved.id}`;
    return (
      <div className="acc-done">
        <span className="acc-done-icon"><i className="fa-solid fa-check" aria-hidden="true" /></span>
        <p className="acc-done-kicker">Payment complete</p>
        <h2>Receipt saved</h2>
        <p className="acc-done-no">{receiptNo}</p>
        <p className="acc-done-meta">
          {ugx(saved.amount || amount)} · Admission fee
          {saved.childName ? ` · ${saved.childName}` : ""} · {info.label}
        </p>
        <div className="acc-wizard-foot is-center">
          <a className="acc-done-btn is-primary" href={printHref} target="_blank" rel="noreferrer">
            <i className="fa-solid fa-print" aria-hidden="true" /> Print receipt
          </a>
          <button
            type="button"
            className="acc-done-btn is-quiet"
            onClick={() => {
              setSaved(null);
              setResult(null);
              setCampus("");
              setAmount(0);
              setFormKey((n) => n + 1);
            }}
          >
            <i className="fa-solid fa-plus" aria-hidden="true" /> Record another
          </button>
          {onDone ? <button type="button" className="acc-done-btn is-quiet" onClick={onDone}>Close</button> : null}
        </div>
      </div>
    );
  }

  return (
    <form
      key={formKey}
      className="ofc-form acc-pay-form is-admission"
      onSubmit={(event) => {
        event.preventDefault();
        if (!campus) {
          setResult({ error: "Choose the campus." });
          return;
        }
        if (amount <= 0) {
          setResult({ error: "Enter the admission amount received." });
          return;
        }
        const data = new FormData(event.currentTarget);
        data.set("campus", campus);
        data.set("method", method);
        data.set("amount", String(amount));
        const childName = String(data.get("child_name") || "").trim();
        run(
          () => recordDeskAdmissionPayment(data),
          (outcome) => setSaved({ ...outcome, amount, childName }),
        );
      }}
    >
      <fieldset className="ofc-fieldset">
        <legend>Applicant</legend>
        <div className="ofc-fields">
          <label className="ofc-field is-wide">
            <span>Child’s name</span>
            <input name="child_name" required maxLength={120} autoComplete="off" placeholder="As on the application" autoFocus />
          </label>
          <label className="ofc-field is-wide">
            <span>Paid by</span>
            <input name="payer_name" required maxLength={120} autoComplete="name" placeholder="Parent or guardian" />
          </label>
        </div>

        <div className="acc-admission-campuses" role="radiogroup" aria-label="Campus">
          <span className="acc-admission-label">Campus</span>
          <div className="acc-admission-campus-grid">
            {CAMPUS_OPTIONS.map((name) => {
              const fee = fees.find((row) => row.campus === name)?.fee ?? 0;
              const on = campus === name;
              return (
                <label key={name} className={`acc-admission-campus${on ? " is-on" : ""}`}>
                  <input
                    type="radio"
                    name="campus_choice"
                    value={name}
                    checked={on}
                    onChange={() => { setCampus(name); setResult(null); }}
                    required
                  />
                  <span className="acc-admission-campus-mark" aria-hidden="true">
                    <i className="fa-solid fa-school" />
                  </span>
                  <span className="acc-admission-campus-copy">
                    <strong>{name}</strong>
                    <small>{fee > 0 ? ugx(fee) : "Enter amount"}</small>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="ofc-fields">
          <label className="ofc-field">
            <span>Phone (optional)</span>
            <input name="phone" maxLength={40} autoComplete="tel" placeholder="07…" />
          </label>
          <label className="ofc-field">
            <span>Email (optional)</span>
            <input name="payer_email" type="email" maxLength={120} autoComplete="email" placeholder="name@example.com" />
          </label>
        </div>
      </fieldset>

      <fieldset className="ofc-fieldset">
        <legend>Payment</legend>
        <div className="ofc-fields">
          <label className="ofc-field">
            <span>Date paid</span>
            <DateField name="paid_on" defaultValue={kampalaToday()} max={kampalaToday()} required />
          </label>
          <div className="ofc-field is-wide">
            <span>Amount received</span>
            <AmountInput name="amount_display" value={amount} onValue={setAmount} required />
            {campusFee > 0 ? (
              <span className="acc-quick-amounts">
                <button
                  type="button"
                  className={amount === campusFee ? "is-on" : ""}
                  onClick={() => setAmount(campusFee)}
                >
                  Campus fee · {ugx(campusFee)}
                </button>
              </span>
            ) : campus ? (
              <small className="acc-hint">No published fee for this campus. Enter the amount received.</small>
            ) : (
              <small className="acc-hint">Choose a campus to load the published admission fee.</small>
            )}
          </div>
          <label className="ofc-field is-wide">
            <span>Application id (optional)</span>
            <input name="application_id" maxLength={36} placeholder="Link an existing application UUID" autoComplete="off" />
            <small className="acc-field-hint">Only if this payment belongs to an application already on file.</small>
          </label>
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
          <label className="ofc-field is-wide">
            <span>Notes (optional)</span>
            <input name="notes" maxLength={500} placeholder="Anything the office should know" />
          </label>
        </div>
      </fieldset>

      <Feedback result={result} />
      <div className="ofc-form-foot">
        {onDone ? (
          <button type="button" className="admin-btn admin-btn-ghost" onClick={onDone}>
            Cancel
          </button>
        ) : null}
        <button
          className="admin-btn admin-btn-gold"
          type="submit"
          disabled={pending || !campus || amount <= 0}
        >
          <i className={`fa-solid fa-receipt${pending ? " fa-fade" : ""}`} aria-hidden="true" />
          {pending
            ? "Saving…"
            : amount > 0
              ? `Save admission receipt for ${ugx(amount)}`
              : "Save admission receipt"}
        </button>
      </div>
    </form>
  );
}
