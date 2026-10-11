"use client";

import { useState } from "react";
import { submitApplication, submitContact, subscribeNewsletter } from "@/app/actions";
import type { Article } from "@/lib/types";

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

export function ApplicationForm({ campuses }: { campuses: Article[] }) {
  const { status, setStatus } = useStatus();
  return (
    <form className="enroll-form" action={async (formData) => {
      try {
        await submitApplication(formData);
        setStatus("Application received. The admissions team will be in touch.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Could not submit the application.");
      }
    }}>
      <h3>Apply to enroll</h3>
      <div className="form-group"><input className="form-control" name="parent_name" placeholder="Parent or guardian name" required /></div>
      <div className="form-group"><input className="form-control" type="email" name="email" placeholder="Email address" required /></div>
      <div className="form-group"><input className="form-control" name="phone" placeholder="Phone" required /></div>
      <div className="form-group"><input className="form-control" name="child_name" placeholder="Child's name" required /></div>
      <div className="form-group">
        <select className="form-select" name="campus" defaultValue="">
          <option value="">Preferred campus</option>
          {campuses.map((campus) => <option key={campus.slug} value={campus.title}>{campus.title}</option>)}
        </select>
      </div>
      <div className="form-group"><input className="form-control" name="grade" placeholder="Class or year group" /></div>
      <div className="form-group"><textarea className="form-control" name="message" rows={4} placeholder="Anything we should know" /></div>
      <button className="kja-btn" type="submit">Submit application <i className="fas fa-arrow-right-long" /></button>
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
