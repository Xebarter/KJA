"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AmountInput, Feedback, useOfficeAction } from "@/components/accounts/client";
import { saveExpense } from "@/app/accounts/(desk)/expenses/actions";
import { ACCOUNTS_BASE, PAYMENT_METHODS, day, kampalaToday, methodInfo, ugx, ugxShort, type Expense, type ExpenseCategory } from "@/lib/accounts-format";

type Status = "done" | "todo" | "optional";

const SECTIONS = [
  { id: "expense-category", title: "Category" },
  { id: "expense-details", title: "The expense" },
  { id: "expense-payment", title: "Payment and receipt" },
];

function Field({ label, hint, wide, required, children }: { label: string; hint?: string; wide?: boolean; required?: boolean; children: React.ReactNode }) {
  return (
    <label className={`ofc-field${wide ? " is-wide" : ""}`}>
      <span>
        <b>{label}{required ? <i className="enr-req" aria-hidden="true">*</i> : null}</b>
        {hint ? <em>{hint}</em> : null}
      </span>
      {children}
    </label>
  );
}

function Section({ id, n, title, sub, status, children }: { id: string; n: number; title: string; sub: string; status: Status; children: React.ReactNode }) {
  return (
    <section className={`ofc-fieldset enr-section is-${status}`} id={id} aria-labelledby={`${id}-title`}>
      <header className="enr-head">
        <span className="enr-step" aria-hidden="true">{status === "done" ? <i className="fa-solid fa-check" /> : n}</span>
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          <p>{sub}</p>
        </div>
        <span className={`enr-status is-${status}`}>{status === "done" ? "Complete" : status === "todo" ? "Required" : "Optional"}</span>
      </header>
      {children}
    </section>
  );
}

