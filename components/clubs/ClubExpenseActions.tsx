"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog, Feedback, useOfficeAction } from "@/components/accounts/client";
import { voidClubExpense } from "@/app/clubs/(desk)/expenses/actions";
import { ugx } from "@/lib/accounts-format";

export function VoidClubExpenseButton({
  id,
  refNo,
  amount,
  payee,
  editHref,
}: {
  id: string;
  refNo: string;
  amount: number;
  payee: string;
  editHref?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { result, setResult, pending, run } = useOfficeAction();

  return (
    <div className="clubs-exp-actions">
      {editHref ? (
        <a className="clubs-acc-btn is-ghost is-compact" href={editHref}>
          <i className="fa-solid fa-pen" aria-hidden="true" /> Edit
        </a>
      ) : null}
      <button
        type="button"
        className="clubs-acc-btn is-danger is-compact"
        onClick={() => {
          setResult(null);
          setReason("");
          setOpen(true);
        }}
      >
        <i className="fa-solid fa-ban" aria-hidden="true" /> Void
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Void ${refNo}?`}
        description={`${ugx(amount)} to ${payee}. It stays on record marked void and stops counting in balances and reports.`}
      >
        <form
          className="ofc-form is-compact"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData();
            data.set("id", id);
            data.set("void_reason", reason);
            run(() => voidClubExpense(data), () => {
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <label className="ofc-field">
            <span>Reason</span>
            <textarea
              rows={3}
              required
              minLength={4}
              maxLength={300}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="For example: recorded twice, wrong club"
              autoFocus
            />
          </label>
          <Feedback result={result} />
          <div className="acc-dialog-foot">
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setOpen(false)}>
              Keep it
            </button>
            <button type="submit" className="admin-btn" disabled={pending || reason.trim().length < 4}>
              {pending ? "Voiding…" : `Void ${refNo}`}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
