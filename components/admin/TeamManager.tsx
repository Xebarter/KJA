"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addAdmin, removeAdmin } from "@/app/admin/(panel)/team/actions";
import { Avatar } from "@/components/admin/Applications";

type Member = { id: string; name: string; email: string | null; open: number; isYou: boolean };
type Result = { error?: string; ok?: string } | null;

function Feedback({ result }: { result: Result }) {
  if (!result) return null;
  return result.error
    ? <p className="app-feedback is-error" role="alert"><i className="fa-solid fa-circle-exclamation" /> {result.error}</p>
    : <p className="app-feedback" role="status"><i className="fa-solid fa-check" /> {result.ok}</p>;
}

export function TeamManager({ members }: { members: Member[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<Result>(null);
  const [pending, startTransition] = useTransition();

  const run = (task: () => Promise<{ error?: string; ok?: string }>, after?: () => void) => {
    startTransition(async () => {
      const outcome = await task();
      setResult(outcome);
      if (!outcome.error) {
        after?.();
        router.refresh();
      }
    });
  };

  return (
    <div className="team-grid">
      <section className="admin-card">
        <h2 className="app-card-title">Admins <span className="app-count">{members.length}</span></h2>
        <ul className="team-list">
          {members.map((member) => (
            <li key={member.id}>
              <Avatar name={member.name} size="md" />
              <div className="team-who">
                <strong>{member.name}{member.isYou ? <span className="team-you">You</span> : null}</strong>
                <small>{member.email}</small>
              </div>
              <span className="team-load" title="Open applications assigned">
                {member.open} open
              </span>
              <button
                type="button"
                className="app-link-btn is-danger"
                disabled={pending || members.length <= 1}
                onClick={() => {
                  const text = member.isYou
                    ? "Remove your own admin access? You will be signed out of the dashboard."
                    : `Remove admin access for ${member.name}?`;
                  if (!window.confirm(text)) return;
                  run(() => removeAdmin(member.id), member.isYou ? () => router.push("/") : undefined);
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="admin-card">
        <h2 className="app-card-title">Add an admin</h2>
        <ol className="team-steps">
          <li>Ask them to create an account using <strong>Parent portal</strong> on the website.</li>
          <li>Enter the email they used below.</li>
          <li>They can then sign in at <code>/admin</code>.</li>
        </ol>
        <form
          className="team-add"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            run(() => addAdmin(data), () => setEmail(""));
          }}
        >
          <label className="visually-hidden" htmlFor="team-email">Email address</label>
          <input id="team-email" name="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@kja.ug" />
          <button className="admin-btn" type="submit" disabled={pending}>{pending ? "Adding…" : "Add admin"}</button>
        </form>
        <Feedback result={result} />
      </section>
    </div>
  );
}