export function ExpenseForm({ categories, campuses, expense, spentBy }: {
  categories: ExpenseCategory[];
  campuses: string[];
  expense?: Expense | null;
  spentBy: Record<string, number>;
}) {
  const router = useRouter();
  const active = categories.filter((category) => category.active || category.id === expense?.category_id);
  const [categoryId, setCategoryId] = useState(expense?.category_id ?? "");
  const [value, setValue] = useState(expense?.amount ?? 0);
  const [payee, setPayee] = useState(expense?.payee ?? "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [spentOn, setSpentOn] = useState(expense?.spent_on ?? kampalaToday());
  const [campus, setCampus] = useState(expense?.campus ?? "");
  const [method, setMethod] = useState(expense?.method ?? "");
  const [reference, setReference] = useState(expense?.reference ?? "");
  const [fileName, setFileName] = useState("");
  const [activeStep, setActiveStep] = useState(SECTIONS[0].id);
  const { result, pending, run } = useOfficeAction();
  const category = active.find((entry) => entry.id === categoryId);
  const backHref = expense ? `${ACCOUNTS_BASE}/expenses/${expense.id}` : `${ACCOUNTS_BASE}/expenses`;

  const categoryDone = Boolean(categoryId);
  const detailsDone = Boolean(payee.trim() && description.trim() && value > 0 && spentOn);
  const paymentStarted = Boolean(method || reference.trim() || fileName || expense?.receipt_path);
  const status: Record<string, Status> = {
    "expense-category": categoryDone ? "done" : "todo",
    "expense-details": detailsDone ? "done" : "todo",
    "expense-payment": paymentStarted ? "done" : "optional",
  };
  const doneCount = Number(categoryDone) + Number(detailsDone);
  const used = category ? spentBy[category.id] ?? 0 : 0;
  const budget = category?.monthly_budget ?? 0;
  const projected = used + value;

  useEffect(() => {
    const targets = SECTIONS.map((section) => document.getElementById(section.id)).filter(Boolean) as HTMLElement[];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveStep(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -55% 0px" },
    );
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  const goTo = (id: string) => {
    setActiveStep(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const form = (
    <form
      className="ofc-form enr-form acc-expense-form"
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
      <Section id="expense-category" n={1} title="Category" sub="Where this spending belongs. The monthly budget, if there is one, is a guide." status={status["expense-category"]}>
        <div className="acc-exp-cats" role="radiogroup" aria-label="Category">
          {active.map((entry) => {
            const cap = entry.monthly_budget ?? 0;
            const soFar = spentBy[entry.id] ?? 0;
            return (
              <label key={entry.id} className={!cap ? "" : soFar > cap ? "is-over" : soFar > cap * 0.85 ? "is-near" : ""}>
                <input type="radio" name="category_choice" checked={categoryId === entry.id} required onChange={() => setCategoryId(entry.id)} />
                <span>
                  <span className="acc-exp-mark is-sm" aria-hidden="true"><i className={`fa-solid ${entry.icon}`} /></span>
                  <strong>{entry.name}</strong>
                  <small>{cap ? `${ugxShort(soFar)} of ${ugxShort(cap)}` : "No monthly cap"}</small>
                </span>
              </label>
            );
          })}
        </div>
        {category && budget > 0 ? (
          projected > budget ? (
            <p className="enr-warn"><i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> This takes {category.name} to {ugx(projected)}, {ugx(projected - budget)} over the {ugx(budget)} budget.</p>
          ) : (
            <p className="acc-exp-budget-note"><i className="fa-solid fa-scale-balanced" aria-hidden="true" /> {ugx(used)} of {ugx(budget)} used this month{value > 0 ? `. ${ugx(budget - projected)} would remain.` : "."}</p>
          )
        ) : null}
      </Section>

      <Section id="expense-details" n={2} title="The expense" sub="Who it is for, how much, and what the money buys." status={status["expense-details"]}>
        <div className="ofc-fields enr-cols-2">
          <Field label="Paid to" required wide>
            <input name="payee" required maxLength={120} value={payee} onChange={(event) => setPayee(event.target.value)} placeholder="Supplier or person" autoFocus={!expense} />
          </Field>
          <Field label="Amount" required>
            <AmountInput name="amount_display" value={value} onValue={setValue} required />
          </Field>
          <Field label="Date" required>
            <input type="date" name="spent_on" value={spentOn} max={kampalaToday()} required onChange={(event) => setSpentOn(event.target.value)} />
          </Field>
          <Field label="What it's for" required wide>
            <textarea name="description" required rows={3} maxLength={600} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="For example: 20 reams of printing paper for exams" />
          </Field>
        </div>
        {campuses.length ? (
          <div className="ofc-field enr-gap-top">
            <span><b>Campus</b><em>{campuses.length > 1 ? "Leave blank for the whole school" : "Optional"}</em></span>
            <div className="enr-chips" role="radiogroup" aria-label="Campus">
              <label>
                <input type="radio" name="campus" value="" checked={campus === ""} onChange={() => setCampus("")} />
                <span>Whole school</span>
              </label>
              {campuses.map((entry) => (
                <label key={entry}>
                  <input type="radio" name="campus" value={entry} checked={campus === entry} onChange={() => setCampus(entry)} />
                  <span>{entry}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </Section>

      <Section id="expense-payment" n={3} title="Payment and receipt" sub="You can leave this until the request is approved and the money goes out." status={status["expense-payment"]}>
        <div className="ofc-field">
          <span><b>How it will be paid</b><em>Optional</em></span>
          <div className="enr-chips" role="radiogroup" aria-label="How it will be paid">
            <label>
              <input type="radio" name="method" value="" checked={method === ""} onChange={() => setMethod("")} />
              <span>Decide later</span>
            </label>
            {PAYMENT_METHODS.filter((entry) => entry.value !== "schoolpay").map((entry) => (
              <label key={entry.value}>
                <input type="radio" name="method" value={entry.value} checked={method === entry.value} onChange={() => setMethod(entry.value)} />
                <span><i className={`fa-solid ${entry.icon}`} aria-hidden="true" /> {entry.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="ofc-fields enr-gap-top">
          <Field label="Invoice or reference" hint="Optional">
            <input name="reference" maxLength={80} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Supplier invoice number" />
          </Field>
          <label className={`ofc-field is-wide acc-file${fileName ? " has-file" : ""}`}>
            <span><b>Receipt or quotation</b><em>Optional, PDF or photo, up to 5 MB</em></span>
            <span className="acc-file-box">
              <i className={`fa-solid ${fileName ? "fa-file-circle-check" : "fa-cloud-arrow-up"}`} aria-hidden="true" />
              <span>{fileName || (expense?.receipt_path ? "Replace the attached file" : "Choose a file")}</span>
              <input
                type="file"
                name="receipt"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
              />
            </span>
          </label>
        </div>
      </Section>

      <Feedback result={result} />
      <footer className="ofc-form-foot enr-foot">
        <div className="enr-progress">
          <span className="enr-progress-bar" aria-hidden="true"><span style={{ width: `${doneCount * 50}%` }} /></span>
          <span>{doneCount === 2 ? (expense ? "Ready to save" : "Ready to send") : `${doneCount} of 2 required steps done`}</span>
        </div>
        <div>
          <Link className="admin-btn admin-btn-ghost" href={backHref}>Cancel</Link>
          <button className="admin-btn admin-btn-gold" type="submit" disabled={pending}>
            <i className={`fa-solid ${pending ? "fa-spinner fa-spin" : "fa-paper-plane"}`} aria-hidden="true" /> {pending ? "Saving…" : expense ? "Save changes" : "Send for approval"}
          </button>
        </div>
      </footer>
    </form>
  );

  return (
    <div className="enr-layout">
      <div className="enr-main">{form}</div>
      <aside className="enr-side" aria-label="Expense summary">
        <div className="enr-card acc-exp-preview">
          <div className="enr-card-top">
            <span className="enr-avatar" aria-hidden="true"><i className={`fa-solid ${category?.icon ?? "fa-receipt"}`} /></span>
            <div>
              <strong className={payee.trim() ? "" : "is-empty"}>{payee.trim() || "New expense"}</strong>
              <small>{fileName ? fileName : expense?.receipt_path ? "Receipt attached" : "No receipt yet"}</small>
            </div>
          </div>
          <dl className="enr-facts">
            <div>
              <dt>Amount</dt>
              <dd className={value > 0 ? "is-money" : ""}>{value > 0 ? ugx(value) : <span>Not entered</span>}</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{category?.name ?? <span>Not chosen</span>}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{spentOn ? day(spentOn) : <span>No date</span>}</dd>
            </div>
            <div>
              <dt>Campus</dt>
              <dd>{campus || <span>Whole school</span>}</dd>
            </div>
            <div>
              <dt>Payment</dt>
              <dd>{method ? methodInfo(method).label : <span>Decide later</span>}</dd>
            </div>
          </dl>
        </div>
        <nav className="enr-steps" aria-label="Form sections">
          {SECTIONS.map((section, index) => {
            const state = status[section.id];
            return (
              <a
                key={section.id}
                href={`#${section.id}`}
                className={`is-${state}${activeStep === section.id ? " is-active" : ""}`}
                aria-current={activeStep === section.id ? "step" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  goTo(section.id);
                }}
              >
                <span className="enr-step-dot" aria-hidden="true">{state === "done" ? <i className="fa-solid fa-check" /> : index + 1}</span>
                <span>
                  <strong>{section.title}</strong>
                  <small>{state === "done" ? "Complete" : state === "todo" ? "Required" : "Optional"}</small>
                </span>
              </a>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}
