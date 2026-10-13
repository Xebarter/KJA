"use client";

import { useRef, useState } from "react";
import { submitApplication } from "@/app/actions";
import { APPLIED_KEY } from "@/components/site/Popup";

type FieldName = "parent_names" | "parent_email" | "parent_phone" | "child_name" | "child_birtDate";
type Errors = Partial<Record<FieldName, string>>;
type Status = "idle" | "submitting" | "sent" | "failed";

const REQUIRED: Record<FieldName, string> = {
  parent_names: "Enter your name.",
  parent_email: "Enter your email.",
  parent_phone: "Enter your phone number.",
  child_name: "Enter your child's name.",
  child_birtDate: "Enter a date of birth.",
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

export function ApplyForm({ campuses, phone, email }: { campuses: string[]; phone: string; email: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<Status>("idle");
  const [firstName, setFirstName] = useState("");

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
    },
  });

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
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
    setStatus("submitting");
    try {
      await submitApplication(data);
      setFirstName(String(data.get("parent_names") || "").trim().split(/\s+/)[0] || "");
      setStatus("sent");
      try {
        localStorage.setItem(APPLIED_KEY, "1");
      } catch {}
      requestAnimationFrame(() => {
        successRef.current?.focus({ preventScroll: true });
        successRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    } catch {
      setStatus("failed");
    }
  };

  const reset = () => {
    setErrors({});
    setStatus("idle");
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>("input")?.focus());
  };

  if (status === "sent") {
    return (
      <div className="apply-card apply-success" ref={successRef} tabIndex={-1} role="status">
        <div className="apply-success-icon" aria-hidden="true"><i className="fas fa-check" /></div>
        <h2>Application received</h2>
        <p>Thank you{firstName ? `, ${firstName}` : ""}. We&apos;ll be in touch soon.</p>
        <div className="apply-success-actions">
          <button type="button" className="apply-btn apply-btn-primary" onClick={reset}>Add another child</button>
        </div>
      </div>
    );
  }

  const submitting = status === "submitting";
  return (
    <form ref={formRef} className="apply-card apply-form" onSubmit={onSubmit} noValidate aria-label="Application form">
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
        <Field id="campus" label="Campus" optional>
          <select className="apply-input apply-select" id="campus" name="campus" defaultValue="">
            <option value="">No preference</option>
            {campuses.map((campus) => <option key={campus}>{campus}</option>)}
          </select>
        </Field>
      </Section>

      <Section step="03" title="Anything else">
        <Field id="message" label="Message" optional wide>
          <textarea className="apply-input apply-textarea" id="message" name="message" rows={5} maxLength={2000} />
        </Field>
      </Section>

      {status === "failed" ? (
        <div className="apply-alert" role="alert">
          <i className="fas fa-triangle-exclamation" aria-hidden="true" />
          <p>
            Couldn&apos;t send. Try again or contact <a href={`tel:${phone.replace(/\s/g, "")}`}>{phone}</a> or{" "}
            <a href={`mailto:${email}`}>{email}</a>.
          </p>
        </div>
      ) : null}

      <div className="apply-submit-row">
        <button type="submit" className="apply-btn apply-btn-primary apply-submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? <span className="apply-spinner" aria-hidden="true" /> : null}
          {submitting ? "Sending…" : "Submit"}
          {submitting ? null : <i className="fas fa-arrow-right" aria-hidden="true" />}
        </button>
      </div>
    </form>
  );
}
