"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { Dialog, Feedback, useOfficeAction } from "@/components/accounts/client";
import { sendReminders } from "@/app/accounts/(desk)/debtors/actions";
import { StudentFace } from "@/components/StudentFace";
import { initials } from "@/lib/applications";
import { ACCOUNTS_BASE, AGING, agingOf, amount, day, overdueText, ugx } from "@/lib/accounts-format";
import { className as classLabel, displayPhone, telHref } from "@/lib/students";

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

export type FamilyDebtorRow = {
  family_id: string;
  family_code: string | null;
  mailing_name: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  children: number;
  balance: number;
  oldest_due: string | null;
  last_paid_on: string | null;
};

const DEFAULT_MESSAGE =
  "This is a friendly reminder that school fees are outstanding for your child or children listed below. Please clear the balance, or contact the accounts office to agree a payment plan. Thank you for your support.";

function AgePill({ oldest, today }: { oldest: string | null; today: string }) {
  const bucket = AGING.find((entry) => entry.key === agingOf(oldest, today)) ?? AGING[0];
  return <span className={`acc-age is-${bucket.tone}`}>{oldest ? overdueText(oldest, today) : "No due date"}</span>;
}

function Balance({ value, note }: { value: number; note?: string }) {
  return (
    <span className="acc-debt-figure" title={ugx(value)}>
      <span className="acc-debt-balance">
        <span className="acc-debt-ccy">UGX</span>
        <strong className="acc-money is-owing">{amount(value)}</strong>
      </span>
      {note ? <span className="acc-debt-sub">{note}</span> : null}
    </span>
  );
}

function openRow(event: MouseEvent, href: string, push: (href: string) => void) {
  if ((event.target as HTMLElement).closest("a, button, input, label, textarea")) return;
  push(href);
}

