"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog, Feedback, useOfficeAction } from "@/components/accounts/client";
import { saveClubExpenseCategory } from "@/app/clubs/(desk)/expenses/actions";
import { CLUB_EXPENSE_CATEGORY_ICONS, type ClubExpenseCategory } from "@/lib/club-accounts";

export function ClubExpenseCategories({ categories }: { categories: ClubExpenseCategory[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClubExpenseCategory | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>(CLUB_EXPENSE_CATEGORY_ICONS[0]);
  const [active, setActive] = useState(true);
  const [sortOrder, setSortOrder] = useState(100);
  const { result, setResult, pending, run } = useOfficeAction();

  const startCreate = () => {
    setEditing(null);
    setName("");
    setIcon(CLUB_EXPENSE_CATEGORY_ICONS[0]);
    setActive(true);
    setSortOrder(100);
    setResult(null);
    setOpen(true);
  };

  const startEdit = (row: ClubExpenseCategory) => {
    setEditing(row);
    setName(row.name);
    setIcon(row.icon || CLUB_EXPENSE_CATEGORY_ICONS[0]);
    setActive(row.active);
    setSortOrder(row.sort_order);
    setResult(null);
    setOpen(true);
  };

  return (
    <div className="clubs-exp-cats-admin">
      <div className="clubs-exp-cats-admin-head">
        <p>Categories used when Clubs registers spending from club funds.</p>
        <button type="button" className="clubs-head-btn is-primary" onClick={startCreate}>
          <i className="fa-solid fa-plus" aria-hidden="true" /> Add category
        </button>
      </div>

      {categories.length ? (
        <ul className="clubs-exp-cats-admin-list">
          {categories.map((row) => (
            <li key={row.id} className={row.active ? undefined : "is-off"}>
              <span className="clubs-ov-portal-icon" aria-hidden="true">
                <i className={`fa-solid ${row.icon}`} />
              </span>
              <span>
                <strong>{row.name}</strong>
                <small>
                  Sort {row.sort_order}
                  {row.active ? "" : " · inactive"}
                </small>
              </span>
              <button type="button" className="clubs-reg-tool" onClick={() => startEdit(row)}>
                <i className="fa-solid fa-pen" aria-hidden="true" /> Edit
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="clubs-detail-empty">No categories yet. Add Equipment, Transport, and other spend types.</p>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.name}` : "Add expense category"}
        description="These labels organise club spending. They never appear on the Accounts desk."
      >
        <form
          className="ofc-form is-compact"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            if (editing) data.set("id", editing.id);
            data.set("active", active ? "1" : "0");
            run(() => saveClubExpenseCategory(data), () => {
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <label className="ofc-field">
            <span>Name</span>
            <input name="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required autoFocus />
          </label>
          <label className="ofc-field">
            <span>Icon</span>
            <select name="icon" value={icon} onChange={(event) => setIcon(event.target.value)}>
              {CLUB_EXPENSE_CATEGORY_ICONS.map((value) => (
                <option key={value} value={value}>
                  {value.replace("fa-", "")}
                </option>
              ))}
            </select>
          </label>
          <label className="ofc-field">
            <span>Sort order</span>
            <input
              type="number"
              name="sort_order"
              min={0}
              max={9999}
              value={sortOrder}
              onChange={(event) => setSortOrder(Number(event.target.value) || 0)}
            />
          </label>
          <label className="ofc-check">
            <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
            <span>Active for new expenses</span>
          </label>
          <Feedback result={result} />
          <div className="acc-dialog-foot">
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="admin-btn" disabled={pending || !name.trim()}>
              {pending ? "Saving…" : editing ? "Save" : "Add category"}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
