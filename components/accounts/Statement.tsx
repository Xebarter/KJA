import Link from "next/link";
import { ACCOUNTS_BASE, amount, day, type StatementEntry } from "@/lib/accounts-format";

/** Charges and payments in date order with a running balance, newest at the bottom like a bank statement. */
export function Statement({ entries, showLinks = true, emptyText = "Nothing billed or paid yet." }: {
  entries: StatementEntry[];
  showLinks?: boolean;
  emptyText?: string;
}) {
  if (!entries.length) return <p className="app-muted acc-empty-line">{emptyText}</p>;
  const charged = entries.reduce((sum, entry) => sum + entry.charge, 0);
  const paid = entries.reduce((sum, entry) => sum + entry.credit, 0);
  const closing = entries[entries.length - 1].balance;
  return (
    <div className="ofc-table-scroll">
      <table className="app-table acc-table acc-statement">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Details</th>
            <th scope="col" className="is-num">Charges</th>
            <th scope="col" className="is-num">Paid</th>
            <th scope="col" className="is-num">Balance</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const link = `${ACCOUNTS_BASE}/${entry.kind === "invoice" ? "invoices" : "payments"}/${entry.id}`;
            return (
              <tr key={`${entry.kind}-${entry.id}`} className={`is-${entry.kind}`}>
                <td data-label="Date">{day(entry.date)}</td>
                <td data-label="Details">
                  <span className={`acc-statement-icon is-${entry.kind}`} aria-hidden="true">
                    <i className={`fa-solid ${entry.kind === "invoice" ? "fa-file-invoice" : "fa-receipt"}`} />
                  </span>
                  <span className="acc-statement-text">
                    {entry.description}
                    <small>{showLinks ? <Link href={link}>{entry.ref}</Link> : entry.ref}</small>
                  </span>
                </td>
                <td data-label="Charges" className="is-num">{entry.charge ? amount(entry.charge) : ""}</td>
                <td data-label="Paid" className="is-num acc-paid-cell">{entry.credit ? amount(entry.credit) : ""}</td>
                <td data-label="Balance" className={`is-num${entry.balance > 0 ? " acc-owing" : ""}`}>{amount(entry.balance)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="ofc-total-row">
            <th scope="row" colSpan={2}>{closing < 0 ? "Credit on account" : "Balance due"}</th>
            <td className="is-num">{amount(charged)}</td>
            <td className="is-num">{amount(paid)}</td>
            <td className={`is-num${closing > 0 ? " acc-owing" : ""}`}><strong>{amount(closing)}</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
