"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AmountInput, Feedback, useOfficeAction } from "@/components/accounts/client";
import { DateField } from "@/components/ui/DateField";
import { saveClubExpense } from "@/app/clubs/(desk)/expenses/actions";
import { kampalaToday, PAYMENT_METHODS, ugxShort, type Term } from "@/lib/accounts-format";
import type { ClubExpense, ClubExpenseCategory } from "@/lib/club-accounts";
import { CLUBS_BASE } from "@/lib/clubs-nav";

type ClubOption = { id: string; title: string };

function Field({
  label,
  hint,
  wide,
  required,
  children,
}: {
  label: string;
  hint?: string;
  wide?: boolean;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`clubs-exp-field${wide ? " is-wide" : ""}`}>
      <span className="clubs-exp-field-label">
        <b>
          {label}
          {required ? <i className="enr-req" aria-hidden="true">*</i> : null}
        </b>
        {hint ? <em>{hint}</em> : null}
      </span>
      {children}
    </label>
  );
}

function SelectShell({ children }: { children: React.ReactNode }) {
  return <span className="clubs-select">{children}</span>;
}

function Section({
  step,
  title,
  sub,
  children,
}: {
  step: string;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <section className="clubs-exp-section">
      <header className="clubs-exp-section-head">
        <span className="clubs-exp-step" aria-hidden="true">
          {step}
        </span>
        <div>
          <h3>{title}</h3>
          <p>{sub}</p>
        </div>
      </header>
      <div className="clubs-exp-section-body">{children}</div>
    </section>
  );
}

