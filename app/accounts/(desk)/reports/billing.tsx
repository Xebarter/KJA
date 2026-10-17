"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { amount, percent, ugx, ugxShort } from "@/lib/accounts-format";

export type BillCharge = { name: string; kind: string; icon: string; amount: number; count: number };
export type BillDiscount = { label: string; amount: number; count: number };
export type BillGap = { code: string; name: string; notBilled: number; onRoll: number; href: string };
export type BillLink = { href: string; label: string; count: number; amount: number; quiet?: boolean };

const count = (value: number) => value.toLocaleString("en-GB");

export function BillingBoard({
  coverage,
  charges,
  discounts,
  discountTotal,
  issuedTotal,
  linesLoaded,
  feesCsv,
  discountsCsv,
  links,
}: {
  coverage: {
    periodLabel: string;
    onRoll: number;
    billedPupils: number;
    notBilled: number;
    draftsWaiting: number;
    generateHref: string;
    gaps: BillGap[];
  } | null;
  charges: BillCharge[];
  discounts: BillDiscount[];
  discountTotal: number;
  issuedTotal: number;
  linesLoaded: boolean;
  feesCsv: string;
  discountsCsv: string;
  links: BillLink[];
}) {
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const chargeTotal = charges.reduce((total, row) => total + row.amount, 0);
  const kinds = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of charges) totals.set(row.kind, (totals.get(row.kind) ?? 0) + row.amount);
    return [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label]) => label);
  }, [charges]);
  const needle = query.trim().toLowerCase();
  const visible = charges.filter((row) => (kind === "all" || row.kind === kind) && (!needle || row.name.toLowerCase().includes(needle)));
  const filtering = kind !== "all" || needle.length > 0;
  const covered = coverage && coverage.onRoll > 0 ? Math.round((coverage.billedPupils / coverage.onRoll) * 100) : 0;

  return (
    <div className="acr-bill">
      {coverage ? (
        <article className="acr-card acr-bill-cover">
          <header>
            <div>
              <h3>Who has a bill</h3>
              <p>
                {coverage.onRoll
                  ? `${count(coverage.billedPupils)} of ${count(coverage.onRoll)} active pupils have an issued invoice for ${coverage.periodLabel}.`
                  : `No active pupils on the roll for ${coverage.periodLabel}.`}
              </p>
            </div>
            {coverage.notBilled ? (
              <Link className="acr-bill-go no-print" href={coverage.generateHref}>
                <i className="fa-solid fa-file-circle-plus" aria-hidden="true" /> Generate invoices
              </Link>
            ) : null}
          </header>
          {coverage.onRoll ? (
            <>
              <div className="acr-cover">
                <span className={`acr-cover-bar${coverage.notBilled ? "" : " is-done"}`} role="progressbar" aria-valuenow={covered} aria-valuemin={0} aria-valuemax={100} aria-label="Pupils with an issued invoice">
                  <span style={{ width: `${covered}%` }} />
                </span>
                <strong>{covered}%</strong>
              </div>
              {coverage.notBilled ? (
                <p className="acr-bill-line">
                  {count(coverage.notBilled)} still {coverage.notBilled === 1 ? "needs" : "need"} an invoice
                  {coverage.draftsWaiting ? `, and ${count(coverage.draftsWaiting)} already ${coverage.draftsWaiting === 1 ? "has" : "have"} a draft` : ""}.
                </p>
              ) : (
                <p className="acr-bill-line">Every active pupil has an issued invoice.</p>
              )}
              {coverage.gaps.length ? (
                <ul className="acr-bill-gaps">
                  {coverage.gaps.map((gap) => {
                    const body = (<><strong>{gap.code || gap.name}</strong><small>{count(gap.notBilled)} of {count(gap.onRoll)} not billed</small></>);
                    return <li key={gap.code || gap.name}>{gap.href ? <Link href={gap.href}>{body}</Link> : <div>{body}</div>}</li>;
                  })}
                </ul>
              ) : null}
            </>
          ) : null}
        </article>
      ) : null}

      <div className="acr-grid">
        <article className="acr-card">
          <header>
            <div>
              <h3>The bill</h3>
              <p>Issued invoices only. Drafts and voids stay off this total.</p>
            </div>
            {linesLoaded && discountTotal ? (
              <a className="acr-csv no-print" href={discountsCsv}><i className="fa-solid fa-download" aria-hidden="true" /> Discounts</a>
            ) : null}
          </header>
          <dl className="acr-books">
            {linesLoaded ? <div><dt>Charges</dt><dd>{amount(chargeTotal)}</dd></div> : null}
            {linesLoaded && discountTotal ? (
              <div className="is-quiet">
                <dt>{discounts.length === 1 ? discounts[0].label : "Discounts"}</dt>
                <dd>
                  {amount(discountTotal)}
                  {discounts.length === 1 ? <small>{count(discounts[0].count)} {discounts[0].count === 1 ? "line" : "lines"}</small> : null}
                </dd>
              </div>
            ) : null}
            {linesLoaded && discounts.length > 1
              ? discounts.map((row) => (
                <div className="is-sub" key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{amount(row.amount)}<small>{count(row.count)} lines</small></dd>
                </div>
              ))
              : null}
            <div className="is-net"><dt>Issued</dt><dd>{amount(issuedTotal)}</dd></div>
          </dl>
          {linesLoaded && discountTotal && Math.abs(chargeTotal - discountTotal - issuedTotal) > 1 ? (
            <p className="acr-note">Issued is the invoice total on the books. Charges and discounts are the lines on those invoices.</p>
          ) : null}
        </article>

        <article className="acr-card">
          <header>
            <div>
              <h3>Open in the register</h3>
              <p>Term bills, extras, and anything still in draft or void.</p>
            </div>
          </header>
          {links.length ? (
            <ul className="acr-bill-links">
              {links.map((link) => (
                <li key={link.label} className={link.quiet ? "is-quiet" : ""}>
                  <Link href={link.href}>
                    <span><strong>{link.label}</strong><small>{count(link.count)} {link.count === 1 ? "invoice" : "invoices"}</small></span>
                    <strong title={ugx(link.amount)}>{ugxShort(link.amount)}</strong>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="acr-empty">No invoices in this period.</p>
          )}
        </article>
      </div>

      <article className="acr-card acr-bill-charges">
        <header>
          <div>
            <h3>What the bills are for</h3>
            <p>{linesLoaded ? "Charges on issued invoices." : "Fee lines could not be loaded."}</p>
          </div>
          {linesLoaded && charges.length ? (
            <a className="acr-csv no-print" href={feesCsv}><i className="fa-solid fa-download" aria-hidden="true" /> Download</a>
          ) : null}
        </header>
        {charges.length ? (
          <>
            <div className="acr-bill-tools no-print">
              {kinds.length > 1 ? (
                <div className="acr-bill-kinds" role="group" aria-label="Charge group">
                  <button type="button" className={kind === "all" ? "is-on" : ""} aria-pressed={kind === "all"} onClick={() => setKind("all")}>All</button>
                  {kinds.map((label) => (
                    <button key={label} type="button" className={kind === label ? "is-on" : ""} aria-pressed={kind === label} onClick={() => setKind(label)}>{label}</button>
                  ))}
                </div>
              ) : null}
              {charges.length > 6 ? (
                <label className="acr-bill-find">
                  <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                  <span className="visually-hidden">Find a charge</span>
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find an item" />
                </label>
              ) : null}
              {filtering ? <p aria-live="polite">{count(visible.length)} of {count(charges.length)}</p> : null}
            </div>
            {visible.length ? (
              <ul className="acr-rows">
                {charges.map((row) => {
                  const on = (kind === "all" || row.kind === kind) && (!needle || row.name.toLowerCase().includes(needle));
                  return (
                    <li key={row.name} className={on ? "" : "is-off"}>
                      <div className="acr-row">
                        <span className="acr-row-icon"><i className={`fa-solid ${row.icon}`} aria-hidden="true" /></span>
                        <span className="acr-row-name">
                          <strong>{row.name}</strong>
                          <small>{kind === "all" ? `${row.kind} · ` : ""}{count(row.count)} lines</small>
                        </span>
                        <Meter value={row.amount} max={chargeTotal || row.amount} label={`${row.name} share of charges`} />
                        <strong>{ugxShort(row.amount)}</strong>
                        <span className="acr-share">{percent(row.amount, chargeTotal)}%</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="acr-empty no-print">Nothing matches.</p>
            )}
          </>
        ) : (
          <p className="acr-empty">{linesLoaded ? "No charges on issued invoices in this period." : "Fee lines could not be loaded."}</p>
        )}
      </article>
    </div>
  );
}

function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
  return (
    <span className="acr-meter" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}
