import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { AutoSubmit } from "@/components/accounts/client";
import { Chips, InvoiceStatus, Money, Stat, notReady } from "@/components/accounts/ui";
import { ActionButton } from "@/components/office/client";
import { Empty, Pager } from "@/components/office/ui";
import { issueAllDrafts } from "./actions";
import { ACCOUNTS_BASE, loadTerms, requireAccounts } from "@/lib/accounts";
import { amount, day, hrefWith, type TermBalance } from "@/lib/accounts-format";
import { SCHOOL_CLASSES, fetchAll, isClassCode, pick, searchNeedle } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Invoices" };

const BASE = `${ACCOUNTS_BASE}/invoices`;
const SIZE = 50;

type Row = {
  id: string;
  invoice_no: string;
  student_id: string;
  term_id: string;
  kind: string;
  status: string;
  class_code: string | null;
  issued_on: string;
  due_on: string | null;
  total: number;
  students: { full_name: string; student_number: string } | null;
  fee_terms: { label: string } | null;
};

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!supabaseConfigured()) return notReady("Invoices", { kind: "config" });
  const auth = await requireAccounts();
  if ("error" in auth) return notReady("Invoices", { kind: "auth", message: auth.error });
  const { supabase } = auth;
  const params = await searchParams;
  const { terms, current, error } = await loadTerms(supabase);
  if (error) return notReady("Invoices", { kind: "schema", message: error });

  const termParam = pick(params, "term");
  const term = termParam === "all" ? null : terms.find((entry) => entry.id === termParam) ?? current;
  const status = ["draft", "issued", "void"].includes(pick(params, "status")) ? pick(params, "status") : "";
  const kind = ["term", "extra"].includes(pick(params, "kind")) ? pick(params, "kind") : "";
  const cls = isClassCode(pick(params, "class")) ? pick(params, "class") : "";
  const q = searchNeedle(pick(params, "q")).slice(0, 60);
  const page = Math.max(1, Number.parseInt(pick(params, "page"), 10) || 1);
  const from = (page - 1) * SIZE;
  const filters = { term: termParam === "all" ? "all" : term && term.id !== current?.id ? term.id : "", status, kind, class: cls, q };

  let query = supabase
    .from("invoices")
    .select("id, invoice_no, student_id, term_id, kind, status, class_code, issued_on, due_on, total, students!inner(full_name, student_number), fee_terms(label)", { count: "exact" });
  if (term) query = query.eq("term_id", term.id);
  if (status) query = query.eq("status", status);
  if (kind) query = query.eq("kind", kind);
  if (cls) query = query.eq("class_code", cls);
  if (q) query = /^(inv|\d)/i.test(q) && /\d/.test(q) ? query.ilike("invoice_no", `%${q}%`) : query.ilike("students.full_name", `%${q}%`);

  const [list, summary] = await Promise.all([
    query.order("issued_on", { ascending: false }).order("invoice_no", { ascending: false }).range(from, from + SIZE - 1),
    term
      ? fetchAll<{ status: string; total: number }>((a, b) => supabase.from("invoices").select("status, total").eq("term_id", term.id).order("id").range(a, b))
      : Promise.resolve([] as { status: string; total: number }[]),
  ]);
  if (list.error) return notReady("Invoices", { kind: "schema", message: list.error.message });
  const rows = (list.data || []) as unknown as Row[];
  const total = list.count ?? 0;

  const balances = new Map<string, TermBalance>();
  if (rows.length) {
    const { data } = await supabase
      .from("student_term_balances")
      .select("student_id, term_id, invoiced, paid, balance, due_on, last_paid_on")
      .in("student_id", [...new Set(rows.map((row) => row.student_id))])
      .in("term_id", [...new Set(rows.map((row) => row.term_id))]);
    for (const row of (data || []) as TermBalance[]) balances.set(`${row.student_id}:${row.term_id}`, row);
  }

  const issued = summary.filter((row) => row.status === "issued");
  const drafts = summary.filter((row) => row.status === "draft");
  const voided = summary.filter((row) => row.status === "void");
  const billed = issued.reduce((sum, row) => sum + Number(row.total), 0);
  const href = (changes: Record<string, string | number | null>) => hrefWith(BASE, filters, changes);

  return (
    <div className="app-page ofc-page acc-page">
      <PageHeader
        kicker="Billing"
        icon="fa-file-invoice"
        title="Invoices"
        description="Term bills and one-off charges. Generate a whole term at once, check drafts, and void anything raised in error."
        actions={
          <>
            <Link className="admin-hero-btn is-primary" href={`${BASE}/generate${term ? `?term=${term.id}` : ""}`}><i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" /> Generate term invoices</Link>
            <Link className="admin-hero-btn" href={`${ACCOUNTS_BASE}/students`}><i className="fa-solid fa-plus" aria-hidden="true" /> Bill one pupil</Link>
          </>
        }
      >
        {term ? (
          <div className="acc-hero-figures">
            <Stat label={`Billed in ${term.label}`} value={<Money value={billed} short />} note={`${issued.length.toLocaleString("en-GB")} invoices`} />
            <Stat label="Drafts" value={drafts.length.toLocaleString("en-GB")} note={drafts.length ? "Not yet counted" : "None waiting"} tone={drafts.length ? "warn" : undefined} />
            <Stat label="Void" value={voided.length.toLocaleString("en-GB")} />
          </div>
        ) : null}
      </PageHeader>

      {term && drafts.length ? (
        <div className="acc-banner is-warn">
          <i className="fa-regular fa-file" aria-hidden="true" />
          <p>
            <strong>{drafts.length} draft invoice{drafts.length === 1 ? "" : "s"}</strong> for {term.label} totalling {amount(drafts.reduce((sum, row) => sum + Number(row.total), 0))} UGX.
            Drafts don&apos;t count towards balances or show to parents until issued.
          </p>
          <Link className="app-link-btn" href={href({ status: "draft" })}>Review</Link>
          <ActionButton
            action={issueAllDrafts.bind(null, term.id)}
            label="Issue all"
            busyLabel="Issuing…"
            icon="fa-paper-plane"
            className="admin-btn"
            confirm={`Issue all ${drafts.length} drafts for ${term.label}? Parents will see them in the portal.`}
          />
        </div>
      ) : null}

      <section className="admin-card ofc-register">
        <AutoSubmit className="ofc-finder" action={BASE} label="Filter invoices">
          <div className="ofc-finder-top">
            <label className="ofc-finder-search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
              <span className="visually-hidden">Search invoices</span>
              <input type="search" name="q" defaultValue={q} placeholder="Pupil name or invoice number" />
            </label>
            <label className="ofc-finder-field is-inline">
              <span>Term</span>
              <select name="term" defaultValue={filters.term}>
                <option value="">{current ? `${current.label} (current)` : "Current term"}</option>
                {terms.filter((entry) => entry.id !== current?.id).map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                <option value="all">All terms</option>
              </select>
            </label>
            <label className="ofc-finder-field is-inline">
              <span>Class</span>
              <select name="class" defaultValue={cls}>
                <option value="">All classes</option>
                {SCHOOL_CLASSES.map((entry) => <option key={entry.code} value={entry.code}>{entry.code} · {entry.name}</option>)}
              </select>
            </label>
            <label className="ofc-finder-field is-inline">
              <span>Type</span>
              <select name="kind" defaultValue={kind}>
                <option value="">Term and extra</option>
                <option value="term">Term bills</option>
                <option value="extra">Extra charges</option>
              </select>
            </label>
            <input type="hidden" name="status" value={status} />
            <button className="admin-btn" type="submit">Search</button>
          </div>
        </AutoSubmit>

        <div className="acc-list-head">
          <Chips
            label="Invoice status"
            items={[
              { href: href({ status: "" }), label: "All", on: !status },
              { href: href({ status: "issued" }), label: "Issued", on: status === "issued" },
              { href: href({ status: "draft" }), label: "Drafts", on: status === "draft" },
              { href: href({ status: "void" }), label: "Void", on: status === "void" },
            ]}
          />
          <p>{total.toLocaleString("en-GB")} invoice{total === 1 ? "" : "s"}{term ? ` in ${term.label}` : ""}</p>
        </div>

        {rows.length ? (
          <div className="ofc-table-scroll">
            <table className="app-table acc-table">
              <thead>
                <tr>
                  <th scope="col">Invoice</th>
                  <th scope="col">Pupil</th>
                  <th scope="col">Term</th>
                  <th scope="col">Due</th>
                  <th scope="col" className="is-num">Amount</th>
                  <th scope="col">Term account</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const balance = balances.get(`${row.student_id}:${row.term_id}`);
                  return (
                    <tr key={row.id} className={row.status === "void" ? "is-void" : ""}>
                      <td data-label="Invoice">
                        <Link className="acc-doc-link" href={`${BASE}/${row.id}`}>{row.invoice_no}</Link>
                        <small>{row.kind === "extra" ? "Extra charge" : "Term bill"} · {day(row.issued_on)}</small>
                      </td>
                      <td data-label="Pupil">
                        <Link href={`${ACCOUNTS_BASE}/students/${row.student_id}`}>{row.students?.full_name ?? "Unknown pupil"}</Link>
                        <small>{row.class_code ?? "No class"} · {row.students?.student_number}</small>
                      </td>
                      <td data-label="Term">{row.fee_terms?.label}</td>
                      <td data-label="Due">{row.due_on ? day(row.due_on) : <span className="app-muted">–</span>}</td>
                      <td data-label="Amount" className="is-num"><strong>{amount(row.total)}</strong></td>
                      <td data-label="Term account">
                        {row.status !== "issued" || !balance ? <span className="app-muted">–</span>
                          : balance.balance <= 0 ? <span className="acc-paid"><i className="fa-solid fa-circle-check" aria-hidden="true" /> Paid</span>
                          : <span className="acc-owing">{amount(balance.balance)} due</span>}
                      </td>
                      <td data-label="Status"><InvoiceStatus status={row.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="fa-file-lines" title={q || status || cls || kind ? "No invoices match" : "No invoices yet"}>
            {q || status || cls || kind ? "Try clearing a filter." : <>Set the fees in <Link href={`${ACCOUNTS_BASE}/settings`}>Fee setup</Link>, then generate this term&apos;s invoices.</>}
          </Empty>
        )}
        <Pager page={page} pages={Math.max(1, Math.ceil(total / SIZE))} total={total} from={from} size={SIZE} href={(n) => href({ page: n })} />
      </section>
    </div>
  );
}
