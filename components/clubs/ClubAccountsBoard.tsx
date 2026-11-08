import Link from "next/link";
import { ugxShort } from "@/lib/accounts-format";
import type { ClubAccountsSummary } from "@/lib/club-accounts";
import { CLUBS_BASE } from "@/lib/clubs-nav";

export function ClubAccountsKpis({
  summary,
  termLabel,
  className = "",
}: {
  summary: ClubAccountsSummary;
  termLabel?: string | null;
  className?: string;
}) {
  const term = termLabel || "This term";
  return (
    <div className={`clubs-ov-kpis clubs-acc-kpis${className ? ` ${className}` : ""}`}>
      <div className={`clubs-ov-kpi${summary.expected ? "" : ""}`}>
        <span>Expected</span>
        <strong>
          <small>UGX</small>
          {ugxShort(summary.expected)}
        </strong>
        <small>
          {summary.consentCount} {summary.consentCount === 1 ? "consent" : "consents"} · {term}
        </small>
      </div>
      <div className={`clubs-ov-kpi${summary.collected ? " is-ok" : ""}`}>
        <span>Collected</span>
        <strong>
          <small>UGX</small>
          {ugxShort(summary.collected)}
        </strong>
        <small>
          {summary.paidCount} paid · {summary.receiptCount} {summary.receiptCount === 1 ? "receipt" : "receipts"}
        </small>
      </div>
      <div className={`clubs-ov-kpi${summary.expenditure ? " is-warn" : ""}`}>
        <span>Expenditure</span>
        <strong>
          <small>UGX</small>
          {ugxShort(summary.expenditure)}
        </strong>
        <small>
          {summary.expenseCount} {summary.expenseCount === 1 ? "expense" : "expenses"}
        </small>
      </div>
      <div className={`clubs-ov-kpi${summary.balance >= 0 && summary.collected ? " is-ok" : summary.balance < 0 ? " is-danger" : ""}`}>
        <span>Balance</span>
        <strong>
          <small>UGX</small>
          {ugxShort(summary.balance)}
        </strong>
        <small>Collected minus expenditure</small>
      </div>
    </div>
  );
}

export function ClubAccountsCard({
  summary,
  termLabel,
  clubId,
  printHref,
  expenseHref,
  accountsHref,
  title = "Club Accounts",
  description = "Expected fees, collections, club spending, and remaining balance.",
}: {
  summary: ClubAccountsSummary;
  termLabel?: string | null;
  clubId?: string;
  printHref: string;
  expenseHref: string;
  accountsHref?: string;
  title?: string;
  description?: string;
}) {
  const openHref =
    accountsHref ||
    (clubId ? `${CLUBS_BASE}/accounts?club=${clubId}&view=expenses` : `${CLUBS_BASE}/accounts`);

  return (
    <section className="clubs-detail-panel clubs-acc-card" aria-label={title}>
      <header>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="clubs-acc-card-actions">
          <Link className="clubs-ov-link" href={expenseHref}>
            Register expense <i className="fa-solid fa-plus" aria-hidden="true" />
          </Link>
          <a className="clubs-ov-link" href={printHref} target="_blank" rel="noreferrer">
            Print PDF <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
          </a>
          <Link className="clubs-ov-link" href={openHref}>
            Open Accounts <i className="fa-solid fa-chevron-right" aria-hidden="true" />
          </Link>
        </div>
      </header>
      <ClubAccountsKpis summary={summary} termLabel={termLabel} className="clubs-acc-card-kpis" />
      <p className="clubs-detail-note clubs-acc-note">
        Fees land on Accounts desk; club expenses stay here and do not hit that ledger.
      </p>
    </section>
  );
}
