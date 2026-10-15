import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { RecordPaymentButton } from "@/components/accounts/PaymentForm";
import { Statement } from "@/components/accounts/Statement";
import { Money, Progress, Stat, notReady } from "@/components/accounts/ui";
import { Panel } from "@/components/office/ui";
import { ACCOUNTS_BASE, loadTerms, requireAccounts } from "@/lib/accounts";
import { amount, day, overdueText, statementRows, ugx, type BalanceRow, type Invoice, type Payment } from "@/lib/accounts-format";
import { className, displayPhone, isUuid, telHref } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Family account" };

export default async function FamilyAccountPage({ params }: { params: Promise<{ id: string }> }) {
  if (!supabaseConfigured()) return notReady("Family account", { kind: "config" });
  const auth = await requireAccounts();
  if ("error" in auth) return notReady("Family account", { kind: "auth", message: auth.error });
  const { supabase } = auth;
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const [{ data: family, error }, { data: childRows }, { data: guardianRows }, { terms, current }] = await Promise.all([
    supabase.from("families").select("id, family_code, mailing_name, home_area").eq("id", id).maybeSingle(),
    supabase.from("student_balances").select("*").eq("family_id", id).order("class_order", { ascending: false, nullsFirst: false }),
    supabase.from("guardians").select("id, full_name, relationship, phone, email, is_primary").eq("family_id", id).order("is_primary", { ascending: false }),
    loadTerms(supabase),
  ]);
  if (error) return notReady("Family account", { kind: "schema", message: error.message });
  if (!family) notFound();
  const children = ((childRows || []) as BalanceRow[]).map((row) => ({ ...row, balance: Number(row.balance), invoiced: Number(row.invoiced), paid: Number(row.paid) }));
  const guardians = (guardianRows || []) as { id: string; full_name: string; relationship: string; phone: string | null; email: string | null; is_primary: boolean }[];
  const ids = children.map((child) => child.student_id);

  const [{ data: invoiceRows }, { data: paymentRows }] = ids.length
    ? await Promise.all([
        supabase.from("invoices").select("*").in("student_id", ids).eq("status", "issued"),
        supabase.from("payments").select("*").in("student_id", ids).is("voided_at", null),
      ])
    : [{ data: [] }, { data: [] }];
  const names = new Map(children.map((child) => [child.student_id, child.full_name.split(" ").slice(1).join(" ") || child.full_name]));
  const entries = statementRows((invoiceRows || []) as Invoice[], (paymentRows || []) as Payment[], terms, names);
  const billed = children.reduce((sum, child) => sum + child.invoiced, 0);
  const paid = children.reduce((sum, child) => sum + child.paid, 0);
  const balance = billed - paid;
  const oldest = children.map((child) => child.oldest_due).filter(Boolean).sort()[0] ?? null;
  const termOptions = terms.map((term) => ({ id: term.id, label: term.label }));
  const title = family.mailing_name || `Family ${family.family_code}`;

  return (
    <div className="app-page ofc-page acc-page">
      <p className="acc-crumbs">
        <Link href={`${ACCOUNTS_BASE}/students`}><i className="fa-solid fa-arrow-left" aria-hidden="true" /> Fee accounts</Link>
      </p>
      <PageHeader
        kicker="Family account"
        icon="fa-people-roof"
        title={title}
        description={<>Family {family.family_code}{family.home_area ? ` · ${family.home_area}` : ""} · {children.length} child{children.length === 1 ? "" : "ren"} on record</>}
        actions={
          <a className="admin-hero-btn is-primary" href={`${ACCOUNTS_BASE}/families/${id}/statement`} target="_blank" rel="noreferrer">
            <i className="fa-solid fa-file-pdf" aria-hidden="true" /> Family statement
          </a>
        }
      />
      <div className="acc-hero-figures">
        <Stat label={balance < 0 ? "In credit" : "Family balance"} value={<Money value={Math.abs(balance)} />} note={balance > 0 && oldest ? overdueText(oldest) : balance > 0 ? "Owing" : "Nothing owed"} tone={balance > 0 ? "bad" : "good"} icon="fa-people-roof" />
        <Stat label="Paid to date" value={<Money value={paid} short />} note={`of ${ugx(billed)} billed`} icon="fa-sack-dollar" />
      </div>

      <ul className="acc-child-cards">
        {children.map((child) => (
          <li key={child.student_id} className={child.balance > 0 ? "is-owing" : "is-clear"}>
            <div className="acc-child-head">
              <Link href={`${ACCOUNTS_BASE}/students/${child.student_id}`}><strong>{child.full_name}</strong></Link>
              <small>{child.student_number} · {className(child.class_code)}{child.status !== "active" ? ` · ${child.status}` : ""}</small>
            </div>
            <strong className="acc-child-balance">{child.balance > 0 ? ugx(child.balance) : child.balance < 0 ? `${ugx(-child.balance)} credit` : "Paid up"}</strong>
            <Progress value={child.paid} max={child.invoiced} label={`Share paid for ${child.full_name}`} />
            <small>{amount(child.paid)} of {amount(child.invoiced)} paid{child.last_paid_on ? ` · last paid ${day(child.last_paid_on)}` : ""}</small>
            {terms.length && child.status === "active" ? (
              <RecordPaymentButton
                terms={termOptions}
                termId={current?.id ?? terms[0].id}
                className="acc-row-btn"
                label="Record payment"
                pupil={{
                  student_id: child.student_id,
                  full_name: child.full_name,
                  student_number: child.student_number,
                  class_code: child.class_code,
                  stream: child.stream,
                  campus: child.campus,
                  status: child.status,
                  family_id: child.family_id,
                  family_code: child.family_code,
                  mailing_name: child.mailing_name,
                  balance: child.balance,
                }}
              />
            ) : null}
          </li>
        ))}
      </ul>

      <div className="dash-grid acc-detail-grid">
        <div className="dash-col">
          <Panel title="Combined statement" description="Every child's invoices and payments together." action={{ href: `${ACCOUNTS_BASE}/families/${id}/statement`, label: "Download PDF", file: true }}>
            <Statement entries={entries} />
          </Panel>
        </div>
        <div className="dash-col">
          <Panel title="Parents and guardians">
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
            ) : <p className="app-muted acc-empty-line">No parents on record.</p>}
          </Panel>
        </div>
      </div>
    </div>
  );
}
