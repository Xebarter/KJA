"use client";

import { useRef, useState } from "react";
import { AmountInput, Feedback, useOfficeAction } from "@/components/accounts/client";
import { addInvoiceLine } from "@/app/accounts/(desk)/invoices/actions";

/** Adds a charge or discount line to a draft invoice. */
export function AddLineForm({ invoiceId }: { invoiceId: string }) {
  const form = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<"charge" | "discount">("charge");
  const [key, setKey] = useState(0);
  const { result, pending, run } = useOfficeAction();
  return (
    <form
      ref={form}
      className="ofc-form is-compact acc-add-line"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        data.set("kind", kind);
        run(() => addInvoiceLine(invoiceId, data), () => {
          form.current?.reset();
          setKey((n) => n + 1);
        });
      }}
    >
      <div className="ofc-segmented" role="radiogroup" aria-label="Line type">
        <label>
          <input type="radio" name="line_kind" checked={kind === "charge"} onChange={() => setKind("charge")} />
          <span><i className="fa-solid fa-plus" aria-hidden="true" /> Charge</span>
        </label>
        <label>
          <input type="radio" name="line_kind" checked={kind === "discount"} onChange={() => setKind("discount")} />
          <span><i className="fa-solid fa-minus" aria-hidden="true" /> Discount</span>
        </label>
      </div>
      <div className="acc-add-line-row">
        <label className="ofc-field">
          <span>Description</span>
          <input name="description" required maxLength={120} placeholder={kind === "charge" ? "For example: Swimming club" : "For example: Early payment discount"} />
        </label>
        <label className="ofc-field">
          <span>Amount</span>
          <AmountInput key={key} name="amount" required />
        </label>
        <button className="admin-btn" type="submit" disabled={pending}>
          <i className={`fa-solid fa-plus${pending ? " fa-fade" : ""}`} aria-hidden="true" /> {pending ? "Adding…" : "Add line"}
        </button>
      </div>
      <Feedback result={result} />
    </form>
  );
}
