import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/admin/Applications";
import {
  CopyEmail,
  DeleteJobApplicationButton,
  DeleteJobNoteButton,
  JobManagePanel,
  JobNoteForm,
  RatingPicker,
  StageActions,
} from "@/components/admin/JobApplicationParts";
import { loadPeople, loadTeam, requireAdmin } from "@/lib/admin-applications";
import { formatDate, formatDateTime, initials, timeAgo, toKampalaInput, whatsappLink } from "@/lib/applications";
import {
  fileIcon,
  fileSize,
  jobReference,
  replyTemplates,
  roleTitle,
  stageInfo,
  toJobApplication,
} from "@/lib/job-applications";
import { interviewLabel, signDocuments } from "@/lib/job-applications-server";
import "../../../../../vacancies.css";

export const metadata = { title: "Job application" };

const KIND_ICONS: Record<string, string> = {
  note: "fa-regular fa-comment",
  status: "fa-solid fa-arrows-rotate",
  assign: "fa-solid fa-user-check",
  interview: "fa-regular fa-calendar",
  rating: "fa-regular fa-star",
};

type Activity = { id: string; actor_id: string | null; kind: string; body: string; created_at: string };

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="app-detail">
      <dt>{label}</dt>
      <dd>{children || <span className="app-muted">Not given</span>}</dd>
    </div>
  );
}