export function ClubExpenseForm({
  categories,
  clubs,
  terms,
  currentTermId,
  expense,
  defaultClubId,
  cancelHref,
  onDoneHref,
}: {
  categories: ClubExpenseCategory[];
  clubs: ClubOption[];
  terms: Term[];
  currentTermId?: string | null;
  expense?: ClubExpense | null;
  defaultClubId?: string | null;
  cancelHref: string;
  onDoneHref?: string;
}) {
  const router = useRouter();
  const active = useMemo(
    () => categories.filter((row) => row.active || row.id === expense?.category_id),
    [categories, expense?.category_id],
  );
  const [categoryId, setCategoryId] = useState(expense?.category_id ?? "");
  const [clubId, setClubId] = useState(expense?.club_id ?? defaultClubId ?? "");
  const [termId, setTermId] = useState(expense?.term_id ?? currentTermId ?? "");
  const [value, setValue] = useState(expense?.amount ?? 0);
  const [payee, setPayee] = useState(expense?.payee ?? "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [spentOn, setSpentOn] = useState(expense?.spent_on ?? kampalaToday());
  const [method, setMethod] = useState(expense?.method ?? "");
  const [reference, setReference] = useState(expense?.reference ?? "");
  const [notes, setNotes] = useState(expense?.notes ?? "");
  const { result, pending, run } = useOfficeAction();
  const category = active.find((row) => row.id === categoryId);
  const club = clubs.find((row) => row.id === clubId);
  const term = terms.find((row) => row.id === termId);

  const ready = Boolean(categoryId && clubId && termId && payee.trim() && description.trim() && value > 0 && spentOn);

  return (
    <form
      className="clubs-exp-form"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        data.set("amount", String(value));
        if (expense?.id) data.set("id", expense.id);
        run(() => saveClubExpense(data), () => {
          router.push(onDoneHref || cancelHref);
          router.refresh();
        });
      }}
    >
      <header className="clubs-exp-form-head">
        <div className="clubs-exp-form-intro">
          <span className="clubs-exp-kicker">{expense ? "Edit expense" : "New expense"}</span>
          <h2>{expense ? expense.ref_no : "Register club expense"}</h2>
          <p>Capture spending from club funds with a clean audit trail.</p>
        </div>
        <div className="clubs-exp-amount-card" aria-live="polite">
          <span>Amount</span>
          <strong>
            <small>UGX</small>
            {value ? ugxShort(value) : "0"}
          </strong>
          <small>{category ? category.name : "Choose a category"}</small>
        </div>
      </header>

      <div className="clubs-exp-layout">
        <Section step="01" title="Category" sub="What kind of spend is this?">
          <div className="clubs-exp-cats" role="radiogroup" aria-label="Expense category">
            {active.length ? (
              active.map((row) => (
                <label key={row.id} className={`clubs-exp-cat${categoryId === row.id ? " is-on" : ""}`}>
                  <input
                    type="radio"
                    name="category_id"
                    value={row.id}
                    checked={categoryId === row.id}
                    onChange={() => setCategoryId(row.id)}
                    required
                  />
                  <span className="clubs-exp-cat-icon" aria-hidden="true">
                    <i className={`fa-solid ${row.icon}`} />
                  </span>
                  <span>{row.name}</span>
                </label>
              ))
            ) : (
              <p className="clubs-detail-empty">
                No categories yet. Add them under <Link href={`${CLUBS_BASE}/settings`}>Settings</Link>.
              </p>
            )}
          </div>
        </Section>

        <Section step="02" title="Details" sub="Club, term, payee, and what was bought.">
          <div className="clubs-exp-grid">
            <Field label="Club" required>
              <SelectShell>
                <select name="club_id" value={clubId} onChange={(event) => setClubId(event.target.value)} required>
                  <option value="">Choose a club</option>
                  {clubs.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.title}
                    </option>
                  ))}
                </select>
              </SelectShell>
            </Field>

            <Field label="Term" required>
              <SelectShell>
                <select name="term_id" value={termId} onChange={(event) => setTermId(event.target.value)} required>
                  <option value="">Choose a term</option>
                  {terms.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                      {entry.is_current ? " · current" : ""}
                    </option>
                  ))}
                </select>
              </SelectShell>
            </Field>

            <Field label="Amount" required>
              <AmountInput name="amount_display" value={value} onValue={setValue} required />
            </Field>

            <Field label="Spent on" required>
              <DateField name="spent_on" value={spentOn} onChange={(event) => setSpentOn(event.target.value)} required />
            </Field>

            <Field label="Payee" required hint="Supplier or person paid" wide>
              <input name="payee" value={payee} onChange={(event) => setPayee(event.target.value)} maxLength={120} required placeholder="Who received the money?" />
            </Field>

            <Field label="Description" required wide hint="What the money was for">
              <textarea
                name="description"
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={600}
                required
                placeholder="Brief note for the ledger"
              />
            </Field>
          </div>
        </Section>

        <Section step="03" title="Payment" sub="Optional method and reference for your records.">
          <div className="clubs-exp-grid">
            <Field label="Method">
              <SelectShell>
                <select name="method" value={method} onChange={(event) => setMethod(event.target.value)}>
                  <option value="">Not set</option>
                  {PAYMENT_METHODS.map((row) => (
                    <option key={row.value} value={row.value}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </SelectShell>
            </Field>

            <Field label="Reference" hint="Slip, cheque, or phone">
              <input name="reference" value={reference} onChange={(event) => setReference(event.target.value)} maxLength={80} placeholder="Optional" />
            </Field>

            <Field label="Notes" wide hint="Anything else to remember">
              <textarea name="notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={400} placeholder="Optional" />
            </Field>
          </div>
        </Section>
      </div>

      <div className="clubs-exp-summary" aria-live="polite">
        <div>
          <span>Filing</span>
          <strong>{category?.name || "Category"}</strong>
        </div>
        <div>
          <span>Club</span>
          <strong>{club?.title || "—"}</strong>
        </div>
        <div>
          <span>Term</span>
          <strong>{term?.label || "—"}</strong>
        </div>
        <div>
          <span>Total</span>
          <strong>{value ? ugxShort(value) : "UGX 0"}</strong>
        </div>
      </div>

      <Feedback result={result} />

      <div className="clubs-exp-foot">
        <Link className="clubs-acc-btn" href={cancelHref}>
          Cancel
        </Link>
        <button type="submit" className="clubs-acc-btn is-primary" disabled={pending || !ready}>
          <i className={`fa-solid ${pending ? "fa-circle-notch fa-spin" : "fa-check"}`} aria-hidden="true" />
          {pending ? "Saving…" : expense ? "Save changes" : "Register expense"}
        </button>
      </div>
    </form>
  );
}

export function ClubExpenseAddPanel({
  open,
  ...props
}: {
  open: boolean;
} & React.ComponentProps<typeof ClubExpenseForm>) {
  if (!open) return null;
  return (
    <section className="clubs-exp-panel" aria-label="Register club expense">
      <ClubExpenseForm {...props} />
    </section>
  );
}
