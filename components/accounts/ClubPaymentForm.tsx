"use client";

import { DateField } from "@/components/ui/DateField";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Feedback, useOfficeAction, useScrollTopWhen } from "@/components/accounts/client";
import { StudentPicker } from "@/components/accounts/StudentPicker";
import {
  loadClubOptionsForPupil,
  recordDeskClubPayment,
  type ClubPayOption,
  type PupilHit,
} from "@/app/accounts/(desk)/payments/actions";
import { ACCOUNTS_BASE, PAYMENT_METHODS, kampalaToday, methodInfo, ugx, type PaymentMethod } from "@/lib/accounts-format";
import type { ActionResult } from "@/lib/office-forms";

const REFERENCE_LABEL: Record<PaymentMethod, string> = {
  bank: "Bank slip or transaction number",
  mobile_money: "Mobile money transaction ID",
  schoolpay: "SchoolPay receipt number",
  cheque: "Cheque number",
  cash: "Reference (optional)",
  other: "Reference (optional)",
};

const CATEGORY_ICONS: Record<string, string> = {
  "Games and Sports": "fa-futbol",
  "Art and Entertainment": "fa-palette",
  "Science and Technology": "fa-flask",
  "Travel and Adventure": "fa-compass",
  "Information and Language": "fa-language",
  Religion: "fa-book-open",
};

type SavedClubPayment = ActionResult & {
  amount?: number;
  clubTitles?: string[];
};

