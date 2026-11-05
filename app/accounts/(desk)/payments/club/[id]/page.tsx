import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountsPageHeader } from "@/components/accounts/AccountsPageHeader";
import { VoidButton } from "@/components/accounts/client";
import { MethodTag, Money, notReady } from "@/components/accounts/ui";
import { Panel } from "@/components/office/ui";
import { voidClubPayment } from "../../actions";
import { ACCOUNTS_BASE, requireAccounts } from "@/lib/accounts";
import { dateTime, day, ugx } from "@/lib/accounts-format";
import { loadPeople } from "@/lib/admin-applications";
import { className, isUuid } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";
import "../../payments.css";

export const metadata = { title: "Club payment" };

export default async function ClubPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  if (!supabaseConfigured()) return notReady("Club payment", { kind: "config" });
  const auth = await requireAccounts();
  if ("error" in auth) return notReady("Club payment", { kind: "auth", message: auth.error });
  const { supabase } = auth;
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const { data: payment, error } = await supabase.from("club_payments").select("*").eq("id", id).maybeSingle();
  if (error) return notReady("Club payment", { kind: "schema", message: error.message });
  if (!payment) notFound();

  const [{ data: student }, { data: club }, { data: term }] = await Promise.all([
    supabase.from("students").select("id, full_name, student_number, class_code, stream, campus, family_id").eq("id", payment.student_id).maybeSingle(),
    supabase.from("clubs").select("id, title, category").eq("id", payment.club_id).maybeSingle(),
    supabase.from("fee_terms").select("id, label").eq("id", payment.term_id).maybeSingle(),
  ]);
  const people = await loadPeople(supabase, [payment.received_by, payment.voided_by]);
  const voided = Boolean(payment.voided_at);
  const studentHref = `${ACCOUNTS_BASE}/students/${payment.student_id}`;
  const moneyParts = ugx(payment.amount).match(/^(UGX)\s*(.+)$/i);

  return (
    <div className="app-page ofc-page acc-page pay-page pay-detail-page is-clubs">
      <p className="acc-crumbs">
        <Link href={`${ACCOUNTS_BASE}/payments`}><i className="fa-solid fa-arrow-left" aria-hidden="true" /> Payments</Link>
        <span aria-hidden="true">/</span>
        <Link href={`${ACCOUNTS_BASE}/payments?category=clubs`}>Clubs</Link>
      </p>

      <AccountsPageHeader
        kicker={voided ? "Voided club receipt" : "Club receipt"}
        icon="fa-puzzle-piece"
        title={payment.receipt_no}
        description={`${ugx(payment.amount)} for ${club?.title ?? "club"} · ${student?.full_name ?? "pupil"} · ${day(payment.paid_on)}`}
        actions={
          <>
            <Link className="aov-btn" href={`${ACCOUNTS_BASE}/payments?category=clubs`}>
              <i className="fa-solid fa-list" aria-hidden="true" /> Club payments
            </Link>
            <Link className="aov-btn is-primary" href={`${ACCOUNTS_BASE}/payments?record=1&kind=club&student=${payment.student_id}`}>
              <i className="fa-solid fa-plus" aria-hidden="true" /> Another payment
            </Link>
          </>
        }
      />

      <section className="pay-receipt-hero is-clubs" aria-label="Receipt summary">
        <div className="pay-receipt-main">
          <span className="pay-receipt-mark" aria-hidden="true"><i className="fa-solid fa-puzzle-piece" /></span>
          <div>
            <span className="pay-receipt-label">{voided ? "Voided amount" : "Received"}</span>
            <strong className="pay-receipt-amount">
              {moneyParts ? <><small>{moneyParts[1]}</small>{moneyParts[2]}</> : ugx(payment.amount)}
            </strong>
            <p>{club?.title ?? "Club"}{club?.category ? ` · ${club.category}` : ""}</p>
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
            <span>Term</span>
            <strong>{term?.label ?? "–"}</strong>
            <small>Current club term</small>
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
              <div><dt>Reference</dt><dd>{payment.reference || <span className="app-muted">None</span>}</dd></div>
              <div><dt>Paid by</dt><dd>{payment.payer_name || <span className="app-muted">Not recorded</span>}</dd></div>
              <div><dt>Club</dt><dd>{club?.title ?? "–"}{club?.category ? ` · ${club.category}` : ""}</dd></div>
              <div><dt>Term</dt><dd>{term?.label ?? "–"}</dd></div>
              <div><dt>Source</dt><dd>{payment.source === "online" ? "Online" : "Desk"}</dd></div>
              <div><dt>Recorded by</dt><dd>{payment.source === "online" ? "Online payment" : payment.received_by ? people.get(payment.received_by) ?? "Teammate" : "–"}</dd></div>
              <div><dt>Recorded</dt><dd>{dateTime(payment.created_at)}</dd></div>
            </dl>
            {payment.notes ? <p className="acc-note"><i className="fa-regular fa-note-sticky" aria-hidden="true" /> {payment.notes}</p> : null}
          </Panel>
        </div>
        <div className="dash-col">
          <Panel title="Pupil" action={{ href: studentHref, label: "Fee account" }}>
            <dl className="acc-facts">
              <div><dt>Name</dt><dd><Link href={studentHref}>{student?.full_name ?? "Unknown"}</Link></dd></div>
              <div><dt>Student no.</dt><dd>{student?.student_number ?? "–"}</dd></div>
              <div><dt>Class</dt><dd>{className(student?.class_code) || "–"}{student?.stream ? ` ${student.stream}` : ""}</dd></div>
              <div><dt>Campus</dt><dd>{student?.campus || "–"}</dd></div>
            </dl>
          </Panel>
          {!voided ? (
            <Panel title="Recorded in error?" description="Voiding keeps the receipt on record and removes it from club paid lists.">
              <div className="acc-panel-actions">
                <VoidButton action={voidClubPayment.bind(null, id)} what="club payment" label="Void payment" />
              </div>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
