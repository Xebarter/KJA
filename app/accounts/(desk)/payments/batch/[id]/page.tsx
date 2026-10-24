import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { VoidButton } from "@/components/accounts/client";
import { MethodTag, Money, notReady } from "@/components/accounts/ui";
import { Panel } from "@/components/office/ui";
import { voidPaymentBatch } from "../../actions";
import { ACCOUNTS_BASE, requireAccounts } from "@/lib/accounts";
import { dateTime, day, ugx, type Payment, type PaymentBatch } from "@/lib/accounts-format";
import { loadPeople } from "@/lib/admin-applications";
import { className, isUuid } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";
import "../../payments.css";

export const metadata = { title: "Family receipt" };

export default async function FamilyPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  if (!supabaseConfigured()) return notReady("Family receipt", { kind: "config" });
  const auth = await requireAccounts();
  if ("error" in auth) return notReady("Family receipt", { kind: "auth", message: auth.error });
  const { supabase } = auth;
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const { data: batch, error } = await supabase.from("payment_batches").select("*").eq("id", id).maybeSingle<PaymentBatch>();
  if (error) return notReady("Family receipt", { kind: "schema", message: error.message });
  if (!batch) notFound();

  const [{ data: family }, { data: lines }, { data: termRows }] = await Promise.all([
    supabase.from("families").select("id, family_code, mailing_name").eq("id", batch.family_id).maybeSingle(),
    supabase.from("payments").select("*").eq("batch_id", id).order("created_at"),
    supabase.from("fee_terms").select("id, label"),
  ]);
  const payments = (lines || []) as Payment[];
  const termLabel = new Map((termRows || []).map((row) => [row.id as string, row.label as string]));
  const studentIds = [...new Set(payments.map((row) => row.student_id))];
  const { data: students } = studentIds.length
    ? await supabase.from("students").select("id, full_name, student_number, class_code").in("id", studentIds)
    : { data: [] as { id: string; full_name: string; student_number: string; class_code: string | null }[] };
  const byStudent = new Map((students || []).map((row) => [row.id, row]));
  const people = await loadPeople(supabase, [batch.received_by, batch.voided_by]);
  const voided = Boolean(batch.voided_at);
  const receipt = `${ACCOUNTS_BASE}/payments/batch/${id}/receipt`;
  const title = family?.mailing_name || family?.family_code || "Family";

  return (
    <div className="app-page ofc-page acc-page pay-page pay-detail-page">
      <p className="acc-crumbs">
        <Link href={`${ACCOUNTS_BASE}/payments`}><i className="fa-solid fa-arrow-left" aria-hidden="true" /> Payments</Link>
        <span aria-hidden="true">/</span>
        <Link href={`${ACCOUNTS_BASE}/families/${batch.family_id}`}>{title}</Link>
      </p>
      <PageHeader
        kicker={voided ? "Voided family receipt" : "Family receipt"}
        icon="fa-people-roof"
        title={batch.receipt_no}
        description={<>{ugx(batch.amount)} from {batch.payer_name || title} · shared across {payments.length} {payments.length === 1 ? "child" : "children"} · {day(batch.paid_on)}</>}
        actions={
          <>
            <a className="admin-hero-btn is-primary" href={receipt} target="_blank" rel="noreferrer"><i className="fa-solid fa-print" aria-hidden="true" /> Print receipt</a>
            <a className="admin-hero-btn" href={`${receipt}?download=1`}><i className="fa-solid fa-download" aria-hidden="true" /> Download</a>
            <Link className="admin-hero-btn" href={`${ACCOUNTS_BASE}/payments/new?family=${batch.family_id}`}><i className="fa-solid fa-plus" aria-hidden="true" /> Another family payment</Link>
          </>
        }
      />
      <div className="acc-hero-figures">
        <div className={`acc-stat${voided ? " is-bad" : " is-good"}`}>
          <span className="acc-stat-top"><span>Amount</span><i className="fa-solid fa-coins" aria-hidden="true" /></span>
          <strong>{ugx(batch.amount)}</strong>
          <small>{voided ? "Void, not counted" : "Received"}</small>
        </div>
        <div className="acc-stat">
          <span className="acc-stat-top"><span>Method</span><i className="fa-solid fa-money-bill-wave" aria-hidden="true" /></span>
          <strong><MethodTag method={batch.method} /></strong>
          {batch.reference ? <small>{batch.reference}</small> : null}
        </div>
      </div>

      {voided ? (
        <div className="acc-banner is-danger">
          <i className="fa-solid fa-ban" aria-hidden="true" />
          <p>
            <strong>Voided {dateTime(batch.voided_at)}{batch.voided_by ? ` by ${people.get(batch.voided_by) ?? "a teammate"}` : ""}.</strong> {batch.void_reason}
          </p>
        </div>
      ) : null}

      <div className="dash-grid acc-detail-grid">
        <div className="dash-col">
          <Panel title="How it was shared" description="Each line reduced that pupil's fee balance. One receipt covers them all.">
            <ul className="acc-alloc-list">
              {payments.map((row) => {
                const pupil = byStudent.get(row.student_id);
                return (
                  <li key={row.id}>
                    <div>
                      {pupil ? (
                        <Link href={`${ACCOUNTS_BASE}/students/${pupil.id}`}><strong>{pupil.full_name}</strong></Link>
                      ) : <strong>Pupil</strong>}
                      <small>
                        {pupil ? `${pupil.student_number} · ${className(pupil.class_code)} · ` : ""}
                        {termLabel.get(row.term_id) ?? "Term"}
                      </small>
                    </div>
                    <Money value={row.amount} />
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
        <div className="dash-col">
          <Panel title="Receipt details">
            <dl className="acc-facts is-two">
              <div><dt>Receipt number</dt><dd><strong>{batch.receipt_no}</strong></dd></div>
              <div><dt>Date paid</dt><dd>{day(batch.paid_on)}</dd></div>
              <div><dt>Amount</dt><dd><Money value={batch.amount} /></dd></div>
              <div><dt>Method</dt><dd><MethodTag method={batch.method} /></dd></div>
              <div><dt>Reference</dt><dd>{batch.reference || <span className="app-muted">None</span>}</dd></div>
              <div><dt>Paid by</dt><dd>{batch.payer_name || <span className="app-muted">Not recorded</span>}</dd></div>
              <div><dt>Family</dt><dd><Link href={`${ACCOUNTS_BASE}/families/${batch.family_id}`}>{title}</Link></dd></div>
              <div><dt>Recorded by</dt><dd>{batch.received_by ? people.get(batch.received_by) ?? "Teammate" : "–"}</dd></div>
            </dl>
            {batch.notes ? <p className="acc-note"><i className="fa-regular fa-note-sticky" aria-hidden="true" /> {batch.notes}</p> : null}
          </Panel>
          {!voided ? (
            <Panel title="Recorded in error?" description="Voiding keeps the family receipt on record, marked void, and removes every child's share from balances.">
              <div className="acc-panel-actions">
                <VoidButton
                  label="Void family receipt"
                  what={`family receipt ${batch.receipt_no}`}
                  action={(reason) => voidPaymentBatch(id, reason)}
                />
              </div>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
