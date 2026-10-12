import { ActionForm } from "@/components/account/ActionForm";
import { sendParentMessage } from "@/app/account/actions";
import { getPortal } from "@/lib/portal";

export default async function MessagesPage() {
  const { messages } = await getPortal();
  return (
    <div>
      <div className="account-title">
        <div>
          <h1>Messages</h1>
          <p>Write to the school office. Replies from admin appear in this thread.</p>
        </div>
      </div>
      <div className="account-card" style={{ marginBottom: "1rem" }}>
        <h2>New message</h2>
        <ActionForm action={sendParentMessage} success="Message sent.">
          <label>Subject<input name="subject" required /></label>
          <label>Message<textarea name="body" rows={5} required /></label>
          <button className="account-btn" type="submit">Send to admin</button>
        </ActionForm>
      </div>
      <div className="account-list">
        {messages.map((message) => (
          <article key={message.id} className={`account-msg ${message.direction}`}>
            <strong>{message.subject}</strong>
            <div>{message.direction === "out" ? "You" : "School"} · {message.created_at.slice(0, 16).replace("T", " ")}</div>
            <p>{message.body}</p>
          </article>
        ))}
        {!messages.length ? <div className="account-card account-empty">No messages yet.</div> : null}
      </div>
    </div>
  );
}
