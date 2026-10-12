"use client";

import { useEffect, useRef, useState } from "react";
import { submitAlumniStory, submitApplication, submitContact } from "@/app/actions";
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

export function ContactUsForm() {
  const cf7 = useCf7(submitContact);
  return (
    <div className={SELECTOR}>
      <div className="wpcf7 js" lang="en-US" dir="ltr">
        <form {...cf7.form} aria-label="Contact form">
          <input type="hidden" name="subject" value="Contact us" />
          <div className="d-flex flex-column gap-0  event-registration-form mt-3">
            <div className="row mb-0">
              <div className="col-12 mt-0">
                <div className="form-group">
                  <label className="form-label" htmlFor="names">Names<span className="text-danger">*</span></label>
                  <span className="wpcf7-form-control-wrap" data-name="names">
                    <input size={40} maxLength={400} {...cf7.field("name", TEXT)} id="names" type="text" />
                  </span>
                </div>
              </div>
              <div className="col-6 mt-0">
                <div className="form-group">
                  <label className="form-label" htmlFor="email">Contact email<span className="text-danger">*</span></label>
                  <span className="wpcf7-form-control-wrap" data-name="email">
                    <input size={40} maxLength={400} {...cf7.field("email", EMAIL)} id="email" type="email" />
                  </span>
                </div>
              </div>
              <div className="col-6 mt-0">
                <div className="form-group">
                  <label className="form-label" htmlFor="phone">Phone Number<span className="text-danger">*</span></label>
                  <span className="wpcf7-form-control-wrap" data-name="phone">
                    <input size={40} maxLength={400} {...cf7.field("phone", TEL)} id="phone" type="tel" />
                  </span>
                </div>
              </div>
              <div className="col-12 mt-0">
                <div className="form-group">
                  <label className="form-label" htmlFor="message">Message<span className="text-danger">*</span></label>
                  <span className="wpcf7-form-control-wrap" data-name="message">
                    <textarea cols={40} rows={7} maxLength={2000} {...cf7.field("message", "wpcf7-form-control wpcf7-textarea wpcf7-validates-as-required not-rounded form-control w-100")} id="message" />
                  </span>
                </div>
              </div>
              <div className="col-12 mt-lg-4 mt-0">
                <div className="w-100 h-100 d-flex align-items-center gap-4">
                  <button type="submit" className="kja-btn px-5 wpcf7-submit form-button" disabled={cf7.submitDisabled}><Loader />send</button>
                  <button type="button" className="kja-btn px-4">cancel</button>
                </div>
              </div>
            </div>
          </div>
          {cf7.output}
        </form>
      </div>
    </div>
  );
}

export function AlumniTouchForm() {
  const cf7 = useCf7(submitAlumniStory);
  return (
    <div className={SELECTOR}>
      <div className="wpcf7 js" lang="en-US" dir="ltr">
        <form {...cf7.form} aria-label="Contact form">
          <div className="row event-registration-form mb-3">
            <div className="col-12 mt-5">
              <div className="form-group">
                <label className="mb-1" htmlFor="full_names">Full Name<span className="text-danger">*</span></label>
                <span className="wpcf7-form-control-wrap" data-name="full_names">
                  <input size={40} maxLength={400} {...cf7.field("full_names", TEXT)} id="full_names" type="text" />
                </span>
              </div>
            </div>
            <div className="col-12 mt-4">
              <div className="form-group">
                <label className="mb-1" htmlFor="email">Email address<span className="text-danger">*</span></label>
                <span className="wpcf7-form-control-wrap" data-name="email">
                  <input size={40} maxLength={400} {...cf7.field("email", EMAIL)} id="email" type="email" />
                </span>
              </div>
            </div>
            <div className="col-12 mt-4">
              <div className="form-group">
                <label className="mb-1" htmlFor="class_of">Class Of<span className="text-danger">*</span></label>
                <span className="wpcf7-form-control-wrap" data-name="class_of">
                  <input size={40} maxLength={400} {...cf7.field("class_of", TEXT)} id="class_of" type="text" />
                </span>
              </div>
            </div>
            <div className="col-12 mt-4">
              <div className="form-group">
                <label className="mb-1" htmlFor="phone">Phone Number<span className="text-danger">*</span></label>
                <span className="wpcf7-form-control-wrap" data-name="phone">
                  <input size={40} maxLength={400} {...cf7.field("phone", TEL)} id="phone" type="tel" />
                </span>
              </div>
            </div>
            {ALUMNI_QUESTIONS.map((question, index) => {
              const name = `question${index + 1}`;
              return (
                <div className="col-12 mt-4" key={name}>
                  <div className="form-group">
                    <p id={`${name}-label`}>{question}</p>
                    <span className="wpcf7-form-control-wrap" data-name={name}>
                      <textarea cols={40} rows={7} maxLength={2000} {...cf7.field(name, "wpcf7-form-control wpcf7-textarea wpcf7-validates-as-required form-control not-rounded")} id={name} aria-labelledby={`${name}-label`} />
                    </span>
                  </div>
                </div>
              );
            })}
            <div className="col-12 mt-lg-4 mt-4">
              <div className="w-100 h-100 d-flex align-items-center">
                <button type="submit" className="kja-btn wpcf7-submit form-button" disabled={cf7.submitDisabled}><Loader />Send</button>
              </div>
            </div>
          </div>
          {cf7.output}
        </form>
      </div>
    </div>
  );
}

