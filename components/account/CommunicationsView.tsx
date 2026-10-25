import { CommunicationsInbox } from "@/components/account/CommunicationsInbox";
import type { MessageRow } from "@/lib/account";
import { groupCommThreads } from "@/lib/communications";

export function CommunicationsView({ messages, phone, email }: { messages: MessageRow[]; phone: string; email: string }) {
  const threads = groupCommThreads(messages);
  const unread = threads.reduce((sum, thread) => sum + thread.unread, 0);

  return (
    <div className="ov ms">
      <section className="ch-hero ms-hero">
        <div className="ch-hero-copy">
          <p className="ch-kicker">Inbox</p>
          <h1>Communications</h1>
          <p>
            Messages from the school office and your replies live here in one place — fees, reports, clubs, or anything else you need to ask.
          </p>
        </div>
        {threads.length ? (
          <dl className="ch-hero-stats">
            <div>
              <dt>Conversations</dt>
              <dd>{threads.length}</dd>
            </div>
            <div className={unread ? "ms-hero-unread" : ""}>
              <dt>Unread</dt>
              <dd>{unread}</dd>
            </div>
          </dl>
        ) : null}
      </section>

      <CommunicationsInbox messages={messages} />

      <aside className="rp-help ms-help">
        <span className="rp-help-icon">
          <i className="fa-solid fa-phone-volume" aria-hidden="true" />
        </span>
        <div>
          <strong>Something urgent?</strong>
          <p>For anything that can&apos;t wait, such as a sick child or a safety concern, call the school directly.</p>
        </div>
        <div className="ms-help-actions">
          <a className="ov-btn ov-btn-gold" href={`tel:${phone.replace(/\s/g, "")}`}>
            <i className="fa-solid fa-phone" aria-hidden="true" /> {phone}
          </a>
          <a className="ov-btn ov-btn-glass" href={`mailto:${email}`}>
            <i className="fa-regular fa-envelope" aria-hidden="true" /> {email}
          </a>
        </div>
      </aside>
    </div>
  );
}
