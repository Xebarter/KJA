import Link from "next/link";
import { ClosePaneLink, CopyButton, MarkAllRead, MessageList, ReaderActions, type MessageRow } from "@/components/admin/Inbox";
import { PageHeader } from "@/components/admin/PageHeader";
import { formatDateTime, initials, timeAgo, whatsappLink } from "@/lib/applications";
import {
  MESSAGE_KINDS,
  inboxHref,
  kindInfo,
  messagePreview,
  parseMessage,
  replyHref,
  subjectParts,
  telHref,
  type ContactMessage,
  type InboxFilters,
} from "@/lib/inbox";
import "@/app/admin/inbox.css";

export const MESSAGES_BASE = "/admin/inbox/enquiries";
export const MESSAGES_PAGE_SIZE = 30;
const BASE = MESSAGES_BASE;
const DAY = 24 * 60 * 60 * 1000;

export type MessageSummary = Pick<ContactMessage, "id" | "subject" | "read" | "created_at">;

export function MessagesSetup() {
  return (
    <div className="inbox-page">
      <Hero unread={0} week={0} total={0} mix={[]} />
      <div className="admin-card app-notice">
        <h2>Connect Supabase to receive messages</h2>
        <p>Contact, visit and alumni story forms store their submissions in Supabase. Add the project keys to start collecting enquiries here.</p>
      </div>
    </div>
  );
}