export function FamilyDebtorsTable({ rows, today }: { rows: FamilyDebtorRow[]; today: string }) {
  const router = useRouter();
  return (
    <div className="ofc-table-scroll">
      <table className="app-table ofc-table ofc-reg-table acc-debt-table is-family">
        <thead>
          <tr>
            <th scope="col">Family</th>
            <th scope="col" className="ofc-col-parents">Contact</th>
            <th scope="col" className="acc-col-children">Children</th>
            <th scope="col" className="is-money">Balance</th>
            <th scope="col">Overdue</th>
            <th scope="col" className="acc-col-paid">Last paid</th>
            <th scope="col" className="ofc-col-go"><span className="visually-hidden">Open</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const name = row.mailing_name || `Family ${row.family_code ?? ""}`.trim();
            const href = `${ACCOUNTS_BASE}/families/${row.family_id}`;
            return (
              <tr key={row.family_id} onClick={(event) => openRow(event, href, router.push)}>
                <td>
                  <div className="ofc-who">
                    <span className="ofc-who-avatar" aria-hidden="true">{initials(name)}</span>
                    <div>
                      <Link href={href} className="ofc-who-name">{name}</Link>
                      <span className="ofc-who-meta">
                        {row.family_code ? <span className="ofc-num">{row.family_code}</span> : null}
                        <span>{row.children} child{row.children === 1 ? "" : "ren"}</span>
                      </span>
                    </div>
                  </div>
                </td>
                <td className="ofc-col-parents" data-label="Contact">
                  <Contact
                    href={href}
                    name={row.contact_name || row.mailing_name}
                    phone={row.contact_phone}
                    email={row.contact_email}
                  />
                </td>
                <td className="acc-col-children" data-label="Children"><span className="acc-debt-count">{row.children}</span></td>
                <td className="is-money" data-label="Balance"><Balance value={row.balance} /></td>
                <td data-label="Overdue"><AgePill oldest={row.oldest_due} today={today} /></td>
                <td className="acc-col-paid" data-label="Last paid">{row.last_paid_on ? day(row.last_paid_on) : <span className="app-muted">Never</span>}</td>
                <td className="ofc-col-go" aria-hidden="true"><i className="fa-solid fa-chevron-right" /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Contact({ href, name, phone, email }: { href: string; name: string | null; phone: string | null; email: string | null }) {
  if (!name && !phone && !email) return <span className="app-muted">No contact on file</span>;
  return (
    <dl className="ofc-reg-contacts">
      <div>
        <dt>Parent</dt>
        <dd>
          {name ? <Link href={href} className="acc-debt-parent">{name}</Link> : <span className="app-muted">Name not recorded</span>}
          {phone ? (
            <a href={telHref(phone)}>
              <i className="fa-solid fa-phone" aria-hidden="true" /> {displayPhone(phone)}
            </a>
          ) : null}
          {email ? (
            <a className="acc-debt-mail" href={`mailto:${email}`}>
              <i className="fa-regular fa-envelope" aria-hidden="true" /> {email}
            </a>
          ) : (
            <span className="ofc-row-flag is-warn">No email</span>
          )}
        </dd>
      </div>
    </dl>
  );
}

export function DebtorsTable({ rows, today, emailReady }: { rows: DebtorRow[]; today: string; emailReady: string | null }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const { result, setResult, pending, run } = useOfficeAction();
  const ids = useMemo(() => rows.map((row) => row.student_id), [rows]);

  useEffect(() => {
    setPicked((current) => new Set([...current].filter((id) => ids.includes(id))));
  }, [ids]);

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
    <div className="app-table-wrap">
      {picked.size ? (
        <div className="app-bulk ofc-bulk acc-debt-bulk" role="region" aria-label="Remind selected families" aria-live="polite">
          <strong>{picked.size} selected</strong>
          <span>{ugx(chosenTotal)} · {families} famil{families === 1 ? "y" : "ies"}</span>
          <button type="button" className="admin-btn admin-btn-gold" onClick={() => { setResult(null); setOpen(true); }}>
            <i className="fa-regular fa-envelope" aria-hidden="true" /> Email reminders
          </button>
          <button type="button" className="app-link-btn app-bulk-close" onClick={() => setPicked(new Set())} aria-label="Clear selection">
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <Feedback result={open ? null : result} />

      <div className="ofc-table-scroll">
        <table className={`app-table ofc-table ofc-reg-table acc-debt-table${pending ? " is-busy" : ""}`}>
          <thead>
            <tr>
              <th scope="col" className="app-col-check">
                <input
                  type="checkbox"
                  aria-label="Select every pupil on this page"
                  checked={allOn}
                  onChange={() => setPicked(allOn ? new Set() : new Set(ids))}
                />
              </th>
              <th scope="col">Pupil</th>
              <th scope="col" className="ofc-col-parents">Family</th>
              <th scope="col" className="is-money">Balance</th>
              <th scope="col">Overdue</th>
              <th scope="col" className="acc-col-paid">Last paid</th>
              <th scope="col" className="acc-col-reminded">Reminded</th>
              <th scope="col" className="ofc-col-go"><span className="visually-hidden">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const href = `${ACCOUNTS_BASE}/students/${row.student_id}`;
              const on = picked.has(row.student_id);
              return (
                <tr key={row.student_id} className={on ? "is-selected" : ""} onClick={(event) => openRow(event, href, router.push)}>
                  <td className="app-col-check">
                    <input type="checkbox" aria-label={`Select ${row.full_name}`} checked={on} onChange={() => toggle(row.student_id)} />
                  </td>
                  <td>
                    <div className="ofc-who">
                      <StudentFace id={row.student_id} name={row.full_name} className="ofc-who-avatar" />
                      <div>
                        <Link href={href} className="ofc-who-name">{row.full_name}</Link>
                        <span className="ofc-who-meta">
                          <span className="ofc-num">{row.student_number}</span>
                          <span>
                            {row.class_code ? classLabel(row.class_code) : "No class"}
                            {row.stream ? ` · ${row.stream}` : ""}
                          </span>
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="ofc-col-parents" data-label="Family">
                    {row.family_id ? (
                      <Contact
                        href={`${ACCOUNTS_BASE}/families/${row.family_id}`}
                        name={row.contact_name || row.mailing_name}
                        phone={row.contact_phone}
                        email={row.contact_email}
                      />
                    ) : <span className="app-muted">No family on file</span>}
                  </td>
                  <td className="is-money" data-label="Balance">
                    <Balance value={row.balance} note={row.terms_owing > 1 ? `${row.terms_owing} terms` : undefined} />
                  </td>
                  <td data-label="Overdue"><AgePill oldest={row.oldest_due} today={today} /></td>
                  <td className="acc-col-paid" data-label="Last paid">{row.last_paid_on ? day(row.last_paid_on) : <span className="app-muted">Never</span>}</td>
                  <td className="acc-col-reminded" data-label="Reminded">{row.last_reminded ? day(row.last_reminded) : <span className="app-muted">Not yet</span>}</td>
                  <td className="ofc-col-go" aria-hidden="true"><i className="fa-solid fa-chevron-right" /></td>
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
    </div>
  );
}
