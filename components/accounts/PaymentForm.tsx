"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AmountInput, Dialog, Feedback, useOfficeAction } from "@/components/accounts/client";
import { StudentPicker } from "@/components/accounts/StudentPicker";
import { StudentFace } from "@/components/StudentFace";
import {
  loadFamilyPayment,
  previewFamilyAllocation,
  pupilTerms,
  recordFamilyPayment,
  recordPayment,
  type FamilyPaymentContext,
  type PaymentFamilyHit,
  type PupilHit,
  type PupilTerm,
} from "@/app/accounts/(desk)/payments/actions";
import type { FamilyPaySlice } from "@/lib/accounts-family-pay";
import { ACCOUNTS_BASE, PAYMENT_METHODS, kampalaToday, methodInfo, ugx, type PaymentMethod } from "@/lib/accounts-format";
import type { ActionResult } from "@/lib/office-forms";
import { searchWords } from "@/lib/students";

const REFERENCE_LABEL: Record<PaymentMethod, string> = {
  bank: "Bank slip or transaction number",
  mobile_money: "Mobile money transaction ID",
  schoolpay: "SchoolPay receipt number",
  cheque: "Cheque number",
  cash: "Reference (optional)",
  other: "Reference (optional)",
};

type Mode = "pupil" | "family";

