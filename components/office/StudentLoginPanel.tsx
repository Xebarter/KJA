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
    <div className="ofc-student-login">
      {hasLogin && !issued ? (
        <>
          <p>
            Student portal is <strong>on</strong>
            {loginEmail ? <> for <span className="ofc-num">{loginEmail}</span></> : null}.
            Classmate messaging is available in their portal.
          </p>
          <button
            type="button"
            className="admin-btn admin-btn-ghost"
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
            <i className="fa-solid fa-user-slash" aria-hidden="true" /> {pending ? "Working…" : "Revoke login"}
          </button>
        </>
      ) : issued ? (
        <div className="ofc-banner is-ok" style={{ margin: 0 }}>
          <i className="fa-solid fa-key" aria-hidden="true" />
          <div>
            <p><strong>Share these details once</strong>. The password is not stored here.</p>
            <p>Email: <code>{issued.email}</code></p>
            <p>Temporary password: <code>{issued.password}</code></p>
            <p>They should sign in at the school website and change the password.</p>
          </div>
        </div>
      ) : (
        <form
          className="ofc-student-login-form"
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
          <p>Create a student portal account so they can see homework, timetable, and message classmates.</p>
          <label className="ofc-field">
            Login email
            <input name="email" type="email" required placeholder="student@example.com" autoComplete="off" />
          </label>
          <button className="admin-btn" type="submit" disabled={pending}>
            <i className="fa-solid fa-user-plus" aria-hidden="true" /> {pending ? "Creating…" : "Issue login"}
          </button>
        </form>
      )}
      {error ? <p className="ofc-form-error">{error}</p> : null}
      {ok && !issued ? <p className="ofc-form-ok">{ok}</p> : null}
    </div>
  );
}
