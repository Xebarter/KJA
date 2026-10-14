"use client";

import { useState } from "react";
import {
  deleteDiscountRule,
  deleteTerm,
  saveCategory,
  saveDiscountRule,
  saveItem,
  saveTerm,
  setCurrentTerm,
  toggleCategory,
  toggleItem,
} from "@/app/accounts/(desk)/settings/actions";
import { Dialog, Feedback, useOfficeAction } from "@/components/accounts/client";
import {
  DISCOUNT_KINDS,
  ITEM_KINDS,
  day,
  discountText,
  itemKindInfo,
  ugx,
  type DiscountRule,
  type ExpenseCategory,
  type FeeItem,
  type Term,
} from "@/lib/accounts-format";
import type { ActionResult } from "@/lib/office-forms";

/** A dialog form that runs a server action with the form data and closes when it works. */
function FormDialog({ open, onClose, title, description, action, submit, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  action: (form: FormData) => Promise<ActionResult>;
  submit: string;
  children: React.ReactNode;
}) {
  const { result, setResult, pending, run } = useOfficeAction();
  return (
    <Dialog open={open} onClose={() => { setResult(null); onClose(); }} title={title} description={description}>
      <form
        className="ofc-form is-compact"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          run(() => action(data), () => { setResult(null); onClose(); });
        }}
      >
        <div className="ofc-fields">{children}</div>
        <Feedback result={result} />
        <div className="acc-dialog-foot">
          <button type="button" className="admin-btn admin-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="admin-btn" disabled={pending}>{pending ? "Saving…" : submit}</button>
        </div>
      </form>
    </Dialog>
  );
}

function RowButton({ label, icon, onClick, danger = false, disabled = false }: { label: string; icon: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button type="button" className={`acc-row-btn${danger ? " is-danger" : ""}`} onClick={onClick} disabled={disabled} title={label} aria-label={label}>
      <i className={`fa-solid ${icon}`} aria-hidden="true" />
    </button>
  );
}

// ---------------------------------------------------------------- terms

