"use client";

import { useState } from "react";
import { moveApplication } from "@/app/admin/(panel)/applications/actions";
import { Feedback, useOfficeAction } from "@/components/office/client";

/** Outcome buttons for a booked school visit: offer, waitlist, decline or reschedule. */
export function VisitActions({ id, visitAt, past }: { id: string; visitAt: string; past: boolean }) {
  const { result, pending, run } = useOfficeAction();
  const [rescheduling, setRescheduling] = useState(false);
  const [when, setWhen] = useState(visitAt);

  const move = (status: string, note: string) => run(() => moveApplication({ id, status, note }));

  return (
    <div className="ofc-visit-actions">
      {rescheduling ? (
        <form
          className="ofc-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => moveApplication({ id, status: "visit_scheduled", visitAt: when, notify: true }), () => setRescheduling(false));
          }}
        >
          <label className="visually-hidden" htmlFor={`visit-${id}`}>New visit time</label>
          <input id={`visit-${id}`} type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} required />
          <button type="submit" className="app-link-btn" disabled={pending}>{pending ? "Saving…" : "Save and email parent"}</button>
          <button type="button" className="app-link-btn is-quiet" onClick={() => setRescheduling(false)}>Cancel</button>
        </form>
      ) : (
        <>
          {past ? (
            <>
              <button type="button" className="app-link-btn" disabled={pending} onClick={() => move("offered", "Visit done. Offered a place.")}>
                <i className="fa-solid fa-envelope-open-text" aria-hidden="true" /> Offer a place
              </button>
              <button type="button" className="app-link-btn" disabled={pending} onClick={() => move("waitlisted", "Visit done. Added to the waiting list.")}>
                <i className="fa-solid fa-hourglass-half" aria-hidden="true" /> Waitlist
              </button>
              <button
                type="button"
                className="app-link-btn is-quiet"
                disabled={pending}
                onClick={() => {
                  if (window.confirm("Decline this application?")) move("declined", "Declined after the school visit.");
                }}
              >
                Decline
              </button>
            </>
          ) : null}
          <button type="button" className="app-link-btn is-quiet" disabled={pending} onClick={() => setRescheduling(true)}>
            <i className="fa-regular fa-calendar" aria-hidden="true" /> Reschedule
          </button>
        </>
      )}
      <Feedback result={result} className="ofc-visit-feedback" />
    </div>
  );
}