export function ApplyForm() {
  const cf7 = useCf7(submitApplication);
  return (
    <div className={SELECTOR}>
      <div className="wpcf7 js" lang="en-US" dir="ltr">
        <form {...cf7.form} aria-label="Contact form">
          {/* Empty but load-bearing: CF7's hidden-fields fieldset stops the mt-5 margin collapsing out of the form. */}
          <fieldset className="hidden-fields-container" />
          <div className="d-flex flex-column gap-0  event-registration-form mt-5">
            <h4 style={{ paddingBottom: 0, marginBottom: 0 }}>Parent&apos;s Details</h4>
            <div className="row mb-0">
              <div className="col-12 mt-0">
                <div className="form-group">
                  <label className="form-label" htmlFor="parent_names">Names<span className="text-danger">*</span></label>
                  <span className="wpcf7-form-control-wrap" data-name="parent_names">
                    <input size={40} maxLength={400} {...cf7.field("parent_names", TEXT)} id="parent_names" type="text" />
                  </span>
                </div>
              </div>
              <div className="col-6 mt-0">
                <div className="form-group">
                  <label className="form-label" htmlFor="parent_email">Email<span className="text-danger">*</span></label>
                  <span className="wpcf7-form-control-wrap" data-name="parent_email">
                    <input size={40} maxLength={400} {...cf7.field("parent_email", EMAIL)} id="parent_email" type="email" />
                  </span>
                </div>
              </div>
              <div className="col-6 mt-0">
                <div className="form-group">
                  <label className="form-label" htmlFor="parent_phone">Phone Number<span className="text-danger">*</span></label>
                  <span className="wpcf7-form-control-wrap" data-name="parent_phone">
                    <input size={40} maxLength={400} {...cf7.field("parent_phone", TEL)} id="parent_phone" type="tel" />
                  </span>
                </div>
              </div>
            </div>
            <h4 className="mt-5">Child Details</h4>
            <div className="row mt-3">
              <div className="col-12 mt-0">
                <div className="form-group">
                  <label className="form-label" htmlFor="child_name">Child&apos;s names</label>
                  <span className="wpcf7-form-control-wrap" data-name="child_name">
                    <input size={40} maxLength={400} {...cf7.field("child_name", TEXT)} id="child_name" type="text" />
                  </span>
                </div>
              </div>
              <div className="col-12 mt-0">
                <div className="form-group">
                  <label className="form-label" htmlFor="child_birtDate">Child&apos;s birthdate</label>
                  <span className="wpcf7-form-control-wrap" data-name="child_birtDate">
                    <input {...cf7.field("child_birtDate", "wpcf7-form-control wpcf7-date wpcf7-validates-as-required wpcf7-validates-as-date form-control not-rounded")} id="child_birtDate" type="date" />
                  </span>
                </div>
              </div>
            </div>
            <h4 className="mt-4">Additional Details</h4>
            <div className="row mt-3">
              <div className="col-12 mt-0">
                <div className="form-group">
                  <label className="form-label" htmlFor="message">Message</label>
                  <span className="wpcf7-form-control-wrap" data-name="message">
                    <textarea cols={40} rows={7} maxLength={2000} {...cf7.field("message", "wpcf7-form-control wpcf7-textarea wpcf7-validates-as-required form-control not-rounded")} id="message" />
                  </span>
                </div>
              </div>
              <div className="col-12 mt-lg-4 mt-0">
                <div className="w-100 h-100 d-flex align-items-center gap-4">
                  <button type="submit" className="kja-btn px-5 wpcf7-submit form-button" disabled={cf7.submitDisabled}><Loader />send</button>
                  <button type="button" className="kja-btn px-4">cancel</button>
                </div>
              </div>
            </div>
          </div>
          {cf7.output}
        </form>
      </div>
    </div>
  );
}
