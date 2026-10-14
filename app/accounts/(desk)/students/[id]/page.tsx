import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { AccountNoteForm, DiscountButton, ExtraInvoiceButton } from "@/components/accounts/AccountTools";
import { RecordPaymentButton } from "@/components/accounts/PaymentForm";
import { Statement } from "@/components/accounts/Statement";
import { BalancePill, Chips, InvoiceStatus, Money, Progress, Stat, notReady } from "@/components/accounts/ui";
import { ActionButton } from "@/components/office/client";
import { Panel } from "@/components/office/ui";
import { removeStudentDiscount } from "../actions";
import type { PupilHit } from "../../payments/actions";
import { ACCOUNTS_BASE, loadTerms, requireAccounts } from "@/lib/accounts";
import {
  amount,
  dateTime,
  day,
  discountText,
  overdueText,
  statementRows,
  ugx,
  type AccountActivity,
  type BalanceRow,
  type DiscountRule,
  type Invoice,
  type Payment,
  type StudentDiscount,
  type TermBalance,
} from "@/lib/accounts-format";
import { loadPeople } from "@/lib/admin-applications";
import { className, displayPhone, isUuid, pick, telHref } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Fee account" };

const ACTIVITY_ICONS: Record<string, string> = {
  payment: "fa-receipt",
  invoice: "fa-file-invoice",
  void: "fa-ban",
  discount: "fa-tag",
  reminder: "fa-envelope",
  note: "fa-note-sticky",
};

