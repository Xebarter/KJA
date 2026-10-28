"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { issueStudentLogin, revokeStudentLogin } from "@/app/admissions_office/(office)/students/actions";

export function StudentLoginPanel({
  studentId,
  studentName,
  hasLogin,
  loginEmail,
}: {
  studentId: string;
  studentName: string;
  hasLogin: boolean;
  loginEmail: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);

  return (
    <div className="ofc-portal">
      {hasLogin && !issued ? (
        <div className="ofc-portal-active">
          <div className="ofc-portal-status">
            <span className="ofc-portal-pill is-on">
              <i className="fa-solid fa-check" aria-hidden="true" />
              Portal on
            </span>
            <p>Homework, timetable and classmate messaging are available.</p>
          </div>
          {loginEmail ? (
            <div className="ofc-portal-email">
              <span>Login</span>
              <code className="ofc-num">{loginEmail}</code>
            </div>
          ) : null}
          <button
            type="button"
            className="ofc-portal-btn is-ghost"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Revoke the portal login for ${studentName}?`)) return;
              start(async () => {
                setError("");
                setOk("");
                const result = await revokeStudentLogin(studentId);
                if (result.error) setError(result.error);
                else {
                  setOk(result.ok || "Revoked.");
                  router.refresh();
                }
              });
            }}
          >
            <i className="fa-solid fa-user-slash" aria-hidden="true" />
            {pending ? "Working…" : "Revoke login"}
          </button>
        </div>
      ) : issued ? (
        <div className="ofc-portal-issued" role="status">
          <header>
            <span className="ofc-portal-issued-icon" aria-hidden="true">
              <i className="fa-solid fa-key" />
            </span>
            <div>
              <strong>Share these details once</strong>
              <p>The password is not stored here. They should sign in on the school website and change it.</p>
            </div>
          </header>
          <dl className="ofc-portal-creds">
            <div>
              <dt>Email</dt>
              <dd><code>{issued.email}</code></dd>
            </div>
            <div>
              <dt>Temporary password</dt>
              <dd><code>{issued.password}</code></dd>
            </div>
          </dl>
        </div>
      ) : (
        <form
          className="ofc-portal-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            start(async () => {
              setError("");
              setOk("");
              const result = await issueStudentLogin(studentId, form);
              if (result.error) {
                setError(result.error);
                return;
              }
              if (result.email && result.password) {
                setIssued({ email: result.email, password: result.password });
              }
              setOk(result.ok || "Login created.");
              router.refresh();
            });
          }}
        >
          <div className="ofc-portal-status">
            <span className="ofc-portal-pill is-off">No login</span>
            <p>Create access so they can see homework, timetable and message classmates.</p>
          </div>
          <label className="ofc-portal-field">
            <span>Login email</span>
            <input name="email" type="email" required placeholder="student@example.com" autoComplete="off" />
          </label>
          <button className="ofc-portal-btn is-primary" type="submit" disabled={pending}>
            <i className="fa-solid fa-user-plus" aria-hidden="true" />
            {pending ? "Creating…" : "Issue login"}
          </button>
        </form>
      )}
      {error ? <p className="ofc-portal-msg is-error">{error}</p> : null}
      {ok && !issued ? <p className="ofc-portal-msg is-ok">{ok}</p> : null}
    </div>
  );
}
