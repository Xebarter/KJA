"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Dialog, Feedback, useOfficeAction } from "@/components/accounts/client";
import { sendReminders } from "@/app/accounts/(desk)/debtors/actions";
import { ACCOUNTS_BASE, AGING, agingOf, amount, day, overdueText, ugx } from "@/lib/accounts-format";

export type DebtorRow = {
  student_id: string;
  full_name: string;
  student_number: string;
  class_code: string | null;
  stream: string | null;
  family_id: string | null;
  mailing_name: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  balance: number;
  oldest_due: string | null;
  last_paid_on: string | null;
  terms_owing: number;
  last_reminded: string | null;
};

const DEFAULT_MESSAGE =
  "This is a friendly reminder that school fees are outstanding for your child or children listed below. Please clear the balance, or contact the accounts office to agree a payment plan. Thank you for your support.";

export function DebtorsTable({ rows, today, emailReady }: { rows: DebtorRow[]; today: string; emailReady: string | null }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const { result, setResult, pending, run } = useOfficeAction();

  const chosen = rows.filter((row) => picked.has(row.student_id));
  const families = useMemo(() => new Set(chosen.map((row) => row.family_id ?? row.student_id)).size, [chosen]);
  const noEmail = chosen.filter((row) => !row.contact_email).length;
  const chosenTotal = chosen.reduce((sum, row) => sum + row.balance, 0);
  const allOn = rows.length > 0 && rows.every((row) => picked.has(row.student_id));

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <div className={`acc-bulk${picked.size ? " is-on" : ""}`} aria-live="polite">
        {picked.size ? (
          <>
            <span><strong>{picked.size}</strong> selected · {ugx(chosenTotal)}</span>
            <button type="button" className="admin-btn" onClick={() => { setResult(null); setOpen(true); }}>
              <i className="fa-regular fa-envelope" aria-hidden="true" /> Email reminders
            </button>
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setPicked(new Set())}>Clear</button>
          </>
        ) : (
          <span className="app-muted">Tick pupils to email their families a reminder.</span>
        )}
        <Feedback result={open ? null : result} />
      </div>

      <div className="ofc-table-scroll">
        <table className="app-table acc-table acc-debtors">
          <thead>
            <tr>
              <th scope="col" className="is-check">
                <input
                  type="checkbox"
                  aria-label="Select every pupil on this page"
                  checked={allOn}
                  onChange={() => setPicked(allOn ? new Set() : new Set(rows.map((row) => row.student_id)))}
                />
              </th>
              <th scope="col">Pupil</th>
              <th scope="col">Parent</th>
              <th scope="col" className="is-num">Owes</th>
              <th scope="col">Overdue</th>
              <th scope="col">Last paid</th>
              <th scope="col">Reminded</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const bucket = AGING.find((entry) => entry.key === agingOf(row.oldest_due, today)) ?? AGING[0];
              return (
                <tr key={row.student_id} className={picked.has(row.student_id) ? "is-picked" : ""}>
                  <td className="is-check">
                    <input type="checkbox" aria-label={`Select ${row.full_name}`} checked={picked.has(row.student_id)} onChange={() => toggle(row.student_id)} />
                  </td>
                  <td data-label="Pupil">
                    <Link className="acc-doc-link" href={`${ACCOUNTS_BASE}/students/${row.student_id}`}>{row.full_name}</Link>
                    <small>{row.class_code ?? "No class"}{row.stream ? ` ${row.stream}` : ""} · {row.student_number}</small>
                  </td>
                  <td data-label="Parent">
                    {row.family_id ? <Link href={`${ACCOUNTS_BASE}/families/${row.family_id}`}>{row.contact_name || row.mailing_name || "Family"}</Link> : <span className="app-muted">No family</span>}
                    <small>
                      {row.contact_phone ? <a href={`tel:${row.contact_phone.replace(/\s/g, "")}`}>{row.contact_phone}</a> : null}
                      {row.contact_phone && !row.contact_email ? " · " : null}
                      {!row.contact_email ? <span className="acc-warn-text">no email</span> : null}
                    </small>
                  </td>
                  <td data-label="Owes" className="is-num"><strong className="acc-owing">{amount(row.balance)}</strong>{row.terms_owing > 1 ? <small>{row.terms_owing} terms</small> : null}</td>
                  <td data-label="Overdue">
                    <span className={`acc-age is-${bucket.tone}`}>{row.oldest_due ? overdueText(row.oldest_due, today) : "No due date"}</span>
                  </td>
                  <td data-label="Last paid">{row.last_paid_on ? day(row.last_paid_on) : <span className="app-muted">Never</span>}</td>
                  <td data-label="Reminded">{row.last_reminded ? day(row.last_reminded) : <span className="app-muted">–</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Email ${families} famil${families === 1 ? "y" : "ies"}`}
        description="Each family gets one email listing every selected child and what they owe, with a link to the parent portal."
        wide
      >
        <form
          className="ofc-form is-compact"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => sendReminders([...picked], message), () => {
              setOpen(false);
              setPicked(new Set());
            });
          }}
        >
          {emailReady ? <p className="app-feedback is-error">{emailReady}</p> : null}
          <ul className="acc-preview-stats">
            <li><span>Pupils</span><strong>{picked.size}</strong></li>
            <li><span>Families</span><strong>{families}</strong></li>
            <li><span>Total owed</span><strong>{ugx(chosenTotal)}</strong></li>
          </ul>
          {noEmail ? (
            <p className="app-feedback is-warning">
              {noEmail} selected pupil{noEmail === 1 ? " has" : "s have"} no parent email on record and will be skipped. Call them instead.
            </p>
          ) : null}
          <label className="ofc-field">
            <span>Message</span>
            <textarea rows={5} maxLength={1200} value={message} onChange={(event) => setMessage(event.target.value)} />
          </label>
          <Feedback result={result} />
          <div className="acc-dialog-foot">
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="admin-btn" disabled={pending || Boolean(emailReady)}>
              <i className={`fa-solid fa-paper-plane${pending ? " fa-fade" : ""}`} aria-hidden="true" /> {pending ? "Sending…" : "Send reminders"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
