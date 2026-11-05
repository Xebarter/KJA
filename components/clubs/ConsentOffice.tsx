"use client";

import { useState, type FormEvent } from "react";
import { officeConsent } from "@/app/clubs/(desk)/actions";
import { Dialog, Feedback, useOfficeAction } from "@/components/accounts/client";

export function ConsentOffice({
  clubs,
  pupils,
}: {
  clubs: { id: string; title: string }[];
  pupils: { id: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const { result, setResult, pending, run } = useOfficeAction();

  return (
    <>
      <button
        type="button"
        className="clubs-head-btn is-primary"
        onClick={() => {
          setResult(null);
          setOpen(true);
        }}
      >
        <i className="fa-solid fa-handshake" aria-hidden="true" /> Desk consent
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Record consent"
        description="Use this when a parent consents at the desk instead of on the portal."
      >
        <form
          className="clubs-consent-form"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            run(() => officeConsent(new FormData(event.currentTarget)), () => setOpen(false));
          }}
        >
          <div className="clubs-consent-fields">
            <label className="clubs-dialog-field">
              <span>Pupil</span>
              <select name="student_id" required defaultValue="">
                <option value="" disabled>
                  Choose a pupil
                </option>
                {pupils.map((pupil) => (
                  <option key={pupil.id} value={pupil.id}>
                    {pupil.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="clubs-dialog-field">
              <span>Club</span>
              <select name="club_id" required defaultValue="">
                <option value="" disabled>
                  Choose a club
                </option>
                {clubs.map((club) => (
                  <option key={club.id} value={club.id}>
                    {club.title}
                  </option>
                ))}
              </select>
            </label>
            <Feedback result={result} />
          </div>
          <div className="clubs-dialog-foot">
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="admin-btn" disabled={pending}>
              {pending ? "Saving…" : "Save consent"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
