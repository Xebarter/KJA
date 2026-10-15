"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AmountInput, Dialog, Feedback, useOfficeAction } from "@/components/accounts/client";
import { createExtraInvoice } from "@/app/accounts/(desk)/invoices/actions";
import { addAccountNote, addStudentDiscount } from "@/app/accounts/(desk)/students/actions";
import { ACCOUNTS_BASE, discountText, ugx, type DiscountRule } from "@/lib/accounts-format";

type TermOption = { id: string; label: string };

/** Gives the pupil a bursary or another discount on tuition. */
export function DiscountButton({ studentId, rules, terms, className = "acc-row-btn" }: { studentId: string; rules: DiscountRule[]; terms: TermOption[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const usable = rules.filter((rule) => rule.kind === "bursary" || rule.kind === "other");
  const [ruleId, setRuleId] = useState(usable[0]?.id ?? "");
  const rule = usable.find((entry) => entry.id === ruleId);
  const [method, setMethod] = useState<"percent" | "fixed">(rule?.method ?? "percent");
  const { result, setResult, pending, run } = useOfficeAction();
  return (
    <>
      <button type="button" className={className} onClick={() => { setResult(null); setOpen(true); }}>
        <i className="fa-solid fa-plus" aria-hidden="true" /> Add discount
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add a discount" description="Comes off tuition when term invoices are generated. Invoices already issued don't change.">
        <form
          className="ofc-form is-compact"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            data.set("method", method);
            run(() => addStudentDiscount(studentId, data), () => setOpen(false));
          }}
        >
          <div className="ofc-fields">
            <label className="ofc-field is-wide">
              <span>Type</span>
              <select
                name="rule_id"
                value={ruleId}
                onChange={(event) => {
                  setRuleId(event.target.value);
                  const next = usable.find((entry) => entry.id === event.target.value);
                  if (next) setMethod(next.method);
                }}
              >
                {usable.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} ({discountText(entry.method, entry.value)})</option>)}
                <option value="">Something else</option>
              </select>
            </label>
            {!rule ? (
              <label className="ofc-field is-wide">
                <span>Name</span>
                <input name="label" required maxLength={80} placeholder="For example: Sports scholarship" />
              </label>
            ) : null}
            <div className="ofc-field is-wide">
              <span>Discount</span>
              <div className="acc-inline">
                <div className="ofc-segmented">
                  <label>
                    <input type="radio" name="method_pick" checked={method === "percent"} onChange={() => setMethod("percent")} />
                    <span>Percentage</span>
                  </label>
                  <label>
                    <input type="radio" name="method_pick" checked={method === "fixed"} onChange={() => setMethod("fixed")} />
                    <span>Fixed amount</span>
                  </label>
                </div>
                <input
                  key={`${ruleId}-${method}`}
                  name="value"
                  inputMode="decimal"
                  className="acc-short-input"
                  defaultValue={rule && rule.method === method ? String(rule.value) : ""}
                  placeholder={method === "percent" ? "25" : "500000"}
                  required
                />
                <em>{method === "percent" ? "% of tuition" : "UGX off tuition"}</em>
              </div>
            </div>
            <label className="ofc-field">
              <span>Applies to</span>
              <select name="term_id" defaultValue="">
                <option value="">Every term until removed</option>
                {terms.map((term) => <option key={term.id} value={term.id}>{term.label} only</option>)}
              </select>
            </label>
            <label className="ofc-field">
              <span>Note (optional)</span>
              <input name="note" maxLength={300} placeholder="Approved by the head teacher" />
            </label>
          </div>
          <Feedback result={result} />
          <div className="acc-dialog-foot">
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="admin-btn" disabled={pending}>{pending ? "Saving…" : "Add discount"}</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

/** Bills the pupil for something outside the term fees: uniform, a trip, a lost book. */
export function ExtraInvoiceButton({ studentId, terms, termId, className = "admin-hero-btn" }: {
  studentId: string;
  terms: TermOption[];
  termId: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState([{ key: 0, value: 0 }]);
  const next = useRef(1);
  const { result, setResult, pending, run } = useOfficeAction();
  const total = lines.reduce((sum, line) => sum + line.value, 0);
  return (
    <>
      <button type="button" className={className} onClick={() => { setResult(null); setOpen(true); }}>
        <i className="fa-solid fa-file-circle-plus" aria-hidden="true" /> Bill extra charges
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Bill extra charges" description="Issues a separate invoice for things outside the term fees, such as uniform or a school trip." wide>
        <form
          className="ofc-form is-compact"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            data.set("student_id", studentId);
            run(() => createExtraInvoice(data), (outcome) => {
              setOpen(false);
              if (outcome.id) router.push(`${ACCOUNTS_BASE}/invoices/${outcome.id}`);
            });
          }}
        >
          <div className="ofc-fields">
            <label className="ofc-field">
              <span>Term</span>
              <select name="term_id" defaultValue={termId} required>
                {terms.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}
              </select>
            </label>
            <label className="ofc-field">
              <span>Due date (optional)</span>
              <input type="date" name="due_on" />
            </label>
          </div>
          <div className="acc-extra-lines">
            {lines.map((line, index) => (
              <div key={line.key} className="acc-extra-line">
                <label className="ofc-field">
                  <span className={index ? "visually-hidden" : ""}>Item</span>
                  <input name={`line_${index}_description`} maxLength={120} required={index === 0} placeholder={index === 0 ? "For example: Sweater (size 8)" : "Another item"} />
                </label>
                <label className="ofc-field">
                  <span className={index ? "visually-hidden" : ""}>Amount</span>
                  <AmountInput
                    name={`line_${index}_amount`}
                    required={index === 0}
                    onValue={(value) => setLines((rows) => rows.map((row) => (row.key === line.key ? { ...row, value } : row)))}
                  />
                </label>
                {lines.length > 1 ? (
                  <button type="button" className="acc-row-btn is-danger" aria-label="Remove line" onClick={() => setLines((rows) => rows.filter((row) => row.key !== line.key))}>
                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            ))}
            {lines.length < 8 ? (
              <button type="button" className="acc-text-btn" onClick={() => setLines((rows) => [...rows, { key: next.current++, value: 0 }])}>
                <i className="fa-solid fa-plus" aria-hidden="true" /> Add another item
              </button>
            ) : null}
          </div>
          <label className="ofc-field">
            <span>Note on the invoice (optional)</span>
            <input name="notes" maxLength={300} placeholder="For example: P5 trip to Entebbe Zoo" />
          </label>
          <Feedback result={result} />
          <div className="acc-dialog-foot">
            <strong className="acc-dialog-total">Total {ugx(total)}</strong>
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="admin-btn" disabled={pending || total <= 0}>{pending ? "Issuing…" : "Issue invoice"}</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function AccountNoteForm({ studentId }: { studentId: string }) {
  const form = useRef<HTMLFormElement>(null);
  const { result, pending, run } = useOfficeAction();
  return (
    <form
      ref={form}
      className="acc-note-form"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        run(() => addAccountNote(studentId, data), () => form.current?.reset());
      }}
    >
      <label className="visually-hidden" htmlFor={`note-${studentId}`}>Add a note</label>
      <textarea id={`note-${studentId}`} name="body" rows={2} maxLength={1000} placeholder="Add a note, e.g. payment plan agreed with the mother" required />
      <button type="submit" className="admin-btn admin-btn-ghost" disabled={pending}>{pending ? "Saving…" : "Add note"}</button>
      <Feedback result={result} />
    </form>
  );
}
