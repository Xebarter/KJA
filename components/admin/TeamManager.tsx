"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addAdmin, removeAdmin } from "@/app/admin/(panel)/team/actions";
import { initials } from "@/lib/applications";

type Member = { id: string; name: string; email: string | null; open: number; isYou: boolean };
type Outcome = { error?: string; ok?: string };
type Result = (Outcome & { source: "list" | "invite" }) | null;

const ACCESS = [
  { icon: "fa-file-signature", text: "Review, assign and update admission applications" },
  { icon: "fa-newspaper", text: "Write, schedule and publish stories" },
  { icon: "fa-images", text: "Change images and website content" },
  { icon: "fa-user-shield", text: "Add or remove other admins" },
];

function Feedback({ result }: { result: Result }) {
  if (!result) return null;
  return result.error
    ? <p className="tm-feedback is-error" role="alert"><i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {result.error}</p>
    : <p className="tm-feedback" role="status"><i className="fa-solid fa-circle-check" aria-hidden="true" /> {result.ok}</p>;
}

export function TeamManager({ members }: { members: Member[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<Result>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const busiest = Math.max(1, ...members.map((member) => member.open));

  const run = (source: "list" | "invite", task: () => Promise<Outcome>, after?: () => void) => {
    startTransition(async () => {
      const outcome = await task();
      setResult({ ...outcome, source });
      setRemoving(null);
      if (!outcome.error) {
        after?.();
        router.refresh();
      }
    });
  };

  return (
    <div className="tm-grid">
      <section className="tm-panel" id="team-members" aria-labelledby="team-members-title">
        <header className="tm-panel-head">
          <div>
            <h2 id="team-members-title">Admins</h2>
            <p>Workload shows open applications each person owns.</p>
          </div>
          <span className="tm-count">{members.length}</span>
        </header>
        {result?.source === "list" ? <Feedback result={result} /> : null}
        <ul className="tm-members">
          {members.map((member) => (
            <li key={member.id} className={`tm-card${member.isYou ? " is-you" : ""}`}>
              <div className="tm-card-top">
                <span className="tm-avatar" aria-hidden="true">{initials(member.name)}</span>
                <div className="tm-who">
                  <strong>
                    <span>{member.name}</span>
                    {member.isYou ? <em className="tm-you">You</em> : null}
                  </strong>
                  {member.email ? <a href={`mailto:${member.email}`}>{member.email}</a> : <small>No email on file</small>}
                </div>
              </div>
              <div className="tm-load">
                <p>
                  <span>Open applications</span>
                  <strong>{member.open}</strong>
                </p>
                <span className="tm-bar" aria-hidden="true">
                  <span style={{ width: `${(member.open / busiest) * 100}%` }} />
                </span>
              </div>
              <div className="tm-card-actions">
                <Link href={`/admin/applications?owner=${member.isYou ? "me" : member.id}`} className="tm-link">
                  View applications <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  className="tm-remove"
                  disabled={pending || members.length <= 1}
                  title={members.length <= 1 ? "Keep at least one admin" : undefined}
                  onClick={() => {
                    const text = member.isYou
                      ? "Remove your own admin access? You will be signed out of the dashboard."
                      : `Remove admin access for ${member.name}? They will keep their parent portal account.`;
                    if (!window.confirm(text)) return;
                    setRemoving(member.id);
                    run("list", () => removeAdmin(member.id), member.isYou ? () => router.push("/") : undefined);
                  }}
                >
                  <i className="fa-solid fa-user-minus" aria-hidden="true" />
                  {pending && removing === member.id ? "Removing…" : "Remove"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <aside className="tm-side">
        <section className="tm-panel tm-invite" id="team-invite" aria-labelledby="team-invite-title">
          <span className="tm-invite-icon" aria-hidden="true"><i className="fa-solid fa-user-plus" /></span>
          <h2 id="team-invite-title">Add an admin</h2>
          <p>Give a colleague access to this dashboard in three steps.</p>
          <ol className="tm-steps">
            <li><span>1</span><p>They create an account with <strong>Parent portal</strong> on the website.</p></li>
            <li><span>2</span><p>You enter the email address they signed up with below.</p></li>
            <li><span>3</span><p>They sign in at <code>/admin</code> with the same account.</p></li>
          </ol>
          <form
            className="tm-add"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              run("invite", () => addAdmin(data), () => setEmail(""));
            }}
          >
            <label htmlFor="team-email">Email address</label>
            <div className="tm-add-row">
              <span className="tm-add-field">
                <i className="fa-regular fa-envelope" aria-hidden="true" />
                <input id="team-email" name="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@kja.ug" />
              </span>
              <button className="admin-btn" type="submit" disabled={pending}>{pending && !removing ? "Adding…" : "Add admin"}</button>
            </div>
          </form>
          {result?.source === "invite" ? <Feedback result={result} /> : null}
        </section>

        <section className="tm-panel tm-access" aria-labelledby="team-access-title">
          <h2 id="team-access-title">What admins can do</h2>
          <ul>
            {ACCESS.map((item) => (
              <li key={item.text}>
                <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
          <p className="tm-access-note">
            <i className="fa-solid fa-shield-halved" aria-hidden="true" /> Removing an admin keeps their parent portal account; they just lose dashboard access.
          </p>
        </section>
      </aside>
    </div>
  );
}