export function TermsManager({ terms, usage }: { terms: Term[]; usage: Record<string, number> }) {
  const [editing, setEditing] = useState<Term | "new" | null>(null);
  const { result, pending, run } = useOfficeAction();
  const term = editing && editing !== "new" ? editing : null;
  const nextYear = terms[0] ? (terms[0].term === 3 ? terms[0].year + 1 : terms[0].year) : new Date().getFullYear();
  const nextTerm = terms[0] ? (terms[0].term === 3 ? 1 : terms[0].term + 1) : 1;
  return (
    <>
      <div className="acc-panel-actions">
        <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setEditing("new")}>
          <i className="fa-solid fa-plus" aria-hidden="true" /> Add a term
        </button>
      </div>
      <Feedback result={result} />
      {terms.length ? (
        <ul className="acc-terms">
          {terms.map((entry) => (
            <li key={entry.id} className={entry.is_current ? "is-current" : ""}>
              <span className="acc-term-badge" aria-hidden="true">T{entry.term}</span>
              <div>
                <strong>{entry.label}</strong>
                <small>
                  {entry.starts_on ? `${day(entry.starts_on, false)} – ${day(entry.ends_on)}` : "Dates not set"}
                  {entry.due_on ? ` · fees due ${day(entry.due_on, false)}` : ""}
                  {usage[entry.id] ? ` · ${usage[entry.id].toLocaleString("en-GB")} invoices` : ""}
                </small>
              </div>
              {entry.is_current ? (
                <span className="app-status app-status-done">Current</span>
              ) : (
                <button type="button" className="app-link-btn" disabled={pending} onClick={() => run(() => setCurrentTerm(entry.id))}>Make current</button>
              )}
              <RowButton label={`Edit ${entry.label}`} icon="fa-pen" onClick={() => setEditing(entry)} />
              {!entry.is_current && !usage[entry.id] ? (
                <RowButton
                  label={`Remove ${entry.label}`}
                  icon="fa-trash-can"
                  danger
                  disabled={pending}
                  onClick={() => window.confirm(`Remove ${entry.label}? Its fee rates go too.`) && run(() => deleteTerm(entry.id))}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="app-muted">No terms yet. Add the current term to start billing.</p>
      )}

      <FormDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={term ? `Edit ${term.label}` : "Add a term"}
        description="Fees are billed per term. The due date goes on every invoice for the term."
        action={saveTerm}
        submit={term ? "Save term" : "Add term"}
      >
        <input type="hidden" name="id" value={term?.id ?? ""} />
        <label className="ofc-field">
          <span>Year</span>
          <input name="year" type="number" min={2000} max={2100} required defaultValue={term?.year ?? nextYear} />
        </label>
        <label className="ofc-field">
          <span>Term</span>
          <select name="term" defaultValue={term?.term ?? nextTerm}>
            <option value={1}>Term 1</option>
            <option value={2}>Term 2</option>
            <option value={3}>Term 3</option>
          </select>
        </label>
        <label className="ofc-field is-wide">
          <span>Name <em>optional, e.g. 2026 Term 3</em></span>
          <input name="label" defaultValue={term?.label ?? ""} maxLength={60} placeholder="Made from the year and term" />
        </label>
        <label className="ofc-field">
          <span>Opens</span>
          <input name="starts_on" type="date" defaultValue={term?.starts_on ?? ""} />
        </label>
        <label className="ofc-field">
          <span>Closes</span>
          <input name="ends_on" type="date" defaultValue={term?.ends_on ?? ""} />
        </label>
        <label className="ofc-field">
          <span>Fees due by</span>
          <input name="due_on" type="date" defaultValue={term?.due_on ?? ""} />
        </label>
      </FormDialog>
    </>
  );
}

// ---------------------------------------------------------------- fee items

export function ItemsManager({ items }: { items: FeeItem[] }) {
  const [editing, setEditing] = useState<FeeItem | "new" | null>(null);
  const { result, pending, run } = useOfficeAction();
  const item = editing && editing !== "new" ? editing : null;
  return (
    <>
      <div className="acc-panel-actions">
        <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setEditing("new")}>
          <i className="fa-solid fa-plus" aria-hidden="true" /> Add an item
        </button>
      </div>
      <Feedback result={result} />
      <ul className="acc-items">
        {items.map((entry) => {
          const kind = itemKindInfo(entry.kind);
          return (
            <li key={entry.id} className={entry.active ? "" : "is-off"}>
              <span className="acc-item-icon" aria-hidden="true"><i className={`fa-solid ${kind.icon}`} /></span>
              <div>
                <strong>{entry.name}</strong>
                <small>{kind.label}{entry.description ? ` · ${entry.description}` : ""}</small>
              </div>
              <label className="acc-switch" title={entry.active ? "Billed on new invoices" : "Not billed"}>
                <input type="checkbox" checked={entry.active} disabled={pending} onChange={(event) => run(() => toggleItem(entry.id, event.target.checked))} />
                <span aria-hidden="true" />
                <em className="visually-hidden">{entry.active ? "On" : "Off"}</em>
              </label>
              <RowButton label={`Edit ${entry.name}`} icon="fa-pen" onClick={() => setEditing(entry)} />
            </li>
          );
        })}
      </ul>

      <FormDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={item ? `Edit ${item.name}` : "Add a fee item"}
        description="Items are the columns of the fee table, such as Tuition, Lunch or Transport."
        action={saveItem}
        submit={item ? "Save item" : "Add item"}
      >
        <input type="hidden" name="id" value={item?.id ?? ""} />
        <label className="ofc-field is-wide">
          <span>Name</span>
          <input name="name" required maxLength={80} defaultValue={item?.name ?? ""} placeholder="For example: Lunch" />
        </label>
        <label className="ofc-field">
          <span>Kind</span>
          <select name="kind" defaultValue={item?.kind ?? "other"}>
            {ITEM_KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
          </select>
        </label>
        <label className="ofc-field">
          <span>Order <em>lower comes first</em></span>
          <input name="sort_order" type="number" min={0} max={99} defaultValue={item?.sort_order ?? items.length + 1} />
        </label>
        <label className="ofc-field is-wide">
          <span>Note <em>optional</em></span>
          <input name="description" maxLength={200} defaultValue={item?.description ?? ""} />
        </label>
      </FormDialog>
    </>
  );
}

// ---------------------------------------------------------------- discounts

export function DiscountsManager({ rules, usage }: { rules: DiscountRule[]; usage: Record<string, number> }) {
  const [editing, setEditing] = useState<DiscountRule | "new" | null>(null);
  const [method, setMethod] = useState<"percent" | "fixed">("percent");
  const [kind, setKind] = useState<DiscountRule["kind"]>("bursary");
  const { result, pending, run } = useOfficeAction();
  const rule = editing && editing !== "new" ? editing : null;
  const open = (next: DiscountRule | "new") => {
    setEditing(next);
    setMethod(next === "new" ? "percent" : next.method);
    setKind(next === "new" ? "bursary" : next.kind);
  };
  return (
    <>
      <div className="acc-panel-actions">
        <button type="button" className="admin-btn admin-btn-ghost" onClick={() => open("new")}>
          <i className="fa-solid fa-plus" aria-hidden="true" /> Add a discount
        </button>
      </div>
      <Feedback result={result} />
      <ul className="acc-items">
        {rules.map((entry) => {
          const info = DISCOUNT_KINDS.find((item) => item.value === entry.kind);
          return (
            <li key={entry.id} className={entry.active ? "" : "is-off"}>
              <span className="acc-item-icon is-gold" aria-hidden="true">{entry.method === "percent" ? `${Number(entry.value)}%` : <i className="fa-solid fa-tag" />}</span>
              <div>
                <strong>{entry.name} <em className="acc-soft">{discountText(entry.method, entry.value)}</em></strong>
                <small>
                  {entry.kind === "sibling" ? `From the ${ordinal(entry.sibling_from)} child in a family, on tuition` : info?.note}
                  {usage[entry.id] ? ` · ${usage[entry.id]} pupil${usage[entry.id] === 1 ? "" : "s"}` : ""}
                  {entry.active ? "" : " · Off"}
                </small>
              </div>
              <RowButton label={`Edit ${entry.name}`} icon="fa-pen" onClick={() => open(entry)} />
              <RowButton
                label={`Remove ${entry.name}`}
                icon="fa-trash-can"
                danger
                disabled={pending}
                onClick={() => window.confirm(`Remove ${entry.name}? Pupils who already have it keep it.`) && run(() => deleteDiscountRule(entry.id))}
              />
            </li>
          );
        })}
      </ul>
      {!rules.length ? <p className="app-muted">No discounts yet.</p> : null}

      <FormDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={rule ? `Edit ${rule.name}` : "Add a discount"}
        description="Discounts come off tuition when term invoices are generated."
        action={saveDiscountRule}
        submit={rule ? "Save discount" : "Add discount"}
      >
        <input type="hidden" name="id" value={rule?.id ?? ""} />
        <label className="ofc-field is-wide">
          <span>Name</span>
          <input name="name" required maxLength={80} defaultValue={rule?.name ?? ""} placeholder="For example: Sports bursary" />
        </label>
        <label className="ofc-field">
          <span>Who gets it</span>
          <select name="kind" value={kind} onChange={(event) => setKind(event.target.value as DiscountRule["kind"])}>
            {DISCOUNT_KINDS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </select>
        </label>
        <label className="ofc-field">
          <span>Type</span>
          <select name="method" value={method} onChange={(event) => setMethod(event.target.value as "percent" | "fixed")}>
            <option value="percent">Percentage of tuition</option>
            <option value="fixed">Fixed amount (UGX)</option>
          </select>
        </label>
        <label className="ofc-field">
          <span>{method === "percent" ? "Percentage" : "Amount (UGX)"}</span>
          <input name="value" required inputMode="decimal" defaultValue={rule ? String(Number(rule.value)) : ""} placeholder={method === "percent" ? "10" : "100,000"} />
        </label>
        {kind === "sibling" ? (
          <label className="ofc-field">
            <span>Starts from child</span>
            <select name="sibling_from" defaultValue={rule?.sibling_from ?? 2}>
              {[2, 3, 4, 5].map((n) => <option key={n} value={n}>{ordinal(n)} child</option>)}
            </select>
          </label>
        ) : <input type="hidden" name="sibling_from" value="2" />}
        <label className="ofc-check is-wide">
          <input type="checkbox" name="active" defaultChecked={rule?.active ?? true} />
          {kind === "sibling" || kind === "staff" ? "Apply automatically to new term invoices" : "Available to give to pupils"}
        </label>
        <p className="acc-dialog-note is-wide">{DISCOUNT_KINDS.find((entry) => entry.value === kind)?.note}.</p>
      </FormDialog>
    </>
  );
}

function ordinal(n: number) {
  return `${n}${n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;
}

// ---------------------------------------------------------------- expense categories

const CATEGORY_ICONS = [
  "fa-receipt", "fa-people-group", "fa-bolt", "fa-screwdriver-wrench", "fa-book-open", "fa-utensils", "fa-bus",
  "fa-print", "fa-masks-theater", "fa-building-columns", "fa-broom", "fa-laptop", "fa-futbol", "fa-kit-medical", "fa-shield-halved",
];

export function CategoriesManager({ categories, spent }: { categories: ExpenseCategory[]; spent: Record<string, number> }) {
  const [editing, setEditing] = useState<ExpenseCategory | "new" | null>(null);
  const [icon, setIcon] = useState("fa-receipt");
  const { result, pending, run } = useOfficeAction();
  const category = editing && editing !== "new" ? editing : null;
  return (
    <>
      <div className="acc-panel-actions">
        <button type="button" className="admin-btn admin-btn-ghost" onClick={() => { setEditing("new"); setIcon("fa-receipt"); }}>
          <i className="fa-solid fa-plus" aria-hidden="true" /> Add a category
        </button>
      </div>
      <Feedback result={result} />
      <ul className="acc-items is-grid">
        {categories.map((entry) => (
          <li key={entry.id} className={entry.active ? "" : "is-off"}>
            <span className="acc-item-icon" aria-hidden="true"><i className={`fa-solid ${entry.icon}`} /></span>
            <div>
              <strong>{entry.name}</strong>
              <small>
                {entry.monthly_budget ? `Budget ${ugx(entry.monthly_budget)} a month` : "No monthly budget"}
                {spent[entry.id] ? ` · ${ugx(spent[entry.id])} this month` : ""}
              </small>
            </div>
            <label className="acc-switch" title={entry.active ? "Shown on new expenses" : "Hidden"}>
              <input type="checkbox" checked={entry.active} disabled={pending} onChange={(event) => run(() => toggleCategory(entry.id, event.target.checked))} />
              <span aria-hidden="true" />
              <em className="visually-hidden">{entry.active ? "On" : "Off"}</em>
            </label>
            <RowButton label={`Edit ${entry.name}`} icon="fa-pen" onClick={() => { setEditing(entry); setIcon(entry.icon); }} />
          </li>
        ))}
      </ul>

      <FormDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={category ? `Edit ${category.name}` : "Add an expense category"}
        action={saveCategory}
        submit={category ? "Save category" : "Add category"}
      >
        <input type="hidden" name="id" value={category?.id ?? ""} />
        <input type="hidden" name="icon" value={icon} />
        <input type="hidden" name="active" value={category && !category.active ? "off" : "on"} />
        <label className="ofc-field is-wide">
          <span>Name</span>
          <input name="name" required maxLength={80} defaultValue={category?.name ?? ""} />
        </label>
        <label className="ofc-field is-wide">
          <span>Monthly budget <em>optional, in UGX</em></span>
          <input name="monthly_budget" inputMode="numeric" defaultValue={category?.monthly_budget ? category.monthly_budget.toLocaleString("en-US") : ""} placeholder="Leave empty for no budget" />
        </label>
        <fieldset className="ofc-field is-wide acc-icon-pick">
          <span>Icon</span>
          <div>
            {CATEGORY_ICONS.map((name) => (
              <button key={name} type="button" className={icon === name ? "is-on" : ""} aria-pressed={icon === name} aria-label={name.replace("fa-", "")} onClick={() => setIcon(name)}>
                <i className={`fa-solid ${name}`} aria-hidden="true" />
              </button>
            ))}
          </div>
        </fieldset>
      </FormDialog>
    </>
  );
}
