"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DeskForm } from "@/components/academics/Form";
import { classOrder, classSection } from "@/lib/academics";

type Save = (formData: FormData) => Promise<{ error?: string; ok?: string; href?: string }>;

export type OpenRegister = {
  key: string;
  name: string;
  href: string;
  unmarked: number;
  pupils: number;
  classCode: string;
  stream: string;
};

const nf = (value: number) => value.toLocaleString("en-GB");

export function OpenRegisters({
  date,
  termId,
  rows,
  cancel,
}: {
  date: string;
  termId: string;
  rows: OpenRegister[];
  cancel: Save;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const searchId = useId();
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) keepRef.current?.focus();
  }, [confirming]);

  const ordered = useMemo(() => {
    return [...rows].sort((a, b) => {
      const order = (classOrder(a.classCode) ?? 99) - (classOrder(b.classCode) ?? 99);
      if (order) return order;
      return a.name.localeCompare(b.name, "en");
    });
  }, [rows]);

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? ordered.filter((row) => `${row.name} ${row.classCode} ${row.stream}`.toLowerCase().includes(needle))
    : ordered;
  const sections = (["nursery", "primary"] as const)
    .map((section) => ({
      section,
      label: section === "nursery" ? "Nursery" : "Primary",
      rows: visible.filter((row) => classSection(row.classCode) === section),
    }))
    .filter((section) => section.rows.length);
  const showHeads = sections.length > 1;
  const unmarked = rows.reduce((sum, row) => sum + row.unmarked, 0);
  const first = ordered[0];

  if (!rows.length) return null;

  return (
    <section className="reg-open" aria-label="Open registers">
      <header className="reg-open-head">
        <span className="reg-open-icon" aria-hidden="true"><i className="fa-solid fa-clipboard-user" /></span>
        <div className="reg-open-copy">
          <h2>Open registers</h2>
          <p>
            {nf(rows.length)} {rows.length === 1 ? "class still needs" : "classes still need"} a register.
            Take one off today's count if it should not be marked. Saved marks stay.
          </p>
        </div>
        <p className="reg-open-meta">
          <strong>{nf(unmarked)}</strong>
          <span>to mark</span>
        </p>
        {first ? (
          <Link className="reg-open-go" href={first.href} aria-label={`Mark ${first.name}`}>
            {rows.length === 1 ? "Open register" : "Mark next"}
            <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </Link>
        ) : null}
      </header>

      {rows.length > 6 ? (
        <label className="reg-open-search" htmlFor={searchId}>
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <span className="sr-only">Find a register</span>
          <input id={searchId} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a class" />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          ) : null}
        </label>
      ) : null}

      {visible.length ? (
        <div className="reg-open-groups">
          {sections.map((section) => (
            <div key={section.section}>
              {showHeads ? <h3 className="reg-open-label"><span>{section.label}</span><em>{nf(section.rows.length)}</em></h3> : null}
              <ul>
                {section.rows.map((row) => {
                  const pupils = Math.max(row.pupils, row.unmarked);
                  const done = Math.max(0, pupils - row.unmarked);
                  const width = pupils ? Math.round((done / pupils) * 100) : 0;
                  const asking = confirming === row.key;
                  return (
                    <li key={row.key} className={asking ? "is-asking" : ""}>
                      <div className="reg-open-row">
                        <Link href={row.href} className="reg-open-class">
                          <span className="reg-open-code" aria-hidden="true">{row.classCode}</span>
                          <span>
                            <strong>{row.name}</strong>
                            <small>{nf(done)} of {nf(pupils)} marked</small>
                          </span>
                        </Link>
                        <span className="reg-open-track" aria-hidden="true"><span style={{ width: `${width}%` }} /></span>
                        <span className="reg-open-left">
                          <strong>{nf(row.unmarked)}</strong>
                          <small>left</small>
                        </span>
                        <span className="reg-open-actions">
                          <Link href={row.href} aria-label={`Mark ${row.name}`}>Mark</Link>
                          <button type="button" aria-expanded={asking} onClick={() => setConfirming(asking ? null : row.key)}>
                            Cancel
                          </button>
                        </span>
                      </div>
                      {asking ? (
                        <DeskForm action={cancel} className="reg-cancel">
                          <input type="hidden" name="date" value={date} />
                          <input type="hidden" name="term_id" value={termId} />
                          <input type="hidden" name="class_code" value={row.classCode} />
                          <input type="hidden" name="stream" value={row.stream} />
                          <div
                            className="reg-cancel-ask"
                            role="group"
                            aria-label={`Cancel ${row.name}`}
                            onKeyDown={(event) => { if (event.key === "Escape") setConfirming(null); }}
                          >
                            <p>Take {row.name} off today's count? Marks already saved stay.</p>
                            <button type="button" ref={keepRef} onClick={() => setConfirming(null)}>Keep open</button>
                            <button type="submit">Cancel register</button>
                          </div>
                        </DeskForm>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="reg-open-empty">No register matches “{query.trim()}”.</p>
      )}
    </section>
  );
}

export function RegisterClosure({
  action,
  date,
  termId,
  classCode,
  stream,
  name,
  restoring,
}: {
  action: Save;
  date: string;
  termId: string;
  classCode: string;
  stream: string;
  name: string;
  restoring?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <DeskForm action={action} className={`reg-cancel${restoring ? " is-restore" : ""}`}>
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="term_id" value={termId} />
      <input type="hidden" name="class_code" value={classCode} />
      <input type="hidden" name="stream" value={stream} />
      {restoring ? <input type="hidden" name="intent" value="restore" /> : null}
      {confirming ? (
        <div className="reg-cancel-ask" role="group" aria-label={restoring ? "Restore register" : "Cancel register"}>
          <p>{restoring ? `Put ${name} back on today's count?` : `Cancel ${name} for today? Marks already saved stay.`}</p>
          <button type="button" onClick={() => setConfirming(false)}>Keep</button>
          <button type="submit">{restoring ? "Put it back" : "Cancel register"}</button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)}>{restoring ? "Put this register back" : "Cancel register"}</button>
      )}
    </DeskForm>
  );
}
