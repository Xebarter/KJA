"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { saveMonthlyBudget } from "@/app/accounts/(desk)/budgeting/actions";
import { useOfficeAction } from "@/components/accounts/client";
import { ACCOUNTS_BASE, hrefWith, parseAmount } from "@/lib/accounts-format";

const BASE = `${ACCOUNTS_BASE}/budgeting`;
const SEARCH_DELAY_MS = 180;

const FOCUS_LABEL: Record<string, string> = {
  attention: "Needs a look",
  over: "Over the plan",
  track: "On track",
  open: "No plan",
};

/** The monthly plan for one category. The save button appears once the amount changes. */
export function BudgetField({ id, amount }: { id: string; amount: number | null }) {
  const { result, pending, run } = useOfficeAction();
  const [value, setValue] = useState(amount == null ? "" : amount.toLocaleString("en-US"));
  useEffect(() => {
    setValue(amount == null ? "" : amount.toLocaleString("en-US"));
  }, [amount]);
  const parsed = value.trim() ? parseAmount(value) : null;
  const invalid = Boolean(value.trim()) && parsed === null;
  const dirty = invalid || parsed !== amount;

  return (
    <form
      className="bgt-edit"
      onSubmit={(event) => {
        event.preventDefault();
        if (!dirty || pending) return;
        run(() => saveMonthlyBudget(id, value));
      }}
    >
      <label className="visually-hidden" htmlFor={`bgt-${id}`}>Monthly plan</label>
      <input
        id={`bgt-${id}`}
        inputMode="decimal"
        value={value}
        placeholder="No plan"
        aria-invalid={invalid || undefined}
        onChange={(event) => setValue(event.target.value)}
      />
      {dirty ? (
        <button type="submit" className="bgt-save" disabled={pending}>{pending ? "Saving" : "Save"}</button>
      ) : null}
      {result?.error ? <span className="bgt-edit-error" role="alert">{result.error}</span> : null}
    </form>
  );
}

export function PrintBudget() {
  return (
    <button type="button" className="aov-btn bgt-no-print" onClick={() => window.print()}>
      <i className="fa-solid fa-print" aria-hidden="true" /> Print
    </button>
  );
}

/** Keeps the selected month in view when the year strip overflows. */
export function MonthStrip({ month, children }: { month: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const wrap = ref.current;
    const current = wrap?.querySelector<HTMLElement>(".is-on");
    if (!wrap || !current || wrap.scrollWidth <= wrap.clientWidth + 1) return;
    const wrapBox = wrap.getBoundingClientRect();
    const itemBox = current.getBoundingClientRect();
    if (itemBox.left >= wrapBox.left + 8 && itemBox.right <= wrapBox.right - 8) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delta = itemBox.left - wrapBox.left - (wrap.clientWidth - itemBox.width) / 2;
    wrap.scrollTo({ left: Math.max(0, wrap.scrollLeft + delta), behavior: reduce ? "auto" : "smooth" });
  }, [month]);
  return <div className="bgt-months-wrap" ref={ref}>{children}</div>;
}

/** Search that updates the register as you type, the same way the student register does. */
export function BudgetFinder({ month, focus, q }: { month: string; focus: string; q: string }) {
  const router = useRouter();
  const [value, setValue] = useState(q);
  const [searching, startSearch] = useTransition();
  const sent = useRef(q);
  const filters = useRef({ month, focus });
  filters.current = { month, focus };

  useEffect(() => {
    if (q === sent.current) return;
    sent.current = q;
    setValue(q);
  }, [q]);

  useEffect(() => {
    const needle = value.trim();
    if (needle === sent.current) return;
    const timer = window.setTimeout(() => {
      sent.current = needle;
      const current = filters.current;
      startSearch(() => router.replace(hrefWith(BASE, { month: current.month, focus: current.focus, q: needle }), { scroll: false }));
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [value, router]);

  const go = (changes: Record<string, string>) => hrefWith(BASE, { month, focus, q }, changes);
  const pills = [
    q ? { key: "q", label: `Search: “${q}”`, href: go({ q: "" }) } : null,
    focus && FOCUS_LABEL[focus] ? { key: "focus", label: FOCUS_LABEL[focus], href: go({ focus: "" }) } : null,
  ].filter((entry): entry is { key: string; label: string; href: string } => Boolean(entry));

  return (
    <div className="ofc-finder bgt-no-print">
      <form
        className="ofc-finder-top"
        role="search"
        action={BASE}
        method="get"
        onSubmit={(event) => {
          event.preventDefault();
          const needle = value.trim();
          sent.current = needle;
          startSearch(() => router.replace(hrefWith(BASE, { month, focus, q: needle }), { scroll: false }));
        }}
      >
        <label className={`ofc-finder-search${searching ? " is-searching" : ""}`}>
          <i className={`fa-solid ${searching ? "fa-spinner fa-spin" : "fa-magnifying-glass"}`} aria-hidden="true" />
          <span className="visually-hidden">Search categories</span>
          <input
            type="search"
            name="q"
            value={value}
            placeholder="Category name"
            autoComplete="off"
            aria-busy={searching}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && value) {
                event.preventDefault();
                setValue("");
              }
            }}
          />
        </label>
        <input type="hidden" name="month" value={month} />
        {focus ? <input type="hidden" name="focus" value={focus} /> : null}
        <button className="bgt-search" type="submit">Search</button>
      </form>
      {pills.length ? (
        <div className="ofc-finder-active" aria-label="Active filters">
          <span>Filtered by</span>
          <ul>
            {pills.map((pill) => (
              <li key={pill.key}>
                <Link href={pill.href} scroll={false} aria-label={`Remove filter ${pill.label}`}>
                  {pill.label} <i className="fa-solid fa-xmark" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          {pills.length > 1 ? <Link className="ofc-finder-clear" href={go({ q: "", focus: "" })} scroll={false}>Clear all</Link> : null}
        </div>
      ) : null}
    </div>
  );
}
