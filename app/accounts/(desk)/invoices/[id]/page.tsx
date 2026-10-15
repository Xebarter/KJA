import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { VoidButton } from "@/components/accounts/client";
import { AddLineForm } from "@/components/accounts/InvoiceTools";
import { InvoiceStatus, MethodTag, Money, Progress, notReady } from "@/components/accounts/ui";
import { ActionButton } from "@/components/office/client";
import { Panel } from "@/components/office/ui";
import { issueInvoices, removeInvoiceLine, voidInvoice } from "../actions";
import { ACCOUNTS_BASE, requireAccounts } from "@/lib/accounts";
import { amount, dateTime, day, overdueText, ugx, type AccountActivity, type Invoice, type InvoiceLine, type Payment } from "@/lib/accounts-format";
import { loadPeople } from "@/lib/admin-applications";
import { className, isUuid } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  if (!supabaseConfigured()) return notReady("Invoice", { kind: "config" });
  const auth = await requireAccounts();
  if ("error" in auth) return notReady("Invoice", { kind: "auth", message: auth.error });
  const { supabase } = auth;
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const { data: invoice, error } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle<Invoice>();
  if (error) return notReady("Invoice", { kind: "schema", message: error.message });
  if (!invoice) notFound();

  const [{ data: lineRows }, { data: student }, { data: term }, { data: paymentRows }, { data: others }, { data: activityRows }] = await Promise.all([
    supabase.from("invoice_lines").select("*").eq("invoice_id", id).order("position").order("description"),
    supabase.from("students").select("id, full_name, student_number, class_code, stream, campus, status, family_id, families(family_code, mailing_name)").eq("id", invoice.student_id).maybeSingle(),
    supabase.from("fee_terms").select("id, label, due_on").eq("id", invoice.term_id).maybeSingle(),
    supabase.from("payments").select("*").eq("student_id", invoice.student_id).eq("term_id", invoice.term_id).order("paid_on", { ascending: false }),
    supabase.from("invoices").select("id, invoice_no, kind, status, total").eq("student_id", invoice.student_id).eq("term_id", invoice.term_id).neq("id", id).order("issued_on"),
    supabase.from("account_activity").select("*").eq("entity_id", id).order("created_at", { ascending: false }).limit(20),
  ]);
  const lines = (lineRows || []) as InvoiceLine[];
  const payments = (paymentRows || []) as Payment[];
  const valid = payments.filter((payment) => !payment.voided_at);
  const otherInvoices = (others || []) as { id: string; invoice_no: string; kind: string; status: string; total: number }[];
  const activity = (activityRows || []) as AccountActivity[];
  const people = await loadPeople(supabase, [invoice.created_by, invoice.voided_by, ...activity.map((row) => row.actor_id)]);
  const family = (student?.families ?? null) as unknown as { family_code: string | null; mailing_name: string | null } | null;

  const charges = lines.filter((line) => line.kind === "charge").reduce((sum, line) => sum + line.amount, 0);
  const discounts = lines.filter((line) => line.kind === "discount").reduce((sum, line) => sum + line.amount, 0);
  const termBilled = (invoice.status === "issued" ? invoice.total : 0) + otherInvoices.filter((row) => row.status === "issued").reduce((sum, row) => sum + row.total, 0);
  const termPaid = valid.reduce((sum, payment) => sum + payment.amount, 0);
  const termBalance = termBilled - termPaid;
  const isDraft = invoice.status === "draft";
  const isVoid = invoice.status === "void";
  const studentHref = `${ACCOUNTS_BASE}/students/${invoice.student_id}`;
  const pdf = `${ACCOUNTS_BASE}/invoices/${id}/pdf`;

  return (
    <div className="app-page ofc-page acc-page">
      <p className="acc-crumbs">
        <Link href={`${ACCOUNTS_BASE}/invoices`}><i className="fa-solid fa-arrow-left" aria-hidden="true" /> Invoices</Link>
        <span aria-hidden="true">/</span>
        <Link href={studentHref}>{student?.full_name ?? "Pupil"}</Link>
      </p>
      <PageHeader
        kicker={invoice.kind === "term" ? "Term invoice" : "Extra charges"}
        icon="fa-file-invoice"
        title={invoice.invoice_no}
        description={
          <>
            {student?.full_name ?? "Unknown pupil"} · {term?.label ?? "Term"} · issued {day(invoice.issued_on)}
            {invoice.due_on && !isVoid ? <> · due {day(invoice.due_on)}</> : null}
          </>
        }
        actions={
          <>
            <a className="admin-hero-btn" href={pdf} target="_blank" rel="noreferrer"><i className="fa-solid fa-file-pdf" aria-hidden="true" /> View PDF</a>
            <a className="admin-hero-btn" href={`${pdf}?download=1`}><i className="fa-solid fa-download" aria-hidden="true" /> Download</a>
            {!isVoid ? (
              <Link className="admin-hero-btn is-primary" href={`${ACCOUNTS_BASE}/payments/new?student=${invoice.student_id}&term=${invoice.term_id}`}>
                <i className="fa-solid fa-hand-holding-dollar" aria-hidden="true" /> Record payment
              </Link>
            ) : null}
          </>
        }
      />
      <div className="acc-hero-figures">
        <div className="acc-stat">
          <span className="acc-stat-top"><span>Status</span><i className="fa-solid fa-flag" aria-hidden="true" /></span>
          <strong><InvoiceStatus status={invoice.status} /></strong>
        </div>
        <div className="acc-stat">
          <span className="acc-stat-top"><span>Invoice total</span><i className="fa-solid fa-file-invoice" aria-hidden="true" /></span>
          <strong>{ugx(invoice.total)}</strong>
        </div>
        {!isVoid ? (
          <div className={`acc-stat${termBalance > 0 ? " is-bad" : " is-good"}`}>
            <span className="acc-stat-top"><span>Term balance</span><i className="fa-solid fa-scale-balanced" aria-hidden="true" /></span>
            <strong>{termBalance > 0 ? ugx(termBalance) : termBalance < 0 ? `${ugx(-termBalance)} credit` : "Paid"}</strong>
            {termBalance > 0 && invoice.due_on ? <small>{overdueText(invoice.due_on)}</small> : null}
          </div>
        ) : null}
      </div>

      {isDraft ? (
        <div className="acc-banner is-warn">
          <i className="fa-regular fa-file" aria-hidden="true" />
          <p><strong>This is a draft.</strong> Check the lines, then issue it. Drafts don&apos;t count towards the pupil&apos;s balance and parents can&apos;t see them.</p>
          <ActionButton action={issueInvoices.bind(null, [id])} label="Issue invoice" busyLabel="Issuing…" icon="fa-paper-plane" className="admin-btn" />
        </div>
      ) : null}
      {isVoid ? (
        <div className="acc-banner is-danger">
          <i className="fa-solid fa-ban" aria-hidden="true" />
          <p>
            <strong>Voided {day(invoice.voided_at)}{invoice.voided_by ? ` by ${people.get(invoice.voided_by) ?? "a teammate"}` : ""}.</strong>{" "}
            {invoice.void_reason}
          </p>
        </div>
      ) : null}

      <div className="dash-grid acc-detail-grid">
        <div className="dash-col">
          <Panel title="Invoice lines" description={isDraft ? "You can still add or remove lines while this is a draft." : "Issued invoices can't be edited. Void and re-bill, or add an extra invoice."}>
            <div className="ofc-table-scroll">
              <table className="app-table acc-table acc-lines">
                <thead>
                  <tr>
                    <th scope="col">Item</th>
                    <th scope="col" className="is-num">Amount (UGX)</th>
                    {isDraft ? <th scope="col"><span className="visually-hidden">Remove</span></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id} className={line.kind === "discount" ? "is-discount" : ""}>
                      <td data-label="Item">
                        {line.kind === "discount" ? <i className="fa-solid fa-tag" aria-hidden="true" /> : null} {line.description}
                      </td>
                      <td data-label="Amount" className="is-num">{amount(line.amount)}</td>
                      {isDraft ? (
                        <td className="is-action">
                          <ActionButton action={removeInvoiceLine.bind(null, line.id)} label="Remove" icon="fa-xmark" className="acc-row-btn is-danger" confirm={`Remove "${line.description}"?`} />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                  {!lines.length ? (
                    <tr><td colSpan={isDraft ? 3 : 2} className="app-muted">No lines yet.</td></tr>
                  ) : null}
                </tbody>
                <tfoot>
                  {discounts ? (
                    <>
                      <tr><th scope="row">Charges</th><td className="is-num">{amount(charges)}</td>{isDraft ? <td /> : null}</tr>
                      <tr><th scope="row">Discounts</th><td className="is-num">{amount(discounts)}</td>{isDraft ? <td /> : null}</tr>
                    </>
                  ) : null}
                  <tr className="ofc-total-row"><th scope="row">Total</th><td className="is-num"><strong>{amount(invoice.total)}</strong></td>{isDraft ? <td /> : null}</tr>
                </tfoot>
              </table>
            </div>
            {isDraft ? <AddLineForm invoiceId={id} /> : null}
          </Panel>

          <Panel
            title={`Payments for ${term?.label ?? "this term"}`}
            description="Payments are recorded against the term, so they cover every invoice the pupil has that term."
          >
            {payments.length ? (
              <ul className="acc-feed">
                {payments.map((payment) => (
                  <li key={payment.id} className={payment.voided_at ? "is-void" : ""}>
                    <span className="acc-feed-icon is-pay"><i className="fa-solid fa-receipt" aria-hidden="true" /></span>
                    <div>
                      <Link href={`${ACCOUNTS_BASE}/payments/${payment.id}`}><strong>{payment.receipt_no}</strong></Link>
                      <small>{day(payment.paid_on)} · <MethodTag method={payment.method} />{payment.voided_at ? " · void" : ""}</small>
                    </div>
                    <Money value={payment.amount} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="app-muted acc-empty-line">No payments yet this term.</p>
            )}
          </Panel>
        </div>

        <div className="dash-col">
          <Panel title="Term account" description={term?.label}>
            <dl className="acc-facts">
              <div><dt>Billed this term</dt><dd>{ugx(termBilled)}</dd></div>
              <div><dt>Paid this term</dt><dd>{ugx(termPaid)}</dd></div>
              <div className="is-total"><dt>{termBalance < 0 ? "Credit" : "Balance"}</dt><dd><Money value={termBalance} tone="auto" /></dd></div>
            </dl>
            <Progress value={termPaid} max={termBilled} label="Share of this term's fees paid" />
            {otherInvoices.length ? (
              <>
                <h3 className="acc-mini-head">Other invoices this term</h3>
                <ul className="ofc-list acc-mini-list">
                  {otherInvoices.map((row) => (
                    <li key={row.id}>
                      <Link href={`${ACCOUNTS_BASE}/invoices/${row.id}`}>{row.invoice_no}</Link>
                      <span>{row.kind === "term" ? "Term bill" : "Extra"} · <InvoiceStatus status={row.status} /></span>
                      <strong>{amount(row.total)}</strong>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </Panel>

          <Panel title="Pupil" action={{ href: studentHref, label: "Fee account" }}>
            <dl className="acc-facts">
              <div><dt>Name</dt><dd><Link href={studentHref}>{student?.full_name ?? "Unknown"}</Link></dd></div>
              <div><dt>Student no.</dt><dd>{student?.student_number ?? "–"}</dd></div>
              <div><dt>Class</dt><dd>{className(invoice.class_code ?? student?.class_code) || "–"}{student?.stream ? ` ${student.stream}` : ""}</dd></div>
              {invoice.campus || student?.campus ? <div><dt>Campus</dt><dd>{invoice.campus || student?.campus}</dd></div> : null}
              {family ? (
                <div>
                  <dt>Family</dt>
                  <dd>{student?.family_id ? <Link href={`${ACCOUNTS_BASE}/families/${student.family_id}`}>{family.mailing_name || family.family_code}</Link> : "–"}</dd>
                </div>
              ) : null}
            </dl>
          </Panel>

          <Panel title="History">
            <ul className="acc-feed is-compact">
              <li>
                <span className="acc-feed-icon"><i className="fa-solid fa-file-circle-plus" aria-hidden="true" /></span>
                <div>
                  <strong>Created</strong>
                  <small>{dateTime(invoice.created_at)}{invoice.created_by ? ` · ${people.get(invoice.created_by) ?? "Teammate"}` : " · term billing"}</small>
                </div>
              </li>
              {activity.map((row) => (
                <li key={row.id}>
                  <span className={`acc-feed-icon is-${row.kind}`}><i className={`fa-solid ${row.kind === "void" ? "fa-ban" : "fa-pen"}`} aria-hidden="true" /></span>
                  <div>
                    <strong>{row.body}</strong>
                    <small>{dateTime(row.created_at)}{row.actor_id ? ` · ${people.get(row.actor_id) ?? "Teammate"}` : ""}</small>
                  </div>
                </li>
              ))}
            </ul>
            {invoice.notes ? <p className="acc-note"><i className="fa-regular fa-note-sticky" aria-hidden="true" /> {invoice.notes}</p> : null}
            {!isVoid ? (
              <div className="acc-panel-actions">
                <VoidButton action={voidInvoice.bind(null, id)} what="invoice" label="Void invoice" />
              </div>
            ) : null}
          </Panel>
        </div>
      </div>
    </div>
  );
}