export function MessagesView({ filters, summary, rows, total, selected, loadError, nowMs }: {
  filters: InboxFilters;
  summary: MessageSummary[];
  rows: ContactMessage[];
  total: number;
  selected: ContactMessage | null;
  loadError?: string;
  nowMs: number;
}) {
  const counts = new Map<string, number>();
  for (const item of summary) {
    const value = kindInfo(item.subject).value;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const unread = summary.filter((item) => !item.read).length;
  const week = summary.filter((item) => nowMs - new Date(item.created_at).getTime() < 7 * DAY).length;
  const mix = [...MESSAGE_KINDS, { value: "general", label: "General" }]
    .map((item) => ({ value: item.value, label: item.label, count: counts.get(item.value) ?? 0 }))
    .filter((item) => item.count);

  const folders = [
    { value: "all", label: "All enquiries", icon: "fa-inbox", count: summary.length },
    { value: "unread", label: "Unread", icon: "fa-circle-dot", count: unread },
    ...MESSAGE_KINDS.map((item) => ({ value: item.value, label: item.label, icon: item.icon, count: counts.get(item.value) ?? 0 })),
  ].filter((folder) => folder.count > 0 || folder.value === "all" || folder.value === "unread" || folder.value === filters.box);

  const listFilters = { ...filters, id: "" };
  const messageRows: MessageRow[] = rows.map((row) => {
    const info = kindInfo(row.subject);
    const parts = subjectParts(row.subject);
    const name = row.name?.trim() || row.email || "Website visitor";
    return {
      id: row.id,
      href: inboxHref(BASE, filters, { id: row.id }),
      name,
      initials: initials(name),
      kind: info.value,
      kindLabel: info.short,
      kindIcon: info.icon,
      title: parts.title,
      campus: parts.campus,
      preview: messagePreview(row.subject, row.message),
      time: timeAgo(row.created_at, nowMs),
      timeFull: formatDateTime(row.created_at),
      unread: !row.read,
      active: row.id === selected?.id,
    };
  });

  const position = selected ? rows.findIndex((row) => row.id === selected.id) : -1;
  const previous = position > 0 ? rows[position - 1] : null;
  const next = position >= 0 && position < rows.length - 1 ? rows[position + 1] : null;
  const pages = Math.max(1, Math.ceil(total / MESSAGES_PAGE_SIZE));
  const activeFolder = folders.find((folder) => folder.value === filters.box);

  return (
    <div className="inbox-page">
      <Hero unread={unread} week={week} total={summary.length} mix={mix} />

      {loadError ? (
        <p className="app-feedback is-error" role="alert">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> Couldn&apos;t load messages: {loadError}
        </p>
      ) : null}

      <div className={`inbox-shell${filters.id ? " has-reader" : ""}`}>
        <nav className="inbox-rail" aria-label="Message folders">
          <p className="inbox-rail-label">Folders</p>
          <ul>
            {folders.map((folder) => (
              <li key={folder.value}>
                <Link
                  href={inboxHref(BASE, listFilters, { box: folder.value })}
                  className={`${folder.value === filters.box ? "active" : ""}${folder.value === "unread" && folder.count ? " has-unread" : ""}`}
                  aria-current={folder.value === filters.box ? "page" : undefined}
                >
                  <i className={`fa-solid ${folder.icon}`} aria-hidden="true" />
                  <span>{folder.label}</span>
                  <em>{folder.count}</em>
                </Link>
              </li>
            ))}
          </ul>
          <Link className="inbox-rail-extra" href="/admin/inbox/newsletter">
            <i className="fa-solid fa-paper-plane" aria-hidden="true" />
            <span>Newsletter list</span>
            <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </Link>
        </nav>

        <section className="inbox-list" aria-label={activeFolder?.label ?? "Messages"}>
          <div className="inbox-list-head">
            <div>
              <h2>{activeFolder?.label ?? "Messages"}</h2>
              <p>{total === 1 ? "1 message" : `${total} messages`}{filters.q ? ` matching “${filters.q}”` : ""}</p>
            </div>
          </div>
          <form className="inbox-search" action={BASE} role="search">
            {filters.box !== "all" ? <input type="hidden" name="box" value={filters.box} /> : null}
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <label className="visually-hidden" htmlFor="inbox-q">Search messages</label>
            <input id="inbox-q" name="q" type="search" defaultValue={filters.q} placeholder="Search name, email or message…" />
            {filters.q ? (
              <Link href={inboxHref(BASE, listFilters, { q: "" })} className="inbox-search-clear" aria-label="Clear search">
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </Link>
            ) : null}
          </form>

          {messageRows.length ? (
            <MessageList rows={messageRows} />
          ) : (
            <div className="inbox-empty">
              <span><i className={`fa-solid ${filters.q ? "fa-magnifying-glass" : filters.box === "unread" ? "fa-check-double" : "fa-inbox"}`} aria-hidden="true" /></span>
              <h3>{filters.q ? "No matching messages" : filters.box === "unread" ? "You're all caught up" : "No messages yet"}</h3>
              <p>
                {filters.q
                  ? "Try a different name, email address or phrase."
                  : filters.box === "unread"
                    ? "Every message has been read. New enquiries will appear here."
                    : "Messages sent through the website's contact, visit and alumni forms land here."}
              </p>
            </div>
          )}

          {pages > 1 ? (
            <nav className="inbox-pager" aria-label="Message pages">
              <span>Page {filters.page} of {pages}</span>
              <div>
                {filters.page > 1 ? (
                  <Link href={inboxHref(BASE, listFilters, { page: filters.page - 1 })} aria-label="Newer messages"><i className="fa-solid fa-chevron-left" aria-hidden="true" /></Link>
                ) : <span aria-hidden="true"><i className="fa-solid fa-chevron-left" /></span>}
                {filters.page < pages ? (
                  <Link href={inboxHref(BASE, listFilters, { page: filters.page + 1 })} aria-label="Older messages"><i className="fa-solid fa-chevron-right" aria-hidden="true" /></Link>
                ) : <span aria-hidden="true"><i className="fa-solid fa-chevron-right" /></span>}
              </div>
            </nav>
          ) : null}
        </section>

        <section className="inbox-reader" aria-label="Message">
          {selected ? (
            <Reader
              message={selected}
              nowMs={nowMs}
              closeHref={inboxHref(BASE, listFilters)}
              previousHref={previous ? inboxHref(BASE, filters, { id: previous.id }) : ""}
              nextHref={next ? inboxHref(BASE, filters, { id: next.id }) : ""}
            />
          ) : filters.id ? (
            <div className="inbox-placeholder">
              <ClosePaneLink href={inboxHref(BASE, listFilters)} />
              <span><i className="fa-regular fa-envelope" aria-hidden="true" /></span>
              <h3>Message not found</h3>
              <p>It may have been deleted by another admin.</p>
            </div>
          ) : (
            <div className="inbox-placeholder">
              <span><i className="fa-regular fa-envelope-open" aria-hidden="true" /></span>
              <h3>Select a message to read</h3>
              <p>{unread ? `${unread} unread ${unread === 1 ? "message is" : "messages are"} waiting for a reply.` : "Pick any message from the list to see the full details."}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Hero({ unread, week, total, mix }: { unread: number; week: number; total: number; mix: { value: string; label: string; count: number }[] }) {
  return (
    <PageHeader
      kicker="Inbox"
      icon="fa-envelope"
      title="Enquiries"
      description="Website contact forms, campus visit requests and alumni stories — separate from parent Communications."
      actions={
        <>
          <MarkAllRead count={unread} />
          <Link className="admin-hero-btn" href="/admin/communications">
            <i className="fa-solid fa-comments" aria-hidden="true" /> Communications
          </Link>
          <Link className="admin-hero-btn" href="/admin/inbox/newsletter">
            <i className="fa-solid fa-paper-plane" aria-hidden="true" /> Newsletter list
          </Link>
        </>
      }
    >
      <div className="apl-pipeline">
        <p className="apl-pipeline-head">
          <span>Inbox at a glance</span>
          <strong>{total.toLocaleString("en-GB")} total</strong>
        </p>
        <div className="admin-pipeline is-dark" role="img" aria-label={mix.map((item) => `${item.label}: ${item.count}`).join(", ") || "No messages yet"}>
          {mix.map((item) => <span key={item.value} className={`admin-seg inbox-seg-${item.value}`} style={{ flexGrow: item.count }} />)}
        </div>
        <dl className="apl-pipeline-figures">
          <div className={unread ? "is-hot" : undefined}><dt>Unread</dt><dd>{unread}</dd></div>
          <div><dt>This week</dt><dd>{week}</dd></div>
          <div><dt>Visits</dt><dd>{mix.find((item) => item.value === "visit")?.count ?? 0}</dd></div>
        </dl>
      </div>
    </PageHeader>
  );
}

function Reader({ message, nowMs, closeHref, previousHref, nextHref }: {
  message: ContactMessage;
  nowMs: number;
  closeHref: string;
  previousHref: string;
  nextHref: string;
}) {
  const info = kindInfo(message.subject);
  const parts = subjectParts(message.subject);
  const body = parseMessage(message.subject, message.message);
  const name = message.name?.trim() || message.email || "Website visitor";
  const reply = replyHref(message);
  const call = telHref(message.phone);
  const whatsapp = whatsappLink(message.phone);

  return (
    <article className="inbox-message">
      <header className="inbox-message-bar">
        <ClosePaneLink href={closeHref} />
        <div className="inbox-message-nav">
          {previousHref ? (
            <Link href={previousHref} className="inbox-icon-btn" title="Newer message" aria-label="Newer message" scroll={false}><i className="fa-solid fa-chevron-up" aria-hidden="true" /></Link>
          ) : <span className="inbox-icon-btn is-off" aria-hidden="true"><i className="fa-solid fa-chevron-up" /></span>}
          {nextHref ? (
            <Link href={nextHref} className="inbox-icon-btn" title="Older message" aria-label="Older message" scroll={false}><i className="fa-solid fa-chevron-down" aria-hidden="true" /></Link>
          ) : <span className="inbox-icon-btn is-off" aria-hidden="true"><i className="fa-solid fa-chevron-down" /></span>}
        </div>
        <ReaderActions id={message.id} unread={!message.read} email={message.email ?? ""} closeHref={closeHref} />
      </header>

      <div className="inbox-message-head">
        <p className="inbox-message-tags">
          <span className={`inbox-kind is-${info.value}`}><i className={`fa-solid ${info.icon}`} aria-hidden="true" /> {info.short}</span>
          {parts.campus ? <span className="inbox-tag"><i className="fa-solid fa-location-dot" aria-hidden="true" /> {parts.campus}</span> : null}
        </p>
        <h2>{parts.title}</h2>
      </div>

      <div className="inbox-sender">
        <span className={`inbox-avatar inbox-avatar-lg is-${info.value}`} aria-hidden="true">{initials(name)}</span>
        <div className="inbox-sender-info">
          <strong>{name}</strong>
          <span>
            {message.email ? <a href={`mailto:${message.email}`}>{message.email}</a> : null}
            {message.email && message.phone ? <i aria-hidden="true">·</i> : null}
            {message.phone ? <a href={call || undefined}>{message.phone}</a> : null}
          </span>
        </div>
        <time dateTime={message.created_at} title={formatDateTime(message.created_at)}>
          {formatDateTime(message.created_at)}
          <small>{timeAgo(message.created_at, nowMs)}</small>
        </time>
      </div>

      <div className="inbox-body">
        {body.type === "fields" ? (
          <dl className="inbox-fields">
            {body.fields.map((field) => (
              <div key={field.label} className={field.label === "Notes" ? "is-wide" : undefined}>
                <dt>{field.label}</dt>
                <dd>{field.value || "—"}</dd>
              </div>
            ))}
          </dl>
        ) : body.type === "answers" ? (
          <ol className="inbox-answers">
            {body.answers.map((item, index) => (
              <li key={item.question}>
                <span className="inbox-answer-num" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{item.question}</h3>
                  {item.answer ? item.answer.split(/\n+/).map((line, lineIndex) => <p key={lineIndex}>{line}</p>) : <p className="is-empty">No answer given</p>}
                </div>
              </li>
            ))}
          </ol>
        ) : body.paragraphs.length ? (
          body.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)
        ) : (
          <p className="is-empty">This message has no text.</p>
        )}
      </div>

      {info.value === "alumni" ? (
        <aside className="inbox-callout">
          <i className="fa-solid fa-feather-pointed" aria-hidden="true" />
          <div>
            <strong>Turn this into a published alumni story</strong>
            <p>Open a new story draft and use these answers as the starting point.</p>
          </div>
          <Link className="admin-btn admin-btn-ghost" href="/admin/stories/alumni_stories/new">Start a story</Link>
        </aside>
      ) : null}

      <footer className="inbox-reply">
        {reply ? (
          <a className="admin-btn" href={reply}><i className="fa-solid fa-reply" aria-hidden="true" /> Reply by email</a>
        ) : null}
        {whatsapp ? (
          <a className="admin-btn admin-btn-ghost" href={whatsapp} target="_blank" rel="noreferrer"><i className="fa-brands fa-whatsapp" aria-hidden="true" /> WhatsApp</a>
        ) : null}
        {call ? (
          <a className="admin-btn admin-btn-ghost" href={call}><i className="fa-solid fa-phone" aria-hidden="true" /> Call</a>
        ) : null}
        {message.email ? <CopyButton text={message.email} label="Copy email" className="admin-btn admin-btn-ghost" labelled /> : null}
        {!reply && !call ? <p>No contact details were left with this message.</p> : null}
      </footer>
    </article>
  );
}
