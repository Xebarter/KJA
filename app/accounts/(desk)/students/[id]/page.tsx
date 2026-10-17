import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountNoteForm, DiscountButton, ExtraInvoiceButton } from "@/components/accounts/AccountTools";
import { RecordPaymentButton } from "@/components/accounts/PaymentForm";
import { Statement } from "@/components/accounts/Statement";
import { BalancePill, Chips, InvoiceStatus, Progress, notReady } from "@/components/accounts/ui";
import { StudentFace } from "@/components/StudentFace";
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
  methodInfo,
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
import { ageFrom, initials, whatsappLink } from "@/lib/applications";
import { cap, className, displayPhone, isStudentStatus, isUuid, pick, studentStatusInfo, telHref } from "@/lib/students";
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

  const [invoiceRes, paymentRes, termRes, discountRes, ruleRes, siblingRes, activityRes, guardianRes, reminderRes, faceRes, clubRes, clubPayRes, clubWaitRes] = await Promise.all([
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
    supabase.from("students").select("photo_path, sex, date_of_birth, house, enrolled_on, preferred_name").eq("id", id).maybeSingle(),
    supabase.from("club_consents").select("club_id, clubs(title, fee_amount)").eq("student_id", id).is("withdrawn_at", null),
    current
      ? supabase.from("club_payments").select("club_id, receipt_no").eq("student_id", id).eq("term_id", current.id).is("voided_at", null)
      : Promise.resolve({ data: [], error: null }),
    current
      ? supabase.from("club_collections").select("id, club_id").eq("student_id", id).eq("term_id", current.id).eq("status", "pending")
      : Promise.resolve({ data: [], error: null }),
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
  type PupilProfile = { photo_path?: string | null; sex?: string | null; date_of_birth?: string | null; house?: string | null; enrolled_on?: string | null; preferred_name?: string | null };
  let profile: PupilProfile = {};
  if (faceRes.error?.message && /photo_path/.test(faceRes.error.message)) {
    const retry = await supabase.from("students").select("sex, date_of_birth, house, enrolled_on, preferred_name").eq("id", id).maybeSingle();
    profile = (retry.data || {}) as PupilProfile;
  } else if (!faceRes.error) {
    profile = (faceRes.data || {}) as PupilProfile;
  }
  const photoPath = typeof profile.photo_path === "string" && profile.photo_path ? profile.photo_path : null;
  const sex = profile.sex === "M" || profile.sex === "F" ? profile.sex : null;
  const tone = sex === "M" ? "boy" : sex === "F" ? "girl" : "none";
  const age = ageFrom(profile.date_of_birth);
  const house = profile.house?.trim() || "";
  const called = profile.preferred_name?.trim() || "";
  const showCalled = Boolean(called) && called.toLowerCase() !== pupil.full_name.trim().toLowerCase();

  type ClubEmbed = { title?: string | null; fee_amount?: number | null };
  const clubSeats: { id: string; title: string; fee: number }[] = [];
  if (!clubRes.error) {
    for (const seat of (clubRes.data || []) as { club_id: string; clubs: ClubEmbed | ClubEmbed[] | null }[]) {
      const club = Array.isArray(seat.clubs) ? seat.clubs[0] : seat.clubs;
      if (!club?.title) continue;
      clubSeats.push({ id: seat.club_id, title: club.title, fee: Number(club.fee_amount) || 0 });
    }
    clubSeats.sort((a, b) => a.title.localeCompare(b.title));
  }
  const clubPaid = new Map(
    (((clubPayRes.error ? [] : clubPayRes.data) || []) as { club_id: string; receipt_no: string | null }[]).map((row) => [row.club_id, row.receipt_no] as const),
  );
  const clubWaiting = new Set<string>();
  if (!clubWaitRes.error) {
    const waitingRows = (clubWaitRes.data || []) as { id: string; club_id: string | null }[];
    for (const row of waitingRows) if (row.club_id) clubWaiting.add(row.club_id);
    if (waitingRows.length) {
      const items = await supabase.from("club_collection_items").select("club_id").in("collection_id", waitingRows.map((row) => row.id));
      if (!items.error) for (const item of (items.data || []) as { club_id: string }[]) clubWaiting.add(item.club_id);
    }
  }
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
  const lastPayment = payments.find((payment) => !payment.voided_at) ?? null;
  const familyBalance = pupil.family_id ? pupil.balance + siblings.reduce((sum, sibling) => sum + Number(sibling.balance), 0) : null;
  const familyNote = familyBalance === null ? "" : familyBalance > 0 ? `Family still owes ${ugx(familyBalance)}` : familyBalance < 0 ? `Family is ${ugx(-familyBalance)} in credit` : "The family account is clear";
  const primaryId = guardians.find((guardian) => guardian.is_primary)?.id ?? guardians[0]?.id ?? "";
  const collected = pupil.invoiced > 0 ? Math.max(0, Math.min(100, Math.round((Math.max(pupil.paid, 0) / pupil.invoiced) * 100))) : null;
  const balanceNote = pupil.balance > 0 && pupil.oldest_due
    ? overdueText(pupil.oldest_due)
    : pupil.balance > 0
      ? `${pupil.terms_owing} term${pupil.terms_owing === 1 ? "" : "s"} owing`
      : pupil.balance < 0
        ? "Overpaid"
        : "Nothing owed";
  const balanceTone = pupil.balance > 0 ? "bad" : pupil.balance < 0 ? "credit" : "ok";

  return (
    <div className="app-page ofc-page acc-page fac-page">
      <p className="acc-crumbs">
        <Link href={`${ACCOUNTS_BASE}/students`}><i className="fa-solid fa-arrow-left" aria-hidden="true" /> Fee accounts</Link>
        {pupil.family_id ? (
          <>
            <span aria-hidden="true">/</span>
            <Link href={`${ACCOUNTS_BASE}/families/${pupil.family_id}`}>{pupil.mailing_name || `Family ${pupil.family_code}`}</Link>
          </>
        ) : null}
      </p>
      <header className="fac-account">
        <div className="fac-account-id">
          <span className={`fac-portrait is-${tone}`}>
            <StudentFace id={id} name={pupil.full_name} photoPath={photoPath} className="fac-portrait-face" />
          </span>
          <div className="fac-account-copy">
            <p className="fac-account-kicker">Fee account</p>
            <h1>{pupil.full_name}</h1>
            {showCalled ? <p className="fac-called">Called {called}</p> : null}
            <p className="fac-account-meta">
              <span className="ofc-num">{pupil.student_number}</span>
              <span>{className(pupil.class_code)}{pupil.stream ? ` ${pupil.stream}` : ""}</span>
              {pupil.campus ? <span>{pupil.campus}</span> : null}
              {pupil.staff_child ? <em className="fac-tag is-staff">Staff child</em> : null}
              {pupil.status !== "active" ? <em className="fac-tag">{isStudentStatus(pupil.status) ? studentStatusInfo(pupil.status).label : pupil.status}</em> : null}
            </p>
            {age || sex || house || profile.enrolled_on || pupil.family_id ? (
              <ul className="fac-facts">
                {age ? <li><span>Age</span><strong>{age}</strong></li> : null}
                {sex ? <li><span>Sex</span><strong>{sex === "M" ? "Boy" : "Girl"}</strong></li> : null}
                {house ? <li><span>House</span><strong>{house}</strong></li> : null}
                {profile.enrolled_on ? <li><span>Joined</span><strong>{day(profile.enrolled_on)}</strong></li> : null}
                {pupil.family_id ? (
                  <li>
                    <span>Family</span>
                    <strong><Link href={`${ACCOUNTS_BASE}/families/${pupil.family_id}`}>{pupil.mailing_name || `Family ${pupil.family_code}`}</Link></strong>
                  </li>
                ) : null}
              </ul>
            ) : null}
            <div className="fac-account-actions">
              {terms.length ? <RecordPaymentButton className="fac-act is-primary" terms={termOptions} termId={payTerm} pupil={hit} /> : null}
              <a className="fac-act" href={statementPdf} target="_blank" rel="noreferrer"><i className="fa-solid fa-file-pdf" aria-hidden="true" /> Statement</a>
              {terms.length ? <ExtraInvoiceButton className="fac-act" studentId={id} terms={termOptions} termId={current?.id ?? terms[0].id} /> : null}
            </div>
          </div>
        </div>
        <div className="fac-account-side">
          <dl className="fac-account-figs">
            <div className={`is-${balanceTone}`}>
              <dt>{pupil.balance < 0 ? "In credit" : "Balance"}</dt>
              <dd title={ugx(Math.abs(pupil.balance))}><small>UGX</small> {amount(Math.abs(pupil.balance))}</dd>
              <p>{balanceNote}</p>
            </div>
            <div>
              <dt>Paid</dt>
              <dd title={ugx(pupil.paid)}><small>UGX</small> {amount(pupil.paid)}</dd>
              <p>of {ugx(pupil.invoiced)} billed</p>
            </div>
            <div>
              <dt>Last payment</dt>
              {lastPayment ? (
                <>
                  <dd title={ugx(lastPayment.amount)}><small>UGX</small> {amount(lastPayment.amount)}</dd>
                  <p><Link href={`${ACCOUNTS_BASE}/payments/${lastPayment.id}`}>{day(lastPayment.paid_on)}</Link> · {methodInfo(lastPayment.method).label}</p>
                </>
              ) : (
                <>
                  <dd>—</dd>
                  <p>Nothing received yet</p>
                </>
              )}
            </div>
          </dl>
          {collected !== null ? (
            <>
              <p className="fac-account-rate"><strong>{collected}%</strong> of billed fees collected</p>
              <div className="fac-account-bar" role="img" aria-label={`${collected}% of billed fees collected`}>
                <span style={{ width: `${collected}%` }} />
              </div>
            </>
          ) : null}
        </div>
      </header>

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
            description="Charges and payments, oldest first. The balance at the bottom is what is still due."
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
              <ol className="fac-log">
                {activity.map((entry) => (
                  <li key={entry.id} className={entry.kind === "note" ? "is-note" : ""}>
                    <span className={`fac-log-mark is-${entry.kind}`} aria-hidden="true"><i className={`fa-solid ${ACTIVITY_ICONS[entry.kind] ?? "fa-pen"}`} /></span>
                    <div>
                      <p>{entry.body}</p>
                      <small>{dateTime(entry.created_at)}{entry.actor_id ? ` · ${people.get(entry.actor_id) ?? "Teammate"}` : ""}</small>
                    </div>
                  </li>
                ))}
              </ol>
            ) : <p className="fac-empty"><i className="fa-regular fa-note-sticky" aria-hidden="true" /> Nothing recorded yet. A note here stays with the fee account.</p>}
          </Panel>
        </div>

        <div className="dash-col">
          <Panel title="Who to contact" action={pupil.family_id ? { href: `${ACCOUNTS_BASE}/families/${pupil.family_id}`, label: "Family account" } : undefined}>
            {guardians.length ? (
              <ul className="fac-people">
                {guardians.map((guardian) => {
                  const whatsapp = whatsappLink(guardian.phone);
                  const main = guardian.id === primaryId;
                  return (
                    <li key={guardian.id} className={main ? "is-main" : ""}>
                      <span className="fac-person-mark" aria-hidden="true">{initials(guardian.full_name)}</span>
                      <div>
                        <strong>{guardian.full_name}</strong>
                        <small>
                          {cap(guardian.relationship)}
                          {guardian.is_primary ? <em>Main</em> : null}
                        </small>
                        {main && (guardian.phone || whatsapp) ? (
                          <span className="fac-person-actions">
                            {guardian.phone ? <a className="fac-act" href={telHref(guardian.phone)}><i className="fa-solid fa-phone" aria-hidden="true" /> {displayPhone(guardian.phone)}</a> : null}
                            {whatsapp ? <a className="fac-act is-wa" href={whatsapp} target="_blank" rel="noreferrer"><i className="fa-brands fa-whatsapp" aria-hidden="true" /> WhatsApp</a> : null}
                          </span>
                        ) : null}
                        {(!main && (guardian.phone || whatsapp)) || guardian.email ? (
                          <span className="fac-person-links">
                            {!main && guardian.phone ? <a href={telHref(guardian.phone)}><i className="fa-solid fa-phone" aria-hidden="true" /> {displayPhone(guardian.phone)}</a> : null}
                            {!main && whatsapp ? <a className="is-wa" href={whatsapp} target="_blank" rel="noreferrer"><i className="fa-brands fa-whatsapp" aria-hidden="true" /> WhatsApp</a> : null}
                            {guardian.email ? <a href={`mailto:${guardian.email}`}><i className="fa-regular fa-envelope" aria-hidden="true" /> {guardian.email}</a> : null}
                          </span>
                        ) : !main || (!guardian.phone && !whatsapp) ? <span className="fac-person-none">No phone or email on file</span> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="fac-empty"><i className="fa-solid fa-address-book" aria-hidden="true" /> No parents on record. Add them in the admissions office.</p>}
            {reminders.length ? (
              <p className={`fac-remind${reminders[0].status === "failed" ? " is-failed" : ""}`}>
                <i className="fa-regular fa-envelope" aria-hidden="true" />
                <span>Last reminder {dateTime(reminders[0].sent_at)} to {reminders[0].sent_to}{reminders[0].status === "failed" ? " did not send" : ""}</span>
              </p>
            ) : null}
          </Panel>

          {clubSeats.length ? (
            <Panel title="Clubs" description={current ? `Fees for ${current.label}` : "Clubs this child has joined"}>
              <ul className="fac-seats">
                {clubSeats.map((club) => {
                  const receipt = clubPaid.get(club.id);
                  const waiting = clubWaiting.has(club.id);
                  const status = receipt !== undefined ? "paid" : waiting ? "waiting" : "unpaid";
                  return (
                    <li key={club.id}>
                      <div>
                        <strong>{club.title}</strong>
                        <small>{ugx(club.fee)}{receipt ? ` · ${receipt}` : ""}</small>
                      </div>
                      <span className={`fac-seat is-${status}`}>
                        {status === "paid" ? "Paid" : status === "waiting" ? "Waiting" : "Not paid"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ) : null}

          <Panel title="Discounts" description="Taken off tuition when the next term invoices are generated.">
            {discounts.length || pupil.staff_child ? (
              <ul className="fac-cuts">
                {pupil.staff_child ? (
                  <li className="is-auto">
                    <span className="fac-cut-mark" aria-hidden="true"><i className="fa-solid fa-id-badge" /></span>
                    <div>
                      <strong>Staff child</strong>
                      <small>Comes off tuition automatically</small>
                    </div>
                  </li>
                ) : null}
                {discounts.map((discount) => {
                  const scope = discount.term_id ? `${termLabel.get(discount.term_id) ?? "One term"} only` : "Every term";
                  const detail = discount.note ? `${scope} · ${discount.note}` : scope;
                  return (
                  <li key={discount.id}>
                    <span className="fac-cut-mark" aria-hidden="true"><i className="fa-solid fa-tag" /></span>
                    <div>
                      <strong>{discount.label}</strong>
                      <small title={detail}>{detail}</small>
                    </div>
                    <em>{discountText(discount.method, discount.value)}</em>
                    <ActionButton action={removeStudentDiscount.bind(null, discount.id)} label="Remove" icon="fa-xmark" className="fac-cut-remove" confirm={`Remove ${discount.label}?`} />
                  </li>
                  );
                })}
              </ul>
            ) : <p className="fac-empty"><i className="fa-solid fa-tag" aria-hidden="true" /> No discounts on this account.</p>}
            <DiscountButton className="fac-add" studentId={id} rules={rules} terms={termOptions} />
          </Panel>

          {siblings.length ? (
            <Panel title="Brothers and sisters" description={familyNote || undefined} action={pupil.family_id ? { href: `${ACCOUNTS_BASE}/families/${pupil.family_id}`, label: "Family statement" } : undefined}>
              <ul className="ofc-list acc-mini-list">
                {siblings.map((sibling) => (
                  <li key={sibling.student_id}>
                    <Link href={`${ACCOUNTS_BASE}/students/${sibling.student_id}`}>{sibling.full_name}</Link>
                    <span className="app-muted">{sibling.class_code ? className(sibling.class_code) : sibling.status}</span>
                    <BalancePill balance={Number(sibling.balance)} />
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel
            title="Invoices"
            description={invoices.length > 8 ? `Latest 8 of ${invoices.length}` : undefined}
            action={{ href: `${ACCOUNTS_BASE}/invoices?term=all&q=${encodeURIComponent(pupil.full_name)}`, label: "All" }}
          >
            {invoices.length ? (
              <ul className="fac-bills">
                {invoices.slice(0, 8).map((invoice) => {
                  const due = invoice.status === "issued" && invoice.due_on ? overdueText(invoice.due_on) : "";
                  const late = due.endsWith("overdue") || due === "Due today";
                  return (
                    <li key={invoice.id} className={invoice.status === "void" ? "is-void" : ""}>
                      <Link href={`${ACCOUNTS_BASE}/invoices/${invoice.id}`}>
                        <span className={`fac-bill-mark is-${invoice.status}`} aria-hidden="true">
                          <i className={`fa-solid ${invoice.kind === "extra" ? "fa-file-circle-plus" : "fa-file-invoice"}`} />
                        </span>
                        <span className="fac-bill-copy">
                          <strong>{invoice.invoice_no}</strong>
                          <small>
                            {termLabel.get(invoice.term_id) ?? "Term"}
                            {" · "}
                            {invoice.kind === "term" ? "Term bill" : "Extra"}
                            {due ? "" : ` · ${day(invoice.issued_on)}`}
                          </small>
                        </span>
                        <span className="fac-bill-sum">
                          <em>{ugx(invoice.total)}</em>
                          {due ? <small className={late ? "is-late" : ""}>{due}</small> : <InvoiceStatus status={invoice.status} />}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="fac-empty"><i className="fa-regular fa-file" aria-hidden="true" /> No invoices yet. Generate this term&apos;s bill or add an extra charge.</p>}
          </Panel>
        </div>
      </div>
    </div>
  );
}
