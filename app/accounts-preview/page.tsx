import Link from "next/link";
import { Chips, InvoiceStatus, Progress } from "@/components/accounts/ui";
import "../admin/admin.css";
import "../admin/(panel)/applications/applications.css";
import "../admissions_office/office.css";
import "../accounts/accounts.css";
import "../accounts/(desk)/overview.css";
import "../accounts/(desk)/invoices/invoices.css";

const rows = [
  { no: "INV-2401", name: "Amina Nakato", initials: "AN", cls: "P4", num: "KJA-1042", total: "1,850,000", due: "14 Oct 2026", late: "1 day overdue", tone: "is-late", paid: 950000, billed: 1850000, owing: "900,000 still due", status: "issued", kind: "Term", extra: false, when: "12 Aug 2026" },
  { no: "INV-2402", name: "Daniel Okello", initials: "DO", cls: "P2", num: "KJA-0988", total: "1,450,000", due: "14 Oct 2026", late: "", tone: "", paid: 1450000, billed: 1450000, owing: "", status: "issued", kind: "Term", extra: false, when: "12 Aug 2026" },
  { no: "INV-2408", name: "Grace Namukasa", initials: "GN", cls: "C3", num: "KJA-1210", total: "180,000", due: "—", late: "", tone: "is-draft", paid: 0, billed: 0, owing: "", status: "draft", kind: "Extra", extra: true, when: "10 Oct 2026" },
  { no: "INV-2390", name: "Joel Ssemakula", initials: "JS", cls: "P6", num: "KJA-0771", total: "1,650,000", due: "—", late: "", tone: "is-void", paid: 0, billed: 0, owing: "", status: "void", kind: "Term", extra: false, when: "12 Aug 2026" },
];

