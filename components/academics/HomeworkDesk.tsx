"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type ClassOption = { value: string; label: string; classCode: string; stream: string; count: number };
type SubjectOption = { id: string; name: string };
type Row = {
  id: string;
  title: string;
  instructions: string | null;
  due_on: string;
  published_at: string | null;
  subject_name: string;
  class_label: string;
  done: number;
};

export function HomeworkDesk({
  termId,
  termLabel,
  subjects,
  classes,
  rows,
  createAction,
  publishAction,
}: {
  termId: string;
  termLabel: string;
  subjects: SubjectOption[];
  classes: ClassOption[];
  rows: Row[];
  createAction: (formData: FormData) => Promise<{ error?: string; ok?: string }>;
  publishAction: (id: string) => Promise<{ error?: string; ok?: string }>;
  base: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  return (
    <>
      <form
        className="ahw-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const selected = String(form.get("class_key") || "");
          const match = classes.find((c) => c.value === selected);
          if (match) {
            form.set("class_code", match.classCode);
            form.set("stream", match.stream);
          }
          form.set("term_id", termId);
          start(async () => {
            setError("");
            setMessage("");
            const result = await createAction(form);
            if (result.error) setError(result.error);
            else {
              setMessage(result.ok || "Saved.");
              event.currentTarget.reset();
              router.refresh();
            }
          });
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Set homework · {termLabel}</h2>
        <div className="ahw-form-grid">
          <label className="ofc-field">
            Class
            <select name="class_key" required defaultValue="">
              <option value="" disabled>
                Choose class
              </option>
              {classes.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label} ({c.count})
                </option>
              ))}
            </select>
          </label>
          <label className="ofc-field">
            Subject
            <select name="subject_id" required defaultValue="">
              <option value="" disabled>
                Choose subject
              </option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ofc-field">
            Title
            <input name="title" required maxLength={160} placeholder="e.g. Read chapter 3" />
          </label>
          <label className="ofc-field">
            Due on
            <input name="due_on" type="date" required />
          </label>
        </div>
        <label className="ofc-field">
          Instructions
          <textarea name="instructions" rows={3} placeholder="What should pupils do?" />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: ".5rem", fontSize: ".9rem" }}>
          <input type="checkbox" name="publish" value="1" defaultChecked />
          Publish now (notify students with a portal login)
        </label>
        <button className="admin-btn" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save homework"}
        </button>
        {error ? <p className="ofc-form-error">{error}</p> : null}
        {message ? <p className="ofc-form-ok">{message}</p> : null}
      </form>

      <section className="ahw-list" aria-label="Homework list">
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>This term</h2>
        {rows.length ? (
          rows.map((row) => (
            <article key={row.id} className="ahw-row">
              <div>
                <strong>{row.title}</strong>
                <p style={{ margin: ".25rem 0 0", color: "#5d6670", fontSize: ".84rem" }}>
                  {row.class_label} · {row.subject_name} · due {row.due_on}
                  {row.published_at ? ` · ${row.done} marked done` : " · draft"}
                </p>
              </div>
              {!row.published_at ? (
                <button
                  type="button"
                  className="admin-btn admin-btn-ghost"
                  disabled={pending}
                  onClick={() => {
                    start(async () => {
                      setError("");
                      const result = await publishAction(row.id);
                      if (result.error) setError(result.error);
                      else {
                        setMessage(result.ok || "Published.");
                        router.refresh();
                      }
                    });
                  }}
                >
                  Publish
                </button>
              ) : (
                <span className="acd-pill is-ok">Published</span>
              )}
            </article>
          ))
        ) : (
          <p className="admin-empty">No homework set for this term yet.</p>
        )}
      </section>
    </>
  );
}
