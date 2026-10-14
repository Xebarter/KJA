"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog, Feedback, useOfficeAction } from "@/components/accounts/client";
import { decideExpense, markExpensePaid, withdrawExpense } from "@/app/accounts/(desk)/expenses/actions";
import { ACCOUNTS_BASE, PAYMENT_METHODS, kampalaToday, ugx, type ExpenseStatus } from "@/lib/accounts-format";

export function ExpenseActions({ id, status, refNo, amount, payee, canDecide, canEdit, method, reference }: {
  id: string;
  status: ExpenseStatus;
  refNo: string;
  amount: number;
  payee: string;
  canDecide: boolean;
  canEdit: boolean;
  method: string | null;
  reference: string | null;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"" | "approve" | "reject" | "pay">("");
  const [note, setNote] = useState("");
  const { result, setResult, pending, run } = useOfficeAction();
  const open = (which: "approve" | "reject" | "pay") => {
    setResult(null);
    setNote("");
    setDialog(which);
  };

  return (
    <div className="acc-expense-actions">
      {status === "pending" ? (
        canDecide ? (
          <>
            <button type="button" className="admin-btn" onClick={() => open("approve")}><i className="fa-solid fa-check" aria-hidden="true" /> Approve</button>
            <button type="button" className="admin-btn admin-btn-ghost acc-btn-danger" onClick={() => open("reject")}><i className="fa-solid fa-xmark" aria-hidden="true" /> Reject</button>
          </>
        ) : (
          <p className="acc-soft"><i className="fa-solid fa-user-check" aria-hidden="true" /> Waiting for another member of the accounts office to approve.</p>
        )
      ) : null}
      {status === "approved" ? (
        <button type="button" className="admin-btn admin-btn-gold" onClick={() => open("pay")}><i className="fa-solid fa-money-bill-wave" aria-hidden="true" /> Mark as paid</button>
      ) : null}
      {status === "pending" && canEdit ? (
        <>
          <a className="admin-btn admin-btn-ghost" href={`${ACCOUNTS_BASE}/expenses/new?edit=${id}`}><i className="fa-solid fa-pen" aria-hidden="true" /> Edit</a>
          <button
            type="button"
            className="admin-btn admin-btn-ghost"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(`Withdraw ${refNo}? It will be deleted.`)) return;
              run(() => withdrawExpense(id), () => router.push(`${ACCOUNTS_BASE}/expenses`));
            }}
          >
            <i className="fa-solid fa-trash-can" aria-hidden="true" /> Withdraw
          </button>
        </>
      ) : null}
      {!dialog ? <Feedback result={result} /> : null}

      <Dialog
        open={dialog === "approve" || dialog === "reject"}
        onClose={() => setDialog("")}
        title={dialog === "approve" ? `Approve ${refNo}?` : `Reject ${refNo}?`}
        description={`${ugx(amount)} to ${payee}.`}
      >
        <form
          className="ofc-form is-compact"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => decideExpense(id, dialog === "approve" ? "approved" : "rejected", note), () => setDialog(""));
          }}
        >
          <label className="ofc-field">
            <span>{dialog === "approve" ? "Note (optional)" : "Reason"}</span>
            <textarea rows={3} maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} required={dialog === "reject"} autoFocus />
          </label>
          <Feedback result={result} />
          <div className="acc-dialog-foot">
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setDialog("")}>Cancel</button>
            <button type="submit" className="admin-btn" disabled={pending || (dialog === "reject" && note.trim().length < 4)}>
              {pending ? "Saving…" : dialog === "approve" ? "Approve" : "Reject"}
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog open={dialog === "pay"} onClose={() => setDialog("")} title={`Pay ${refNo}`} description={`Record that ${ugx(amount)} has been paid to ${payee}.`}>
        <form
          className="ofc-form is-compact"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            run(() => markExpensePaid(id, data), () => setDialog(""));
          }}
        >
          <div className="ofc-fields">
            <label className="ofc-field">
              <span>Paid by</span>
              <select name="method" defaultValue={method ?? "cash"} required>
                {PAYMENT_METHODS.filter((entry) => entry.value !== "schoolpay").map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
              </select>
            </label>
            <label className="ofc-field">
              <span>Date paid</span>
              <input type="date" name="paid_on" defaultValue={kampalaToday()} max={kampalaToday()} required />
            </label>
            <label className="ofc-field is-wide">
              <span>Transaction or cheque reference</span>
              <input name="reference" maxLength={80} defaultValue={reference ?? ""} placeholder="Needed for bank, mobile money and cheques" />
            </label>
            <label className="ofc-field is-wide">
              <span>Receipt (optional)</span>
              <input type="file" name="receipt" accept="application/pdf,image/jpeg,image/png,image/webp" />
            </label>
          </div>
          <Feedback result={result} />
          <div className="acc-dialog-foot">
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setDialog("")}>Cancel</button>
            <button type="submit" className="admin-btn" disabled={pending}>{pending ? "Saving…" : "Mark as paid"}</button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