export default function InvoicesPreview() {
  return (
    <div className="kja-admin kja-office kja-accounts" style={{ minHeight: "100vh", background: "#efe8dc" }}>
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "1.5rem 1.25rem 3rem" }}>
        <div className="app-page ofc-page acc-page aov-page inv-page">
          <header className="aov-head">
            <div>
              <p className="aov-kicker"><i className="fa-solid fa-file-invoice" aria-hidden="true" /> Billing</p>
              <h1>Invoices</h1>
              <p className="aov-lede">
                <span className="aov-term">Term 3</span>
                <span>Term bills and extra charges for this term.</span>
              </p>
            </div>
            <div className="aov-actions">
              <Link className="aov-btn is-primary" href="/accounts/invoices/generate"><i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" /> Generate term invoices</Link>
              <Link className="aov-btn" href="/accounts/students"><i className="fa-solid fa-plus" aria-hidden="true" /> Bill one pupil</Link>
            </div>
          </header>

          <section className="inv-snap" aria-label="Term 3 billing">
            <div className="inv-snap-body">
              <div className="inv-collect">
                <span className="aov-rate" title="71% of issued invoices collected">
                  <svg viewBox="0 0 36 36" aria-hidden="true">
                    <circle cx="18" cy="18" r="15" />
                    <circle className="is-value" cx="18" cy="18" r="15" pathLength={100} style={{ "--aov-rate": 71 } as React.CSSProperties} />
                  </svg>
                  <em>71%</em>
                </span>
                <div>
                  <span>Collected</span>
                  <strong><small>UGX</small> 132M</strong>
                  <p>54M still to collect, of 186M issued</p>
                </div>
              </div>
              <ul className="inv-metrics">
                <li><Link className="is-on" href="#issued" aria-current="true"><span>Issued</span><strong>412</strong><small>186M</small></Link></li>
                <li><Link className="is-warn" href="#draft"><span>Drafts</span><strong>12</strong><small>8.4M waiting</small></Link></li>
                <li><Link href="#void"><span>Void</span><strong>3</strong><small>Cancelled</small></Link></li>
              </ul>
            </div>
            <div className="inv-draft">
              <i className="fa-regular fa-file" aria-hidden="true" />
              <p><strong>12 drafts</strong> for Term 3, totalling UGX 8,400,000. Issue them to put them on balances and in the parent portal.</p>
              <div className="inv-draft-actions">
                <Link className="aov-btn" href="#draft">Review</Link>
                <button className="aov-btn is-primary" type="button"><i className="fa-solid fa-paper-plane" aria-hidden="true" /> Issue all</button>
              </div>
            </div>
          </section>

          <section className="ofc-register">
            <form className="ofc-finder" aria-label="Filter invoices">
              <div className="ofc-finder-top">
                <label className="ofc-finder-search">
                  <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                  <span className="visually-hidden">Search invoices</span>
                  <input type="search" name="q" defaultValue="Nakato" placeholder="Pupil name or invoice number" />
                </label>
                <label className="ofc-finder-field is-inline"><span>Term</span><select defaultValue=""><option>Term 3 (current)</option></select></label>
                <label className="ofc-finder-field is-inline"><span>Class</span><select defaultValue="P4"><option>P4 · Primary Four</option></select></label>
                <label className="ofc-finder-field is-inline"><span>Type</span><select defaultValue=""><option>Term and extra</option></select></label>
                <button className="inv-search" type="button">Search</button>
              </div>
              <div className="ofc-finder-active">
                <span>Showing</span>
                <ul>
                  <li><Link href="#clear">“Nakato” <i className="fa-solid fa-xmark" aria-hidden="true" /></Link></li>
                  <li><Link href="#clear">Primary Four <i className="fa-solid fa-xmark" aria-hidden="true" /></Link></li>
                </ul>
                <Link className="ofc-finder-clear" href="#clear">Clear</Link>
              </div>
            </form>
            <header className="inv-results">
              <div>
                <h2>4 matches</h2>
                <p>Term 3 · Primary Four · matching “Nakato”</p>
              </div>
              <Chips
                label="Invoice status"
                items={[
                  { href: "#all", label: "All", count: 427, on: true },
                  { href: "#issued", label: "Issued", count: 412, on: false },
                  { href: "#draft", label: "Drafts", count: 12, on: false },
                  { href: "#void", label: "Void", count: 3, on: false },
                ]}
              />
            </header>
            <div className="ofc-table-scroll">
              <table className="app-table acc-table inv-table">
                <thead>
                  <tr>
                    <th scope="col">Invoice</th>
                    <th scope="col">Pupil</th>
                    <th scope="col">Due</th>
                    <th scope="col" className="is-num">Amount</th>
                    <th scope="col">Account</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.no} className={row.tone}>
                      <td data-label="Invoice" className="inv-doc">
                        <Link className="inv-no" href="#">{row.no}</Link>
                        <small>
                          <span className={`inv-kind${row.extra ? " is-extra" : ""}`}>{row.kind}</span>
                          {row.when}
                        </small>
                      </td>
                      <td data-label="Pupil" className="inv-who">
                        <span className="inv-avatar" aria-hidden="true">{row.initials}</span>
                        <span>
                          <Link className="inv-name" href="#">{row.name}</Link>
                          <small>{row.cls} · {row.num}</small>
                        </span>
                      </td>
                      <td data-label="Due" className={`inv-due${row.late ? " is-late" : ""}`}>
                        {row.status === "void" ? <span className="app-muted">–</span> : row.due}
                        {row.late ? <small className="inv-late">{row.late}</small> : null}
                      </td>
                      <td data-label="Amount" className="is-num"><strong className={row.status === "void" ? "is-void" : ""}>{row.total}</strong></td>
                      <td data-label="Account" className="inv-account">
                        {row.status === "draft" ? <span className="app-muted">Not issued yet</span>
                          : row.status === "void" ? <span className="app-muted">Voided</span>
                          : row.owing ? (
                            <>
                              <Progress value={row.paid} max={row.billed} label={`${row.name} paid this term`} />
                              <small className="acc-owing">{row.owing}</small>
                            </>
                          ) : <span className="acc-paid"><i className="fa-solid fa-circle-check" aria-hidden="true" /> Paid</span>}
                      </td>
                      <td data-label="Status"><InvoiceStatus status={row.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
