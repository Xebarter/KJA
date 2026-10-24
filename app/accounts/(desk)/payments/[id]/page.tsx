import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { VoidButton } from "@/components/accounts/client";
import { MethodTag, Money, Progress, notReady } from "@/components/accounts/ui";
import { Panel } from "@/components/office/ui";
import { voidPayment } from "../actions";
import { ACCOUNTS_BASE, requireAccounts } from "@/lib/accounts";
import { dateTime, day, ugx, type AccountActivity, type Payment } from "@/lib/accounts-format";
import { loadPeople } from "@/lib/admin-applications";
import { className, isUuid } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";
import "../payments.css";

export const metadata = { title: "Payment" };

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  if (!supabaseConfigured()) return notReady("Payment", { kind: "config" });
  const auth = await requireAccounts();
  if ("error" in auth) return notReady("Payment", { kind: "auth", message: auth.error });
  const { supabase } = auth;
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const { data: payment, error } = await supabase.from("payments").select("*").eq("id", id).maybeSingle<Payment>();
  if (error) return notReady("Payment", { kind: "schema", message: error.message });
  if (!payment) notFound();

  const [{ data: student }, { data: term }, { data: balance }, { data: activityRows }, { data: invoice }] = await Promise.all([
    supabase.from("students").select("id, full_name, student_number, class_code, stream, campus, family_id, families(family_code, mailing_name)").eq("id", payment.student_id).maybeSingle(),
    supabase.from("fee_terms").select("id, label").eq("id", payment.term_id).maybeSingle(),
    supabase.from("student_term_balances").select("invoiced, paid, balance").eq("student_id", payment.student_id).eq("term_id", payment.term_id).maybeSingle(),
    supabase.from("account_activity").select("*").eq("entity_id", id).order("created_at", { ascending: false }).limit(20),
    payment.invoice_id ? supabase.from("invoices").select("id, invoice_no").eq("id", payment.invoice_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const activity = (activityRows || []) as AccountActivity[];
  const people = await loadPeople(supabase, [payment.received_by, payment.voided_by, ...activity.map((row) => row.actor_id)]);
  const family = (student?.families ?? null) as unknown as { family_code: string | null; mailing_name: string | null } | null;
  const voided = Boolean(payment.voided_at);
  const batchId = payment.batch_id || null;
  const receipt = batchId
    ? `${ACCOUNTS_BASE}/payments/batch/${batchId}/receipt`
    : `${ACCOUNTS_BASE}/payments/${id}/receipt`;
  const studentHref = `${ACCOUNTS_BASE}/students/${payment.student_id}`;
  const billed = Number(balance?.invoiced ?? 0);
  const paid = Number(balance?.paid ?? 0);
  const left = Number(balance?.balance ?? 0);

  return (
    <div className="app-page ofc-page acc-page pay-page pay-detail-page">
      <p className="acc-crumbs">
        <Link href={`${ACCOUNTS_BASE}/payments`}><i className="fa-solid fa-arrow-left" aria-hidden="true" /> Payments</Link>
        <span aria-hidden="true">/</span>
        <Link href={studentHref}>{student?.full_name ?? "Pupil"}</Link>
      </p>
      <PageHeader
        kicker={voided ? "Voided receipt" : batchId ? "Family allocation" : "Receipt"}
        icon="fa-receipt"
        title={payment.receipt_no}
        description={<>{ugx(payment.amount)} from {payment.payer_name || family?.mailing_name || "the family"} for {student?.full_name ?? "a pupil"} · {day(payment.paid_on)}</>}
        actions={
          <>
            <a className="admin-hero-btn is-primary" href={receipt} target="_blank" rel="noreferrer"><i className="fa-solid fa-print" aria-hidden="true" /> Print {batchId ? "family receipt" : "receipt"}</a>
            <a className="admin-hero-btn" href={`${receipt}?download=1`}><i className="fa-solid fa-download" aria-hidden="true" /> Download</a>
            {batchId ? <Link className="admin-hero-btn" href={`${ACCOUNTS_BASE}/payments/batch/${batchId}`}><i className="fa-solid fa-people-roof" aria-hidden="true" /> Family receipt</Link> : null}
            <Link className="admin-hero-btn" href={`${ACCOUNTS_BASE}/payments/new?student=${payment.student_id}&term=${payment.term_id}`}><i className="fa-solid fa-plus" aria-hidden="true" /> Another payment</Link>
          </>
        }
      />
      <div className="acc-hero-figures">
        <div className={`acc-stat${voided ? " is-bad" : " is-good"}`}>
          <span className="acc-stat-top"><span>Amount</span><i className="fa-solid fa-coins" aria-hidden="true" /></span>
          <strong>{ugx(payment.amount)}</strong>
          <small>{voided ? "Void, not counted" : "Received"}</small>
        </div>
        <div className="acc-stat">
          <span className="acc-stat-top"><span>Method</span><i className="fa-solid fa-money-bill-wave" aria-hidden="true" /></span>
          <strong><MethodTag method={payment.method} /></strong>
          {payment.reference ? <small>{payment.reference}</small> : null}
        </div>
      </div>

      {voided ? (
        <div className="acc-banner is-danger">
          <i className="fa-solid fa-ban" aria-hidden="true" />
          <p>
            <strong>Voided {dateTime(payment.voided_at)}{payment.voided_by ? ` by ${people.get(payment.voided_by) ?? "a teammate"}` : ""}.</strong> {payment.void_reason}
          </p>
        </div>
      ) : null}

      <div className="dash-grid acc-detail-grid">
        <div className="dash-col">
          <Panel title="Payment details">
            <dl className="acc-facts is-two">
              <div><dt>Receipt number</dt><dd><strong>{payment.receipt_no}</strong></dd></div>
              <div><dt>Date paid</dt><dd>{day(payment.paid_on)}</dd></div>
              <div><dt>Amount</dt><dd><Money value={payment.amount} /></dd></div>
              <div><dt>Method</dt><dd><MethodTag method={payment.method} /></dd></div>
              <div><dt>Reference</dt><dd>{payment.reference || <span className="app-muted">None</span>}</dd></div>
              <div><dt>Paid by</dt><dd>{payment.payer_name || <span className="app-muted">Not recorded</span>}</dd></div>
              <div><dt>Term</dt><dd>{term?.label ?? "–"}</dd></div>
              {invoice ? <div><dt>Invoice</dt><dd><Link href={`${ACCOUNTS_BASE}/invoices/${invoice.id}`}>{invoice.invoice_no}</Link></dd></div> : null}
              <div><dt>Recorded by</dt><dd>{payment.source === "online" ? "Online payment" : payment.received_by ? people.get(payment.received_by) ?? "Teammate" : "–"}</dd></div>
              <div><dt>Recorded</dt><dd>{dateTime(payment.created_at)}</dd></div>
            </dl>
            {payment.notes ? <p className="acc-note"><i className="fa-regular fa-note-sticky" aria-hidden="true" /> {payment.notes}</p> : null}
          </Panel>

          {activity.length ? (
            <Panel title="History">
              <ul className="acc-feed is-compact">
                {activity.map((row) => (
                  <li key={row.id}>
                    <span className={`acc-feed-icon is-${row.kind}`}><i className={`fa-solid ${row.kind === "void" ? "fa-ban" : "fa-receipt"}`} aria-hidden="true" /></span>
                    <div>
                      <strong>{row.body}</strong>
                      <small>{dateTime(row.created_at)}{row.actor_id ? ` · ${people.get(row.actor_id) ?? "Teammate"}` : ""}</small>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>

        <div className="dash-col">
          <Panel title="Term account" description={term?.label}>
            <dl className="acc-facts">
              <div><dt>Billed</dt><dd>{ugx(billed)}</dd></div>
              <div><dt>Paid</dt><dd>{ugx(paid)}</dd></div>
              <div className="is-total"><dt>{left < 0 ? "Credit" : "Balance"}</dt><dd><Money value={left} tone="auto" /></dd></div>
            </dl>
            <Progress value={paid} max={billed} label="Share of the term's fees paid" />
          </Panel>

          <Panel title="Pupil" action={{ href: studentHref, label: "Fee account" }}>
            <dl className="acc-facts">
              <div><dt>Name</dt><dd><Link href={studentHref}>{student?.full_name ?? "Unknown"}</Link></dd></div>
              <div><dt>Student no.</dt><dd>{student?.student_number ?? "–"}</dd></div>
              <div><dt>Class</dt><dd>{className(student?.class_code) || "–"}{student?.stream ? ` ${student.stream}` : ""}</dd></div>
              {family && student?.family_id ? (
                <div><dt>Family</dt><dd><Link href={`${ACCOUNTS_BASE}/families/${student.family_id}`}>{family.mailing_name || family.family_code}</Link></dd></div>
              ) : null}
            </dl>
          </Panel>

          {!voided ? (
            <Panel title="Recorded in error?" description="Voiding keeps the receipt on record, marked void, and removes it from balances and reports.">
              <div className="acc-panel-actions">
                <VoidButton action={voidPayment.bind(null, id)} what="payment" label="Void payment" />
              </div>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
