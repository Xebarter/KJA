"use client";

import { useRef, useState } from "react";
import { payAndApplyAsParent } from "@/app/(site)/apply/actions";
import { FeeSummary, MobileMoneyField, PaymentProgress, ugx, useAdmissionPayment, type FeeOption } from "@/components/site/AdmissionPayment";
import { CLASS_OPTIONS } from "@/lib/applications";

export function NewApplication({ phone, fees }: { phone: string; fees: FeeOption[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [campus, setCampus] = useState("");
  const [payPhone, setPayPhone] = useState(phone);
  const [formKey, setFormKey] = useState(0);
  const flow = useAdmissionPayment();
  const today = new Date().toISOString().slice(0, 10);
  const fee = fees.find((item) => item.campus === campus);
  const inProgress = flow.phase !== "idle" && flow.phase !== "starting";
  const starting = flow.phase === "starting";

  const submit = () => {
    const form = formRef.current;
    if (!form) return;
    if (!form.reportValidity()) return;
    void flow.start(payAndApplyAsParent, new FormData(form));
  };

  const startOver = () => {
    flow.reset();
    setCampus("");
    setPayPhone(phone);
    setFormKey((value) => value + 1);
  };

  return (
    <section className="ap-new" id="new-application">
      <div className="ch-add-head">
        <span className="ch-add-icon" aria-hidden="true">
          <i className="fa-solid fa-child-reaching" />
        </span>
        <div>
          <h2>New application</h2>
          <p>Applying for a sibling? Your contact details are added automatically. The admission fee is paid by mobile money.</p>
        </div>
      </div>

      {inProgress ? (
        <PaymentProgress
          flow={flow}
          compact
          onChangeNumber={() => {
            flow.reset();
            requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>("#ap-pay-phone")?.focus());
          }}
          onRetry={submit}
          onDone={startOver}
          doneLabel="Apply for another child"
        />
      ) : null}

      <form
        key={formKey}
        ref={formRef}
        className="ch-form"
        style={inProgress ? { display: "none" } : undefined}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="ch-fields">
          <label className="ch-field ch-field-wide" htmlFor="ap-child">
            <span>Child&apos;s full name</span>
            <input id="ap-child" name="child_name" required autoComplete="off" />
          </label>
          <label className="ch-field" htmlFor="ap-dob">
            <span>Date of birth</span>
            <input id="ap-dob" name="child_dob" type="date" max={today} />
          </label>
          <label className="ch-field" htmlFor="ap-grade">
            <span>Class applying for</span>
            <select id="ap-grade" name="grade" defaultValue="">
              <option value="">Select class</option>
              {CLASS_OPTIONS.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className={`ch-field${phone ? " ch-field-wide" : ""}`} htmlFor="ap-campus">
            <span>Campus</span>
            <select id="ap-campus" name="campus" required value={campus} onChange={(event) => setCampus(event.target.value)}>
              <option value="">Choose a campus</option>
              {fees.map((item) => <option key={item.campus} value={item.campus}>{item.campus}</option>)}
            </select>
          </label>
          {phone ? null : (
            <label className="ch-field" htmlFor="ap-phone">
              <span>Phone number</span>
              <input id="ap-phone" name="phone" type="tel" autoComplete="tel" placeholder="e.g. 0772 123 456" />
            </label>
          )}
          <label className="ch-field ch-field-wide" htmlFor="ap-message">
            <span>Anything we should know? <small>Optional</small></span>
            <textarea id="ap-message" name="message" rows={3} placeholder="Current school, special needs, preferred start term…" />
          </label>
          <div className="ch-field ch-field-wide">
            <FeeSummary campus={campus} fees={fees} compact />
          </div>
          <div className="ch-field ch-field-wide">
            <span><label htmlFor="ap-pay-phone">Mobile money number</label></span>
            <MobileMoneyField id="ap-pay-phone" inputClassName="" value={payPhone} onChange={setPayPhone} />
          </div>
        </div>
        {flow.error ? (
          <p className="ch-alert" role="alert">
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {flow.error}
          </p>
        ) : null}
        <button className="ch-btn ch-btn-primary ap-submit" type="submit" disabled={starting} aria-busy={starting}>
          {starting ? <span className="ch-spinner" aria-hidden="true" /> : <i className="fa-solid fa-lock" aria-hidden="true" />}
          {starting ? "Sending payment request…" : fee ? `Pay ${ugx(fee.fee)} & submit` : "Pay & submit"}
        </button>
      </form>
    </section>
  );
}
