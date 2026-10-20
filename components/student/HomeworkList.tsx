"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { markHomeworkDone } from "@/app/student/actions";
import type { StudentHomework } from "@/lib/student";

const ZONE = "Africa/Kampala";

function todayYmd() {
  return new Date().toLocaleDateString("en-CA", { timeZone: ZONE });
}

function shortDate(value: string) {
  return new Date(value + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function HomeworkList({ items, filter }: { items: StudentHomework[]; filter: "open" | "done" | "all" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const today = todayYmd();

  const visible = items.filter((row) => {
    if (filter === "open") return !row.done;
    if (filter === "done") return row.done;
    return true;
  });

  return (
    <div className="hw-page">
      <div className="hw-head">
        <div>
          <p className="account-kicker">School</p>
          <h1>Homework</h1>
          <p>Mark work done when you finish. Teachers can see your progress.</p>
        </div>
        <nav className="hw-filters" aria-label="Filter homework">
          <Link href="/student/homework" className={filter === "open" ? "is-active" : ""}>To do</Link>
          <Link href="/student/homework?view=done" className={filter === "done" ? "is-active" : ""}>Done</Link>
          <Link href="/student/homework?view=all" className={filter === "all" ? "is-active" : ""}>All</Link>
        </nav>
      </div>

      {error ? <p className="account-error">{error}</p> : null}

      {visible.length ? (
        <div className="hw-list">
          {visible.map((row) => {
            const overdue = !row.done && row.due_on < today;
            const dueSoon = !row.done && !overdue && row.due_on <= today;
            return (
              <article key={row.id} className={`hw-card${row.done ? " is-done" : ""}${overdue ? " is-overdue" : ""}`}>
                <div>
                  <h2>{row.title}</h2>
                  <p className="hw-meta">
                    {row.done ? <span className="hw-chip is-done">Done</span> : null}
                    {overdue ? <span className="hw-chip is-overdue">Overdue</span> : null}
                    {dueSoon ? <span className="hw-chip is-due">Due today</span> : null}
                    {!row.done && !overdue && !dueSoon ? <span className="hw-chip">Due {shortDate(row.due_on)}</span> : null}
                    {row.subject_name || "Subject"}
                    {!row.done && !dueSoon ? ` · due ${shortDate(row.due_on)}` : ""}
                  </p>
                  {row.instructions ? <p className="hw-meta" style={{ marginTop: ".45rem" }}>{row.instructions}</p> : null}
                </div>
                <div className="hw-actions">
                  <button
                    type="button"
                    className={row.done ? "account-btn account-btn-ghost" : "account-btn"}
                    disabled={pending && busyId === row.id}
                    onClick={() => {
                      setBusyId(row.id);
                      setError("");
                      start(async () => {
                        const result = await markHomeworkDone(row.id, !row.done);
                        setBusyId(null);
                        if (result.error) setError(result.error);
                        else router.refresh();
                      });
                    }}
                  >
                    {row.done ? "Undo" : "Mark done"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="hw-empty">
          <i className="fa-solid fa-book" aria-hidden="true" />
          <p>
            {filter === "done"
              ? "Nothing marked done yet."
              : filter === "open"
                ? "No homework waiting. Nice work!"
                : "No homework has been set for your class yet."}
          </p>
        </div>
      )}
    </div>
  );
}
