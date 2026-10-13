"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { admissionPaymentStatus } from "@/app/(site)/apply/actions";
import type { PaymentResult, PaymentView } from "@/lib/payments/admission";
import { networkOf, normalizeMsisdn } from "@/lib/payments/mobile";
import "./admission-payment.css";

export type FeeOption = { campus: string; fee: number };

export const ugx = (value: number) => `UGX ${value.toLocaleString("en-US")}`;

const STORE = "kja-admission-payment";
const POLL_MS = 4000;
const WAIT_MS = 150_000;

type Phase = "idle" | "starting" | "waiting" | "timeout" | "paid" | "failed";

function downloadReceipt(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  link.download = "";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function remember(view: PaymentView | null, downloaded = false) {
  try {
    if (view) sessionStorage.setItem(STORE, JSON.stringify({ id: view.id, token: view.token, at: Date.now(), downloaded }));
    else sessionStorage.removeItem(STORE);
  } catch {}
}

function recalled(): { id: string; token: string; at: number; downloaded: boolean } | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE) || "null");
    return saved && Date.now() - saved.at < 30 * 60_000 ? saved : null;
  } catch {
    return null;
  }
}

/** Starts a payment, waits for the parent to approve it on their phone, then downloads the receipt. */
export function useAdmissionPayment() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [payment, setPayment] = useState<PaymentView | null>(null);
  const [error, setError] = useState("");
  const startedAt = useRef(0);
  const downloaded = useRef<string | null>(null);

  const settle = useCallback((view: PaymentView) => {
    setPayment(view);
    if (view.status === "paid") {
      setPhase("paid");
      if (view.receiptUrl && downloaded.current !== view.id) {
        downloaded.current = view.id;
        remember(view, true);
        downloadReceipt(view.receiptUrl);
      }
    } else if (view.status === "failed") {
      setPhase("failed");
      remember(null);
    }
  }, []);

  const check = useCallback(async () => {
    if (!payment) return;
    const result = await admissionPaymentStatus(payment.id, payment.token).catch(() => null);
    if (result && "payment" in result) settle(result.payment);
  }, [payment, settle]);

  useEffect(() => {
    const saved = recalled();
    if (!saved) return;
    if (saved.downloaded) downloaded.current = saved.id;
    admissionPaymentStatus(saved.id, saved.token)
      .then((result) => {
        if (!("payment" in result)) return remember(null);
        startedAt.current = Date.now();
        setPayment(result.payment);
        if (result.payment.status === "pending") setPhase("waiting");
        else settle(result.payment);
      })
      .catch(() => {});
  }, [settle]);

  useEffect(() => {
    if (phase !== "waiting" || !payment) return;
    const timer = window.setTimeout(async () => {
      if (Date.now() - startedAt.current > WAIT_MS) {
        setPhase("timeout");
        return;
      }
      await check();
    }, POLL_MS);
    return () => window.clearTimeout(timer);
  }, [phase, payment, check]);

  const start = useCallback(async (action: (data: FormData) => Promise<PaymentResult>, data: FormData) => {
    setError("");
    setPhase("starting");
    let result: PaymentResult;
    try {
      result = await action(data);
    } catch {
      result = { error: "Something went wrong. Please check your connection and try again." };
    }
    if ("error" in result) {
      setError(result.error);
      setPhase("idle");
      return false;
    }
    startedAt.current = Date.now();
    remember(result.payment);
    setPayment(result.payment);
    setPhase("waiting");
    return true;
  }, []);

  const keepWaiting = useCallback(() => {
    startedAt.current = Date.now();
    setPhase("waiting");
    void check();
  }, [check]);

  const reset = useCallback(() => {
    remember(null);
    setPayment(null);
    setError("");
    setPhase("idle");
  }, []);

  return { phase, payment, error, setError, start, check, keepWaiting, reset };
}

export type PaymentFlow = ReturnType<typeof useAdmissionPayment>;

export function FeeSummary({ campus, fees, compact }: { campus: string; fees: FeeOption[]; compact?: boolean }) {
  const fee = fees.find((item) => item.campus === campus);
  return (
    <div className={`pay-summary${fee ? "" : " is-empty"}${compact ? " is-compact" : ""}`}>
      <span className="pay-summary-icon" aria-hidden="true"><i className="fas fa-receipt" /></span>
      <div className="pay-summary-text">
        <small>Admission fee</small>
        <strong>{fee ? `${fee.campus} campus` : "Choose a campus to see the fee"}</strong>
        <span>One-time fee, paid before your application is submitted.</span>
      </div>
      {fee ? <b className="pay-summary-amount">{ugx(fee.fee)}</b> : null}
    </div>
  );
}

