"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AmountInput, Feedback, useOfficeAction } from "@/components/accounts/client";
import { saveExpense } from "@/app/accounts/(desk)/expenses/actions";
import { ACCOUNTS_BASE, PAYMENT_METHODS, kampalaToday, ugx, type Expense, type ExpenseCategory } from "@/lib/accounts-format";

export function ExpenseForm({ categories, campuses, expense }: { categories: ExpenseCategory[]; campuses: string[]; expense?: Expense | null }) {
  const router = useRouter();
  const active = categories.filter((category) => category.active || category.id === expense?.category_id);
  const [categoryId, setCategoryId] = useState(expense?.category_id ?? "");
  const [value, setValue] = useState(expense?.amount ?? 0);
  const [fileName, setFileName] = useState("");
  const { result, pending, run } = useOfficeAction();
  const category = active.find((entry) => entry.id === categoryId);

  return (
    <form
      className="ofc-form acc-expense-form"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        data.set("category_id", categoryId);
        data.set("amount", String(value));
        if (expense) data.set("id", expense.id);
        run(() => saveExpense(data), (outcome) => {
          if (outcome.id) router.push(`${ACCOUNTS_BASE}/expenses/${outcome.id}`);
        });
      }}
    >
      <fieldset className="ofc-fieldset">
        <legend>Category</legend>
        <div className="acc-category-pick" role="radiogroup" aria-label="Category">
          {active.map((entry) => (
            <label key={entry.id} className={categoryId === entry.id ? "is-on" : ""}>
              <input type="radio" name="category_choice" checked={categoryId === entry.id} onChange={() => setCategoryId(entry.id)} />
              <i className={`fa-solid ${entry.icon}`} aria-hidden="true" />
              <span>{entry.name}</span>
            </label>
          ))}
        </div>
        {category?.monthly_budget ? <small className="acc-hint">Monthly budget for {category.name}: {ugx(category.monthly_budget)}</small> : null}
      </fieldset>

      <fieldset className="ofc-fieldset">
        <legend>Details</legend>
        <div className="ofc-fields">
          <label className="ofc-field">
            <span>Paid to</span>
            <input name="payee" required maxLength={120} defaultValue={expense?.payee ?? ""} placeholder="Supplier or person" autoFocus={!expense} />
          </label>
          <div className="ofc-field">
            <span>Amount</span>
            <AmountInput name="amount_display" value={value} onValue={setValue} required />
          </div>
          <label className="ofc-field">
            <span>Date</span>
            <input type="date" name="spent_on" defaultValue={expense?.spent_on ?? kampalaToday()} max={kampalaToday()} required />
          </label>
          {campuses.length ? (
            <label className="ofc-field">
              <span>Campus</span>
              <select name="campus" defaultValue={expense?.campus ?? ""}>
                <option value="">Whole school</option>
                {campuses.map((campus) => <option key={campus} value={campus}>{campus}</option>)}
              </select>
            </label>
          ) : null}
          <label className="ofc-field is-wide">
            <span>What it&apos;s for</span>
            <textarea name="description" required rows={3} maxLength={600} defaultValue={expense?.description ?? ""} placeholder="For example: 20 reams of printing paper for exams" />
          </label>
        </div>
      </fieldset>

      <fieldset className="ofc-fieldset">
        <legend>Payment and receipt</legend>
        <div className="ofc-fields">
          <label className="ofc-field">
            <span>How it will be paid (optional)</span>
            <select name="method" defaultValue={expense?.method ?? ""}>
              <option value="">Decide later</option>
              {PAYMENT_METHODS.filter((method) => method.value !== "schoolpay").map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
            </select>
          </label>
          <label className="ofc-field">
            <span>Invoice or reference (optional)</span>
            <input name="reference" maxLength={80} defaultValue={expense?.reference ?? ""} placeholder="Supplier invoice number" />
          </label>
          <label className={`ofc-field is-wide acc-file${fileName ? " has-file" : ""}`}>
            <span>Receipt or quotation (optional)</span>
            <span className="acc-file-box">
              <i className={`fa-solid ${fileName ? "fa-file-circle-check" : "fa-cloud-arrow-up"}`} aria-hidden="true" />
              <span>{fileName || (expense?.receipt_path ? "Replace the attached file" : "Choose a PDF or photo, up to 5 MB")}</span>
              <input
                type="file"
                name="receipt"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
              />
            </span>
          </label>
        </div>
      </fieldset>

      <Feedback result={result} />
      <div className="ofc-form-foot">
        <button type="button" className="admin-btn admin-btn-ghost" onClick={() => router.back()}>Cancel</button>
        <button className="admin-btn admin-btn-gold" type="submit" disabled={pending || !categoryId || value <= 0}>
          <i className={`fa-solid fa-paper-plane${pending ? " fa-fade" : ""}`} aria-hidden="true" /> {pending ? "Saving…" : expense ? "Save changes" : "Send for approval"}
        </button>
      </div>
    </form>
  );
}
