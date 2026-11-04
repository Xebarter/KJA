"use client";

import Link from "next/link";
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
import { Empty } from "@/components/office/ui";
import {
  DISCOUNT_KINDS,
  ITEM_KINDS,
  ACCOUNTS_BASE,
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
function FormDialog({ open, onClose, title, description, action, submit, children, className, wide = false }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  action: (form: FormData) => Promise<ActionResult>;
  submit: string;
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
}) {
  const { result, setResult, pending, run } = useOfficeAction();
  return (
    <Dialog open={open} onClose={() => { setResult(null); onClose(); }} title={title} description={description} wide={wide}>
      <form
        className={`ofc-form is-compact${className ? ` ${className}` : ""}`}
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
          <button type="submit" className="admin-btn set-save-btn" disabled={pending}>
            <i className={`fa-solid ${pending ? "fa-spinner fa-spin" : "fa-check"}`} aria-hidden="true" />
            {pending ? "Saving…" : submit}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function RowButton({ label, icon, onClick, danger = false, disabled = false, text }: {
  label: string;
  icon: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Visible label. Prefer this for common actions so the page is easy to scan. */
  text?: string;
}) {
  return (
    <button
      type="button"
      className={`acc-row-btn${text ? " is-label" : ""}${danger ? " is-danger" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      <i className={`fa-solid ${icon}`} aria-hidden="true" />
      {text ? <span>{text}</span> : null}
    </button>
  );
}

function Section({ id, step, title, meta, description, action, children }: {
  id: string;
  step: number;
  title: string;
  meta?: string;
  description: React.ReactNode;
  action: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="admin-card ofc-register set-card" id={id} aria-labelledby={`${id}-heading`}>
      <header className="ofc-reg-results">
        <div>
          <h2 id={`${id}-heading`}>
            <span className="set-step-num" aria-hidden="true">{step}</span>
            {title}
            {meta ? <span className="set-count">{meta}</span> : null}
          </h2>
          <p>{description}</p>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="admin-btn fee-add" onClick={onClick}>
      <i className="fa-solid fa-plus" aria-hidden="true" /> {label}
    </button>
  );
}

function Who({ mark, gold = false, title, detail }: { mark: React.ReactNode; gold?: boolean; title: React.ReactNode; detail?: React.ReactNode }) {
  return (
    <div className="set-who">
      <span className={`set-mark${gold ? " is-gold" : ""}`} aria-hidden="true">{mark}</span>
      <span>
        <strong>{title}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
    </div>
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
    <Section
      id="terms"
      step={1}
      title="Terms"
      meta={terms.length ? `${terms.length} on file` : undefined}
      description="Pick the term you are billing now. New payments and invoices use the current term."
      action={<AddButton label="Add a term" onClick={() => setEditing("new")} />}
    >
      <Feedback result={result} />
      {terms.length ? (
        <div className="ofc-table-scroll">
          <table className="set-table">
            <thead>
              <tr>
                <th scope="col">Term</th>
                <th scope="col">Dates</th>
                <th scope="col">Fees due</th>
                <th scope="col">Invoices</th>
                <th scope="col">Status</th>
                <th scope="col" className="is-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {terms.map((entry) => (
                <tr key={entry.id} className={entry.is_current ? "is-current" : ""}>
                  <td>
                    <Who mark={`T${entry.term}`} title={entry.label} />
                  </td>
                  <td className="set-num" data-label="Dates">{entry.starts_on ? `${day(entry.starts_on, false)} – ${day(entry.ends_on)}` : <span className="set-muted">Not set</span>}</td>
                  <td className="set-num" data-label="Fees due">{entry.due_on ? day(entry.due_on, false) : <span className="set-muted">-</span>}</td>
                  <td className="set-num" data-label="Invoices">{usage[entry.id] ? usage[entry.id].toLocaleString("en-GB") : <span className="set-muted">-</span>}</td>
                  <td data-label="Status">
                    {entry.is_current ? (
                      <span className="set-pill"><i className="fa-solid fa-circle-check" aria-hidden="true" /> Current</span>
                    ) : (
                      <span className="set-muted">Not current</span>
                    )}
                  </td>
                  <td className="is-actions" data-label="Actions">
                    <div className="set-actions">
                      {!entry.is_current ? (
                        <button type="button" className="set-make-current" disabled={pending} onClick={() => run(() => setCurrentTerm(entry.id))}>
                          <i className="fa-solid fa-check" aria-hidden="true" /> Make current
                        </button>
                      ) : null}
                      <RowButton label={`Edit ${entry.label}`} icon="fa-pen" text="Edit" onClick={() => setEditing(entry)} />
                      {!entry.is_current && !usage[entry.id] ? (
                        <RowButton
                          label={`Remove ${entry.label}`}
                          icon="fa-trash-can"
                          text="Remove"
                          danger
                          disabled={pending}
                          onClick={() => window.confirm(`Remove ${entry.label}? Its fee rates go too.`) && run(() => deleteTerm(entry.id))}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon="fa-calendar" title="No terms yet">Add the current term to start billing.</Empty>
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
    </Section>
  );
}

// ---------------------------------------------------------------- fee items

export function ItemsManager({ items }: { items: FeeItem[] }) {
  const [editing, setEditing] = useState<FeeItem | "new" | null>(null);
  const { result, pending, run } = useOfficeAction();
  const item = editing && editing !== "new" ? editing : null;
  const billing = items.filter((entry) => entry.active).length;
  return (
    <Section
      id="items"
      step={2}
      title="Fee items"
      meta={items.length ? `${billing} billing` : undefined}
      description="What families are billed for: Tuition, Lunch, Transport, and so on. Switch one off to stop billing it."
      action={<AddButton label="Add an item" onClick={() => setEditing("new")} />}
    >
      <Feedback result={result} />
      {items.length ? (
        <div className="ofc-table-scroll">
          <table className="set-table">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Kind</th>
                <th scope="col">Billed</th>
                <th scope="col" className="is-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => {
                const kind = itemKindInfo(entry.kind);
                return (
                  <tr key={entry.id} className={entry.active ? "" : "is-off"}>
                    <td>
                      <Who mark={<i className={`fa-solid ${kind.icon}`} />} title={entry.name} detail={entry.description || undefined} />
                    </td>
                    <td data-label="Kind"><span className="set-kind">{kind.label}</span></td>
                    <td data-label="Billed">
                      <label className="acc-switch" title={entry.active ? "Billed on new invoices" : "Not billed"}>
                        <input type="checkbox" checked={entry.active} disabled={pending} onChange={(event) => run(() => toggleItem(entry.id, event.target.checked))} />
                        <span aria-hidden="true" />
                        <em className="visually-hidden">{entry.active ? "On" : "Off"}</em>
                      </label>
                    </td>
                    <td className="is-actions" data-label="Actions">
                      <div className="set-actions">
                        <RowButton label={`Edit ${entry.name}`} icon="fa-pen" text="Edit" onClick={() => setEditing(entry)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon="fa-rectangle-list" title="No fee items yet">Add Tuition first, then anything else families are billed for.</Empty>
      )}

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
    </Section>
  );
}

// ---------------------------------------------------------------- discounts

function formatDiscountValue(method: "percent" | "fixed", raw: string) {
  if (method === "percent") {
    const cleaned = raw.replace(/[^\d.]/g, "");
    const [whole, ...rest] = cleaned.split(".");
    const decimals = rest.join("").slice(0, 2);
    return decimals ? `${whole}.${decimals}` : whole;
  }
  const digits = raw.replace(/[^\d]/g, "").slice(0, 12);
  return digits ? Number(digits).toLocaleString("en-US") : "";
}

export function DiscountsManager({ rules, usage }: { rules: DiscountRule[]; usage: Record<string, number> }) {
  const [editing, setEditing] = useState<DiscountRule | "new" | null>(null);
  const [method, setMethod] = useState<"percent" | "fixed">("percent");
  const [kind, setKind] = useState<DiscountRule["kind"]>("bursary");
  const [valueText, setValueText] = useState("");
  const { result, pending, run } = useOfficeAction();
  const rule = editing && editing !== "new" ? editing : null;
  const kindInfo = DISCOUNT_KINDS.find((entry) => entry.value === kind);
  const open = (next: DiscountRule | "new") => {
    const nextMethod = next === "new" ? "percent" : next.method;
    setEditing(next);
    setMethod(nextMethod);
    setKind(next === "new" ? "bursary" : next.kind);
    setValueText(next === "new" ? "" : formatDiscountValue(nextMethod, String(Number(next.value))));
  };
  const pickMethod = (next: "percent" | "fixed") => {
    setMethod(next);
    setValueText((current) => formatDiscountValue(next, current));
  };
  const active = rules.filter((entry) => entry.active).length;
  return (
    <Section
      id="discounts"
      step={4}
      title="Discounts"
      meta={rules.length ? `${active} on` : undefined}
      description="Sibling and staff discounts apply automatically. Bursaries are given to individual pupils from their fee account."
      action={<AddButton label="Add a discount" onClick={() => open("new")} />}
    >
      <Feedback result={result} />
      {rules.length ? (
        <div className="ofc-table-scroll">
          <table className="set-table">
            <thead>
              <tr>
                <th scope="col">Discount</th>
                <th scope="col">Who</th>
                <th scope="col">Pupils</th>
                <th scope="col" className="is-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((entry) => {
                const info = DISCOUNT_KINDS.find((item) => item.value === entry.kind);
                const pupils = usage[entry.id] ?? 0;
                return (
                  <tr key={entry.id} className={entry.active ? "" : "is-off"}>
                    <td>
                      <Who
                        gold
                        mark={entry.method === "percent" ? `${Number(entry.value)}%` : <i className="fa-solid fa-coins" />}
                        title={<>{entry.name} <span className="set-amount">{discountText(entry.method, entry.value)}</span></>}
                        detail={entry.kind === "sibling" ? `From the ${ordinal(entry.sibling_from)} child in a family, on tuition` : info?.note}
                      />
                    </td>
                    <td data-label="Who"><span className="set-kind">{info?.label ?? entry.kind}{entry.active ? "" : " · Off"}</span></td>
                    <td className="set-num" data-label="Pupils">{pupils ? pupils.toLocaleString("en-GB") : <span className="set-muted">-</span>}</td>
                    <td className="is-actions" data-label="Actions">
                      <div className="set-actions">
                        <RowButton label={`Edit ${entry.name}`} icon="fa-pen" text="Edit" onClick={() => open(entry)} />
                        <RowButton
                          label={`Remove ${entry.name}`}
                          icon="fa-trash-can"
                          text="Remove"
                          danger
                          disabled={pending}
                          onClick={() => window.confirm(`Remove ${entry.name}? Pupils who already have it keep it.`) && run(() => deleteDiscountRule(entry.id))}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon="fa-tag" title="No discounts yet">Add a sibling, staff or bursary discount. They come off tuition when invoices are generated.</Empty>
      )}

      <FormDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={rule ? `Edit ${rule.name}` : "Add a discount"}
        description="Comes off tuition on new term invoices. Choose a percentage or a fixed UGX amount."
        action={saveDiscountRule}
        submit={rule ? "Save discount" : "Add discount"}
        className="set-discount-form"
      >
        <input type="hidden" name="id" value={rule?.id ?? ""} />
        <input type="hidden" name="method" value={method} />
        <input type="hidden" name="kind" value={kind} />

        <label className="ofc-field is-wide">
          <span>Name</span>
          <input name="name" required maxLength={80} defaultValue={rule?.name ?? ""} placeholder="For example: Sports bursary" />
        </label>

        <fieldset className="ofc-field is-wide set-choice">
          <legend>Who gets it</legend>
          <div className="set-choice-grid" role="radiogroup" aria-label="Who gets it">
            {DISCOUNT_KINDS.map((entry) => (
              <button
                key={entry.value}
                type="button"
                role="radio"
                aria-checked={kind === entry.value}
                className={kind === entry.value ? "is-on" : ""}
                onClick={() => setKind(entry.value)}
              >
                <strong>{entry.label}</strong>
                <small>{entry.note}</small>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="ofc-field is-wide set-choice">
          <legend>How much comes off</legend>
          <div className="set-method-switch" role="radiogroup" aria-label="Discount method">
            <button
              type="button"
              role="radio"
              aria-checked={method === "percent"}
              className={method === "percent" ? "is-on" : ""}
              onClick={() => pickMethod("percent")}
            >
              <i className="fa-solid fa-percent" aria-hidden="true" />
              <span>
                <strong>Percentage</strong>
                <small>Share of tuition</small>
              </span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={method === "fixed"}
              className={method === "fixed" ? "is-on" : ""}
              onClick={() => pickMethod("fixed")}
            >
              <i className="fa-solid fa-coins" aria-hidden="true" />
              <span>
                <strong>Fixed amount</strong>
                <small>Solid UGX figure</small>
              </span>
            </button>
          </div>
        </fieldset>

        <label className="ofc-field is-wide">
          <span>{method === "percent" ? "Percentage of tuition" : "Fixed amount off tuition"}</span>
          <span className={`set-value-box${method === "fixed" ? " is-money" : " is-percent"}`}>
            {method === "fixed" ? <em>UGX</em> : null}
            <input
              name="value"
              required
              inputMode={method === "percent" ? "decimal" : "numeric"}
              value={valueText}
              onChange={(event) => setValueText(formatDiscountValue(method, event.target.value))}
              placeholder={method === "percent" ? "10" : "100,000"}
              aria-label={method === "percent" ? "Percentage" : "Fixed amount in UGX"}
            />
            {method === "percent" ? <em>%</em> : null}
          </span>
          <small className="set-field-hint">
            {method === "percent"
              ? "Example: 10 means 10% of the tuition line."
              : "Example: 150,000 comes straight off the tuition line."}
          </small>
        </label>

        {kind === "sibling" ? (
          <label className="ofc-field">
            <span>Starts from child</span>
            <select name="sibling_from" defaultValue={rule?.sibling_from ?? 2}>
              {[2, 3, 4, 5].map((n) => <option key={n} value={n}>{ordinal(n)} child</option>)}
            </select>
          </label>
        ) : <input type="hidden" name="sibling_from" value="2" />}

        <label className="ofc-check is-wide set-discount-active">
          <input type="checkbox" name="active" defaultChecked={rule?.active ?? true} />
          <span>
            <strong>{kind === "sibling" || kind === "staff" ? "Apply automatically" : "Available to give"}</strong>
            <small>
              {kind === "sibling" || kind === "staff"
                ? "Added to new term invoices when this matches a pupil."
                : "Staff can attach it to a pupil from their fee account."}
            </small>
          </span>
        </label>

        {kindInfo ? <p className="acc-dialog-note is-wide set-discount-note">{kindInfo.note}.</p> : null}
      </FormDialog>
    </Section>
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
  const shown = categories.filter((entry) => entry.active).length;
  return (
    <Section
      id="categories"
      step={5}
      title="Expense categories"
      meta={categories.length ? `${shown} shown` : undefined}
      description={<>Group spending so reports stay tidy. Monthly plans are watched on the <Link href={`${ACCOUNTS_BASE}/budgeting`}>Budgeting page</Link>.</>}
      action={<AddButton label="Add a category" onClick={() => { setEditing("new"); setIcon("fa-receipt"); }} />}
    >
      <Feedback result={result} />
      {categories.length ? (
        <div className="ofc-table-scroll">
          <table className="set-table">
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Monthly budget</th>
                <th scope="col">This month</th>
                <th scope="col">Shown</th>
                <th scope="col" className="is-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((entry) => {
                const used = spent[entry.id] ?? 0;
                const over = Boolean(entry.monthly_budget && used > entry.monthly_budget);
                const share = entry.monthly_budget ? Math.min(100, Math.round((used / entry.monthly_budget) * 100)) : 0;
                return (
                  <tr key={entry.id} className={entry.active ? "" : "is-off"}>
                    <td>
                      <Who mark={<i className={`fa-solid ${entry.icon}`} />} title={entry.name} />
                    </td>
                    <td className="set-num" data-label="Monthly budget">{entry.monthly_budget ? ugx(entry.monthly_budget) : <span className="set-muted">No budget</span>}</td>
                    <td className="set-num" data-label="This month">
                      <div>
                        <span className={over ? "set-over" : ""}>{used ? ugx(used) : <span className="set-muted">-</span>}</span>
                        {entry.monthly_budget ? (
                          <span className="acc-progress set-meter" aria-hidden="true"><span style={{ width: `${share}%` }} /></span>
                        ) : null}
                      </div>
                    </td>
                    <td data-label="Shown">
                      <label className="acc-switch" title={entry.active ? "Shown on new expenses" : "Hidden"}>
                        <input type="checkbox" checked={entry.active} disabled={pending} onChange={(event) => run(() => toggleCategory(entry.id, event.target.checked))} />
                        <span aria-hidden="true" />
                        <em className="visually-hidden">{entry.active ? "On" : "Off"}</em>
                      </label>
                    </td>
                    <td className="is-actions" data-label="Actions">
                      <div className="set-actions">
                        <RowButton label={`Edit ${entry.name}`} icon="fa-pen" text="Edit" onClick={() => { setEditing(entry); setIcon(entry.icon); }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon="fa-folder-open" title="No categories yet">Add a category so spending can be grouped and watched against a monthly plan.</Empty>
      )}

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
    </Section>
  );
}