export default async function JobApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const auth = await requireAdmin();
  if ("error" in auth) {
    return <div className="admin-card app-notice"><h2>Not available</h2><p>{auth.error}</p></div>;
  }
  const { supabase, user } = auth;
  const { data } = await supabase.from("job_applications").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const app = toJobApplication(data as Record<string, unknown>);
  if (!app.read) await supabase.from("job_applications").update({ read: true }).eq("id", id);

  const siblings = supabase.from("job_applications").select("id, full_name, created_at").order("created_at", { ascending: false }).limit(500);
  const [{ data: activityData }, team, documents, { data: peers }, { data: history }] = await Promise.all([
    supabase.from("job_application_activity").select("id, actor_id, kind, body, created_at").eq("application_id", id).order("created_at", { ascending: false }),
    loadTeam(supabase),
    signDocuments(supabase, app.documents),
    app.vacancy_id ? siblings.eq("vacancy_id", app.vacancy_id) : siblings.is("vacancy_id", null),
    supabase.from("job_applications").select("id, vacancy_title, vacancy_id, status, created_at").eq("email", app.email).neq("id", id).order("created_at", { ascending: false }).limit(10),
  ]);
  const activity = (activityData || []) as Activity[];
  const people = await loadPeople(supabase, [app.assigned_to, app.updated_by, ...activity.map((entry) => entry.actor_id)]);
  const now = Date.now();

  const role = roleTitle(app);
  const info = stageInfo(app.status);
  const phone = app.phone.replace(/\s/g, "");
  const whatsapp = whatsappLink(app.phone);
  const updatedBy = app.updated_by ? people.get(app.updated_by) : null;
  const interview = interviewLabel(app.interview_at);
  const templates = replyTemplates(app, interview);
  const cv = documents.find((doc) => doc.kind === "cv");
  const order = (peers ?? []) as { id: string; full_name: string }[];
  const at = order.findIndex((row) => row.id === id);
  const newer = at > 0 ? order[at - 1] : null;
  const older = at >= 0 && at < order.length - 1 ? order[at + 1] : null;
  const listHref = `/admin/content/vacancies?view=applications${app.vacancy_id ? `&role=${app.vacancy_id}` : "&role=general"}`;

  return (
    <div className="app-page ja-detail">
      <div className="ja-detail-top">
        <Link href={listHref} className="app-back"><i className="fa-solid fa-arrow-left" /> {app.vacancy_id ? `Applicants for ${role}` : "General applications"}</Link>
        {order.length > 1 && at >= 0 ? (
          <nav className="ja-pager" aria-label="Other applicants">
            <span>{at + 1} of {order.length}</span>
            {newer ? <Link href={`/admin/content/vacancies/applications/${newer.id}`} title={newer.full_name} aria-label={`Previous: ${newer.full_name}`}><i className="fa-solid fa-chevron-left" /></Link> : <span className="is-off"><i className="fa-solid fa-chevron-left" /></span>}
            {older ? <Link href={`/admin/content/vacancies/applications/${older.id}`} title={older.full_name} aria-label={`Next: ${older.full_name}`}><i className="fa-solid fa-chevron-right" /></Link> : <span className="is-off"><i className="fa-solid fa-chevron-right" /></span>}
          </nav>
        ) : null}
      </div>

      <header className="app-head ja-head">
        <div className="ja-head-who">
          <span className="ja-head-avatar" aria-hidden="true">{initials(app.full_name)}</span>
          <div>
            <div className="app-head-title">
              <h1>{app.full_name}</h1>
              <span className={`app-status app-status-${info.tone}`}>{info.label}</span>
            </div>
            <p>
              Applied for <strong>{role}</strong> · {formatDateTime(app.created_at)} · Ref {jobReference(app.id)}
            </p>
          </div>
        </div>
        <div className="app-contact-actions">
          {phone ? <a className="admin-btn admin-btn-ghost" href={`tel:${phone}`}><i className="fa-solid fa-phone" /> Call</a> : null}
          {whatsapp ? <a className="admin-btn admin-btn-ghost" href={whatsapp} target="_blank" rel="noreferrer"><i className="fa-brands fa-whatsapp" /> WhatsApp</a> : null}
          <a className="admin-btn" href={`mailto:${app.email}?subject=${encodeURIComponent(`Your application for ${role} – Kampala Junior Academy`)}`}>
            <i className="fa-regular fa-envelope" /> Email
          </a>
        </div>
      </header>

      <section className="admin-card ja-stage-card">
        <StageActions id={app.id} stage={app.status} />
      </section>

      <div className="app-detail-grid">
        <div className="app-detail-main">
          <section className="admin-card">
            <h2 className="app-card-title">Application</h2>
            <dl className="app-details">
              <Detail label="Role">{app.vacancy_id ? <Link href={`/admin/content/vacancies/${app.vacancy_id}`}>{role}</Link> : role}</Detail>
              <Detail label="Preferred campus">{app.campus || "Any campus"}</Detail>
              <Detail label="Highest qualification">{app.qualification}</Detail>
              <Detail label="Experience">{app.experience}</Detail>
              <Detail label="Current or recent role">{app.current_position}</Detail>
              <Detail label="Available to start">{app.available_from ? formatDate(app.available_from) : null}</Detail>
              <Detail label="Email">
                <span className="ja-inline"><a href={`mailto:${app.email}`}>{app.email}</a> <CopyEmail email={app.email} /></span>
              </Detail>
              <Detail label="Phone">{app.phone ? <a href={`tel:${phone}`}>{app.phone}</a> : null}</Detail>
              <Detail label="Lives in">{app.location}</Detail>
              <Detail label="Interview">{interview || null}</Detail>
            </dl>
          </section>

          <section className="admin-card">
            <h2 className="app-card-title">Documents <span className="app-count">{documents.length}</span></h2>
            {documents.length ? (
              <ul className="ja-docs">
                {documents.map((doc) => (
                  <li key={doc.path} className={doc.kind === "cv" ? "is-cv" : ""}>
                    <i className={`fa-solid ${fileIcon(doc.type)} ja-doc-icon`} aria-hidden="true" />
                    <span className="ja-doc-text">
                      <strong title={doc.name}>{doc.name}</strong>
                      <small>{doc.kind === "cv" ? "CV" : "Supporting document"} · {fileSize(doc.size)}</small>
                    </span>
                    {doc.view ? (
                      <a className="admin-btn admin-btn-ghost" href={doc.view} target="_blank" rel="noreferrer"><i className="fa-regular fa-eye" /> Open</a>
                    ) : null}
                    {doc.download ? (
                      <a className="admin-btn" href={doc.download}><i className="fa-solid fa-download" /> Download</a>
                    ) : (
                      <span className="app-muted">Unavailable</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="app-muted">No documents were attached.</p>
            )}
            {cv?.view && cv.type === "application/pdf" ? (
              <details className="ja-preview" open>
                <summary><i className="fa-solid fa-file-pdf" aria-hidden="true" /> CV preview</summary>
                <iframe src={`${cv.view}#view=FitH`} title={`CV of ${app.full_name}`} loading="lazy" />
              </details>
            ) : null}
          </section>

          <section className="admin-card">
            <h2 className="app-card-title">Why they&apos;re a good fit</h2>
            {app.cover_letter ? <div className="app-message ja-letter"><p>{app.cover_letter}</p></div> : <p className="app-muted">No cover note.</p>}
          </section>

          <section className="admin-card">
            <h2 className="app-card-title">Notes and activity</h2>
            <JobNoteForm id={app.id} />
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
                        {entry.kind === "note" && entry.actor_id === user.id ? <DeleteJobNoteButton noteId={entry.id} applicationId={app.id} /> : null}
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
                    <strong>{app.full_name}</strong>
                    <span title={formatDateTime(app.created_at)}>{timeAgo(app.created_at, now)}</span>
                  </p>
                  <p>Applied on the careers page with {app.documents.length} {app.documents.length === 1 ? "document" : "documents"}</p>
                </div>
              </li>
            </ol>
          </section>
        </div>

        <aside className="app-detail-side">
          <section className="admin-card">
            <h2 className="app-card-title">Manage</h2>
            <JobManagePanel
              key={app.updated_at ?? ""}
              id={app.id}
              status={app.status}
              assignedTo={app.assigned_to}
              interviewInput={toKampalaInput(app.interview_at)}
              updatedAt={app.updated_at}
              team={team}
              currentUserId={user.id}
            />
            {app.updated_at && updatedBy ? (
              <p className="app-updated">Last changed by {updatedBy} · {timeAgo(app.updated_at, now)}</p>
            ) : null}
          </section>

          <section className="admin-card">
            <h2 className="app-card-title">Your rating</h2>
            <RatingPicker key={String(app.rating)} id={app.id} rating={app.rating} />
          </section>

          <section className="admin-card">
            <h2 className="app-card-title">Reply by email</h2>
            <p className="ja-side-hint">Opens a ready-written message in your email app. Review it before sending.</p>
            <ul className="ja-replies">
              {templates.map((template) => (
                <li key={template.key}>
                  <a href={template.href}>
                    <i className={`fa-solid ${template.icon}`} aria-hidden="true" />
                    <span>{template.label}</span>
                    <i className="fa-solid fa-arrow-up-right-from-square ja-replies-go" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </section>

          {history?.length ? (
            <section className="admin-card">
              <h2 className="app-card-title">Other applications <span className="app-count">{history.length}</span></h2>
              <ul className="ja-history">
                {history.map((row) => {
                  const stage = stageInfo(row.status);
                  return (
                    <li key={row.id}>
                      <Link href={`/admin/content/vacancies/applications/${row.id}`}>
                        <strong>{row.vacancy_title || "General application"}</strong>
                        <small>{formatDate(row.created_at)}</small>
                      </Link>
                      <span className={`app-status app-status-${stage.tone}`}>{stage.label}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <DeleteJobApplicationButton id={app.id} name={app.full_name} />
        </aside>
      </div>
    </div>
  );
}
