"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Feedback, useOfficeAction } from "@/components/accounts/client";
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
  const [clubId, setClubId] = useState("");
  const [termLabel, setTermLabel] = useState("");
  const [loadingClubs, setLoadingClubs] = useState(false);
  const [clubsError, setClubsError] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [saved, setSaved] = useState<(ActionResult & { clubTitle?: string; amount?: number }) | null>(null);
  const [formKey, setFormKey] = useState(0);
  const { result, setResult, pending, run } = useOfficeAction();

  const selected = clubs.find((row) => row.id === clubId) || null;
  const info = methodInfo(method);
  const amount = selected?.fee ?? 0;

  useEffect(() => {
    let live = true;
    setClubs([]);
    setClubId("");
    setClubsError("");
    setTermLabel("");
    if (!pupil?.student_id) return;
    setLoadingClubs(true);
    loadClubOptionsForPupil(pupil.student_id)
      .then((res) => {
        if (!live) return;
        if (res.error) setClubsError(res.error);
        setClubs(res.rows || []);
        setTermLabel(res.termLabel || "");
        if (res.rows?.length === 1) setClubId(res.rows[0].id);
      })
      .catch(() => live && setClubsError("Could not load clubs for this pupil."))
      .finally(() => live && setLoadingClubs(false));
    return () => {
      live = false;
    };
  }, [pupil?.student_id]);

  if (saved?.id) {
    const receiptHref = `${ACCOUNTS_BASE}/payments/club/${saved.id}`;
    return (
      <div className="acc-done">
        <span className="acc-done-icon"><i className="fa-solid fa-check" aria-hidden="true" /></span>
        <h2>{saved.ok}</h2>
        <p>
          {ugx(saved.amount || amount)} for {saved.clubTitle || selected?.title || "club"}
          {pupil ? ` · ${pupil.full_name}` : ""} by {info.label.toLowerCase()}.
        </p>
        <div className="acc-wizard-foot is-center">
          <Link className="admin-btn" href={receiptHref}>
            <i className="fa-solid fa-receipt" aria-hidden="true" /> Open receipt
          </Link>
          <button
            type="button"
            className="admin-btn admin-btn-ghost"
            onClick={() => {
              setSaved(null);
              setResult(null);
              setClubId("");
              if (!lockPupil) setPupil(null);
              setFormKey((n) => n + 1);
            }}
          >
            <i className="fa-solid fa-plus" aria-hidden="true" /> Record another
          </button>
          {onDone ? <button type="button" className="admin-btn admin-btn-ghost" onClick={onDone}>Close</button> : null}
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
        if (!clubId) {
          setResult({ error: "Choose the club that was paid." });
          return;
        }
        const data = new FormData(event.currentTarget);
        data.set("student_id", pupil.student_id);
        data.set("club_id", clubId);
        data.set("method", method);
        data.set("amount", String(amount));
        run(
          () => recordDeskClubPayment(data),
          (outcome) => setSaved({ ...outcome, clubTitle: selected?.title, amount }),
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
        {pupil ? (
          <p className="acc-hint">
            Only clubs the parent has consented to, and that are still unpaid for {termLabel || "this term"}, are listed below.
          </p>
        ) : null}
      </fieldset>

      {pupil ? (
        <fieldset className="ofc-fieldset">
          <legend>Club</legend>
          {loadingClubs ? (
            <ul className="acc-club-choices is-loading" aria-busy="true" aria-label="Loading clubs">
              <li><span /><span /><span /></li>
              <li><span /><span /><span /></li>
            </ul>
          ) : clubsError ? (
            <p className="acc-hint is-warn">{clubsError}</p>
          ) : clubs.length ? (
            <>
              <div className="acc-club-choices" role="radiogroup" aria-label="Club">
                {clubs.map((club) => {
                  const on = clubId === club.id;
                  const icon = CATEGORY_ICONS[club.category || ""] || "fa-puzzle-piece";
                  return (
                    <label key={club.id} className={`acc-club-choice${on ? " is-on" : ""}`}>
                      <input
                        type="radio"
                        name="club_choice"
                        value={club.id}
                        checked={on}
                        onChange={() => { setClubId(club.id); setResult(null); }}
                        required
                      />
                      <span className="acc-club-choice-mark" aria-hidden="true">
                        <i className={`fa-solid ${icon}`} />
                      </span>
                      <span className="acc-club-choice-copy">
                        <strong>{club.title}</strong>
                        <small>{club.category || "Club"}{termLabel ? ` · ${termLabel}` : ""}</small>
                      </span>
                      <strong className="acc-club-choice-fee">{ugx(club.fee)}</strong>
                    </label>
                  );
                })}
              </div>
              {selected ? (
                <div className="acc-club-summary">
                  <span>Amount due</span>
                  <strong>{ugx(selected.fee)}</strong>
                  <small>Fixed club fee for {termLabel || "the current term"}</small>
                </div>
              ) : (
                <p className="acc-hint">Select a club to see the fee.</p>
              )}
            </>
          ) : (
            <div className="acc-club-empty">
              <i className="fa-solid fa-puzzle-piece" aria-hidden="true" />
              <div>
                <strong>No unpaid consented clubs</strong>
                <p>
                  Parents consent in the portal. The club catalogue is managed on{" "}
                  <Link href={`${ACCOUNTS_BASE}/clubs`}>Clubs</Link>.
                </p>
              </div>
            </div>
          )}
        </fieldset>
      ) : null}

      <fieldset className="ofc-fieldset">
        <legend>Payment</legend>
        <div className="ofc-fields">
          <label className="ofc-field">
            <span>Term</span>
            <input value={termLabel || "Current term"} readOnly />
            <small className="acc-field-hint">Club fees are recorded against the current term.</small>
          </label>
          <label className="ofc-field">
            <span>Date paid</span>
            <input type="date" name="paid_on" defaultValue={kampalaToday()} max={kampalaToday()} required />
          </label>
          <div className="ofc-field is-wide">
            <span>Amount received</span>
            <div className="acc-amount-input is-locked" aria-live="polite">
              <em aria-hidden="true">UGX</em>
              <strong>{amount ? amount.toLocaleString("en-US") : "0"}</strong>
            </div>
            {selected ? (
              <span className="acc-quick-amounts">
                <button type="button" className="is-on" disabled>
                  Full club fee · {ugx(selected.fee)}
                </button>
              </span>
            ) : (
              <small className="acc-hint">The club fee is fixed. Choose a club above.</small>
            )}
          </div>
        </div>
      </fieldset>

      <fieldset className="ofc-fieldset">
        <legend>How it was paid</legend>
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
            <span>Paid by (optional)</span>
            <input name="payer_name" maxLength={120} placeholder={pupil?.mailing_name ?? "Name of the person who paid"} />
          </label>
          <label className="ofc-field is-wide">
            <span>Notes (optional)</span>
            <input name="notes" maxLength={500} placeholder="Anything the office should know" />
          </label>
        </div>
      </fieldset>

      <Feedback result={result} />
      <div className="ofc-form-foot">
        {onDone ? (
          <button type="button" className="admin-btn admin-btn-ghost" onClick={onDone}>
            Cancel
          </button>
        ) : null}
        <button
          className="admin-btn admin-btn-gold"
          type="submit"
          disabled={pending || !pupil || !selected || amount <= 0 || loadingClubs}
        >
          <i className={`fa-solid fa-receipt${pending ? " fa-fade" : ""}`} aria-hidden="true" />
          {pending
            ? "Saving…"
            : amount > 0
              ? `Save club receipt for ${ugx(amount)}`
              : "Save club receipt"}
        </button>
      </div>
    </form>
  );
}
