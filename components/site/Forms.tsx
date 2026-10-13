"use client";

import { useState } from "react";
import { submitContact, subscribeNewsletter } from "@/app/actions";

function useStatus() {
  const [status, setStatus] = useState("");
  return { status, setStatus };
}

export function ContactForm({ subject = "General enquiry", heading = "Send a message" }: { subject?: string; heading?: string }) {
  const { status, setStatus } = useStatus();
  return (
    <form className="enroll-form" action={async (formData) => {
      try {
        await submitContact(formData);
        setStatus("Thank you. We have received your message.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Could not send your message.");
      }
    }}>
      <h3>{heading}</h3>
      <input type="hidden" name="subject" value={subject} />
      <div className="form-group"><input className="form-control" name="name" placeholder="Your name" required /></div>
      <div className="form-group"><input className="form-control" type="email" name="email" placeholder="Email address" required /></div>
      <div className="form-group"><input className="form-control" name="phone" placeholder="Phone" /></div>
      <div className="form-group"><textarea className="form-control" name="message" rows={5} placeholder="Message" required /></div>
      <button className="kja-btn" type="submit">Send <i className="fas fa-arrow-right-long" /></button>
      {status ? <p className="form-note">{status}</p> : null}
    </form>
  );
}

export function NewsroomNewsletter() {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  return (
    <form
      className="kja-nr-subscribe"
      action={async (formData) => {
        setState("sending");
        try {
          await subscribeNewsletter(formData);
          setState("done");
          setMessage("You're on the list. Look out for our next update.");
        } catch (error) {
          setState("error");
          setMessage(error instanceof Error ? error.message : "Could not subscribe. Please try again.");
        }
      }}
    >
      <label className="visually-hidden" htmlFor="newsroom-email">Email address</label>
      <div>
        <input id="newsroom-email" type="email" name="email" placeholder="Your email address" autoComplete="email" required disabled={state === "done"} />
        <button type="submit" disabled={state === "sending" || state === "done"}>
          {state === "done" ? <>Subscribed <i className="fas fa-check" aria-hidden="true" /></> : <>Subscribe <i className="far fa-paper-plane" aria-hidden="true" /></>}
        </button>
      </div>
      <p className={state === "error" ? "is-error" : undefined} role="status">{message || "One email when there's news. No spam."}</p>
    </form>
  );
}

export function NewsletterForm() {
  const { status, setStatus } = useStatus();
  return (
    <div className="footer-newsletter">
      <p>Subscribe Our Newsletter To Get Latest Update And News</p>
      <div className="subscribe-form">
        <form action={async (formData) => {
          try {
            await subscribeNewsletter(formData);
            setStatus("You are subscribed.");
          } catch (error) {
            setStatus(error instanceof Error ? error.message : "Could not subscribe.");
          }
        }}>
          <input type="email" name="email" className="form-control" placeholder="Your Email" required />
          <button className="kja-btn" type="submit">Subscribe Now <i className="far fa-paper-plane" /></button>
        </form>
        {status ? <p className="form-note">{status}</p> : null}
      </div>
    </div>
  );
}
