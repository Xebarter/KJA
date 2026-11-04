"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ExpenseForm } from "@/components/accounts/ExpenseForm";
import { ACCOUNTS_BASE, type Expense, type ExpenseCategory } from "@/lib/accounts-format";

function addHref(base: string, current: URLSearchParams, extra: Record<string, string> = {}) {
  const params = new URLSearchParams(current.toString());
  params.set("add", "1");
  for (const [key, value] of Object.entries(extra)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  const query = params.toString();
  return query ? `${base}?${query}` : `${base}?add=1`;
}

function clearAddHref(base: string, current: URLSearchParams) {
  const params = new URLSearchParams(current.toString());
  params.delete("add");
  params.delete("edit");
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/** Hero button that opens the on-page expense form. */
export function ExpensesAddButton({
  className = "aov-btn is-primary",
  label = "Add expense",
}: {
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (
    <button
      type="button"
      className={className}
      onClick={() => router.push(addHref(pathname || `${ACCOUNTS_BASE}/expenses`, searchParams), { scroll: false })}
    >
      <i className="fa-solid fa-plus" aria-hidden="true" /> {label}
    </button>
  );
}

/** Inline expense form on the Expenses page. Opened with ?add=1 or ?edit=. */
export function ExpensesAddPanel({
  categories,
  campuses,
  expense = null,
  spentBy,
}: {
  categories: ExpenseCategory[];
  campuses: string[];
  expense?: Expense | null;
  spentBy: Record<string, number>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const open = searchParams.get("add") === "1" || Boolean(expense);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  const close = useCallback(() => {
    router.push(clearAddHref(pathname || `${ACCOUNTS_BASE}/expenses`, searchParams), { scroll: false });
  }, [pathname, router, searchParams]);

  if (!open && !mounted) return null;
  if (!open) return null;

  const hasCategories = categories.some((category) => category.active || category.id === expense?.category_id);

  return (
    <section className="exp-add-panel admin-card is-open" aria-label={expense ? `Edit ${expense.ref_no}` : "Add expense"}>
      <header className="exp-add-head">
        <div>
          <p className="exp-add-kicker">Spending</p>
          <h2>{expense ? `Edit ${expense.ref_no}` : "Add expense"}</h2>
          <p>Send for approval. A colleague confirms it, then it can be marked paid.</p>
        </div>
        <button type="button" className="exp-icon-btn" onClick={close} aria-label="Close">
          <i className="fa-solid fa-xmark" aria-hidden="true" />
        </button>
      </header>
      {hasCategories ? (
        <ExpenseForm
          key={expense?.id ?? "new"}
          categories={categories}
          campuses={campuses}
          expense={expense}
          spentBy={spentBy}
          onCancel={close}
        />
      ) : (
        <div className="acc-banner is-warn">
          <i className="fa-solid fa-tags" aria-hidden="true" />
          <p>Add an expense category in <Link href={`${ACCOUNTS_BASE}/settings#categories`}>Fee setup</Link> first.</p>
        </div>
      )}
    </section>
  );
}
