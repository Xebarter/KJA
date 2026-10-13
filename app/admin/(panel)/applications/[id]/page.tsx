import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Avatar,
  DeleteApplicationButton,
  DeleteNoteButton,
  ManagePanel,
  NoteForm,
  PaymentBadge,
  StatusBadge,
} from "@/components/admin/Applications";
import { loadPeople, loadTeam, requireAdmin } from "@/lib/admin-applications";
import {
  ageFrom,
  formatDate,
  formatDateTime,
  timeAgo,
  toKampalaInput,
  whatsappLink,
  type Application,
} from "@/lib/applications";

export const metadata = { title: "Application" };

const KIND_ICONS: Record<string, string> = {
  note: "fa-regular fa-comment",
  status: "fa-solid fa-arrows-rotate",
  assign: "fa-solid fa-user-check",
  visit: "fa-regular fa-calendar",
};

type Activity = { id: string; actor_id: string | null; kind: string; body: string; created_at: string };
type Payment = {
  id: string;
  receipt_no: string | null;
  amount: number;
  currency: string;
  phone: string;
  network: string | null;
  transaction_ref: string | null;
  paid_at: string | null;
};

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="app-detail">
      <dt>{label}</dt>
      <dd>{children || <span className="app-muted">Not given</span>}</dd>
    </div>
  );
}

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const auth = await requireAdmin();
  if ("error" in auth) {
    return <div className="admin-card app-notice"><h2>Not available</h2><p>{auth.error}</p></div>;
  }
  const { supabase, user } = auth;
  const { data } = await supabase.from("applications").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const app = data as Application;
  if (app.read === false) {
    await supabase.from("applications").update({ read: true }).eq("id", id);
  }

  const [{ data: activityData }, team, { data: paymentData }] = await Promise.all([
    supabase.from("application_activity").select("id, actor_id, kind, body, created_at").eq("application_id", id).order("created_at", { ascending: false }),
    loadTeam(supabase),
    app.payment_id
      ? supabase.from("admission_payments").select("id, receipt_no, amount, currency, phone, network, transaction_ref, paid_at").eq("id", app.payment_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const payment = paymentData as Payment | null;
  const activity = (activityData || []) as Activity[];
  const people = await loadPeople(supabase, [app.assigned_to, app.updated_by, ...activity.map((entry) => entry.actor_id)]);
  const now = Date.now();
  const child = app.child_name || "Unnamed child";
  const phone = app.phone?.replace(/\s/g, "") ?? "";
  const whatsapp = whatsappLink(app.phone);
  const age = ageFrom(app.child_dob);
  const updatedBy = app.updated_by ? people.get(app.updated_by) : null;

  return (
    <div className="app-page">
      <Link href="/admin/applications" className="app-back"><i className="fa-solid fa-arrow-left" /> Applications</Link>

      <header className="app-head">
        <div>
          <div className="app-head-title">
            <h1>{child}</h1>
            <StatusBadge status={app.status} />
          </div>
          <p>
            Received {formatDateTime(app.created_at)} · {app.user_id ? "Parent portal" : "Website form"}
          </p>
        </div>
        <div className="app-contact-actions">
          {phone ? <a className="admin-btn admin-btn-ghost" href={`tel:${phone}`}><i className="fa-solid fa-phone" /> Call</a> : null}
          {whatsapp ? <a className="admin-btn admin-btn-ghost" href={whatsapp} target="_blank" rel="noreferrer"><i className="fa-brands fa-whatsapp" /> WhatsApp</a> : null}
          {app.email ? (
            <a className="admin-btn" href={`mailto:${app.email}?subject=${encodeURIComponent(`Your application for ${child} – Kampala Junior Academy`)}`}>
              <i className="fa-regular fa-envelope" /> Email
            </a>
          ) : null}
        </div>
      </header>

      <div className="app-detail-grid">
        <div className="app-detail-main">
          <section className="admin-card">
            <h2 className="app-card-title">Child</h2>
            <dl className="app-details">
              <Detail label="Full name">{child}</Detail>
              <Detail label="Date of birth">{app.child_dob ? `${formatDate(app.child_dob)}${age ? ` (${age})` : ""}` : null}</Detail>
              <Detail label="Class">{app.grade}</Detail>
              <Detail label="Preferred campus">{app.campus}</Detail>
            </dl>
          </section>

          <section className="admin-card">
            <h2 className="app-card-title">Parent or guardian</h2>
            <dl className="app-details">
              <Detail label="Full name">{app.parent_name}</Detail>
              <Detail label="Phone">{app.phone ? <a href={`tel:${phone}`}>{app.phone}</a> : null}</Detail>
              <Detail label="Email">{app.email ? <a href={`mailto:${app.email}`}>{app.email}</a> : null}</Detail>
              <Detail label="Portal account">{app.user_id ? "Yes" : "No"}</Detail>
            </dl>
            {app.message ? (
              <div className="app-message">
                <h3>Message</h3>
                <p>{app.message}</p>
              </div>
            ) : null}
          </section>

          <section className="admin-card">
            <h2 className="app-card-title">Notes and activity</h2>
            <NoteForm id={app.id} />
            <ol className="app-timeline">
              {activity.map((entry) => {
                const actor = entry.actor_id ? people.get(entry.actor_id) ?? "Former admin" : "System";
                return (
                  <li key={entry.id} className={`is-${entry.kind}`}>
                    {entry.kind === "note" ? <Avatar name={actor} size="md" /> : (
                      <span className="app-timeline-icon"><i className={KIND_ICONS[entry.kind] ?? "fa-solid fa-circle"} /></span>
                    )}
                    <div>
                      <p className="app-timeline-meta">
                        <strong>{actor}</strong>
                        <span title={formatDateTime(entry.created_at)}>{timeAgo(entry.created_at, now)}</span>
                        {entry.kind === "note" && entry.actor_id === user.id ? <DeleteNoteButton noteId={entry.id} applicationId={app.id} /> : null}
                      </p>
                      {entry.kind === "note" ? <p className="app-note">{entry.body}</p> : <p>{entry.body}</p>}
                    </div>
                  </li>
                );
              })}
              <li className="is-created">
                <span className="app-timeline-icon"><i className="fa-solid fa-inbox" /></span>
                <div>
                  <p className="app-timeline-meta">
                    <strong>{app.parent_name || "Parent"}</strong>
                    <span title={formatDateTime(app.created_at)}>{timeAgo(app.created_at, now)}</span>
                  </p>
                  <p>Submitted the application{app.payment_status === "paid" ? " and paid the admission fee" : ""}</p>
                </div>
              </li>
            </ol>
          </section>
        </div>

        <aside className="app-detail-side">
          <section className="admin-card">
            <h2 className="app-card-title">Manage</h2>
            <ManagePanel
              key={app.updated_at ?? ""}
              id={app.id}
              status={app.status ?? "received"}
              assignedTo={app.assigned_to}
              visitInput={toKampalaInput(app.visit_at)}
              updatedAt={app.updated_at}
              team={team}
              currentUserId={user.id}
            />
            {app.updated_at && updatedBy ? (
              <p className="app-updated">Last changed by {updatedBy} · {timeAgo(app.updated_at, now)}</p>
            ) : null}
          </section>
          <section className={`admin-card apl-paycard${app.payment_status === "paid" ? " is-paid" : ""}`}>
            <h2 className="app-card-title">Admission fee</h2>
            <div className="apl-paycard-head">
              <PaymentBadge paid={app.payment_status === "paid"} />
              {app.admission_fee ? <strong>UGX {app.admission_fee.toLocaleString("en-US")}</strong> : null}
            </div>
            {payment ? (
              <>
                <dl className="apl-paycard-facts">
                  <div><dt>Receipt no.</dt><dd>{payment.receipt_no ?? "—"}</dd></div>
                  <div><dt>Paid on</dt><dd>{formatDateTime(payment.paid_at)}</dd></div>
                  <div><dt>Method</dt><dd>{payment.network ?? "Mobile money"}</dd></div>
                  <div><dt>Paid from</dt><dd>{payment.phone.replace(/^256/, "0")}</dd></div>
                  {payment.transaction_ref ? <div><dt>Transaction</dt><dd className="apl-paycard-ref">{payment.transaction_ref}</dd></div> : null}
                </dl>
                <a className="admin-btn admin-btn-ghost apl-paycard-btn" href={`/apply/receipt/${payment.id}`}>
                  <i className="fa-solid fa-file-arrow-down" aria-hidden="true" /> Download receipt
                </a>
              </>
            ) : (
              <p className="app-muted apl-paycard-note">
                {app.payment_status === "paid" ? "Payment details are not available." : "This application was submitted before online payment was introduced, or without paying the admission fee."}
              </p>
            )}
          </section>
          <DeleteApplicationButton id={app.id} child={child} />
        </aside>
      </div>
    </div>
  );
}
