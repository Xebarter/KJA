"use client";

import { useEffect, useRef, useState } from "react";
import { submitAlumniStory } from "@/app/actions";
import { ALUMNI_QUESTIONS } from "@/lib/forms";

type Status = "init" | "submitting" | "invalid" | "sent" | "failed";
type Control = HTMLInputElement | HTMLTextAreaElement;

const RESPONSES: Partial<Record<Status, { message: string; alert: string }>> = {
  invalid: { message: "One or more fields have an error. Please check and try again.", alert: "alert-danger alert-danger-icon" },
  failed: { message: "There was an error trying to send your message. Please try again later.", alert: "alert-warning alert-warning-icon" },
  sent: { message: "Thank you for your message. It has been sent.", alert: "alert-success alert-success-icon" },
};

const REQUIRED = ".wpcf7-validates-as-required";

function problem(control: Control) {
  const value = control.value.trim();
  if (!value) return "Please fill out this field.";
  if (control.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Please enter an email address.";
  if (control.type === "tel" && !/^[+]?[0-9() -]*[0-9][0-9() -]*$/.test(value)) return "Please enter a telephone number.";
  return "";
}

/* Contact Form 7 + bs Contact Form 7: fields re-validate on change, submit adds Bootstrap's was-validated state and the response alert. */
function useCf7(send: (data: FormData) => Promise<void>) {
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<Status>("init");
  const [validated, setValidated] = useState(false);
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});

  const check = (control: Control) => {
    const message = problem(control);
    control.setCustomValidity(message);
    setInvalid((current) => ({ ...current, [control.name]: Boolean(message) }));
    return !message;
  };
  const checkRef = useRef(check);
  checkRef.current = check;

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    // Native change (fired on blur), not React's per-keystroke onChange.
    const onChange = (event: Event) => {
      const target = event.target as Element;
      if (target.matches(REQUIRED)) checkRef.current(target as Control);
    };
    form.addEventListener("change", onChange);
    return () => form.removeEventListener("change", onChange);
  }, []);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setValidated(true);
    const controls = Array.from(form.querySelectorAll<Control>(REQUIRED));
    if (!controls.map(check).every(Boolean)) {
      setStatus("invalid");
      return;
    }
    setStatus("submitting");
    try {
      await send(new FormData(form));
      form.reset();
      setInvalid({});
      setValidated(false);
      setStatus("sent");
    } catch {
      setStatus("failed");
    }
  };

  const response = RESPONSES[status];
  const field = (name: string, className: string) => ({
    name,
    className: `${className}${invalid[name] ? " wpcf7-not-valid" : ""}`,
    "aria-required": true,
    "aria-invalid": Boolean(invalid[name]),
  });

  return {
    form: {
      ref: formRef,
      onSubmit,
      noValidate: true,
      className: `wpcf7-form ${status}${validated ? " was-validated" : ""}`,
      "data-status": status,
    },
    field,
    submitDisabled: status === "sent" || status === "submitting",
    output: (
      <>
        <div className={`wpcf7-response-output${response ? ` alert alert-icon ${response.alert}` : ""}`} aria-hidden="true">{response?.message}</div>
        <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{response?.message}</p>
      </>
    ),
  };
}

function Loader() {
  return (
    <div className="ajax-loader">
      <div className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
    </div>
  );
}

const TEXT = "wpcf7-form-control wpcf7-text wpcf7-validates-as-required form-control not-rounded";
const EMAIL = "wpcf7-form-control wpcf7-email wpcf7-validates-as-required wpcf7-text wpcf7-validates-as-email form-control not-rounded";
const TEL = "wpcf7-form-control wpcf7-tel wpcf7-validates-as-required wpcf7-text wpcf7-validates-as-tel not-rounded form-control w-100";

/* No "wp-block" class on the wrapper: ThemeEffects groups wow animations by wp-block count, and counting this
   wrapper beside the page body would animate the body's blocks one by one instead of the whole column. */
const SELECTOR = "contact-form-7-contact-form-selector";

export function AlumniTouchForm() {
  const cf7 = useCf7(submitAlumniStory);
  return (
    <div className={SELECTOR}>
      <div className="wpcf7 js" lang="en-US" dir="ltr">
        <form {...cf7.form} aria-label="Alumni story form">
          <fieldset className="kja-al-fieldset">
            <legend><span>1</span> About you</legend>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label" htmlFor="full_names">Full name<span className="text-danger">*</span></label>
                <span className="wpcf7-form-control-wrap" data-name="full_names">
                  <input size={40} maxLength={400} {...cf7.field("full_names", TEXT)} id="full_names" type="text" autoComplete="name" />
                </span>
              </div>
              <div className="col-md-6">
                <label className="form-label" htmlFor="class_of">Class of<span className="text-danger">*</span></label>
                <span className="wpcf7-form-control-wrap" data-name="class_of">
                  <input size={40} maxLength={400} {...cf7.field("class_of", TEXT)} id="class_of" type="text" inputMode="numeric" placeholder="e.g. 2012" />
                </span>
              </div>
              <div className="col-md-6">
                <label className="form-label" htmlFor="email">Email address<span className="text-danger">*</span></label>
                <span className="wpcf7-form-control-wrap" data-name="email">
                  <input size={40} maxLength={400} {...cf7.field("email", EMAIL)} id="email" type="email" autoComplete="email" />
                </span>
              </div>
              <div className="col-md-6">
                <label className="form-label" htmlFor="phone">Phone number<span className="text-danger">*</span></label>
                <span className="wpcf7-form-control-wrap" data-name="phone">
                  <input size={40} maxLength={400} {...cf7.field("phone", TEL)} id="phone" type="tel" autoComplete="tel" />
                </span>
              </div>
            </div>
          </fieldset>
          <fieldset className="kja-al-fieldset">
            <legend><span>2</span> Your KJA story</legend>
            {ALUMNI_QUESTIONS.map((question, index) => {
              const name = `question${index + 1}`;
              return (
                <div className="kja-al-question" key={name}>
                  <label htmlFor={name}>
                    <b aria-hidden="true">{String(index + 1).padStart(2, "0")}</b>
                    <span>{question}<span className="text-danger">*</span></span>
                  </label>
                  <span className="wpcf7-form-control-wrap" data-name={name}>
                    <textarea cols={40} rows={4} maxLength={2000} {...cf7.field(name, "wpcf7-form-control wpcf7-textarea wpcf7-validates-as-required form-control not-rounded")} id={name} />
                  </span>
                </div>
              );
            })}
          </fieldset>
          <div className="kja-al-form-submit">
            <p><i className="fas fa-lock" aria-hidden="true" /> We only use your contact details to follow up on your story.</p>
            <button type="submit" className="kja-nr-btn kja-nr-btn--gold wpcf7-submit form-button" disabled={cf7.submitDisabled}>
              <Loader />Send my story <i className="fas fa-arrow-right" aria-hidden="true" />
            </button>
          </div>
          {cf7.output}
        </form>
      </div>
    </div>
  );
}
