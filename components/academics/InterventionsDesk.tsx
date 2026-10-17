"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DeskForm } from "@/components/academics/Form";
import { StudentFace } from "@/components/StudentFace";

export type InterventionCase = {
  id: string;
  studentId: string;
  href: string;
  name: string;
  photoPath: string | null;
  meta: string;
  reasonLabel: string;
  note: string;
  followUp: string;
  due: "overdue" | "today" | "later" | "none";
  status: "open" | "done";
};

type Filter = "all" | "open" | "due" | "done";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "due", label: "Due" },
  { id: "done", label: "Done" },
];

const nf = (value: number) => value.toLocaleString("en-GB");

type Save = (formData: FormData) => Promise<{ error?: string; ok?: string; href?: string }>;

export function InterventionsDesk({ cases, save }: { cases: InterventionCase[]; save: Save }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => ({
    all: cases.length,
    open: cases.filter((row) => row.status === "open").length,
    due: cases.filter((row) => row.due === "overdue" || row.due === "today").length,
    done: cases.filter((row) => row.status === "done").length,
  }), [cases]);

  const visible = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return cases.filter((row) => {
      if (filter === "open" && row.status !== "open") return false;
      if (filter === "done" && row.status !== "done") return false;
      if (filter === "due" && row.due !== "overdue" && row.due !== "today") return false;
      if (!words.length) return true;
      const hay = `${row.name} ${row.meta} ${row.reasonLabel} ${row.note}`.toLowerCase();
      return words.every((word) => hay.includes(word));
    });
  }, [cases, query, filter]);

  return (
    <section className="ivn-card" aria-label="Cases">
      <header className="ivn-card-head">
        <div className="ivn-card-title">
          <span className="ivn-card-icon" aria-hidden="true"><i className="fa-solid fa-hand-holding-heart" /></span>
          <div>
            <h2>Cases</h2>
            <p>Open follow-ups stay here until the school marks them done.</p>
          </div>
        </div>
      </header>
      <div className="ivn-tools">
        <label className="ivn-search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pupil, class, or note" aria-label="Search cases" />
        </label>
        <div className="ivn-statuses" role="tablist" aria-label="Status">
          {FILTERS.map((item) => (
            <button key={item.id} type="button" className={filter === item.id ? "is-on" : ""} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
              {item.label}<em>{nf(counts[item.id])}</em>
            </button>
          ))}
        </div>
      </div>
      {visible.length ? (
        <ul className="ivn-list">
          {visible.map((row) => (
            <li key={row.id} className={`is-${row.status}${row.due === "overdue" ? " is-overdue" : ""}`}>
              <StudentFace id={row.studentId} name={row.name} photoPath={row.photoPath} className="ivn-face" />
              <div className="ivn-body">
                <div className="ivn-line">
                  <Link href={row.href}>{row.name}</Link>
                  <em className={`ivn-pill is-${row.status}`}>{row.status === "done" ? "Done" : "Open"}</em>
                </div>
                <small>{row.meta}</small>
                <p>{row.note}</p>
                <div className="ivn-foot">
                  <span className={row.due === "overdue" ? "is-overdue" : row.due === "today" ? "is-today" : ""}>
                    <i className="fa-regular fa-calendar" aria-hidden="true" />
                    {row.followUp}
                    {row.due === "overdue" ? " · Overdue" : row.due === "today" ? " · Today" : ""}
                  </span>
                  <span className="ivn-reason">{row.reasonLabel}</span>
                </div>
              </div>
              {row.status === "open" ? (
                <DeskForm action={save} className="ivn-done">
                  <input type="hidden" name="id" value={row.id} />
                  <button type="submit" name="intent" value="done">Mark done</button>
                </DeskForm>
              ) : <span className="ivn-closed">Closed</span>}
            </li>
          ))}
        </ul>
      ) : <p className="ivn-quiet">{query.trim() ? "No case matches that search." : filter === "due" ? "Nothing is due today or overdue." : filter === "open" ? "Every case this term is done." : "No cases in this view."}</p>}
    </section>
  );
}
