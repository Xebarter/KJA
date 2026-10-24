import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { AutoSubmit, ClickRow } from "@/components/accounts/client";
import { Chips, InvoiceStatus, Progress, notReady } from "@/components/accounts/ui";
import { ActionButton } from "@/components/office/client";
import { Empty, Pager } from "@/components/office/ui";
import { StudentFace } from "@/components/StudentFace";
import { issueAllDrafts } from "./actions";
import { aggRows, num, sumOf } from "@/lib/accounts-agg";
import { ACCOUNTS_BASE, loadTerms, requireAccounts } from "@/lib/accounts";
import { amount, day, daysBetween, hrefWith, kampalaToday, overdueText, percent, ugx, ugxShort, type TermBalance } from "@/lib/accounts-format";
import { SCHOOL_CLASSES, className, fetchAll, isClassCode, pick, searchNeedle } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";
import "./invoices.css";

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

  const [list, summaryRows, collectedSum, owingSum] = await Promise.all([
    query.order("issued_on", { ascending: false }).order("invoice_no", { ascending: false }).range(from, from + SIZE - 1),
    term ? aggRows(supabase.from("invoices").select("status, total.sum(), id.count()").eq("term_id", term.id)) : Promise.resolve([]),
    term ? sumOf(supabase.from("student_term_balances").select("paid.sum()").eq("term_id", term.id)) : Promise.resolve(null),
    term ? sumOf(supabase.from("student_term_balances").select("balance.sum()").eq("term_id", term.id).gt("balance", 0)) : Promise.resolve(null),
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

  let summary = (summaryRows ?? []).map((row) => ({ status: String(row.status ?? ""), total: num(row, "sum"), count: num(row, "count") }));
  if (term && !summaryRows) {
    const fetched = await fetchAll<{ status: string; total: number }>((a, b) => supabase.from("invoices").select("status, total").eq("term_id", term.id).order("id").range(a, b));
    const rolled = new Map<string, { total: number; count: number }>();
    for (const row of fetched) {
      const cur = rolled.get(row.status) ?? { total: 0, count: 0 };
      cur.total += Number(row.total);
      cur.count += 1;
      rolled.set(row.status, cur);
    }
    summary = [...rolled.entries()].map(([status, value]) => ({ status, ...value }));
  }
  const issued = summary.find((row) => row.status === "issued") ?? { total: 0, count: 0 };
  const drafts = summary.find((row) => row.status === "draft") ?? { total: 0, count: 0 };
  const voided = summary.find((row) => row.status === "void") ?? { total: 0, count: 0 };
  const billed = issued.total;
  const draftTotal = drafts.total;
  const collected = collectedSum;
  const owing = owingSum;
  const rate = collected === null ? null : percent(collected, billed);
  const href = (changes: Record<string, string | number | null>) => hrefWith(BASE, filters, changes);
  const n = (value: number) => value.toLocaleString("en-GB");
  const today = kampalaToday();
  const showCounts = Boolean(term) && !q && !cls && !kind;
  const scope = [
    term ? term.label : "All terms",
    status === "draft" ? "drafts" : status === "issued" ? "issued" : status === "void" ? "void" : "",
    cls ? className(cls) : "",
    kind === "extra" ? "extra charges" : kind === "term" ? "term bills" : "",
    q ? `matching “${q}”` : "",
  ].filter(Boolean);
  const active = [
    q ? { key: "q", label: `“${q}”`, href: href({ q: "" }) } : null,
    cls ? { key: "class", label: className(cls), href: href({ class: "" }) } : null,
    kind ? { key: "kind", label: kind === "extra" ? "Extra charges" : "Term bills", href: href({ kind: "" }) } : null,
    filters.term ? { key: "term", label: filters.term === "all" ? "All terms" : term?.label ?? "Term", href: href({ term: "" }) } : null,
  ].filter((entry): entry is { key: string; label: string; href: string } => Boolean(entry));
  const clearHref = href({ q: "", class: "", kind: "", term: "", status: "" });
  const narrowed = Boolean(q || status || cls || kind || filters.term);

  return (
    <div className="app-page ofc-page acc-page inv-page">
      <PageHeader
        kicker="Billing"
        icon="fa-file-invoice"
        title="Invoices"
        description={term ? <>Term bills and extra charges for <strong>{term.label}</strong>. Issue a draft to put it on the balance and in the parent portal.</> : <>Every term bill and extra charge on file.</>}
        actions={
          <>
            <Link className="admin-hero-btn is-primary" href={`${BASE}/generate${term ? `?term=${term.id}` : ""}`}>
              <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" /> Generate term invoices
            </Link>
            <Link className="admin-hero-btn" href={`${ACCOUNTS_BASE}/students`}>
              <i className="fa-solid fa-user" aria-hidden="true" /> Bill one pupil
            </Link>
          </>
        }
      />

      {term ? (
        <section className="inv-board" aria-label={`${term.label} billing`}>
          <div className="inv-board-main">
            <div className="inv-collect">
              {rate !== null && billed > 0 ? (
                <span className={`inv-ring${owing === 0 ? " is-done" : ""}`} title={`${rate}% of issued invoices collected`}>
                  <svg viewBox="0 0 36 36" aria-hidden="true">
                    <circle cx="18" cy="18" r="15" />
                    <circle className="is-value" cx="18" cy="18" r="15" pathLength={100} style={{ "--inv-rate": rate } as React.CSSProperties} />
                  </svg>
                  <em>{rate}%</em>
                </span>
              ) : null}
              <div>
                <span>{collected !== null && billed > 0 ? "Collected" : "Issued"}</span>
                <strong><small>UGX</small> {ugxShort(collected !== null && billed > 0 ? collected : billed)}</strong>
                <p>
                  {collected !== null && billed > 0 ? (
                    owing && owing > 0 ? (
                      <>{ugxShort(owing)} still to collect, of {ugxShort(billed)} issued</>
                    ) : collected > billed ? (
                      <>{ugxShort(collected - billed)} in credit, on {ugxShort(billed)} issued</>
                    ) : (
                      <>All of {ugxShort(billed)} issued is in</>
                    )
                  ) : (
                    <>
                      {n(issued.count)} issued
                      {drafts.count ? <>, {n(drafts.count)} in draft</> : null}
                    </>
                  )}
                </p>
              </div>
            </div>
            <ul className="inv-figs">
              <li>
                <Link className={status === "issued" ? "is-on" : ""} href={href({ status: status === "issued" ? "" : "issued" })} scroll={false} aria-current={status === "issued" ? "true" : undefined}>
                  <span>Issued</span>
                  <strong>{n(issued.count)}</strong>
                  <small>{issued.count ? ugxShort(billed) : "None issued"}</small>
                </Link>
              </li>
              <li>
                <Link className={`${status === "draft" ? "is-on" : ""}${drafts.count ? " is-warn" : ""}`} href={href({ status: status === "draft" ? "" : "draft" })} scroll={false} aria-current={status === "draft" ? "true" : undefined}>
                  <span>Drafts</span>
                  <strong>{n(drafts.count)}</strong>
                  <small>{drafts.count ? `${ugxShort(draftTotal)} waiting` : "None waiting"}</small>
                </Link>
              </li>
              <li>
                <Link className={status === "void" ? "is-on" : ""} href={href({ status: status === "void" ? "" : "void" })} scroll={false} aria-current={status === "void" ? "true" : undefined}>
                  <span>Void</span>
                  <strong>{n(voided.count)}</strong>
                  <small>{voided.count ? "Cancelled" : "None cancelled"}</small>
                </Link>
              </li>
            </ul>
          </div>
          {drafts.count ? (
            <div className="inv-draft">
              <i className="fa-regular fa-file" aria-hidden="true" />
              <p>
                <strong>{n(drafts.count)} draft{drafts.count === 1 ? "" : "s"}</strong> for {term.label}, totalling {ugx(draftTotal)}.
                Issue them to put them on balances and in the parent portal.
              </p>
              <div className="inv-draft-actions">
                <Link className="inv-text" href={href({ status: "draft" })}>Review</Link>
                <ActionButton
                  action={issueAllDrafts.bind(null, term.id)}
                  label="Issue all"
                  busyLabel="Issuing…"
                  icon="fa-paper-plane"
                  className="inv-issue"
                  confirm={`Issue all ${drafts.count} drafts for ${term.label}? Parents will see them in the portal.`}
                />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="ofc-register">
        <AutoSubmit className="ofc-finder" action={BASE} label="Filter invoices">
          <div className="ofc-finder-top">
            <label className="ofc-finder-search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
              <span className="visually-hidden">Search invoices</span>
              <input type="search" name="q" defaultValue={q} placeholder="Pupil name or invoice number" autoComplete="off" />
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
            <button className="inv-search" type="submit">Search</button>
          </div>
          {active.length ? (
            <div className="ofc-finder-active" aria-label="Active filters">
              <span>Filtered by</span>
              <ul>
                {active.map((entry) => (
                  <li key={entry.key}>
                    <Link href={entry.href} scroll={false} aria-label={`Remove filter ${entry.label}`}>
                      {entry.label} <i className="fa-solid fa-xmark" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
              {active.length > 1 ? <Link className="ofc-finder-clear" href={clearHref} scroll={false}>Clear all</Link> : null}
            </div>
          ) : null}
        </AutoSubmit>

        <header className="inv-results">
          <div>
            <h2>{n(total)} {narrowed ? `match${total === 1 ? "" : "es"}` : `invoice${total === 1 ? "" : "s"}`}</h2>
            <p>{scope.join(" · ")}</p>
          </div>
          <Chips
            label="Invoice status"
            items={[
              { href: href({ status: "" }), label: "All", count: showCounts ? summary.length : undefined, on: !status },
              { href: href({ status: "issued" }), label: "Issued", count: showCounts ? issued.count : undefined, on: status === "issued" },
              { href: href({ status: "draft" }), label: "Drafts", count: showCounts ? drafts.count : undefined, on: status === "draft" },
              { href: href({ status: "void" }), label: "Void", count: showCounts ? voided.count : undefined, on: status === "void" },
            ]}
          />
        </header>

        {rows.length ? (
          <div className="ofc-table-scroll">
            <table className="app-table acc-table inv-table">
              <thead>
                <tr>
                  <th scope="col">Invoice</th>
                  <th scope="col">Pupil</th>
                  <th scope="col">Due</th>
                  <th scope="col" className="is-num">Amount</th>
                  <th scope="col">Account</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="ofc-col-go"><span className="visually-hidden">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const balance = balances.get(`${row.student_id}:${row.term_id}`);
                  const name = row.students?.full_name ?? "Unknown pupil";
                  const owingRow = row.status === "issued" && !!balance && balance.balance > 0;
                  const cleared = row.status === "issued" && !!balance && balance.balance <= 0;
                  const due = row.due_on || balance?.due_on || null;
                  const days = owingRow && due ? daysBetween(due, today) : null;
                  const dueHint = days === null ? "" : days >= -7 ? overdueText(due, today) : "";
                  const rowClass = [
                    row.status === "void" ? "is-void" : "",
                    row.status === "draft" ? "is-draft" : "",
                    days !== null && days > 0 ? "is-late" : "",
                  ].filter(Boolean).join(" ");
                  return (
                    <ClickRow key={row.id} href={`${BASE}/${row.id}`} className={rowClass}>
                      <td data-label="Invoice" className="inv-doc">
                        <Link className="inv-no" href={`${BASE}/${row.id}`}>{row.invoice_no}</Link>
                        <small>
                          <span className={`inv-kind${row.kind === "extra" ? " is-extra" : ""}`}>{row.kind === "extra" ? "Extra" : "Term"}</span>
                          {day(row.issued_on)}
                          {!term && row.fee_terms?.label ? ` · ${row.fee_terms.label}` : ""}
                        </small>
                      </td>
                      <td data-label="Pupil" className="inv-who">
                        <StudentFace id={row.student_id} name={name} className="inv-avatar" />
                        <span>
                          <Link className="inv-name" href={`${ACCOUNTS_BASE}/students/${row.student_id}`}>{name}</Link>
                          <small>{row.class_code ?? "No class"} · {row.students?.student_number}</small>
                        </span>
                      </td>
                      <td data-label="Due" className={`inv-due${days !== null && days > 0 ? " is-late" : days === 0 ? " is-today" : ""}`}>
                        {due && row.status !== "void" ? day(due) : <span className="app-muted">–</span>}
                        {dueHint ? <small className="inv-late">{dueHint}</small> : null}
                      </td>
                      <td data-label="Amount" className="is-num">
                        <strong className={row.status === "void" ? "is-void" : ""}>{amount(row.total)}</strong>
                      </td>
                      <td data-label="Account" className="inv-account" title={row.status === "issued" ? "This pupil's balance for the term, across every issued invoice" : undefined}>
                        {row.status === "draft" ? <span className="app-muted">Not issued yet</span>
                          : row.status === "void" ? <span className="app-muted">Voided</span>
                          : !balance ? <span className="app-muted">–</span>
                          : cleared ? <span className="acc-paid"><i className="fa-solid fa-circle-check" aria-hidden="true" /> Paid</span>
                          : (
                            <>
                              {balance.invoiced > 0 ? <Progress value={Math.min(balance.paid, balance.invoiced)} max={balance.invoiced} label={`${name} paid this term`} /> : null}
                              <small className="acc-owing">{amount(balance.balance)} still due</small>
                            </>
                          )}
                      </td>
                      <td data-label="Status"><InvoiceStatus status={row.status} /></td>
                      <td className="ofc-col-go" aria-hidden="true"><i className="fa-solid fa-chevron-right" /></td>
                    </ClickRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="fa-file-lines" title={narrowed ? "No invoices match" : "No invoices yet"}>
            {narrowed ? <>Nothing in this view. <Link href={clearHref}>Clear filters</Link></> : <>Set the fees in <Link href={`${ACCOUNTS_BASE}/settings`}>Fee setup</Link>, then generate this term&apos;s invoices.</>}
          </Empty>
        )}
        <Pager page={page} pages={Math.max(1, Math.ceil(total / SIZE))} total={total} from={from} size={SIZE} href={(next) => href({ page: next })} />
      </section>
    </div>
  );
}
