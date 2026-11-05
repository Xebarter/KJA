"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AmountInput, Feedback, useOfficeAction } from "@/components/accounts/client";
import { StudentPicker } from "@/components/accounts/StudentPicker";
import {
  loadChargeProducts,
  recordChargePayment,
  type ChargeProduct,
  type PupilHit,
} from "@/app/accounts/(desk)/payments/actions";
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

export function TourPaymentForm({
  pupil: initialPupil = null,
  lockPupil = false,
  termId = "",
  onDone,
}: {
  pupil?: PupilHit | null;
  lockPupil?: boolean;
  termId?: string;
  onDone?: () => void;
}) {
  const [pupil, setPupil] = useState<PupilHit | null>(initialPupil);
  const [products, setProducts] = useState<ChargeProduct[]>([]);
  const [productId, setProductId] = useState("");
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saved, setSaved] = useState<(ActionResult & { productName?: string; amount?: number }) | null>(null);
  const [formKey, setFormKey] = useState(0);
  const { result, setResult, pending, run } = useOfficeAction();

  const selected = products.find((row) => row.id === productId) || null;
  const info = methodInfo(method);
  const defaultAmount = selected ? Number(selected.default_amount) || 0 : 0;

  useEffect(() => {
    let live = true;
    setLoading(true);
    setLoadError("");
    loadChargeProducts()
      .then((res) => {
        if (!live) return;
        if (res.error) setLoadError(res.error);
        const rows = (res.rows || []).filter((row) => row.kind === "tour");
        setProducts(rows);
        if (rows.length === 1) {
          setProductId(rows[0].id);
          const fee = Number(rows[0].default_amount) || 0;
          if (fee > 0) setAmount(fee);
        }
      })
      .catch(() => live && setLoadError("Could not load tour charges."))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (defaultAmount > 0) setAmount(defaultAmount);
  }, [defaultAmount, productId]);

  if (saved?.id) {
    const receiptHref = `${ACCOUNTS_BASE}/payments/charge/${saved.id}`;
    return (
      <div className="acc-done">
        <span className="acc-done-icon"><i className="fa-solid fa-check" aria-hidden="true" /></span>
        <h2>{saved.ok}</h2>
        <p>
          {ugx(saved.amount || amount)} for {saved.productName || selected?.name || "tour"}
          {pupil ? ` · ${pupil.full_name}` : ""} by {info.label.toLowerCase()}.
        </p>
        <div className="acc-wizard-foot is-center">
          <Link className="admin-btn" href={receiptHref}>
            <i className="fa-solid fa-receipt" aria-hidden="true" /> Open receipt
          </Link>
          <button
            type="button"
            className="admin-btn admin-btn-ghost"
            onClick={() => {
              setSaved(null);
              setResult(null);
              setAmount(defaultAmount > 0 ? defaultAmount : 0);
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
      className="ofc-form acc-pay-form is-tour"
      onSubmit={(event) => {
        event.preventDefault();
        if (!pupil) {
          setResult({ error: "Choose the pupil this tour payment is for." });
          return;
        }
        if (!productId) {
          setResult({ error: "Choose the tour charge that was paid." });
          return;
        }
        if (amount <= 0) {
          setResult({ error: "Enter the tour amount received." });
          return;
        }
        const data = new FormData(event.currentTarget);
        data.set("student_id", pupil.student_id);
        data.set("product_id", productId);
        data.set("method", method);
        data.set("amount", String(amount));
        if (termId) data.set("term_id", termId);
        run(
          () => recordChargePayment(data),
          (outcome) => setSaved({ ...outcome, productName: selected?.name, amount }),
        );
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
          <StudentPicker
            value={pupil}
            onChange={(next) => {
              setPupil(next);
              setResult(null);
            }}
            autoFocus={!pupil}
            debounceMs={50}
          />
        )}
      </fieldset>

      {pupil ? (
        <fieldset className="ofc-fieldset">
          <legend>Tour charge</legend>
          {loading ? (
            <ul className="acc-tour-choices is-loading" aria-busy="true" aria-label="Loading tour charges">
              <li><span /><span /><span /></li>
            </ul>
          ) : loadError ? (
            <p className="acc-hint is-warn">{loadError}</p>
          ) : products.length ? (
            <div className="acc-tour-choices" role="radiogroup" aria-label="Tour charge">
              {products.map((product) => {
                const on = productId === product.id;
                const fee = Number(product.default_amount) || 0;
                return (
                  <label key={product.id} className={`acc-tour-choice${on ? " is-on" : ""}`}>
                    <input
                      type="radio"
                      name="tour_choice"
                      value={product.id}
                      checked={on}
                      onChange={() => {
                        setProductId(product.id);
                        setResult(null);
                        if (fee > 0) setAmount(fee);
                      }}
                      required
                    />
                    <span className="acc-tour-choice-mark" aria-hidden="true">
                      <i className="fa-solid fa-bus" />
                    </span>
                    <span className="acc-tour-choice-copy">
                      <strong>{product.name}</strong>
                      <small>{product.description || (fee > 0 ? ugx(fee) : "Enter amount received")}</small>
                    </span>
                    {fee > 0 ? <strong className="acc-tour-choice-fee">{ugx(fee)}</strong> : null}
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="acc-tour-empty">
              <i className="fa-solid fa-bus" aria-hidden="true" />
              <div>
                <strong>No tour charges set up</strong>
                <p>Ask an accounts admin to publish a study tour charge before recording payments.</p>
              </div>
            </div>
          )}
        </fieldset>
      ) : null}

      <fieldset className="ofc-fieldset">
        <legend>Payment</legend>
        <div className="ofc-fields">
          <label className="ofc-field">
            <span>Date paid</span>
            <input type="date" name="paid_on" defaultValue={kampalaToday()} max={kampalaToday()} required />
          </label>
          <div className="ofc-field is-wide">
            <span>Amount received</span>
            <AmountInput name="amount_display" value={amount} onValue={setAmount} required />
            {defaultAmount > 0 ? (
              <span className="acc-quick-amounts">
                <button
                  type="button"
                  className={amount === defaultAmount ? "is-on" : ""}
                  onClick={() => setAmount(defaultAmount)}
                >
                  Published fee · {ugx(defaultAmount)}
                </button>
              </span>
            ) : selected ? (
              <small className="acc-hint">No published fee for this charge. Enter the amount received.</small>
            ) : pupil ? (
              <small className="acc-hint">Choose a tour charge above, then enter the amount.</small>
            ) : (
              <small className="acc-hint">Choose a pupil to continue.</small>
            )}
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
        {onDone ? (
          <button type="button" className="admin-btn admin-btn-ghost" onClick={onDone}>
            Cancel
          </button>
        ) : null}
        <button
          className="admin-btn admin-btn-gold"
          type="submit"
          disabled={pending || !pupil || !selected || amount <= 0 || loading}
        >
          <i className={`fa-solid fa-receipt${pending ? " fa-fade" : ""}`} aria-hidden="true" />
          {pending
            ? "Saving…"
            : amount > 0
              ? `Save tour receipt for ${ugx(amount)}`
              : "Save tour receipt"}
        </button>
      </div>
    </form>
  );
}