export default async function FeeAccountPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!supabaseConfigured()) return notReady("Fee account", { kind: "config" });
  const auth = await requireAccounts();
  if ("error" in auth) return notReady("Fee account", { kind: "auth", message: auth.error });
  const { supabase } = auth;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const query = await searchParams;

  const [{ data: row, error }, { terms, current }] = await Promise.all([
    supabase.from("student_balances").select("*").eq("student_id", id).maybeSingle(),
    loadTerms(supabase),
  ]);
  if (error) return notReady("Fee account", { kind: "schema", message: error.message });
  if (!row) notFound();
  const pupil = { ...(row as BalanceRow), balance: Number(row.balance), invoiced: Number(row.invoiced), paid: Number(row.paid) };

  const [invoiceRes, paymentRes, termRes, discountRes, ruleRes, siblingRes, activityRes, guardianRes, reminderRes] = await Promise.all([
    supabase.from("invoices").select("*").eq("student_id", id).order("issued_on", { ascending: false }),
    supabase.from("payments").select("*").eq("student_id", id).order("paid_on", { ascending: false }),
    supabase.from("student_term_balances").select("student_id, term_id, invoiced, paid, balance, due_on, last_paid_on").eq("student_id", id),
    supabase.from("student_discounts").select("*").eq("student_id", id).order("created_at"),
    supabase.from("discount_rules").select("*").eq("active", true).order("name"),
    pupil.family_id
      ? supabase.from("student_balances").select("student_id, full_name, class_code, status, balance").eq("family_id", pupil.family_id).neq("student_id", id).order("class_order", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase.from("account_activity").select("*").eq("student_id", id).order("created_at", { ascending: false }).limit(30),
    pupil.family_id
      ? supabase.from("guardians").select("id, full_name, relationship, phone, email, is_primary").eq("family_id", pupil.family_id).order("is_primary", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase.from("fee_reminders").select("id, sent_to, amount, status, sent_at").eq("student_id", id).order("sent_at", { ascending: false }).limit(5),
  ]);
  const invoices = (invoiceRes.data || []) as Invoice[];
  const payments = (paymentRes.data || []) as Payment[];
  const termBalances = ((termRes.data || []) as TermBalance[]).map((entry) => ({ ...entry, invoiced: Number(entry.invoiced), paid: Number(entry.paid), balance: Number(entry.balance) }));
  const discounts = (discountRes.data || []) as StudentDiscount[];
  const rules = (ruleRes.data || []) as DiscountRule[];
  const siblings = (siblingRes.data || []) as { student_id: string; full_name: string; class_code: string | null; status: string; balance: number }[];
  const activity = (activityRes.data || []) as AccountActivity[];
  const guardians = (guardianRes.data || []) as { id: string; full_name: string; relationship: string; phone: string | null; email: string | null; is_primary: boolean }[];
  const reminders = (reminderRes.data || []) as { id: string; sent_to: string; amount: number; status: string; sent_at: string }[];
  const people = await loadPeople(supabase, activity.map((entry) => entry.actor_id));

  const termOrder = new Map(terms.map((term, index) => [term.id, index]));
  const termLabel = new Map(terms.map((term) => [term.id, term.label]));
  const accountTerms = [...termBalances].sort((a, b) => (termOrder.get(a.term_id) ?? 99) - (termOrder.get(b.term_id) ?? 99));
  const termFilter = accountTerms.some((entry) => entry.term_id === pick(query, "term")) ? pick(query, "term") : "";
  const entries = statementRows(
    invoices.filter((invoice) => !termFilter || invoice.term_id === termFilter),
    payments.filter((payment) => !termFilter || payment.term_id === termFilter),
    terms,
  );
  const drafts = invoices.filter((invoice) => invoice.status === "draft");
  const voids = [...invoices.filter((invoice) => invoice.status === "void"), ...payments.filter((payment) => payment.voided_at)];
  const termOptions = terms.map((term) => ({ id: term.id, label: term.label }));
  const hit: PupilHit = {
    student_id: pupil.student_id,
    full_name: pupil.full_name,
    student_number: pupil.student_number,
    class_code: pupil.class_code,
    stream: pupil.stream,
    campus: pupil.campus,
    status: pupil.status,
    family_id: pupil.family_id,
    family_code: pupil.family_code,
    mailing_name: pupil.mailing_name,
    balance: pupil.balance,
  };
  const owingTerm = accountTerms.find((entry) => entry.balance > 0);
  const payTerm = owingTerm?.term_id ?? current?.id ?? terms[0]?.id ?? "";
  const statementPdf = `${ACCOUNTS_BASE}/students/${id}/statement${termFilter ? `?term=${termFilter}` : ""}`;
  const base = `${ACCOUNTS_BASE}/students/${id}`;

  return (
    <div className="app-page ofc-page acc-page">
      <p className="acc-crumbs">
        <Link href={`${ACCOUNTS_BASE}/students`}><i className="fa-solid fa-arrow-left" aria-hidden="true" /> Fee accounts</Link>
        {pupil.family_id ? (
          <>
            <span aria-hidden="true">/</span>
            <Link href={`${ACCOUNTS_BASE}/families/${pupil.family_id}`}>{pupil.mailing_name || `Family ${pupil.family_code}`}</Link>
          </>
        ) : null}
      </p>
      <PageHeader
        kicker="Fee account"
        icon="fa-user-graduate"
        title={pupil.full_name}
        description={
          <>
            {pupil.student_number} · {className(pupil.class_code)}{pupil.stream ? ` ${pupil.stream}` : ""}
            {pupil.campus ? ` · ${pupil.campus}` : ""}{pupil.staff_child ? " · staff child" : ""}
            {pupil.status !== "active" ? ` · ${pupil.status}` : ""}
          </>
        }
        actions={
          <>
            {terms.length ? <RecordPaymentButton terms={termOptions} termId={payTerm} pupil={hit} /> : null}
            <a className="admin-hero-btn" href={statementPdf} target="_blank" rel="noreferrer"><i className="fa-solid fa-file-pdf" aria-hidden="true" /> Statement</a>
            {terms.length ? <ExtraInvoiceButton studentId={id} terms={termOptions} termId={current?.id ?? terms[0].id} /> : null}
          </>
        }
      >
        <div className="acc-hero-figures">
          <Stat
            label={pupil.balance < 0 ? "In credit" : "Balance"}
            value={<Money value={Math.abs(pupil.balance)} />}
            note={pupil.balance > 0 && pupil.oldest_due ? overdueText(pupil.oldest_due) : pupil.balance > 0 ? `${pupil.terms_owing} term${pupil.terms_owing === 1 ? "" : "s"} owing` : "Nothing owed"}
            tone={pupil.balance > 0 ? "bad" : "good"}
          />
          <Stat label="Billed" value={<Money value={pupil.invoiced} short />} note={`Paid ${ugx(pupil.paid)}`} />
        </div>
      </PageHeader>

      {drafts.length ? (
        <div className="acc-banner is-warn">
          <i className="fa-regular fa-file" aria-hidden="true" />
          <p>
            <strong>{drafts.length} draft invoice{drafts.length === 1 ? "" : "s"}</strong> not yet issued, so not counted below:{" "}
            {drafts.map((invoice, index) => (
              <span key={invoice.id}>{index ? ", " : ""}<Link href={`${ACCOUNTS_BASE}/invoices/${invoice.id}`}>{invoice.invoice_no}</Link> ({ugx(invoice.total)})</span>
            ))}
          </p>
        </div>
      ) : null}

      {accountTerms.length ? (
        <ul className="acc-term-cards" aria-label="Balance by term">
          {accountTerms.map((entry) => (
            <li key={entry.term_id} className={`${entry.balance > 0 ? "is-owing" : "is-clear"}${termFilter === entry.term_id ? " is-on" : ""}`}>
              <Link href={termFilter === entry.term_id ? base : `${base}?term=${entry.term_id}`} scroll={false}>
                <span className="acc-term-name">{termLabel.get(entry.term_id) ?? "Term"}</span>
                <strong>{entry.balance > 0 ? ugx(entry.balance) : entry.balance < 0 ? `${ugx(-entry.balance)} credit` : "Paid"}</strong>
                <Progress value={entry.paid} max={entry.invoiced} label={`Share paid for ${termLabel.get(entry.term_id) ?? "term"}`} />
                <small>{amount(entry.paid)} of {amount(entry.invoiced)} paid{entry.balance > 0 && entry.due_on ? ` · ${overdueText(entry.due_on)}` : ""}</small>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="dash-grid acc-detail-grid">
        <div className="dash-col">
          <Panel
            title="Statement"
            description={termFilter ? `${termLabel.get(termFilter)} only` : "Every term, oldest first"}
            action={{ href: statementPdf, label: "Download PDF", file: true }}
          >
            {accountTerms.length > 1 ? (
              <Chips
                label="Statement period"
                items={[
                  { href: base, label: "All terms", on: !termFilter },
                  ...accountTerms.map((entry) => ({ href: `${base}?term=${entry.term_id}`, label: termLabel.get(entry.term_id) ?? "Term", on: termFilter === entry.term_id })),
                ]}
              />
            ) : null}
            <Statement entries={entries} emptyText="No invoices or payments yet. Generate this term's invoices or record a payment to start the account." />
          </Panel>

          {voids.length ? (
            <Panel title="Voided" description="Kept for the record. These don't count towards the balance.">
              <ul className="acc-feed is-compact">
                {voids.map((entry) => {
                  const isInvoice = "invoice_no" in entry;
                  return (
                    <li key={entry.id} className="is-void">
                      <span className="acc-feed-icon is-void"><i className="fa-solid fa-ban" aria-hidden="true" /></span>
                      <div>
                        <Link href={`${ACCOUNTS_BASE}/${isInvoice ? "invoices" : "payments"}/${entry.id}`}>
                          <strong>{isInvoice ? (entry as Invoice).invoice_no : (entry as Payment).receipt_no}</strong>
                        </Link>
                        <small>{entry.void_reason}</small>
                      </div>
                      <span className="acc-money">{ugx(isInvoice ? (entry as Invoice).total : (entry as Payment).amount)}</span>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ) : null}

          <Panel title="Account notes and activity">
            <AccountNoteForm studentId={id} />
            {activity.length ? (
              <ul className="acc-feed is-compact">
                {activity.map((entry) => (
                  <li key={entry.id} className={entry.kind === "note" ? "is-note" : ""}>
                    <span className={`acc-feed-icon is-${entry.kind}`}><i className={`fa-solid ${ACTIVITY_ICONS[entry.kind] ?? "fa-pen"}`} aria-hidden="true" /></span>
                    <div>
                      <strong>{entry.body}</strong>
                      <small>{dateTime(entry.created_at)}{entry.actor_id ? ` · ${people.get(entry.actor_id) ?? "Teammate"}` : ""}</small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="app-muted acc-empty-line">Nothing recorded yet.</p>}
          </Panel>
        </div>

        <div className="dash-col">
          <Panel title="Who to contact" action={pupil.family_id ? { href: `${ACCOUNTS_BASE}/families/${pupil.family_id}`, label: "Family account" } : undefined}>
            {guardians.length ? (
              <ul className="acc-contacts">
                {guardians.map((guardian) => (
                  <li key={guardian.id}>
                    <strong>{guardian.full_name}</strong>
                    <small>{guardian.relationship}{guardian.is_primary ? " · main contact" : ""}</small>
                    <span>
                      {guardian.phone ? <a href={telHref(guardian.phone)}><i className="fa-solid fa-phone" aria-hidden="true" /> {displayPhone(guardian.phone)}</a> : null}
                      {guardian.email ? <a href={`mailto:${guardian.email}`}><i className="fa-regular fa-envelope" aria-hidden="true" /> {guardian.email}</a> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="app-muted acc-empty-line">No parents on record. Add them in the admissions office.</p>}
            {reminders.length ? (
              <p className="acc-soft">
                <i className="fa-regular fa-envelope" aria-hidden="true" /> Last reminder {dateTime(reminders[0].sent_at)} to {reminders[0].sent_to}
                {reminders[0].status === "failed" ? " (failed)" : ""}
              </p>
            ) : null}
          </Panel>

          <Panel title="Discounts" description="Taken off tuition when term invoices are generated.">
            {discounts.length || pupil.staff_child ? (
              <ul className="ofc-list acc-mini-list">
                {pupil.staff_child ? (
                  <li>
                    <span><i className="fa-solid fa-id-badge" aria-hidden="true" /> Staff child</span>
                    <span className="app-muted">Automatic, from Fee setup</span>
                  </li>
                ) : null}
                {discounts.map((discount) => (
                  <li key={discount.id}>
                    <span>
                      <strong>{discount.label}</strong>
                      <small>{discount.term_id ? `${termLabel.get(discount.term_id) ?? "One term"} only` : "Every term"}{discount.note ? ` · ${discount.note}` : ""}</small>
                    </span>
                    <strong>{discountText(discount.method, discount.value)}</strong>
                    <ActionButton action={removeStudentDiscount.bind(null, discount.id)} label="Remove" icon="fa-xmark" className="acc-row-btn is-danger" confirm={`Remove ${discount.label}?`} />
                  </li>
                ))}
              </ul>
            ) : <p className="app-muted acc-empty-line">No discounts.</p>}
            <div className="acc-panel-actions">
              <DiscountButton studentId={id} rules={rules} terms={termOptions} />
            </div>
          </Panel>

          {siblings.length ? (
            <Panel title="Brothers and sisters" action={pupil.family_id ? { href: `${ACCOUNTS_BASE}/families/${pupil.family_id}`, label: "Family statement" } : undefined}>
              <ul className="ofc-list acc-mini-list">
                {siblings.map((sibling) => (
                  <li key={sibling.student_id}>
                    <Link href={`${ACCOUNTS_BASE}/students/${sibling.student_id}`}>{sibling.full_name}</Link>
                    <span className="app-muted">{sibling.class_code ?? sibling.status}</span>
                    <BalancePill balance={Number(sibling.balance)} />
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel title="Invoices" action={{ href: `${ACCOUNTS_BASE}/invoices?term=all&q=${encodeURIComponent(pupil.full_name)}`, label: "All" }}>
            {invoices.length ? (
              <ul className="ofc-list acc-mini-list">
                {invoices.slice(0, 8).map((invoice) => (
                  <li key={invoice.id}>
                    <span>
                      <Link href={`${ACCOUNTS_BASE}/invoices/${invoice.id}`}>{invoice.invoice_no}</Link>
                      <small>{termLabel.get(invoice.term_id)} · {invoice.kind === "term" ? "term bill" : "extra"} · {day(invoice.issued_on)}</small>
                    </span>
                    <strong>{amount(invoice.total)}</strong>
                    <InvoiceStatus status={invoice.status} />
                  </li>
                ))}
              </ul>
            ) : <p className="app-muted acc-empty-line">No invoices yet.</p>}
          </Panel>
        </div>
      </div>
    </div>
  );
}