/** A button that opens the payment form in a dialog, with the pupil already chosen. */
export function RecordPaymentButton({ terms, termId, pupil, className = "admin-hero-btn is-primary", label = "Record payment" }: {
  terms: { id: string; label: string }[];
  termId: string;
  pupil: PupilHit;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <i className="fa-solid fa-hand-holding-dollar" aria-hidden="true" /> {label}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Record a payment" description={`For ${pupil.full_name}. A numbered receipt is created when you save.`} wide>
        <PaymentForm terms={terms} termId={termId} pupil={pupil} lockPupil onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

/** Opens the family payment form for every child on the family account. */
export function RecordFamilyPaymentButton({ terms, termId, familyId, familyName, className = "admin-hero-btn is-primary", label = "Record family payment" }: {
  terms: { id: string; label: string }[];
  termId: string;
  familyId: string;
  familyName: string;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <i className="fa-solid fa-people-roof" aria-hidden="true" /> {label}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Record a family payment" description={`For ${familyName}. One amount is shared across the children and printed as a single receipt.`} wide>
        <PaymentForm terms={terms} termId={termId} familyId={familyId} mode="family" onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

export function PaymentForm({ terms, termId, pupil: initialPupil = null, familyId: initialFamilyId = "", lockPupil = false, mode: initialMode = "pupil", onDone }: {
  terms: { id: string; label: string }[];
  termId: string;
  pupil?: PupilHit | null;
  familyId?: string;
  lockPupil?: boolean;
  mode?: Mode;
  onDone?: () => void;
}) {
  const [mode, setMode] = useState<Mode>(initialMode === "family" || initialFamilyId ? "family" : "pupil");
  const [pupil, setPupil] = useState<PupilHit | null>(initialPupil);
  const [family, setFamily] = useState<PaymentFamilyHit | null>(null);
  const [familyContext, setFamilyContext] = useState<FamilyPaymentContext | null>(null);
  const [slices, setSlices] = useState<FamilyPaySlice[]>([]);
  const [term, setTerm] = useState(termId);
  const [balances, setBalances] = useState<PupilTerm[]>([]);
  const [value, setValue] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("bank");
  const [saved, setSaved] = useState<(ActionResult & { mode?: Mode }) | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [loadingFamily, setLoadingFamily] = useState(false);
  const { result, setResult, pending, run } = useOfficeAction();

  const studentId = pupil?.student_id;
  useEffect(() => {
    let live = true;
    setBalances([]);
    if (mode === "pupil" && studentId) pupilTerms(studentId).then((rows) => live && setBalances(rows)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [mode, studentId]);

  useEffect(() => {
    let live = true;
    const id = family?.id || initialFamilyId;
    if (mode !== "family" || !id) {
      setFamilyContext(null);
      setSlices([]);
      return;
    }
    setLoadingFamily(true);
    loadFamilyPayment(id, term)
      .then((result) => {
        if (!live) return;
        if (result.context) {
          setFamilyContext(result.context);
          setFamily((current) => current ?? {
            id: result.context!.family.id,
            code: result.context!.family.code,
            name: result.context!.family.name,
            area: result.context!.family.area,
            parents: [],
            phones: [],
            children: result.context!.children.map((child) => child.full_name),
            balance: result.context!.owing,
          });
        } else {
          setFamilyContext(null);
          setResult({ error: result.error ?? "Family not found." });
        }
      })
      .catch(() => live && setResult({ error: "Could not load the family." }))
      .finally(() => live && setLoadingFamily(false));
    return () => {
      live = false;
    };
  }, [mode, family?.id, initialFamilyId, term, setResult]);

  useEffect(() => {
    let live = true;
    if (mode !== "family" || !familyContext || value <= 0) {
      setSlices([]);
      return;
    }
    const timer = window.setTimeout(() => {
      previewFamilyAllocation(familyContext.family.id, value, term)
        .then((result) => {
          if (!live) return;
          setSlices(result.slices ?? []);
        })
        .catch(() => undefined);
    }, 120);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [mode, familyContext, value, term]);

  const owing = (id: string) => balances.find((row) => row.term_id === id)?.balance ?? 0;
  const termBalance = owing(term);
  const label = (id: string) => terms.find((entry) => entry.id === id)?.label ?? "another term";
  const older = balances.filter((row) => row.term_id !== term && row.balance > 0);
  const info = methodInfo(method);
  const familyOwing = familyContext?.owing ?? 0;
  const receiptHref = saved?.id
    ? saved.mode === "family"
      ? `${ACCOUNTS_BASE}/payments/batch/${saved.id}/receipt`
      : `${ACCOUNTS_BASE}/payments/${saved.id}/receipt`
    : "";
  const openHref = saved?.id
    ? saved.mode === "family"
      ? `${ACCOUNTS_BASE}/payments/batch/${saved.id}`
      : `${ACCOUNTS_BASE}/payments/${saved.id}`
    : "";

  if (saved?.id) {
    return (
      <div className="acc-done">
        <span className="acc-done-icon"><i className="fa-solid fa-check" aria-hidden="true" /></span>
        <h2>{saved.ok}</h2>
        <p>
          {ugx(value)}
          {saved.mode === "family"
            ? ` from ${familyContext?.family.name || family?.name || "the family"}, shared across ${slices.length || "the"} ${slices.length === 1 ? "child" : "children"}`
            : ` from ${pupil?.full_name}`}
          {" "}by {info.label.toLowerCase()}.
        </p>
        {saved.warning ? <p className="app-feedback is-warning">{saved.warning}</p> : null}
        <div className="acc-wizard-foot is-center">
          <a className="admin-btn" href={receiptHref} target="_blank" rel="noreferrer">
            <i className="fa-solid fa-print" aria-hidden="true" /> Print receipt
          </a>
          <Link className="admin-btn admin-btn-ghost" href={openHref}>Open payment</Link>
          <button
            type="button"
            className="admin-btn admin-btn-ghost"
            onClick={() => {
              setSaved(null);
              setResult(null);
              setValue(0);
              setSlices([]);
              if (!lockPupil && mode === "pupil") setPupil(null);
              if (mode === "family" && !initialFamilyId) {
                setFamily(null);
                setFamilyContext(null);
              }
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
      className="ofc-form acc-pay-form"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        data.set("term_id", term);
        data.set("method", method);
        data.set("amount", String(value));
        if (mode === "family") {
          if (!familyContext) {
            setResult({ error: "Choose the family this payment is for." });
            return;
          }
          data.set("family_id", familyContext.family.id);
          if (slices.length) {
            data.set("allocations", JSON.stringify(slices.map((slice) => ({
              studentId: slice.studentId,
              termId: slice.termId,
              amount: slice.amount,
            }))));
          }
          run(() => recordFamilyPayment(data), (outcome) => setSaved({ ...outcome, mode: "family" }));
          return;
        }
        if (!pupil) {
          setResult({ error: "Choose the pupil this payment is for." });
          return;
        }
        data.set("student_id", pupil.student_id);
        run(() => recordPayment(data), (outcome) => setSaved({ ...outcome, mode: "pupil" }));
      }}
    >
      {!lockPupil ? (
        <div className="acc-pay-mode" role="tablist" aria-label="Who is paying for">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "pupil"}
            className={mode === "pupil" ? "is-on" : ""}
            onClick={() => { setMode("pupil"); setResult(null); }}
          >
            <span className="acc-pay-mode-icon" aria-hidden="true"><i className="fa-solid fa-user" /></span>
            <span className="acc-pay-mode-copy">
              <strong>One pupil</strong>
              <small>Single fee account</small>
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "family"}
            className={mode === "family" ? "is-on" : ""}
            onClick={() => { setMode("family"); setResult(null); }}
          >
            <span className="acc-pay-mode-icon" aria-hidden="true"><i className="fa-solid fa-people-roof" /></span>
            <span className="acc-pay-mode-copy">
              <strong>Whole family</strong>
              <small>Share across siblings</small>
            </span>
          </button>
        </div>
      ) : null}

      {mode === "family" ? (
        <fieldset className="ofc-fieldset acc-family-block">
          <legend>Family</legend>
          {initialFamilyId && familyContext ? (
            <div className="acc-picked">
              <span className="acc-picked-avatar is-family" aria-hidden="true"><i className="fa-solid fa-people-roof" /></span>
              <div>
                <strong>{familyContext.family.name}</strong>
                <small>
                  {familyContext.family.code}
                  {familyContext.family.area ? ` · ${familyContext.family.area}` : ""}
                  {" · "}
                  {familyContext.children.length} {familyContext.children.length === 1 ? "child" : "children"}
                </small>
              </div>
              <span className={`acc-picked-balance${familyOwing > 0 ? " is-owing" : familyOwing < 0 ? " is-credit" : ""}`}>
                {familyOwing > 0 ? <>Owes {ugx(familyOwing)}</> : familyOwing < 0 ? <>Credit {ugx(-familyOwing)}</> : "Cleared"}
              </span>
            </div>
          ) : (
            <PaymentFamilyPicker value={family} onChange={(next) => { setFamily(next); setResult(null); }} autoFocus={!family} />
          )}
          {loadingFamily ? (
            <ul className="acc-family-kids is-loading" aria-busy="true" aria-label="Loading children">
              <li><span /><span /><span /></li>
              <li><span /><span /><span /></li>
            </ul>
          ) : null}
          {familyContext ? (
            <ul className="acc-family-kids" aria-label="Children on this family">
              {familyContext.children.map((child) => (
                <li key={child.student_id} className={child.balance > 0 ? "is-owing" : child.balance < 0 ? "is-credit" : "is-clear"}>
                  <StudentFace id={child.student_id} name={child.full_name} className="acc-family-face" />
                  <span className="acc-family-kid-copy">
                    <strong>{child.full_name}</strong>
                    <small>
                      {child.student_number} · {child.class_code ?? "No class"}
                      {child.stream ? ` ${child.stream}` : ""}
                      {child.status !== "active" ? ` · ${child.status}` : ""}
                    </small>
                  </span>
                  <strong className={`acc-family-kid-bal${child.balance > 0 ? " is-owing" : child.balance < 0 ? " is-credit" : ""}`}>
                    {child.balance > 0 ? ugx(child.balance) : child.balance < 0 ? `${ugx(-child.balance)} credit` : "Clear"}
                  </strong>
                </li>
              ))}
            </ul>
          ) : null}
        </fieldset>
      ) : (
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
            <StudentPicker value={pupil} onChange={setPupil} autoFocus={!pupil} />
          )}
          {pupil?.family_id && !lockPupil ? (
            <p className="acc-hint">
              This pupil is on a family account.{" "}
              <button
                type="button"
                className="acc-text-btn"
                onClick={() => {
                  setMode("family");
                  setFamily({
                    id: pupil.family_id!,
                    code: pupil.family_code || "",
                    name: pupil.mailing_name || pupil.family_code || "Family",
                    area: null,
                    parents: [],
                    phones: [],
                    children: [pupil.full_name],
                    balance: pupil.balance,
                  });
                }}
              >
                Pay for the whole family instead
              </button>
            </p>
          ) : null}
        </fieldset>
      )}

      <fieldset className="ofc-fieldset">
        <legend>Payment</legend>
        <div className="ofc-fields">
          {mode === "pupil" ? (
            <label className="ofc-field">
              <span>Term</span>
              <select value={term} onChange={(event) => setTerm(event.target.value)} required>
                {terms.map((entry) => {
                  const due = owing(entry.id);
                  return (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}{pupil && due > 0 ? ` (owes ${ugx(due)})` : pupil && due < 0 ? " (in credit)" : ""}
                    </option>
                  );
                })}
              </select>
            </label>
          ) : (
            <label className="ofc-field">
              <span>Prefer term</span>
              <select value={term} onChange={(event) => setTerm(event.target.value)}>
                {terms.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.label}</option>
                ))}
              </select>
              <small className="acc-field-hint">Older balances are cleared first. Leftover credit lands on this term.</small>
            </label>
          )}
          <label className="ofc-field">
            <span>Date paid</span>
            <input type="date" name="paid_on" defaultValue={kampalaToday()} max={kampalaToday()} required />
          </label>
          <div className="ofc-field is-wide">
            <span>Amount received</span>
            <AmountInput name="amount_display" value={value} onValue={setValue} required />
            {mode === "pupil" && pupil && termBalance > 0 ? (
              <span className="acc-quick-amounts">
                <button type="button" className={value === termBalance ? "is-on" : ""} onClick={() => setValue(termBalance)}>
                  Full term balance · {ugx(termBalance)}
                </button>
                {termBalance >= 200_000 ? (
                  <button type="button" className={value === Math.round(termBalance / 2) ? "is-on" : ""} onClick={() => setValue(Math.round(termBalance / 2))}>
                    Half · {ugx(Math.round(termBalance / 2))}
                  </button>
                ) : null}
              </span>
            ) : null}
            {mode === "family" && familyContext && familyOwing > 0 ? (
              <span className="acc-quick-amounts is-family">
                <button type="button" className={value === familyOwing ? "is-on" : ""} onClick={() => setValue(familyOwing)}>
                  <i className="fa-solid fa-scale-balanced" aria-hidden="true" />
                  Clear family balance
                  <em>{ugx(familyOwing)}</em>
                </button>
                {familyOwing >= 200_000 ? (
                  <button type="button" className={value === Math.round(familyOwing / 2) ? "is-on" : ""} onClick={() => setValue(Math.round(familyOwing / 2))}>
                    Half
                    <em>{ugx(Math.round(familyOwing / 2))}</em>
                  </button>
                ) : null}
              </span>
            ) : null}
            {mode === "pupil" && pupil && value > 0 && termBalance > 0 && value > termBalance ? (
              <small className="acc-hint is-warn">{ugx(value - termBalance)} more than the term balance. The extra will show as credit.</small>
            ) : null}
            {mode === "pupil" && pupil && older.length ? (
              <small className="acc-hint">
                Also owes {older.map((row) => `${ugx(row.balance)} for ${label(row.term_id)}`).join(", ")}.{" "}
                <button type="button" className="acc-text-btn" onClick={() => setTerm(older[0].term_id)}>Put it towards {label(older[0].term_id)}</button>
              </small>
            ) : null}
          </div>
        </div>

        {mode === "family" && slices.length ? (
          <div className="acc-alloc">
            <div className="acc-alloc-head">
              <strong>How it will be shared</strong>
              <small>Older balances first, then the largest current balances.</small>
            </div>
            <ul>
              {slices.map((slice) => (
                <li key={`${slice.studentId}-${slice.termId}-${slice.credit ? "c" : "o"}`} className={slice.credit ? "is-credit" : ""}>
                  <StudentFace id={slice.studentId} name={slice.studentName} className="acc-family-face" />
                  <span className="acc-family-kid-copy">
                    <strong>{slice.studentName}</strong>
                    <small>{slice.classCode ? `${slice.classCode} · ` : ""}{slice.termLabel}{slice.credit ? " · credit" : ""}</small>
                  </span>
                  <strong className="acc-family-kid-bal">{ugx(slice.amount)}</strong>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {mode === "family" && familyContext && value > 0 && !slices.length && !loadingFamily ? (
          <p className="acc-hint is-warn">Enter an amount to see how it will be shared across the children.</p>
        ) : null}
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
            <input
              name="payer_name"
              maxLength={120}
              placeholder={mode === "family"
                ? (familyContext?.family.name ?? family?.name ?? "Name of the person who paid")
                : (pupil?.mailing_name ?? "Name of the person who paid")}
            />
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
          disabled={pending || value <= 0 || (mode === "pupil" ? !pupil : !familyContext) || (mode === "family" && loadingFamily)}
        >
          <i className={`fa-solid fa-receipt${pending ? " fa-fade" : ""}`} aria-hidden="true" />
          {pending
            ? "Saving…"
            : value > 0
              ? mode === "family"
                ? `Save family receipt for ${ugx(value)}`
                : `Save receipt for ${ugx(value)}`
              : "Save receipt"}
        </button>
      </div>
    </form>
  );
}

function Highlight({ text, words }: { text: string; words: string[] }) {
  if (!words.length || !text) return <>{text}</>;
  const lower = text.toLowerCase();
  const marks = new Array<boolean>(text.length).fill(false);
  for (const word of words) {
    if (!word) continue;
    let at = lower.indexOf(word);
    while (at !== -1) {
      for (let i = at; i < at + word.length && i < text.length; i += 1) marks[i] = true;
      at = lower.indexOf(word, at + word.length);
    }
  }
  const parts: { text: string; on: boolean }[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const last = parts[parts.length - 1];
    if (last && last.on === marks[i]) last.text += text[i];
    else parts.push({ text: text[i], on: marks[i] });
  }
  return <>{parts.map((part, index) => (part.on ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>))}</>;
}

function PaymentFamilyPicker({ value, onChange, autoFocus = false }: {
  value: PaymentFamilyHit | null;
  onChange: (family: PaymentFamilyHit | null) => void;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PaymentFamilyHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const words = useMemo(() => searchWords(query), [query]);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setItems([]);
      setLoading(false);
      setSearched(false);
      setError("");
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `${ACCOUNTS_BASE}/payments/search?kind=family&q=${encodeURIComponent(text)}`,
          { signal: controller.signal, headers: { Accept: "application/json" } },
        );
        const result = (await response.json()) as { error?: string; items?: PaymentFamilyHit[] };
        if (controller.signal.aborted) return;
        setItems(result.items ?? []);
        setError(result.error ?? "");
        setActive(0);
        setSearched(true);
        setOpen(true);
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setError("Search failed. Check your connection.");
        setItems([]);
        setSearched(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 140);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

  if (value) {
    return (
      <div className="acc-picked">
        <span className="acc-picked-avatar is-family" aria-hidden="true"><i className="fa-solid fa-people-roof" /></span>
        <div>
          <strong>{value.name}</strong>
          <small>
            {value.code}{value.area ? ` · ${value.area}` : ""}
            {value.children.length ? ` · ${value.children.join(", ")}` : ""}
          </small>
        </div>
        <span className={`acc-picked-balance${value.balance > 0 ? " is-owing" : value.balance < 0 ? " is-credit" : ""}`}>
          {value.balance > 0 ? <>Owes {ugx(value.balance)}</> : value.balance < 0 ? <>Credit {ugx(-value.balance)}</> : "Cleared"}
        </span>
        <button
          type="button"
          className="acc-row-btn"
          onClick={() => {
            onChange(null);
            setQuery("");
            window.setTimeout(() => input.current?.focus(), 0);
          }}
        >
          Change
        </button>
      </div>
    );
  }

  const pick = (item: PaymentFamilyHit) => {
    onChange(item);
    setOpen(false);
  };
  const showList = open && query.trim().length >= 2;

  return (
    <div ref={root} className={`acc-picker${loading ? " is-loading" : ""}${showList ? " is-open" : ""}`}>
      <label className="ofc-finder-search acc-picker-box">
        <i className={`fa-solid ${loading ? "fa-spinner fa-spin" : "fa-magnifying-glass"}`} aria-hidden="true" />
        <span className="visually-hidden">Find a family</span>
        <input
          ref={input}
          type="search"
          value={query}
          autoFocus={autoFocus}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActive((n) => Math.min(Math.max(items.length - 1, 0), n + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((n) => Math.max(n - 1, 0));
            } else if (event.key === "Enter" && open && items[active]) {
              event.preventDefault();
              pick(items[active]);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Family code, parent, phone or a child's name"
          autoComplete="off"
          aria-controls={listId}
          aria-expanded={showList}
          aria-autocomplete="list"
          aria-activedescendant={showList && items[active] ? `${listId}-${active}` : undefined}
          role="combobox"
        />
        {query ? (
          <button
            type="button"
            className="acc-picker-clear"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setItems([]);
              setSearched(false);
              input.current?.focus();
            }}
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        ) : null}
      </label>
      {showList ? (
        <ul id={listId} className={`acc-picker-list${loading && items.length ? " is-stale" : ""}`} role="listbox" aria-label="Matching families">
          {items.map((item, index) => (
            <li
              key={item.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={index === active ? "is-active" : ""}
              onMouseDown={(event) => {
                event.preventDefault();
                pick(item);
              }}
              onMouseEnter={() => setActive(index)}
            >
              <span className="acc-picked-avatar is-family" aria-hidden="true"><i className="fa-solid fa-people-roof" /></span>
              <span className="acc-picker-copy">
                <strong><Highlight text={item.name} words={words} /></strong>
                <small>
                  <span className="acc-picker-num"><Highlight text={item.code} words={words} /></span>
                  {item.parents.length ? ` · ${item.parents.slice(0, 2).join(" & ")}` : ""}
                  {item.children.length ? ` · ${item.children.length} ${item.children.length === 1 ? "child" : "children"}` : ""}
                </small>
                {item.children.length ? (
                  <small className="acc-picker-kids">{item.children.slice(0, 3).join(" · ")}{item.children.length > 3 ? "…" : ""}</small>
                ) : null}
              </span>
              <em className={item.balance > 0 ? "is-owing" : item.balance < 0 ? "is-credit" : ""}>
                {item.balance > 0 ? ugx(item.balance) : item.balance < 0 ? "In credit" : "Cleared"}
              </em>
            </li>
          ))}
          {loading && !items.length ? (
            <li className="acc-picker-empty is-loading" aria-hidden="true">
              <span /><span /><span />
            </li>
          ) : null}
          {!loading && searched && !items.length ? (
            <li className="acc-picker-empty">
              <i className="fa-regular fa-face-meh" aria-hidden="true" />
              {error || `No family matches “${query.trim()}”.`}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
