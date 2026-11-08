import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountsPageHeader } from "@/components/accounts/AccountsPageHeader";
import { VoidButton } from "@/components/accounts/client";
import { MethodTag, Money, notReady } from "@/components/accounts/ui";
import { Panel } from "@/components/office/ui";
import { voidChargePayment } from "../../actions";
import { categoryIcon, categoryLabel } from "../../filters";
import { ACCOUNTS_BASE, requireAccounts } from "@/lib/accounts";
import { dateTime, day, ugx } from "@/lib/accounts-format";
import { loadPeople } from "@/lib/admin-applications";
import { className, isUuid } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";
import "../../payments.css";

export const metadata = { title: "Charge payment" };

const KIND_ICON: Record<string, string> = {
  ple: "fa-pen-to-square",
  tour: "fa-bus",
  admission: "fa-file-signature",
  other: "fa-receipt",
};

export default async function ChargePaymentPage({ params }: { params: Promise<{ id: string }> }) {
  if (!supabaseConfigured()) return notReady("Charge payment", { kind: "config" });
  const auth = await requireAccounts();
  if ("error" in auth) return notReady("Charge payment", { kind: "auth", message: auth.error });
  const { supabase } = auth;
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const { data: payment, error } = await supabase.from("charge_payments").select("*").eq("id", id).maybeSingle();
  if (error) {
    if (/charge_payments|schema cache|does not exist/i.test(error.message || "")) {
      return notReady("Charge payment", { kind: "schema", message: "Run supabase/0066_accounts_payment_register.sql." });
    }
    return notReady("Charge payment", { kind: "schema", message: error.message });
  }
  if (!payment) notFound();

  const [{ data: product }, { data: student }, { data: term }] = await Promise.all([
    supabase.from("charge_products").select("id, name, kind").eq("id", payment.product_id).maybeSingle(),
    payment.student_id
      ? supabase.from("students").select("id, full_name, student_number, class_code, stream, campus").eq("id", payment.student_id).maybeSingle()
      : Promise.resolve({ data: null }),
    payment.term_id
      ? supabase.from("fee_terms").select("id, label").eq("id", payment.term_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const people = await loadPeople(supabase, [payment.received_by, payment.voided_by]);
  const voided = Boolean(payment.voided_at);
  const category = product?.kind === "ple" || product?.kind === "tour" || product?.kind === "admission" ? product.kind : "other";
  const studentHref = payment.student_id ? `${ACCOUNTS_BASE}/students/${payment.student_id}` : null;
  const recordKind = category === "admission" ? "other" : category;
  const moneyParts = ugx(payment.amount).match(/^(UGX)\s*(.+)$/i);
  const icon = KIND_ICON[category] || categoryIcon(category);

  return (
    <div className={`app-page ofc-page acc-page pay-page pay-detail-page is-${category}`}>
      <p className="acc-crumbs">
        <Link href={`${ACCOUNTS_BASE}/payments`}><i className="fa-solid fa-arrow-left" aria-hidden="true" /> Payments</Link>
        <span aria-hidden="true">/</span>
        <Link href={`${ACCOUNTS_BASE}/payments?category=${category}`}>{categoryLabel(category)}</Link>
      </p>

      <AccountsPageHeader
        kicker={voided ? "Voided receipt" : `${categoryLabel(category)} receipt`}
        icon={icon}
        title={payment.receipt_no}
        description={`${ugx(payment.amount)} for ${product?.name ?? "charge"}${student ? ` · ${student.full_name}` : ""} · ${day(payment.paid_on)}`}
        actions={
          <>
            <a className="aov-btn is-primary" href={`${ACCOUNTS_BASE}/payments/charge/${id}/receipt`} target="_blank" rel="noreferrer">
              <i className="fa-solid fa-print" aria-hidden="true" /> Print receipt
            </a>
            <a className="aov-btn" href={`${ACCOUNTS_BASE}/payments/charge/${id}/receipt?download=1`}>
              <i className="fa-solid fa-download" aria-hidden="true" /> Download
            </a>
            <Link className="aov-btn" href={`${ACCOUNTS_BASE}/payments?category=${category}`}>
              <i className="fa-solid fa-list" aria-hidden="true" /> {categoryLabel(category)}
            </Link>
            <Link className="aov-btn" href={`${ACCOUNTS_BASE}/payments?record=1&kind=${recordKind}${payment.student_id ? `&student=${payment.student_id}` : ""}`}>
              <i className="fa-solid fa-plus" aria-hidden="true" /> Another
            </Link>
          </>
        }
      />

      <section className={`pay-receipt-hero is-${category}${voided ? " is-void" : ""}`} aria-label="Receipt summary">
        <div className="pay-receipt-main">
          <span className="pay-receipt-mark" aria-hidden="true"><i className={`fa-solid ${icon}`} /></span>
          <div>
            <div className="pay-receipt-topline">
              <span className="pay-receipt-label">{voided ? "Voided amount" : "Amount received"}</span>
              <span className={`pay-receipt-status${voided ? " is-void" : " is-ok"}`}>
                <i className={`fa-solid ${voided ? "fa-ban" : "fa-circle-check"}`} aria-hidden="true" />
                {voided ? "Voided" : "Paid"}
              </span>
            </div>
            <strong className="pay-receipt-amount">
              {moneyParts ? <><small>{moneyParts[1]}</small>{moneyParts[2]}</> : ugx(payment.amount)}
            </strong>
            <p>{product?.name ?? categoryLabel(category)}</p>
          </div>
        </div>
        <ul className="pay-receipt-meta">
          <li>
            <span>Method</span>
            <strong><MethodTag method={payment.method} /></strong>
            {payment.reference ? <small>{payment.reference}</small> : null}
          </li>
          <li>
            <span>Source</span>
            <strong>{payment.source === "online" ? "Online" : "Desk"}</strong>
            <small>{day(payment.paid_on)}</small>
          </li>
          <li>
            <span>Category</span>
            <strong>{categoryLabel(category)}</strong>
            <small>{term?.label || "Not tied to a term"}</small>
          </li>
        </ul>
      </section>

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
              <div><dt>Charge</dt><dd>{product?.name ?? "–"}</dd></div>
              <div><dt>Category</dt><dd><span className={`pay-cat is-${category}`}><i className={`fa-solid ${icon}`} aria-hidden="true" /> {categoryLabel(category)}</span></dd></div>
              <div><dt>Reference</dt><dd>{payment.reference || <span className="app-muted">None</span>}</dd></div>
              <div><dt>Paid by</dt><dd>{payment.payer_name || <span className="app-muted">Not recorded</span>}</dd></div>
              <div><dt>Term</dt><dd>{term?.label ?? "–"}</dd></div>
              <div><dt>Source</dt><dd>{payment.source === "online" ? "Online" : "Desk"}</dd></div>
              <div><dt>Recorded by</dt><dd>{payment.source === "online" ? "Online payment" : payment.received_by ? people.get(payment.received_by) ?? "Teammate" : "–"}</dd></div>
              <div><dt>Recorded</dt><dd>{dateTime(payment.created_at)}</dd></div>
            </dl>
            {payment.notes ? <p className="acc-note"><i className="fa-regular fa-note-sticky" aria-hidden="true" /> {payment.notes}</p> : null}
          </Panel>
        </div>
        <div className="dash-col">
          {student && studentHref ? (
            <Panel title="Pupil" action={{ href: studentHref, label: "Fee account" }}>
              <dl className="acc-facts">
                <div><dt>Name</dt><dd><Link href={studentHref}>{student.full_name}</Link></dd></div>
                <div><dt>Student no.</dt><dd>{student.student_number}</dd></div>
                <div><dt>Class</dt><dd>{className(student.class_code) || "–"}{student.stream ? ` ${student.stream}` : ""}</dd></div>
                <div><dt>Campus</dt><dd>{student.campus || "–"}</dd></div>
              </dl>
            </Panel>
          ) : (
            <Panel title="Pupil">
              <p className="pay-empty-note">No pupil was linked to this receipt.</p>
            </Panel>
          )}
          {!voided ? (
            <Panel title="Recorded in error?" description="Voiding keeps the receipt on record, marked void.">
              <div className="acc-panel-actions">
                <VoidButton action={voidChargePayment.bind(null, id)} what="charge payment" label="Void payment" />
              </div>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
