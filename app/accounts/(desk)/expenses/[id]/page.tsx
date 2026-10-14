import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { ExpenseActions } from "@/components/accounts/ExpenseActions";
import { ExpenseStatus, MethodTag, notReady } from "@/components/accounts/ui";
import { Panel } from "@/components/office/ui";
import { ACCOUNTS_BASE, requireAccounts } from "@/lib/accounts";
import { dateTime, day, ugx, type AccountActivity, type Expense, type ExpenseStatus as Status } from "@/lib/accounts-format";
import { loadPeople } from "@/lib/admin-applications";
import { isUuid } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Expense" };

const STEPS: { status: Status; label: string; icon: string }[] = [
  { status: "pending", label: "Requested", icon: "fa-paper-plane" },
  { status: "approved", label: "Approved", icon: "fa-check" },
  { status: "paid", label: "Paid", icon: "fa-money-bill-wave" },
];

export default async function ExpensePage({ params }: { params: Promise<{ id: string }> }) {
  if (!supabaseConfigured()) return notReady("Expense", { kind: "config" });
  const auth = await requireAccounts();
  if ("error" in auth) return notReady("Expense", { kind: "auth", message: auth.error });
  const { supabase, user, profile } = auth;
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const { data: expense, error } = await supabase.from("expenses").select("*").eq("id", id).maybeSingle<Expense>();
  if (error) return notReady("Expense", { kind: "schema", message: error.message });
  if (!expense) notFound();
  const [{ data: category }, { data: activityRows }] = await Promise.all([
    expense.category_id ? supabase.from("expense_categories").select("name, icon, monthly_budget").eq("id", expense.category_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("account_activity").select("*").eq("entity_id", id).order("created_at", { ascending: false }).limit(20),
  ]);
  const activity = (activityRows || []) as AccountActivity[];
  const people = await loadPeople(supabase, [expense.requested_by, expense.decided_by, expense.paid_by, ...activity.map((row) => row.actor_id)]);
  const who = (personId: string | null) => (personId ? people.get(personId) ?? "Teammate" : "–");
  const isAdmin = profile.role === "admin";
  const mine = expense.requested_by === user.id;
  const reached = expense.status === "paid" ? 2 : expense.status === "approved" ? 1 : 0;
  const isPdf = expense.receipt_path?.endsWith(".pdf");

  return (
    <div className="app-page ofc-page acc-page">
      <p className="acc-crumbs">
        <Link href={`${ACCOUNTS_BASE}/expenses`}><i className="fa-solid fa-arrow-left" aria-hidden="true" /> Expenses</Link>
      </p>
      <PageHeader
        kicker={expense.ref_no}
        icon={category?.icon ?? "fa-receipt"}
        title={expense.payee}
        description={<>{ugx(expense.amount)} · {category?.name ?? "Uncategorised"} · {day(expense.spent_on)}{expense.campus ? ` · ${expense.campus}` : ""}</>}
      >
        <div className="acc-hero-figures">
          <div className="acc-stat"><span>Status</span><strong><ExpenseStatus status={expense.status} /></strong></div>
          <div className="acc-stat"><span>Amount</span><strong>{ugx(expense.amount)}</strong></div>
        </div>
      </PageHeader>

      {expense.status === "rejected" ? (
        <div className="acc-banner is-danger">
          <i className="fa-solid fa-ban" aria-hidden="true" />
          <p><strong>Rejected by {who(expense.decided_by)} {dateTime(expense.decided_at)}.</strong> {expense.decision_note}</p>
        </div>
      ) : (
        <ol className="acc-steps acc-flow" aria-label="Approval progress">
          {STEPS.map((step, index) => (
            <li key={step.status} className={index < reached ? "is-done" : index === reached ? "is-on" : ""}>
              <span><i className={`fa-solid ${index < reached || (index === 2 && reached === 2) ? "fa-check" : step.icon}`} aria-hidden="true" /></span>
              <div>
                <strong>{step.label}</strong>
                <small>
                  {index === 0 ? `${who(expense.requested_by)} · ${dateTime(expense.created_at)}` : null}
                  {index === 1 ? (expense.decided_at ? `${who(expense.decided_by)} · ${dateTime(expense.decided_at)}` : "Waiting") : null}
                  {index === 2 ? (expense.paid_at ? `${who(expense.paid_by)} · ${day(expense.paid_at.slice(0, 10))}` : "Not yet") : null}
                </small>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="dash-grid acc-detail-grid">
        <div className="dash-col">
          <Panel title="Details">
            <dl className="acc-facts is-two">
              <div><dt>Paid to</dt><dd><strong>{expense.payee}</strong></dd></div>
              <div><dt>Amount</dt><dd><strong>{ugx(expense.amount)}</strong></dd></div>
              <div><dt>Category</dt><dd>{category ? <span className="acc-cat"><i className={`fa-solid ${category.icon}`} aria-hidden="true" /> {category.name}</span> : "–"}</dd></div>
              <div><dt>Date</dt><dd>{day(expense.spent_on)}</dd></div>
              <div><dt>Campus</dt><dd>{expense.campus || "Whole school"}</dd></div>
              <div><dt>Method</dt><dd>{expense.method ? <MethodTag method={expense.method} /> : <span className="app-muted">Not decided</span>}</dd></div>
              <div><dt>Reference</dt><dd>{expense.reference || <span className="app-muted">None</span>}</dd></div>
              <div><dt>Reference no.</dt><dd>{expense.ref_no}</dd></div>
              <div className="is-wide"><dt>What it&apos;s for</dt><dd className="acc-pre">{expense.description}</dd></div>
              {expense.decision_note && expense.status !== "rejected" ? <div className="is-wide"><dt>Approval note</dt><dd>{expense.decision_note}</dd></div> : null}
            </dl>
            <div className="acc-panel-actions">
              <ExpenseActions
                id={expense.id}
                status={expense.status}
                refNo={expense.ref_no}
                amount={expense.amount}
                payee={expense.payee}
                canDecide={!mine || isAdmin}
                canEdit={mine || isAdmin}
                method={expense.method}
                reference={expense.reference}
              />
            </div>
          </Panel>
        </div>

        <div className="dash-col">
          <Panel title="Receipt">
            {expense.receipt_path ? (
              <div className="acc-receipt-preview">
                {isPdf ? (
                  <i className="fa-solid fa-file-pdf" aria-hidden="true" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`${ACCOUNTS_BASE}/expenses/${id}/receipt`} alt={`Receipt for ${expense.payee}`} />
                )}
                <a className="admin-btn admin-btn-ghost" href={`${ACCOUNTS_BASE}/expenses/${id}/receipt`} target="_blank" rel="noreferrer">
                  <i className="fa-solid fa-up-right-from-square" aria-hidden="true" /> Open receipt
                </a>
              </div>
            ) : (
              <p className="app-muted acc-empty-line">
                No receipt attached.{expense.status === "pending" && (mine || isAdmin) ? <> <Link href={`${ACCOUNTS_BASE}/expenses/new?edit=${id}`}>Attach one</Link>.</> : expense.status === "approved" ? " You can attach it when marking it paid." : ""}
              </p>
            )}
          </Panel>

          <Panel title="History">
            <ul className="acc-feed is-compact">
              {activity.map((row) => (
                <li key={row.id}>
                  <span className={`acc-feed-icon is-${row.kind}`}><i className="fa-solid fa-receipt" aria-hidden="true" /></span>
                  <div>
                    <strong>{row.body}</strong>
                    <small>{dateTime(row.created_at)}{row.actor_id ? ` · ${who(row.actor_id)}` : ""}</small>
                  </div>
                </li>
              ))}
              {!activity.length ? <li><div><small>Nothing recorded yet.</small></div></li> : null}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