export function ClubPaymentForm({
  pupil: initialPupil = null,
  lockPupil = false,
  onDone,
}: {
  pupil?: PupilHit | null;
  lockPupil?: boolean;
  onDone?: () => void;
}) {
  const [pupil, setPupil] = useState<PupilHit | null>(initialPupil);
  const [clubs, setClubs] = useState<ClubPayOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [termLabel, setTermLabel] = useState("");
  const [loadingClubs, setLoadingClubs] = useState(false);
  const [clubsError, setClubsError] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [saved, setSaved] = useState<SavedClubPayment | null>(null);
  const [formKey, setFormKey] = useState(0);
  const { result, setResult, pending, run } = useOfficeAction();
  useScrollTopWhen(Boolean(saved?.id));

  const openClubs = clubs.filter((row) => !row.paid);
  const paidClubs = clubs.filter((row) => row.paid);
  const selected = openClubs.filter((row) => selectedIds.includes(row.id));
  const info = methodInfo(method);
  const amount = selected.reduce((sum, row) => sum + row.fee, 0);
  const needsConsent = selected.some((row) => row.needsConsent);
  const ctaLabel = needsConsent ? "Consent and pay" : "Record payment";

  useEffect(() => {
    let live = true;
    setClubs([]);
    setSelectedIds([]);
    setClubsError("");
    setTermLabel("");
    if (!pupil?.student_id) return;
    setLoadingClubs(true);
    loadClubOptionsForPupil(pupil.student_id)
      .then((res) => {
        if (!live) return;
        if (res.error) setClubsError(res.error);
        const rows = res.rows || [];
        setClubs(rows);
        setTermLabel(res.termLabel || "");
        const payable = rows.filter((row) => !row.paid);
        if (payable.length === 1) setSelectedIds([payable[0].id]);
      })
      .catch(() => live && setClubsError("Could not load clubs for this pupil."))
      .finally(() => live && setLoadingClubs(false));
    return () => {
      live = false;
    };
  }, [pupil?.student_id]);

  function toggleClub(id: string) {
    const club = clubs.find((row) => row.id === id);
    if (!club || club.paid) return;
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
    setResult(null);
  }

  if (saved?.id) {
    const receiptIds = saved.ids?.length ? saved.ids : saved.id ? [saved.id] : [];
    const titles = saved.clubTitles || selected.map((row) => row.title);
    return (
      <div className="acc-done">
        <span className="acc-done-icon"><i className="fa-solid fa-check" aria-hidden="true" /></span>
        <p className="acc-done-kicker">Payment complete</p>
        <h2>{receiptIds.length > 1 ? "Receipts saved" : "Receipt saved"}</h2>
        <p className="acc-done-meta">
          {ugx(saved.amount || amount)}
          {pupil ? ` · ${pupil.full_name}` : ""} · {info.label}
        </p>
        <ul className="acc-done-receipts">
          {receiptIds.map((id, index) => {
            const title = titles[index] || `Club ${index + 1}`;
            const printHref = `${ACCOUNTS_BASE}/payments/club/${id}/receipt`;
            const detailHref = `${ACCOUNTS_BASE}/payments/club/${id}`;
            return (
              <li key={id}>
                <div>
                  <strong>{title}</strong>
                  <small>CLB receipt</small>
                </div>
                <div className="acc-done-receipt-actions">
                  <a className="acc-done-btn is-primary" href={printHref} target="_blank" rel="noreferrer">
                    <i className="fa-solid fa-print" aria-hidden="true" /> Print
                  </a>
                  <Link className="acc-done-btn is-secondary" href={detailHref}>
                    <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> Details
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="acc-wizard-foot is-center">
          {receiptIds.length === 1 ? (
            <a className="acc-done-btn is-primary" href={`${ACCOUNTS_BASE}/payments/club/${receiptIds[0]}/receipt`} target="_blank" rel="noreferrer">
              <i className="fa-solid fa-print" aria-hidden="true" /> Print receipt
            </a>
          ) : null}
          <button
            type="button"
            className="acc-done-btn is-quiet"
            onClick={() => {
              setSaved(null);
              setResult(null);
              setSelectedIds([]);
              if (!lockPupil) setPupil(null);
              setFormKey((n) => n + 1);
            }}
          >
            <i className="fa-solid fa-plus" aria-hidden="true" /> Record another
          </button>
          {onDone ? <button type="button" className="acc-done-btn is-quiet" onClick={onDone}>Close</button> : null}
        </div>
      </div>
    );
  }

  return (
    <form
      key={formKey}
      className="ofc-form acc-pay-form is-club"
      onSubmit={(event) => {
        event.preventDefault();
        if (!pupil) {
          setResult({ error: "Choose the pupil this club payment is for." });
          return;
        }
        if (!selectedIds.length) {
          setResult({ error: "Choose at least one club to pay." });
          return;
        }
        const data = new FormData(event.currentTarget);
        data.set("student_id", pupil.student_id);
        data.delete("club_id");
        for (const id of selectedIds) data.append("club_id", id);
        data.set("method", method);
        data.set("amount", String(amount));
        run(
          () => recordDeskClubPayment(data),
          (outcome) => {
            const paid = outcome as SavedClubPayment;
            setSaved({
              ...paid,
              amount: paid.amount ?? amount,
              clubTitles: paid.clubTitles ?? selected.map((row) => row.title),
            });
          },
        );
      }}
    >
      <fieldset className="ofc-fieldset">
        <legend>Pupil</legend>
        {lockPupil && pupil ? (
          <div className="acc-picked">
            <div>
              <strong>{pupil.full_name}</strong>
              <small>{pupil.student_number} · {pupil.class_code ?? "No class"}</small>
            </div>
          </div>
        ) : (
          <StudentPicker
            value={pupil}
            onChange={(next) => {
              setPupil(next);
              setResult(null);
            }}
            autoFocus={!pupil}
            debounceMs={50}
          />
        )}
      </fieldset>

      {pupil ? (
        <fieldset className="ofc-fieldset">
          <legend>
            Clubs
            {termLabel ? <span className="acc-club-legend-meta">{termLabel}</span> : null}
          </legend>
          {loadingClubs ? (
            <ul className="acc-club-choices is-loading" aria-busy="true" aria-label="Loading clubs">
              <li><span /><span /><span /></li>
              <li><span /><span /><span /></li>
              <li><span /><span /><span /></li>
            </ul>
          ) : clubsError ? (
            <p className="acc-hint is-warn">{clubsError}</p>
          ) : clubs.length ? (
            <>
              <p className="acc-club-lead">
                {openClubs.length
                  ? "Select unpaid clubs. Desk can consent and collect in one step when needed."
                  : "All fitting clubs are already paid for this term."}
              </p>
              <div className="acc-club-choices" role="group" aria-label="Clubs">
                {openClubs.length ? (
                  <div className="acc-club-group" role="group" aria-label="Open to collect">
                    {openClubs.map((club) => {
                      const on = selectedIds.includes(club.id);
                      const icon = CATEGORY_ICONS[club.category || ""] || "fa-puzzle-piece";
                      return (
                        <label key={club.id} className={`acc-club-choice${on ? " is-on" : ""}${club.needsConsent ? " needs-consent" : ""}`}>
                          <input
                            type="checkbox"
                            name="club_choice"
                            value={club.id}
                            checked={on}
                            onChange={() => toggleClub(club.id)}
                          />
                          <span className="acc-club-choice-mark" aria-hidden="true">
                            <i className={`fa-solid ${on ? "fa-check" : icon}`} />
                          </span>
                          <span className="acc-club-choice-copy">
                            <span className="acc-club-choice-title">
                              <strong>{club.title}</strong>
                              <em className={`acc-club-badge${club.needsConsent ? " is-consent" : ""}`}>
                                {club.needsConsent ? "Consent and pay" : "Pay"}
                              </em>
                            </span>
                            <small>{club.category || "Club"}</small>
                          </span>
                          <strong className="acc-club-choice-fee">{ugx(club.fee)}</strong>
                        </label>
                      );
                    })}
                  </div>
                ) : null}

                {paidClubs.length ? (
                  <div className="acc-club-group is-paid" role="group" aria-label="Already paid">
                    <p className="acc-club-group-label">
                      <i className="fa-solid fa-circle-check" aria-hidden="true" />
                      Paid this term
                      <span>{paidClubs.length}</span>
                    </p>
                    {paidClubs.map((club) => {
                      const detailHref = club.paymentId ? `${ACCOUNTS_BASE}/payments/club/${club.paymentId}` : null;
                      return (
                        <div key={club.id} className="acc-club-choice is-paid">
                          <span className="acc-club-choice-mark" aria-hidden="true">
                            <i className="fa-solid fa-check" />
                          </span>
                          <span className="acc-club-choice-copy">
                            <span className="acc-club-choice-title">
                              <strong>{club.title}</strong>
                              <em className="acc-club-badge is-paid">Paid</em>
                            </span>
                            <small>
                              {club.category || "Club"}
                              {club.receiptNo ? ` · ${club.receiptNo}` : ""}
                            </small>
                          </span>
                          <span className="acc-club-choice-side">
                            <strong className="acc-club-choice-fee">{ugx(club.fee)}</strong>
                            {detailHref ? (
                              <Link className="acc-club-receipt-link" href={detailHref}>
                                Receipt
                              </Link>
                            ) : null}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              {openClubs.length ? (
                <div className={`acc-club-summary${selected.length ? " is-ready" : ""}`} aria-live="polite">
                  <span>{selected.length ? `${selected.length} selected` : "Total"}</span>
                  <strong>{ugx(amount)}</strong>
                  {selected.length && needsConsent ? (
                    <small>Missing consents will be recorded with this payment.</small>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <div className="acc-club-empty">
              <i className="fa-solid fa-puzzle-piece" aria-hidden="true" />
              <div>
                <strong>No clubs for this pupil</strong>
                <p>
                  Eligible guide clubs appear here when they fit the class. Manage the catalogue on{" "}
                  <Link href="/clubs">Clubs</Link>.
                </p>
              </div>
            </div>
          )}
        </fieldset>
      ) : null}

      <fieldset className="ofc-fieldset">
        <legend>Settlement</legend>
        <div className="ofc-fields acc-club-settle">
          <label className="ofc-field">
            <span>Date paid</span>
            <DateField name="paid_on" defaultValue={kampalaToday()} max={kampalaToday()} required />
          </label>
          <label className="ofc-field">
            <span>Term</span>
            <input value={termLabel || "Current term"} readOnly />
          </label>
        </div>
        <div className="ofc-segmented acc-methods" role="radiogroup" aria-label="Payment method">
          {PAYMENT_METHODS.map((entry) => (
            <label key={entry.value}>
              <input type="radio" name="method_choice" checked={method === entry.value} onChange={() => setMethod(entry.value)} />
              <span><i className={`fa-solid ${entry.icon}`} aria-hidden="true" /> {entry.label}</span>
            </label>
          ))}
        </div>
        <div className="ofc-fields">
          <label className="ofc-field">
            <span>{REFERENCE_LABEL[method]}</span>
            <input name="reference" maxLength={80} required={info.needsReference} autoComplete="off" placeholder={info.needsReference ? "Required" : ""} />
          </label>
          <label className="ofc-field">
            <span>Paid by</span>
            <input name="payer_name" maxLength={120} placeholder={pupil?.mailing_name ?? "Optional"} />
          </label>
          <label className="ofc-field is-wide">
            <span>Notes</span>
            <input name="notes" maxLength={500} placeholder="Optional" />
          </label>
        </div>
      </fieldset>

      <Feedback result={result} />
      <div className="ofc-form-foot acc-club-foot">
        {selected.length ? (
          <div className="acc-club-foot-total" aria-hidden="true">
            <span>{selected.length} club{selected.length === 1 ? "" : "s"}</span>
            <strong>{ugx(amount)}</strong>
          </div>
        ) : (
          <span />
        )}
        <div className="acc-club-foot-actions">
          {onDone ? (
            <button type="button" className="admin-btn admin-btn-ghost" onClick={onDone}>
              Cancel
            </button>
          ) : null}
          <button
            className="admin-btn admin-btn-gold"
            type="submit"
            disabled={pending || !pupil || !selected.length || amount <= 0 || loadingClubs}
          >
            <i className={`fa-solid ${needsConsent ? "fa-file-signature" : "fa-receipt"}${pending ? " fa-fade" : ""}`} aria-hidden="true" />
            {pending
              ? needsConsent
                ? "Saving…"
                : "Saving…"
              : amount > 0
                ? `${ctaLabel} · ${ugx(amount)}`
                : ctaLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
