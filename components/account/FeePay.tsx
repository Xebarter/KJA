"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { checkSchoolFeePayment, paySchoolFees } from "@/app/account/(portal)/fees/actions";
import type { FeePaymentView } from "@/lib/payments/school-fees";
import { networkOf, normalizeMsisdn } from "@/lib/payments/mobile";

export type PayableTerm = { id: string; label: string; balance: number; dueOn: string | null };

const ugx = (value: number) => `UGX ${Math.round(value).toLocaleString("en-US")}`;

export function FeePay({
  childId,
  childName,
  studentCode,
  terms,
  phone,
  online,
}: {
  childId: string;
  childName: string;
  studentCode: string | null;
  terms: PayableTerm[];
  phone: string;
  online: boolean;
}) {
  const router = useRouter();
  const first = childName.split(/\s+/)[0] || childName;
  const [open, setOpen] = useState(false);
  const [termId, setTermId] = useState(terms[0]?.id ?? "");
  const term = terms.find((item) => item.id === termId) ?? terms[0];
  const [amount, setAmount] = useState(term ? String(term.balance) : "");
  const [number, setNumber] = useState(phone);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [payment, setPayment] = useState<FeePaymentView | null>(null);
  const [waitFrom, setWaitFrom] = useState(0);
  const network = networkOf(normalizeMsisdn(number));
  const waitingTooLong = Boolean(payment?.status === "pending" && waitFrom && Date.now() - waitFrom > 150_000);

  useEffect(() => {
    if (!payment || payment.status !== "pending" || waitingTooLong) return;
    const timer = window.setTimeout(async () => {
      const result = await checkSchoolFeePayment(payment.id).catch(() => null);
      if (!result || !("payment" in result)) return;
      setPayment(result.payment);
      if (result.payment.status === "paid") router.refresh();
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [payment, router, waitingTooLong]);

  if (!terms.length || !term) return null;

  function chooseTerm(id: string) {
    const next = terms.find((item) => item.id === id);
    setTermId(id);
    if (next) setAmount(String(next.balance));
    setError("");
    setPayment(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData();
    data.set("student_id", childId);
    data.set("term_id", term.id);
    data.set("amount", amount);
    data.set("phone", number);
    const result = await paySchoolFees(data);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setPayment(result.payment);
    if (result.payment.status === "pending") setWaitFrom(Date.now());
    if (result.payment.status === "paid") router.refresh();
  }

  async function checkNow() {
    if (!payment) return;
    setChecking(true);
    const result = await checkSchoolFeePayment(payment.id).catch(() => null);
    setChecking(false);
    if (!result || !("payment" in result)) {
      setError("We couldn't check the payment just now. Try again in a moment.");
      return;
    }
    setPayment(result.payment);
    if (result.payment.status === "paid") router.refresh();
  }

  return (
    <div className="fe-pay-slot">
      <button type="button" className="ov-btn ov-btn-gold fe-pay-open" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <i className="fa-solid fa-wallet" aria-hidden="true" />
        {open ? "Close" : "Pay fees"}
      </button>

      {open ? (
        <section className="fe-paybox" aria-label={`Pay fees for ${childName}`}>
          {payment?.status === "paid" ? (
            <div className="fe-pay-state is-paid" role="status">
              <i className="fa-solid fa-circle-check" aria-hidden="true" />
              <div>
                <strong>Payment received</strong>
                <p>{ugx(payment.amount)} for {payment.child}, {payment.term}. {payment.receiptNo ? `Receipt ${payment.receiptNo}.` : "The balance will update in a moment."}</p>
              </div>
              {payment.receiptUrl ? <a className="ov-btn ov-btn-dark" href={payment.receiptUrl}>Download receipt</a> : null}
            </div>
          ) : payment?.status === "failed" ? (
            <div className="fe-pay-state is-failed" role="alert">
              <i className="fa-solid fa-circle-xmark" aria-hidden="true" />
              <div>
                <strong>Payment not completed</strong>
                <p>The request to {payment.phone} was declined or timed out. You have not been charged.</p>
              </div>
              <button type="button" className="ov-btn ov-btn-dark" onClick={() => setPayment(null)}>Try again</button>
            </div>
          ) : payment?.status === "pending" ? (
            <div className="fe-pay-state" role="status">
              <i className="fa-solid fa-mobile-screen-button" aria-hidden="true" />
              <div>
                <strong>Check {payment.phone}</strong>
                <p>{waitingTooLong ? "If you already approved the prompt, check again. The receipt appears once the payment is confirmed." : `Approve ${ugx(payment.amount)} with your PIN. This page updates when the payment comes through.`}</p>
              </div>
              <button type="button" className="ov-btn ov-btn-dark" onClick={checkNow} disabled={checking}>
                {checking ? "Checking…" : "I've approved"}
              </button>
            </div>
          ) : online ? (
            <form className="fe-pay-form" onSubmit={submit}>
              <div>
                <h3>Pay {first}&apos;s fees</h3>
                <p>The money is applied to the term you choose. You can pay the whole balance or part of it.</p>
              </div>
              <div className="ch-fields">
                <label className="ch-field">
                  <span>Term</span>
                  <select value={term.id} onChange={(event) => chooseTerm(event.target.value)}>
                    {terms.map((item) => <option key={item.id} value={item.id}>{item.label} · {ugx(item.balance)} owing</option>)}
                  </select>
                </label>
                <label className="ch-field">
                  <span>Amount <small>up to {ugx(term.balance)}</small></span>
                  <input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} required />
                </label>
                <label className="ch-field ch-field-wide">
                  <span>Mobile money number</span>
                  <input type="tel" inputMode="tel" autoComplete="tel" placeholder="0772 123 456" value={number} onChange={(event) => setNumber(event.target.value)} required />
                </label>
              </div>
              <p className="fe-pay-hint">
                <i className="fa-solid fa-mobile-screen-button" aria-hidden="true" />
                {network ? `${network}. ` : "MTN Mobile Money or Airtel Money. "}
                You&apos;ll get a prompt on this phone. Quote {childName}{studentCode ? ` (${studentCode})` : ""} if you pay another way.
              </p>
              {error ? <p className="fe-pay-error" role="alert">{error}</p> : null}
              <div className="fe-pay-actions">
                <button className="ov-btn ov-btn-gold" type="submit" disabled={busy}>
                  {busy ? "Sending prompt…" : `Pay ${first}`}
                </button>
                <button type="button" className="fe-pay-link" onClick={() => setAmount(String(term.balance))}>Use the full balance</button>
              </div>
            </form>
          ) : (
            <div className="fe-pay-form">
              <div>
                <h3>Pay {first}&apos;s fees</h3>
                <p>{ugx(term.balance)} is owing for {term.label}. Pay by bank, mobile money or SchoolPay, and quote {childName}{studentCode ? ` and student number ${studentCode}` : ""} as the reference.</p>
              </div>
              {terms.length > 1 ? (
                <label className="ch-field">
                  <span>Term</span>
                  <select value={term.id} onChange={(event) => chooseTerm(event.target.value)}>
                    {terms.map((item) => <option key={item.id} value={item.id}>{item.label} · {ugx(item.balance)} owing</option>)}
                  </select>
                </label>
              ) : null}
              <ol>
                <li><span>1</span><p><strong>Pay {ugx(term.balance)}.</strong> Use the account on the term invoice, or SchoolPay.</p></li>
                <li><span>2</span><p><strong>Use the reference.</strong> {childName}{studentCode ? `, student number ${studentCode}` : ""}.</p></li>
                <li><span>3</span><p><strong>Keep the receipt.</strong> The accounts office records it and this balance updates.</p></li>
              </ol>
              <div className="fe-pay-actions">
                <Link className="ov-btn ov-btn-dark" href="/account/messages">Tell the accounts office</Link>
                <Link className="fe-pay-link" href="/fees">Fee structure <i className="fa-solid fa-arrow-right" aria-hidden="true" /></Link>
              </div>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
