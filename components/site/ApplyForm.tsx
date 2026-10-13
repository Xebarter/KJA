"use client";

import { useRef, useState } from "react";
import { payAndApply } from "@/app/(site)/apply/actions";
import { FeeSummary, MobileMoneyField, PaymentProgress, ugx, useAdmissionPayment, type FeeOption } from "@/components/site/AdmissionPayment";
import { networkOf, normalizeMsisdn } from "@/lib/payments/mobile";

type FieldName = "parent_names" | "parent_email" | "parent_phone" | "child_name" | "child_birtDate" | "campus" | "pay_phone";
type Errors = Partial<Record<FieldName, string>>;

const REQUIRED: Record<FieldName, string> = {
  parent_names: "Enter your name.",
  parent_email: "Enter your email.",
  parent_phone: "Enter your phone number.",
  child_name: "Enter your child's name.",
  child_birtDate: "Enter a date of birth.",
  campus: "Choose the campus you're applying to.",
  pay_phone: "Enter the mobile money number to pay from.",
};
const FIELDS = Object.keys(REQUIRED) as FieldName[];

const GRADES = [
  { group: "Nursery", options: ["Daycare", "Baby Class", "Middle Class", "Top Class"] },
  { group: "Primary", options: ["Primary One", "Primary Two", "Primary Three", "Primary Four", "Primary Five", "Primary Six", "Primary Seven"] },
];

