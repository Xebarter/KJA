"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FocusEvent, type FormEvent, type ReactNode } from "react";
import { submitEnquiry, submitVisitRequest } from "@/app/actions";

type Status = "idle" | "sending" | "sent" | "failed";
type Rule = (value: string) => string;
type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const required = (message: string): Rule => (value) => (value.trim() ? "" : message);
const email: Rule = (value) =>
  !value.trim() ? "Please enter your email address." : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? "" : "Please enter a valid email address.";
const phone: Rule = (value) =>
  !value.trim() ? "Please enter your phone number." : /^\+?[\d\s()-]{7,}$/.test(value.trim()) ? "" : "Please enter a valid phone number.";

function valueOf(form: HTMLFormElement, name: string) {
  const item = form.elements.namedItem(name) as Control | RadioNodeList | null;
  return item ? String(item.value ?? "") : "";
}

function useForm(send: (data: FormData) => Promise<void>, rules: Record<string, Rule>) {
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [sentData, setSentData] = useState<FormData | null>(null);

  const check = (form: HTMLFormElement, names: string[]) => {
    const found: Record<string, string> = {};
    for (const name of names) {
      const message = rules[name]?.(valueOf(form, name)) ?? "";
      if (message) found[name] = message;
    }
    return found;
  };

  const onBlur = (event: FocusEvent<HTMLFormElement>) => {
    const name = (event.target as Element).getAttribute("name") ?? "";
    if (!name || !(name in rules) || (!submitted && !errors[name] && !valueOf(event.currentTarget, name))) return;
    const found = check(event.currentTarget, [name]);
    setErrors((current) => {
      const next = { ...current };
      if (found[name]) next[name] = found[name];
      else delete next[name];
      return next;
    });
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setSubmitted(true);
    const found = check(form, Object.keys(rules));
    setErrors(found);
    const first = Object.keys(rules).find((name) => found[name]);
    if (first) {
      const target = form.elements.namedItem(first);
      (target instanceof RadioNodeList ? (target[0] as HTMLElement) : (target as HTMLElement | null))?.focus();
      return;
    }
    setStatus("sending");
    const data = new FormData(form);
    try {
      await send(data);
      setSentData(data);
      setStatus("sent");
      form.reset();
      setSubmitted(false);
    } catch {
      setStatus("failed");
    }
  };

  const reset = () => {
    setStatus("idle");
    setErrors({});
    setSentData(null);
  };

  const control = (name: string) => ({
    name,
    "aria-invalid": Boolean(errors[name]) || undefined,
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });

  return { formRef, status, errors, sentData, onBlur, onSubmit, reset, control };
}

function Field({ label, name, error, optional, hint, children, wide }: {
  label: string;
  name: string;
  error?: string;
  optional?: boolean;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`kja-ct-field${error ? " is-invalid" : ""}${wide ? " is-wide" : ""}`}>
      <label htmlFor={name}>
        {label}
        {optional ? <small>Optional</small> : <span aria-hidden="true">*</span>}
      </label>
      {children}
      {error ? (
        <p className="kja-ct-error" id={`${name}-error`}>
          <i className="fas fa-circle-exclamation" aria-hidden="true" /> {error}
        </p>
      ) : hint ? (
        <p className="kja-ct-hint">{hint}</p>
      ) : null}
    </div>
  );
}

function SubmitButton({ sending, label, busy }: { sending: boolean; label: string; busy: string }) {
  return (
    <button type="submit" className="kja-ct-submit" disabled={sending} aria-busy={sending || undefined}>
      {sending ? <span className="kja-ct-spinner" aria-hidden="true" /> : null}
      {sending ? busy : label}
      {sending ? null : <i className="fas fa-paper-plane" aria-hidden="true" />}
    </button>
  );
}

function Failure({ phoneNumber, emailAddress }: { phoneNumber: string; emailAddress: string }) {
  return (
    <div className="kja-ct-alert" role="alert">
      <i className="fas fa-triangle-exclamation" aria-hidden="true" />
      <span>
        We couldn&apos;t send this right now. Please try again, or reach us on{" "}
        <a href={`tel:${phoneNumber.replace(/[^\d+]/g, "")}`}>{phoneNumber}</a> or <a href={`mailto:${emailAddress}`}>{emailAddress}</a>.
      </span>
    </div>
  );
}

function Success({ title, children, action, onReset }: { title: string; children: ReactNode; action: string; onReset: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="kja-ct-success" role="status" tabIndex={-1} ref={ref}>
      <span className="kja-ct-success-icon" aria-hidden="true">
        <i className="fas fa-check" />
      </span>
      <h3>{title}</h3>
      {children}
      <button type="button" className="kja-ct-link-btn" onClick={onReset}>
        <i className="fas fa-rotate-left" aria-hidden="true" /> {action}
      </button>
    </div>
  );
}