export function MobileMoneyField({ id, value, onChange, error, inputClassName }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  inputClassName: string;
}) {
  const network = networkOf(normalizeMsisdn(value));
  return (
    <div className="pay-number">
      <div className="pay-number-input">
        <input
          className={inputClassName}
          id={id}
          name="pay_phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="e.g. 0772 123 456"
          maxLength={20}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-hint`}
        />
        {network ? <span className={`pay-network ${network.startsWith("MTN") ? "is-mtn" : "is-airtel"}`}>{network.startsWith("MTN") ? "MTN" : "Airtel"}</span> : null}
      </div>
      <p className="pay-number-hint" id={`${id}-hint`}>
        <i className="fas fa-mobile-screen-button" aria-hidden="true" />
        MTN Mobile Money or Airtel Money. You&apos;ll get a prompt on this phone to approve with your PIN.
      </p>
    </div>
  );
}

export function PaymentProgress({ flow, onChangeNumber, onRetry, onDone, doneLabel, contact, compact }: {
  flow: PaymentFlow;
  onChangeNumber: () => void;
  onRetry: () => void;
  onDone: () => void;
  doneLabel: string;
  contact?: { phone: string; email: string };
  compact?: boolean;
}) {
  const { phase, payment } = flow;
  const panel = useRef<HTMLDivElement>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
    panel.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [phase]);

  if (!payment) return null;

  const checkNow = async () => {
    setChecking(true);
    await flow.check();
    setChecking(false);
  };

  if (phase === "paid") {
    return (
      <div className={`pay-panel is-paid${compact ? " is-compact" : ""}`} ref={panel} tabIndex={-1} role="status">
        <span className="pay-panel-icon" aria-hidden="true"><i className="fas fa-check" /></span>
        <h2>Payment received</h2>
        <p className="pay-panel-lead">
          {payment.child}&apos;s application to {payment.campus} campus has been submitted. Your receipt is downloading now.
        </p>
        <dl className="pay-facts">
          <div><dt>Receipt no.</dt><dd>{payment.receiptNo}</dd></div>
          <div><dt>Amount paid</dt><dd>{ugx(payment.amount)}</dd></div>
          <div><dt>Paid from</dt><dd>{payment.phone}</dd></div>
        </dl>
        <div className="pay-actions">
          {payment.receiptUrl ? (
            <a className="pay-btn pay-btn-primary" href={payment.receiptUrl} download>
              <i className="fas fa-file-arrow-down" aria-hidden="true" /> Download receipt
            </a>
          ) : null}
          <button type="button" className="pay-btn pay-btn-ghost" onClick={onDone}>{doneLabel}</button>
        </div>
        <p className="pay-note">Our admissions team will contact you to arrange a school visit.</p>
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div className={`pay-panel is-failed${compact ? " is-compact" : ""}`} ref={panel} tabIndex={-1} role="alert">
        <span className="pay-panel-icon" aria-hidden="true"><i className="fas fa-xmark" /></span>
        <h2>Payment not completed</h2>
        <p className="pay-panel-lead">
          The payment of {ugx(payment.amount)} from {payment.phone} was declined, cancelled or timed out. You have not been charged
          and your application has not been submitted yet.
        </p>
        <div className="pay-actions">
          <button type="button" className="pay-btn pay-btn-primary" onClick={onRetry}>
            <i className="fas fa-rotate-right" aria-hidden="true" /> Try again
          </button>
          <button type="button" className="pay-btn pay-btn-ghost" onClick={onChangeNumber}>Use a different number</button>
        </div>
        {contact ? (
          <p className="pay-note">
            Need help? Call <a href={`tel:${contact.phone.replace(/\s/g, "")}`}>{contact.phone}</a> or email{" "}
            <a href={`mailto:${contact.email}`}>{contact.email}</a>.
          </p>
        ) : null}
      </div>
    );
  }

  const timedOut = phase === "timeout";
  return (
    <div className={`pay-panel is-waiting${compact ? " is-compact" : ""}`} ref={panel} tabIndex={-1} role="status" aria-live="polite">
      <span className="pay-panel-icon pay-phone" aria-hidden="true">
        <i className="fas fa-mobile-screen-button" />
        {timedOut ? null : <span className="pay-ring" />}
      </span>
      <h2>{timedOut ? "Still waiting for approval" : "Approve the payment on your phone"}</h2>
      <p className="pay-panel-lead">
        We sent a request for <strong>{ugx(payment.amount)}</strong> to <strong>{payment.phone}</strong> ({payment.network}).
        {timedOut ? " If you've already entered your PIN, check again below." : " Enter your mobile money PIN when the prompt appears."}
      </p>
      <ol className="pay-steps">
        <li><span>1</span>Unlock your phone and look for the payment prompt.</li>
        <li><span>2</span>Check the amount, then enter your PIN to approve.</li>
        <li><span>3</span>Keep this page open. Your receipt downloads automatically.</li>
      </ol>
      {timedOut ? null : (
        <p className="pay-waiting"><span className="pay-dots" aria-hidden="true"><i /><i /><i /></span> Waiting for confirmation</p>
      )}
      <div className="pay-actions">
        {timedOut ? (
          <button type="button" className="pay-btn pay-btn-primary" onClick={flow.keepWaiting}>
            <i className="fas fa-rotate-right" aria-hidden="true" /> Check again
          </button>
        ) : (
          <button type="button" className="pay-btn pay-btn-primary" onClick={checkNow} disabled={checking} aria-busy={checking}>
            {checking ? <span className="pay-spinner" aria-hidden="true" /> : <i className="fas fa-check" aria-hidden="true" />}
            I&apos;ve approved it
          </button>
        )}
        <button type="button" className="pay-btn pay-btn-ghost" onClick={onChangeNumber}>Use a different number</button>
      </div>
      <p className="pay-note">No prompt after a minute? Make sure the phone is on and has network, then try again.</p>
    </div>
  );
}
