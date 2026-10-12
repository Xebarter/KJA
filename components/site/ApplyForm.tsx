"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { submitApplication } from "@/app/actions";

type FieldName = "parent_names" | "parent_email" | "parent_phone" | "child_name" | "child_birtDate";
type Errors = Partial<Record<FieldName, string>>;
type Status = "idle" | "submitting" | "sent" | "failed";

const REQUIRED: Record<FieldName, string> = {
  parent_names: "Please enter your full name.",
  parent_email: "Please enter your email address.",
  parent_phone: "Please enter a phone number we can reach you on.",
  child_name: "Please enter your child's full name.",
  child_birtDate: "Please enter your child's date of birth.",
};
const FIELDS = Object.keys(REQUIRED) as FieldName[];

const GRADES = [
  { group: "Nursery", options: ["Daycare", "Baby Class", "Middle Class", "Top Class"] },
  { group: "Primary", options: ["Primary One", "Primary Two", "Primary Three", "Primary Four", "Primary Five", "Primary Six", "Primary Seven"] },
];

function problem(name: FieldName, raw: string) {
  const value = raw.trim();
  if (!value) return REQUIRED[name];
  if (name === "parent_email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Enter a valid email address, e.g. name@example.com.";
  if (name === "parent_phone" && !/^[+]?[0-9() -]{7,}$/.test(value)) return "Enter a valid phone number, e.g. +256 700 000 000.";
  if (name === "child_birtDate" && new Date(value) > new Date()) return "The date of birth can't be in the future.";
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

function Section({ step, title, intro, children }: { step: string; title: string; intro: string; children: React.ReactNode }) {
  return (
    <fieldset className="apply-section">
      <legend className="apply-section-head">
        <span className="apply-step" aria-hidden="true">{step}</span>
        <span>
          <span className="apply-section-title">{title}</span>
          <span className="apply-section-intro">{intro}</span>
        </span>
      </legend>
      <div className="apply-fields">{children}</div>
    </fieldset>
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
        <p>
          Thank you{firstName ? `, ${firstName}` : ""}. Our admissions team will be in touch shortly to arrange your visit
          to the school, the final step in completing your child&apos;s admission.
        </p>
        <div className="apply-success-actions">
          <Link className="apply-btn apply-btn-ghost" href="/admissions">Admission process</Link>
          <button type="button" className="apply-btn apply-btn-primary" onClick={reset}>Apply for another child</button>
        </div>
      </div>
    );
  }

  const submitting = status === "submitting";
  return (
    <form ref={formRef} className="apply-card apply-form" onSubmit={onSubmit} noValidate aria-label="Application form">
      <div className="apply-card-head">
        <h2>Application form</h2>
        <p>It takes about two minutes. Fields marked <span className="apply-req">*</span> are required.</p>
      </div>

      <Section step="01" title="Parent or guardian" intro="So our admissions team can reach you.">
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

      <Section step="02" title="Your child" intro="Helps us find the right class and campus.">
        <Field id="child_name" label="Child's full name" error={errors.child_name}>
          <input className="apply-input" type="text" maxLength={400} {...control("child_name")} />
        </Field>
        <Field id="child_birtDate" label="Date of birth" error={errors.child_birtDate}>
          <input className="apply-input" type="date" {...control("child_birtDate")} />
        </Field>
        <Field id="grade" label="Class applying for" optional>
          <select className="apply-input apply-select" id="grade" name="grade" defaultValue="">
            <option value="">Not sure yet</option>
            {GRADES.map(({ group, options }) => (
              <optgroup key={group} label={group}>
                {options.map((option) => <option key={option}>{option}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field id="campus" label="Preferred campus" optional>
          <select className="apply-input apply-select" id="campus" name="campus" defaultValue="">
            <option value="">No preference</option>
            {campuses.map((campus) => <option key={campus}>{campus}</option>)}
          </select>
        </Field>
      </Section>

      <Section step="03" title="Anything else" intro="Previous school, special needs or questions for us.">
        <Field id="message" label="Message" optional wide>
          <textarea className="apply-input apply-textarea" id="message" name="message" rows={5} maxLength={2000} />
        </Field>
      </Section>

      {status === "failed" ? (
        <div className="apply-alert" role="alert">
          <i className="fas fa-triangle-exclamation" aria-hidden="true" />
          <p>
            We couldn&apos;t send your application just now. Please try again, or contact admissions on{" "}
            <a href={`tel:${phone.replace(/\s/g, "")}`}>{phone}</a> or <a href={`mailto:${email}`}>{email}</a>.
          </p>
        </div>
      ) : null}

      <div className="apply-submit-row">
        <p className="apply-privacy">
          <i className="fas fa-lock" aria-hidden="true" />
          Your details are only used to process this application.
        </p>
        <button type="submit" className="apply-btn apply-btn-primary apply-submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? <span className="apply-spinner" aria-hidden="true" /> : null}
          {submitting ? "Sending…" : "Submit application"}
          {submitting ? null : <i className="fas fa-arrow-right" aria-hidden="true" />}
        </button>
      </div>
    </form>
  );
}
