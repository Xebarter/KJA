import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { PaymentForm } from "@/components/accounts/PaymentForm";
import { notReady } from "@/components/accounts/ui";
import type { PupilHit } from "../actions";
import { ACCOUNTS_BASE, loadTerms, requireAccounts } from "@/lib/accounts";
import { isUuid, pick } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Record a payment" };

export default async function NewPaymentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!supabaseConfigured()) return notReady("Record a payment", { kind: "config" });
  const auth = await requireAccounts();
  if ("error" in auth) return notReady("Record a payment", { kind: "auth", message: auth.error });
  const { supabase } = auth;
  const params = await searchParams;
  const { terms, current, error } = await loadTerms(supabase);
  if (error) return notReady("Record a payment", { kind: "schema", message: error });

  const studentId = pick(params, "student");
  const termParam = pick(params, "term");
  let pupil: PupilHit | null = null;
  if (isUuid(studentId)) {
    const { data } = await supabase
      .from("student_balances")
      .select("student_id, full_name, student_number, class_code, stream, campus, status, family_id, family_code, mailing_name, balance")
      .eq("student_id", studentId)
      .maybeSingle();
    if (data) pupil = { ...(data as PupilHit), balance: Number(data.balance) };
  }
  const termId = terms.find((term) => term.id === termParam)?.id ?? current?.id ?? "";

  return (
    <div className="app-page ofc-page acc-page">
      <p className="acc-crumbs">
        <Link href={`${ACCOUNTS_BASE}/payments`}><i className="fa-solid fa-arrow-left" aria-hidden="true" /> Payments</Link>
      </p>
      <PageHeader
        kicker="Payments"
        icon="fa-hand-holding-dollar"
        title="Record a payment"
        description="Find the pupil, enter what was received and how. A numbered receipt is ready to print as soon as you save."
      />
      {terms.length ? (
        <section className="admin-card ofc-narrow acc-form-card">
          <PaymentForm terms={terms.map((term) => ({ id: term.id, label: term.label }))} termId={termId} pupil={pupil} />
        </section>
      ) : (
        <div className="acc-banner is-warn">
          <i className="fa-solid fa-calendar-plus" aria-hidden="true" />
          <p>Add a term in <Link href={`${ACCOUNTS_BASE}/settings#terms`}>Fee setup</Link> before recording payments.</p>
        </div>
      )}
    </div>
  );
}