function problem(name: FieldName, raw: string) {
  const value = raw.trim();
  if (!value) return REQUIRED[name];
  if (name === "parent_email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Enter a valid email.";
  if (name === "parent_phone" && !/^[+]?[0-9() -]{7,}$/.test(value)) return "Enter a valid phone number.";
  if (name === "child_birtDate" && new Date(value) > new Date()) return "Date can't be in the future.";
  if (name === "pay_phone") {
    const msisdn = normalizeMsisdn(value);
    if (!msisdn) return "Enter a valid number, e.g. 0772 123 456.";
    if (!networkOf(msisdn)) return "Use an MTN or Airtel mobile money number.";
  }
  return "";
}

function Field({ id, label, optional, error, wide, children }: {
  id: string;
  label: string;
  optional?: boolean;
  error?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`apply-field${wide ? " is-wide" : ""}${error ? " has-error" : ""}`}>
      <label htmlFor={id}>
        <span>{label}{optional ? null : <span className="apply-req" aria-hidden="true">*</span>}</span>
        {optional ? <span className="apply-optional">Optional</span> : null}
      </label>
      {children}
      {error ? (
        <p className="apply-error" id={`${id}-error`}>
          <i className="fas fa-circle-exclamation" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Section({ step, title, children }: { step: string; title: string; children: React.ReactNode }) {
  const id = `apply-section-${step}`;
  return (
    <div className="apply-section" role="group" aria-labelledby={id}>
      <div className="apply-section-head">
        <span className="apply-step" aria-hidden="true">{step}</span>
        <h3 className="apply-section-title" id={id}>{title}</h3>
      </div>
      <div className="apply-fields">{children}</div>
    </div>
  );
}

export function ApplyForm({ fees, phone, email }: { fees: FeeOption[]; phone: string; email: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [campus, setCampus] = useState("");
  const [payPhone, setPayPhone] = useState("");
  const [payPhoneEdited, setPayPhoneEdited] = useState(false);
  const flow = useAdmissionPayment();
  const fee = fees.find((item) => item.campus === campus);

  const validate = (name: FieldName, value: string) => {
    const message = problem(name, value);
    setErrors((current) => ({ ...current, [name]: message || undefined }));
    return message;
  };

  const control = (name: FieldName) => ({
    id: name,
    name,
    "aria-required": true,
    "aria-invalid": Boolean(errors[name]),
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
    onBlur: (event: React.FocusEvent<HTMLInputElement>) => {
      if (event.target.value || errors[name]) validate(name, event.target.value);
    },
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      if (errors[name]) validate(name, event.target.value);
      if (name === "parent_phone" && !payPhoneEdited) setPayPhone(event.target.value);
    },
  });

  const submit = async (form: HTMLFormElement) => {
    const data = new FormData(form);
    const found = Object.fromEntries(FIELDS.map((name) => [name, problem(name, String(data.get(name) || "")) || undefined])) as Errors;
    setErrors(found);
    const firstInvalid = FIELDS.find((name) => found[name]);
    if (firstInvalid) {
      const element = form.elements.namedItem(firstInvalid) as HTMLElement | null;
      element?.focus();
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    await flow.start(payAndApply, data);
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit(event.currentTarget);
  };

  const changeNumber = () => {
    flow.reset();
    requestAnimationFrame(() => {
      const input = formRef.current?.querySelector<HTMLInputElement>("#pay_phone");
      input?.focus({ preventScroll: true });
      input?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const startOver = () => {
    flow.reset();
    formRef.current?.reset();
    setErrors({});
    setCampus("");
    setPayPhone("");
    setPayPhoneEdited(false);
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>("input")?.focus());
  };

  const inProgress = flow.phase !== "idle" && flow.phase !== "starting";
  const starting = flow.phase === "starting";

  return (
    <>
      {inProgress ? (
        <PaymentProgress
          flow={flow}
          onChangeNumber={changeNumber}
          onRetry={() => formRef.current && void submit(formRef.current)}
          onDone={startOver}
          doneLabel="Apply for another child"
          contact={{ phone, email }}
        />
      ) : null}

      <form ref={formRef} className="apply-card apply-form" onSubmit={onSubmit} noValidate aria-label="Application form" style={inProgress ? { display: "none" } : undefined}>
        <div className="apply-card-head">
          <h2>Application form</h2>
        </div>

        <Section step="01" title="Parent or guardian">
          <Field id="parent_names" label="Full name" error={errors.parent_names} wide>
            <input className="apply-input" type="text" autoComplete="name" maxLength={400} {...control("parent_names")} />
          </Field>
          <Field id="parent_email" label="Email address" error={errors.parent_email}>
            <input className="apply-input" type="email" autoComplete="email" inputMode="email" maxLength={400} {...control("parent_email")} />
          </Field>
          <Field id="parent_phone" label="Phone number" error={errors.parent_phone}>
            <input className="apply-input" type="tel" autoComplete="tel" inputMode="tel" maxLength={40} placeholder="+256" {...control("parent_phone")} />
          </Field>
        </Section>

        <Section step="02" title="Your child">
          <Field id="child_name" label="Child's name" error={errors.child_name}>
            <input className="apply-input" type="text" maxLength={400} {...control("child_name")} />
          </Field>
          <Field id="child_birtDate" label="Date of birth" error={errors.child_birtDate}>
            <input className="apply-input" type="date" {...control("child_birtDate")} />
          </Field>
          <Field id="grade" label="Class" optional>
            <select className="apply-input apply-select" id="grade" name="grade" defaultValue="">
              <option value="">Not sure yet</option>
              {GRADES.map(({ group, options }) => (
                <optgroup key={group} label={group}>
                  {options.map((option) => <option key={option}>{option}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field id="campus" label="Campus" error={errors.campus}>
            <select
              className="apply-input apply-select"
              id="campus"
              name="campus"
              value={campus}
              aria-required
              aria-invalid={Boolean(errors.campus)}
              aria-describedby={errors.campus ? "campus-error" : undefined}
              onChange={(event) => {
                setCampus(event.target.value);
                if (errors.campus) validate("campus", event.target.value);
              }}
            >
              <option value="">Choose a campus</option>
              {fees.map((item) => <option key={item.campus} value={item.campus}>{item.campus}</option>)}
            </select>
          </Field>
        </Section>

        <Section step="03" title="Anything else">
          <Field id="message" label="Message" optional wide>
            <textarea className="apply-input apply-textarea" id="message" name="message" rows={5} maxLength={2000} />
          </Field>
        </Section>

        <Section step="04" title="Admission fee">
          <div className="apply-field is-wide">
            <FeeSummary campus={campus} fees={fees} />
          </div>
          <Field id="pay_phone" label="Mobile money number" error={errors.pay_phone} wide>
            <MobileMoneyField
              id="pay_phone"
              inputClassName="apply-input"
              value={payPhone}
              error={errors.pay_phone}
              onChange={(value) => {
                setPayPhone(value);
                setPayPhoneEdited(true);
                if (errors.pay_phone) validate("pay_phone", value);
              }}
            />
          </Field>
        </Section>

        {flow.error ? (
          <div className="apply-alert" role="alert">
            <i className="fas fa-triangle-exclamation" aria-hidden="true" />
            <p>
              {flow.error} Need help? Call <a href={`tel:${phone.replace(/\s/g, "")}`}>{phone}</a> or email{" "}
              <a href={`mailto:${email}`}>{email}</a>.
            </p>
          </div>
        ) : null}

        <div className="apply-submit-row">
          <button type="submit" className="apply-btn apply-btn-primary apply-submit" disabled={starting} aria-busy={starting}>
            {starting ? <span className="apply-spinner" aria-hidden="true" /> : <i className="fas fa-lock" aria-hidden="true" />}
            {starting ? "Sending payment request…" : fee ? `Pay ${ugx(fee.fee)} & submit` : "Pay & submit"}
          </button>
        </div>
      </form>
    </>
  );
}
