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

function subjectTone(name: string | null | undefined) {
  const key = (name || "").toLowerCase();
  if (/math|numeracy|arith/.test(key)) return "sky";
  if (/eng|lit|read|writ|spell/.test(key)) return "rose";
  if (/sci|nature|environ/.test(key)) return "mint";
  if (/soc|hist|geog|cre|relig/.test(key)) return "sun";
  if (/art|music|pe|sport|drama/.test(key)) return "teal";
  return "gold";
}

function subjectIcon(name: string | null | undefined) {
  const key = (name || "").toLowerCase();
  if (/math|numeracy|arith/.test(key)) return "fa-calculator";
  if (/eng|lit|read|writ|spell/.test(key)) return "fa-book-open";
  if (/sci|nature|environ/.test(key)) return "fa-flask";
  if (/soc|hist|geog|cre|relig/.test(key)) return "fa-globe";
  if (/art|music|pe|sport|drama/.test(key)) return "fa-palette";
  return "fa-pencil";
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function looksLikeHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

export function HomeworkList({ items, filter }: { items: StudentHomework[]; filter: "open" | "done" | "all" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const today = todayYmd();

  const open = items.filter((row) => !row.done);
  const done = items.filter((row) => row.done);
  const overdue = open.filter((row) => row.due_on < today);
  const dueToday = open.filter((row) => row.due_on === today);

  const visible = items.filter((row) => {
    if (filter === "open") return !row.done;
    if (filter === "done") return row.done;
    return true;
  });

  const filters = [
    { href: "/student/homework", key: "open" as const, label: "To do", count: open.length, icon: "fa-list-check" },
    { href: "/student/homework?view=done", key: "done" as const, label: "Done", count: done.length, icon: "fa-trophy" },
    { href: "/student/homework?view=all", key: "all" as const, label: "All", count: items.length, icon: "fa-layer-group" },
  ];

  const cheer =
    overdue.length > 0
      ? `You have ${plural(overdue.length, "overdue task")}. Finish those first — you can do it!`
      : dueToday.length > 0
        ? `${plural(dueToday.length, "task")} due today. Steady work wins the day.`
        : open.length > 0
          ? `${plural(open.length, "task")} still to do. One step at a time.`
          : "All caught up — brilliant work!";

  return (
    <div className="hw-page">
      <section className="hw-hero">
        <div className="hw-hero-bg" aria-hidden="true">
          <span className="hw-blob hw-blob-a" />
          <span className="hw-blob hw-blob-b" />
        </div>
        <div className="hw-hero-copy">
          <p className="hw-kicker">
            <i className="fa-solid fa-book-open" aria-hidden="true" />
            School work
          </p>
          <h1>Homework</h1>
          <p className="hw-hero-lead">{cheer}</p>
          <p className="hw-hero-note">Mark work done when you finish. Your teachers can see your progress.</p>
        </div>
        <div className="hw-hero-stats" aria-label="Homework summary">
          <div className="hw-hero-stat hw-hero-stat--todo">
            <strong>{open.length}</strong>
            <span>To do</span>
          </div>
          <div className={`hw-hero-stat hw-hero-stat--late${overdue.length ? " is-hot" : ""}`}>
            <strong>{overdue.length}</strong>
            <span>Overdue</span>
          </div>
          <div className="hw-hero-stat hw-hero-stat--done">
            <strong>{done.length}</strong>
            <span>Done</span>
          </div>
        </div>
      </section>

      <nav className="hw-filters" aria-label="Filter homework">
        {filters.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={`hw-filter hw-filter--${item.key}${filter === item.key ? " is-active" : ""}`}
          >
            <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
            <span>{item.label}</span>
            <em>{item.count}</em>
          </Link>
        ))}
      </nav>

      {error ? (
        <p className="hw-error" role="alert">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      {visible.length ? (
        <div className="hw-list">
          {visible.map((row, index) => {
            const overdueItem = !row.done && row.due_on < today;
            const dueSoon = !row.done && !overdueItem && row.due_on <= today;
            const tone = subjectTone(row.subject_name);
            const icon = subjectIcon(row.subject_name);
            return (
              <article
                key={row.id}
                className={`hw-card hw-card--${tone}${row.done ? " is-done" : ""}${overdueItem ? " is-overdue" : ""}`}
                style={{ animationDelay: `${Math.min(index, 8) * 0.04}s` }}
              >
                <span className="hw-card-icon" aria-hidden="true">
                  <i className={`fa-solid ${icon}`} />
                </span>
                <div className="hw-card-body">
                  <div className="hw-card-top">
                    <h2>{row.title}</h2>
                    <div className="hw-chips">
                      {row.done ? (
                        <span className="hw-chip is-done">
                          <i className="fa-solid fa-check" aria-hidden="true" /> Done
                        </span>
                      ) : null}
                      {overdueItem ? (
                        <span className="hw-chip is-overdue">
                          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> Overdue
                        </span>
                      ) : null}
                      {dueSoon ? (
                        <span className="hw-chip is-due">
                          <i className="fa-solid fa-clock" aria-hidden="true" /> Due today
                        </span>
                      ) : null}
                      {!row.done && !overdueItem && !dueSoon ? (
                        <span className="hw-chip">
                          <i className="fa-solid fa-calendar-day" aria-hidden="true" /> Due {shortDate(row.due_on)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <p className="hw-meta">
                    <span className="hw-subject">{row.subject_name || "Subject"}</span>
                    {row.done && row.done_at ? ` · finished ${shortDate(row.done_at.slice(0, 10))}` : null}
                    {!row.done && (overdueItem || dueSoon) ? ` · due ${shortDate(row.due_on)}` : null}
                  </p>
                  {row.instructions ? (
                    looksLikeHtml(row.instructions) ? (
                      <div className="hw-instructions hw-prose" dangerouslySetInnerHTML={{ __html: row.instructions }} />
                    ) : (
                      <p className="hw-instructions">{row.instructions}</p>
                    )
                  ) : null}
                </div>
                <div className="hw-actions">
                  <button
                    type="button"
                    className={row.done ? "hw-btn hw-btn--ghost" : "hw-btn hw-btn--primary"}
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
                    {pending && busyId === row.id ? (
                      <>
                        <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
                        Saving…
                      </>
                    ) : row.done ? (
                      <>
                        <i className="fa-solid fa-rotate-left" aria-hidden="true" />
                        Undo
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-circle-check" aria-hidden="true" />
                        Mark done
                      </>
                    )}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className={`hw-empty hw-empty--${filter}`}>
          <span aria-hidden="true">
            <i className={`fa-solid ${filter === "done" ? "fa-medal" : filter === "open" ? "fa-trophy" : "fa-book-open"}`} />
          </span>
          <h2>
            {filter === "done"
              ? "No finished homework yet"
              : filter === "open"
                ? "Nothing left to do"
                : "No homework yet"}
          </h2>
          <p>
            {filter === "done"
              ? "When you mark tasks done, they will show up here."
              : filter === "open"
                ? "Nice work — enjoy your free time, or peek at My class."
                : "Your teachers have not set homework for your class yet."}
          </p>
          {filter === "open" ? (
            <Link className="hw-empty-link" href="/student/class">
              Visit My class <i className="fa-solid fa-arrow-right" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}
