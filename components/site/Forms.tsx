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
