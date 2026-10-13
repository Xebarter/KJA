"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { submitParentApplication } from "@/app/account/actions";
import { CAMPUS_OPTIONS, CLASS_OPTIONS } from "@/lib/applications";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="ch-btn ch-btn-primary ap-submit" type="submit" disabled={pending}>
      {pending ? <span className="ch-spinner" aria-hidden="true" /> : <i className="fa-solid fa-paper-plane" aria-hidden="true" />}
      {pending ? "Sending…" : "Submit application"}
    </button>
  );
}

export function NewApplication({ phone }: { phone: string }) {
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");
  const [formKey, setFormKey] = useState(0);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="ap-new" id="new-application">
      <div className="ch-add-head">
        <span className="ch-add-icon" aria-hidden="true">
          <i className="fa-solid fa-child-reaching" />
        </span>
        <div>
          <h2>New application</h2>
          <p>
            {phone
              ? "Applying for a sibling? Your contact details are added automatically."
              : "Applying for a sibling? Add a phone number so the admissions team can reach you."}
          </p>
        </div>
      </div>

      {sent ? (
        <div className="ap-sent" role="status">
          <span className="ap-sent-icon"><i className="fa-solid fa-check" aria-hidden="true" /></span>
          <strong>Application sent</strong>
          <p>Thank you. {sent}&apos;s application is now listed here, and the admissions team will be in touch soon.</p>
          <button
            className="ch-btn ch-btn-ghost"
            type="button"
            onClick={() => {
              setSent("");
              setFormKey((value) => value + 1);
            }}
          >
            <i className="fa-solid fa-plus" aria-hidden="true" /> Apply for another child
          </button>
        </div>
      ) : (
        <form
          key={formKey}
          className="ch-form"
          action={async (formData) => {
            setError("");
            try {
              await submitParentApplication(formData);
              setSent(String(formData.get("child_name") || "").trim().split(/\s+/)[0] || "Your child");
            } catch (err) {
              setError(err instanceof Error && err.message ? err.message : "Something went wrong. Please try again.");
            }
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
              <span>Preferred campus</span>
              <select id="ap-campus" name="campus" defaultValue="">
                <option value="">No preference</option>
                {CAMPUS_OPTIONS.map((campus) => <option key={campus}>{campus}</option>)}
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
          </div>
          {error ? (
            <p className="ch-alert" role="alert">
              <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {error}
            </p>
          ) : null}
          <Submit />
        </form>
      )}
    </section>
  );
}