const TOPICS = [
  { value: "General enquiry", icon: "fa-circle-question" },
  { value: "Admissions", icon: "fa-door-open" },
  { value: "Fees & payment", icon: "fa-wallet" },
  { value: "Campus visit", icon: "fa-school" },
  { value: "Feedback", icon: "fa-comment-dots" },
];

export function EnquiryForm({ campuses, phoneNumber, emailAddress }: { campuses: string[]; phoneNumber: string; emailAddress: string }) {
  const form = useForm(submitEnquiry, {
    name: required("Please tell us your name."),
    email,
    phone,
    message: required("Please write your message."),
  });
  const [topic, setTopic] = useState(TOPICS[0].value);

  if (form.status === "sent") {
    const first = String(form.sentData?.get("name") || "").trim().split(/\s+/)[0];
    return (
      <Success title={first ? `Thank you, ${first}!` : "Thank you!"} action="Send another message" onReset={form.reset}>
        <p>
          Your message has reached our team. We&apos;ll reply to <strong>{String(form.sentData?.get("email") || "your email")}</strong> as soon as we can.
        </p>
      </Success>
    );
  }

  return (
    <form ref={form.formRef} className="kja-ct-form" noValidate onSubmit={form.onSubmit} onBlur={form.onBlur} aria-label="Contact form">
      <fieldset className="kja-ct-topics">
        <legend>What would you like to talk about?</legend>
        <div>
          {TOPICS.map((item) => (
            <label key={item.value} className={`kja-ct-chip${topic === item.value ? " is-active" : ""}`}>
              <input type="radio" name="topic" value={item.value} checked={topic === item.value} onChange={() => setTopic(item.value)} />
              <i className={`fas ${item.icon}`} aria-hidden="true" /> {item.value}
            </label>
          ))}
        </div>
        {topic === "Campus visit" ? (
          <p className="kja-ct-tip">
            <i className="far fa-calendar-check" aria-hidden="true" /> Planning a tour? <Link href="/visit-us#book">Book a campus visit</Link> and pick a date that suits you.
          </p>
        ) : null}
      </fieldset>

      <div className="kja-ct-grid">
        <Field label="Your name" name="name" error={form.errors.name}>
          <input id="name" type="text" autoComplete="name" maxLength={120} {...form.control("name")} />
        </Field>
        <Field label="Campus" name="campus" optional>
          <select id="campus" name="campus" defaultValue="">
            <option value="">Any campus</option>
            {campuses.map((campus) => <option key={campus} value={campus}>{campus}</option>)}
          </select>
        </Field>
        <Field label="Email address" name="email" error={form.errors.email}>
          <input id="email" type="email" autoComplete="email" maxLength={160} {...form.control("email")} />
        </Field>
        <Field label="Phone number" name="phone" error={form.errors.phone}>
          <input id="phone" type="tel" autoComplete="tel" maxLength={40} placeholder="+256" {...form.control("phone")} />
        </Field>
        <Field label="Message" name="message" error={form.errors.message} wide>
          <textarea id="message" rows={6} maxLength={2000} placeholder="How can we help?" {...form.control("message")} />
        </Field>
      </div>

      {form.status === "failed" ? <Failure phoneNumber={phoneNumber} emailAddress={emailAddress} /> : null}

      <div className="kja-ct-actions">
        <p className="kja-ct-privacy">
          <i className="fas fa-lock" aria-hidden="true" /> We only use your details to respond to your message.
        </p>
        <SubmitButton sending={form.status === "sending"} label="Send message" busy="Sending…" />
      </div>
    </form>
  );
}

export type VisitOption = { value: string; name: string; stage: string; image: string; address: string };

function tomorrow() {
  const date = new Date(Date.now() + 3 * 3_600_000 + 86_400_000);
  return date.toISOString().slice(0, 10);
}

function readableDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function VisitForm({ campuses, phoneNumber, emailAddress }: { campuses: VisitOption[]; phoneNumber: string; emailAddress: string }) {
  const [minDate, setMinDate] = useState("");
  useEffect(() => setMinDate(tomorrow()), []);
  const form = useForm(submitVisitRequest, {
    campus: required("Please choose a campus to visit."),
    date: (value) => (!value ? "Please choose a date." : minDate && value < minDate ? "Please choose a date from tomorrow onwards." : ""),
    name: required("Please tell us your name."),
    phone,
    email,
  });
  const [campus, setCampus] = useState("");
  const [time, setTime] = useState("Morning");

  if (form.status === "sent") {
    const chosen = String(form.sentData?.get("campus") || "");
    const date = String(form.sentData?.get("date") || "");
    return (
      <Success title="Your visit request is in" action="Book another visit" onReset={() => { form.reset(); setCampus(""); setTime("Morning"); }}>
        <p>Thank you. Our team will call or email you to confirm the details.</p>
        <dl className="kja-ct-summary">
          <div><dt>Campus</dt><dd>{chosen}</dd></div>
          {date ? <div><dt>Preferred date</dt><dd>{readableDate(date)}</dd></div> : null}
          <div><dt>Time of day</dt><dd>{String(form.sentData?.get("time") || "")}</dd></div>
        </dl>
      </Success>
    );
  }

  return (
    <form ref={form.formRef} className="kja-ct-form kja-ct-form--visit" noValidate onSubmit={form.onSubmit} onBlur={form.onBlur} aria-label="Book a campus visit">
      <fieldset className={`kja-ct-step${form.errors.campus ? " is-invalid" : ""}`} aria-describedby={form.errors.campus ? "campus-error" : undefined}>
        <legend><span>1</span> Choose a campus</legend>
        <div className="kja-ct-campuses">
          {campuses.map((item) => (
            <label key={item.value} className={`kja-ct-campus${campus === item.value ? " is-active" : ""}`}>
              <input type="radio" name="campus" value={item.value} checked={campus === item.value} onChange={() => setCampus(item.value)} />
              <span className="kja-ct-campus-media" aria-hidden="true">
                {item.image ? <img src={item.image} alt="" loading="lazy" /> : <i className="fas fa-school" />}
              </span>
              <span className="kja-ct-campus-body">
                <strong>{item.name}</strong>
                <small>{item.stage}</small>
                {item.address ? <em>{item.address}</em> : null}
              </span>
              <span className="kja-ct-campus-tick" aria-hidden="true"><i className="fas fa-check" /></span>
            </label>
          ))}
        </div>
        {form.errors.campus ? (
          <p className="kja-ct-error" id="campus-error"><i className="fas fa-circle-exclamation" aria-hidden="true" /> {form.errors.campus}</p>
        ) : null}
      </fieldset>

      <fieldset className="kja-ct-step">
        <legend><span>2</span> Pick a day</legend>
        <div className="kja-ct-grid">
          <Field label="Preferred date" name="date" error={form.errors.date} hint="We'll confirm the exact time with you.">
            <input id="date" type="date" min={minDate || undefined} {...form.control("date")} />
          </Field>
          <div className="kja-ct-field">
            <span className="kja-ct-label" id="time-label">Time of day</span>
            <div className="kja-ct-toggle" role="radiogroup" aria-labelledby="time-label">
              {[["Morning", "fa-sun"], ["Afternoon", "fa-cloud-sun"]].map(([value, icon]) => (
                <label key={value} className={`kja-ct-chip${time === value ? " is-active" : ""}`}>
                  <input type="radio" name="time" value={value} checked={time === value} onChange={() => setTime(value)} />
                  <i className={`fas ${icon}`} aria-hidden="true" /> {value}
                </label>
              ))}
            </div>
          </div>
        </div>
      </fieldset>

      <fieldset className="kja-ct-step">
        <legend><span>3</span> Your details</legend>
        <div className="kja-ct-grid">
          <Field label="Your name" name="name" error={form.errors.name}>
            <input id="name" type="text" autoComplete="name" maxLength={120} {...form.control("name")} />
          </Field>
          <Field label="Phone number" name="phone" error={form.errors.phone}>
            <input id="phone" type="tel" autoComplete="tel" maxLength={40} placeholder="+256" {...form.control("phone")} />
          </Field>
          <Field label="Email address" name="email" error={form.errors.email}>
            <input id="email" type="email" autoComplete="email" maxLength={160} {...form.control("email")} />
          </Field>
          <Field label="Child's age or class" name="child" optional>
            <input id="child" name="child" type="text" maxLength={80} placeholder="e.g. 4 years, or joining P2" />
          </Field>
          <Field label="Anything we should know?" name="notes" optional wide>
            <textarea id="notes" name="notes" rows={4} maxLength={1500} placeholder="Questions you'd like answered, accessibility needs, number of visitors…" />
          </Field>
        </div>
      </fieldset>

      {form.status === "failed" ? <Failure phoneNumber={phoneNumber} emailAddress={emailAddress} /> : null}

      <div className="kja-ct-actions">
        <p className="kja-ct-privacy">
          <i className="fas fa-lock" aria-hidden="true" /> We only use your details to arrange your visit.
        </p>
        <SubmitButton sending={form.status === "sending"} label="Request my visit" busy="Sending…" />
      </div>
    </form>
  );
}
