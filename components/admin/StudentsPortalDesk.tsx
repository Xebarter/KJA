"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createStudentForPortal,
  issueAdminStudentLogin,
  revokeAdminStudentLogin,
} from "@/app/admin/(panel)/students/actions";
import { StudentFace } from "@/components/StudentFace";
import { noteProcess } from "@/lib/process-signal";
import { SCHOOL_CLASSES, className } from "@/lib/students";

export type PortalStudentRow = {
  id: string;
  full_name: string;
  student_number: string | null;
  class_code: string | null;
  stream: string | null;
  status: string;
  hasLogin: boolean;
  loginEmail: string | null;
  /** Path string when known; null = no photo; undefined = unknown (try by id). */
  photo_path?: string | null;
};

type Filter = "all" | "on" | "off";
type Issued = { email: string; password: string; name: string };

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "on", label: "Has login" },
  { id: "off", label: "No login" },
];

const nf = (value: number) => value.toLocaleString("en-GB");

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function StudentsPortalDesk({ students }: { students: PortalStudentRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [issueFor, setIssueFor] = useState<string | null>(null);
  const [copied, setCopied] = useState<"email" | "password" | null>(null);

  const counts = useMemo(
    () => ({
      all: students.length,
      on: students.filter((row) => row.hasLogin).length,
      off: students.filter((row) => !row.hasLogin).length,
    }),
    [students],
  );

  const visible = useMemo(() => {
    const words = deferredQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return students.filter((row) => {
      if (filter === "on" && !row.hasLogin) return false;
      if (filter === "off" && row.hasLogin) return false;
      if (!words.length) return true;
      const hay = `${row.full_name} ${row.student_number || ""} ${row.class_code || ""} ${row.stream || ""} ${row.loginEmail || ""}`.toLowerCase();
      return words.every((word) => hay.includes(word));
    });
  }, [students, deferredQuery, filter]);

  function run(
    task: () => Promise<{ error?: string; ok?: string; email?: string; password?: string; studentId?: string }>,
    name?: string,
    label = "Saving",
  ) {
    setNotice(null);
    noteProcess(label);
    start(async () => {
      const result = await task();
      setBusyId(null);
      if (result.error) {
        setNotice({ tone: "error", text: result.error });
        return;
      }
      if (result.email && result.password) {
        setIssued({ email: result.email, password: result.password, name: name || "Student" });
        setIssueFor(null);
        setCopied(null);
      }
      setNotice({ tone: "ok", text: result.ok || "Done." });
      router.refresh();
    });
  }

  return (
    <div className="asp-desk">
      <div className="asp-strip" aria-label="Portal summary">
        <div>
          <span className="asp-stat-icon" aria-hidden="true"><i className="fa-solid fa-users" /></span>
          <div className="asp-stat-copy">
            <span>Pupils</span>
            <strong>{nf(counts.all)}</strong>
            <small>On the register</small>
          </div>
        </div>
        <div className="is-ok">
          <span className="asp-stat-icon" aria-hidden="true"><i className="fa-solid fa-key" /></span>
          <div className="asp-stat-copy">
            <span>Has login</span>
            <strong>{nf(counts.on)}</strong>
            <small>Portal ready</small>
          </div>
        </div>
        <div className={counts.off ? "is-warn" : "is-ok"}>
          <span className="asp-stat-icon" aria-hidden="true"><i className="fa-solid fa-user-lock" /></span>
          <div className="asp-stat-copy">
            <span>No login</span>
            <strong>{nf(counts.off)}</strong>
            <small>Need access</small>
          </div>
        </div>
        <div>
          <span className="asp-stat-icon" aria-hidden="true"><i className="fa-solid fa-list" /></span>
          <div className="asp-stat-copy">
            <span>Showing</span>
            <strong>{nf(visible.length)}</strong>
            <small>In this view</small>
          </div>
        </div>
      </div>

      {issued ? (
        <div className="asp-banner is-ok" role="status">
          <i className="fa-solid fa-key" aria-hidden="true" />
          <div className="asp-banner-body">
            <p><strong>Share these details once</strong> for {issued.name} — the password is not stored here.</p>
            <div className="asp-cred">
              <span>Email</span>
              <code>{issued.email}</code>
              <button
                type="button"
                className="admin-btn admin-btn-ghost"
                onClick={async () => {
                  if (await copyText(issued.email)) setCopied("email");
                }}
              >
                {copied === "email" ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="asp-cred">
              <span>Password</span>
              <code>{issued.password}</code>
              <button
                type="button"
                className="admin-btn admin-btn-ghost"
                onClick={async () => {
                  if (await copyText(issued.password)) setCopied("password");
                }}
              >
                {copied === "password" ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="asp-banner-hint">They sign in on the school website, then change the password.</p>
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setIssued(null)}>Dismiss</button>
          </div>
        </div>
      ) : null}

      {notice && !issued ? (
        <p className={`asp-notice is-${notice.tone}`} role="status">
          <i className={`fa-solid ${notice.tone === "ok" ? "fa-circle-check" : "fa-circle-exclamation"}`} aria-hidden="true" />
          {notice.text}
        </p>
      ) : null}

      <div className="asp-layout">
        <section className="asp-card" aria-label="Students">
          <header className="asp-card-head">
            <div className="asp-card-title">
              <span className="asp-card-icon" aria-hidden="true"><i className="fa-solid fa-user-graduate" /></span>
              <div>
                <h2>Students</h2>
                <p>Search a pupil, then issue or revoke portal access.</p>
              </div>
            </div>
          </header>

          <div className="asp-tools">
            <label className="asp-search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, number, class, or email"
                aria-label="Search students"
              />
              {query ? (
                <button type="button" className="asp-search-clear" aria-label="Clear search" onClick={() => setQuery("")}>
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              ) : null}
            </label>
            <div className="asp-filters" role="tablist" aria-label="Portal filter">
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={filter === item.id ? "is-on" : ""}
                  aria-pressed={filter === item.id}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                  <em>{nf(counts[item.id])}</em>
                </button>
              ))}
            </div>
          </div>

          {visible.length ? (
            <ul className="asp-list">
              {visible.map((row) => {
                const meta = [row.student_number, className(row.class_code), row.stream].filter(Boolean).join(" · ");
                const opening = issueFor === row.id;
                const busy = busyId === row.id;
                return (
                  <li key={row.id} className={`${row.hasLogin ? "is-on" : ""}${opening ? " is-issuing" : ""}`}>
                    <StudentFace
                      id={row.id}
                      name={row.full_name}
                      photoPath={row.photo_path}
                      className="asp-face"
                    />
                    <div className="asp-who">
                      <strong>{row.full_name}</strong>
                      <small>{meta || "No class"}</small>
                      {row.loginEmail ? <span className="asp-email">{row.loginEmail}</span> : null}
                    </div>
                    <div className="asp-status">
                      {row.hasLogin ? (
                        <span className="asp-pill is-on"><i className="fa-solid fa-check" aria-hidden="true" /> Portal on</span>
                      ) : (
                        <span className="asp-pill is-off">No login</span>
                      )}
                    </div>
                    <div className="asp-actions">
                      {row.hasLogin ? (
                        <button
                          type="button"
                          className="admin-btn admin-btn-ghost"
                          disabled={pending}
                          onClick={() => {
                            if (!confirm(`Revoke the portal login for ${row.full_name}?`)) return;
                            setBusyId(row.id);
                            run(() => revokeAdminStudentLogin(row.id), undefined, "Revoking login");
                          }}
                        >
                          <i className="fa-solid fa-user-slash" aria-hidden="true" />
                          {busy ? "Working…" : "Revoke"}
                        </button>
                      ) : opening ? (
                        <form
                          className="asp-issue"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const form = new FormData(event.currentTarget);
                            setBusyId(row.id);
                            run(() => issueAdminStudentLogin(row.id, form), row.full_name, "Issuing login");
                          }}
                        >
                          <input
                            name="email"
                            type="email"
                            required
                            placeholder="student@example.com"
                            autoComplete="off"
                            autoFocus
                          />
                          <button className="admin-btn" type="submit" disabled={pending}>
                            {busy ? "Creating…" : "Issue"}
                          </button>
                          <button type="button" className="admin-btn admin-btn-ghost" disabled={pending} onClick={() => setIssueFor(null)}>
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          className="admin-btn"
                          disabled={pending}
                          onClick={() => setIssueFor(row.id)}
                        >
                          <i className="fa-solid fa-user-plus" aria-hidden="true" /> Issue login
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="asp-empty">
              <span className="asp-empty-icon" aria-hidden="true"><i className="fa-regular fa-address-card" /></span>
              <strong>{students.length ? "No pupils match this filter" : "No pupils on the register yet"}</strong>
              <p>
                {students.length
                  ? "Try All, clear the search, or create a new student on the right."
                  : "Create a student below, then share their temporary portal password."}
              </p>
            </div>
          )}
        </section>

        <section className="asp-card asp-create" aria-label="New student">
          <header className="asp-card-head">
            <div className="asp-card-title">
              <span className="asp-card-icon" aria-hidden="true"><i className="fa-solid fa-user-plus" /></span>
              <div>
                <h2>New student</h2>
                <p>Add a pupil and optionally issue portal access now.</p>
              </div>
            </div>
          </header>
          <form
            className="asp-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              const name = [String(data.get("surname") || ""), String(data.get("given_names") || "")].filter(Boolean).join(" ");
              setBusyId("create");
              run(async () => {
                const result = await createStudentForPortal(data);
                if (!result.error) form.reset();
                return result;
              }, name || "Student", "Creating the student");
            }}
          >
            <label className="ofc-field">
              <span>Surname</span>
              <input name="surname" required maxLength={80} autoComplete="off" />
            </label>
            <label className="ofc-field">
              <span>Given names</span>
              <input name="given_names" required maxLength={120} autoComplete="off" />
            </label>
            <div className="asp-form-row">
              <label className="ofc-field">
                <span>Class</span>
                <select name="class_code" required defaultValue="">
                  <option value="" disabled>Choose class</option>
                  {SCHOOL_CLASSES.map((entry) => (
                    <option key={entry.code} value={entry.code}>{entry.name}</option>
                  ))}
                </select>
              </label>
              <label className="ofc-field">
                <span>Stream</span>
                <input name="stream" maxLength={20} placeholder="A" autoComplete="off" />
              </label>
            </div>
            <div className="asp-form-row">
              <label className="ofc-field">
                <span>Date of birth</span>
                <input name="date_of_birth" type="date" required />
              </label>
              <label className="ofc-field">
                <span>Sex</span>
                <select name="sex" defaultValue="">
                  <option value="">Optional</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </label>
            </div>
            <label className="ofc-field">
              <span>Portal email <em>optional — issues login now</em></span>
              <input name="email" type="email" placeholder="student@example.com" autoComplete="off" />
            </label>
            <button className="admin-btn" type="submit" disabled={pending}>
              <i className="fa-solid fa-plus" aria-hidden="true" />
              {busyId === "create" ? "Saving…" : "Create student"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
