"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { OFFICE } from "@/lib/students";

export type CheckItem = { id: string; label: string; icon: string; tone: string; count: number | null };

export type PupilInfo = { id: string; name: string; number: string; place: string; family: string | null; sex: string | null };

const GAPS = [
  { value: "dob", label: "No date of birth", tag: "Date of birth", action: "Add date of birth", tab: "edit" },
  { value: "sex", label: "Sex not recorded", tag: "Sex", action: "Record sex", tab: "edit" },
  { value: "class", label: "No class", tag: "Class", action: "Set a class", tab: "edit" },
  { value: "family", label: "No family", tag: "Family", action: "Link a family", tab: "family" },
] as const;

export type Gap = (typeof GAPS)[number]["value"];
export type GapPupil = PupilInfo & { gaps: Gap[] };

const LIMIT = 60;
const nf = (value: number) => value.toLocaleString("en-GB");

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

export function PupilCell({ pupil, children }: { pupil: PupilInfo | undefined; children?: React.ReactNode }) {
  if (!pupil) {
    return (
      <div className="odq-who is-missing">
        <span className="odq-avatar" aria-hidden="true"><i className="fa-solid fa-user-slash" /></span>
        <div>
          <strong>Student not found</strong>
          <small>The record may have been removed.</small>
        </div>
      </div>
    );
  }
  const tone = pupil.sex === "M" ? " is-boy" : pupil.sex === "F" ? " is-girl" : "";
  return (
    <div className="odq-who">
      <span className={`odq-avatar${tone}`} aria-hidden="true">{initials(pupil.name)}</span>
      <div>
        <Link href={`${OFFICE}/students/${pupil.id}`}>{pupil.name}</Link>
        <small>
          <span className="odq-num">{pupil.number}</span> · {pupil.place}
          {pupil.family ? ` · ${pupil.family}` : ""}
        </small>
        {children}
      </div>
    </div>
  );
}

export function Clear({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="odq-clear">
      <span aria-hidden="true"><i className="fa-solid fa-check" /></span>
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </div>
  );
}

/** The checklist beside the page. Highlights whichever check is on screen. */
export function DataQualityNav({ items }: { items: CheckItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const list = useRef<HTMLUListElement>(null);
  const ids = items.map((item) => item.id).join(",");

  useEffect(() => {
    const sections = ids.split(",").map((id) => document.getElementById(id)).filter((section): section is HTMLElement => Boolean(section));
    if (!sections.length) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = Math.min(220, window.innerHeight * .3);
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const current = atBottom ? sections[sections.length - 1] : sections.filter((section) => section.getBoundingClientRect().top <= line).pop() ?? sections[0];
      setActive(current.id);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [ids]);

  // On narrow screens the checklist scrolls sideways; keep the current check in view.
  useEffect(() => {
    const ul = list.current;
    const link = ul?.querySelector<HTMLElement>(`a[href="#${active}"]`);
    if (!ul || !link || ul.scrollWidth <= ul.clientWidth) return;
    ul.scrollTo({ left: link.offsetLeft - ul.clientWidth / 2 + link.clientWidth / 2, behavior: "smooth" });
  }, [active]);

  const clear = items.filter((item) => item.count === 0).length;
  return (
    <nav className="odq-rail no-print" aria-label="Data quality checks">
      <div className="odq-rail-head">
        <p>Checklist</p>
        <span>{clear} of {items.length} clear</span>
      </div>
      <div className="odq-rail-bar" aria-hidden="true"><span style={{ width: `${(clear / Math.max(1, items.length)) * 100}%` }} /></div>
      <ul ref={list}>
        {items.map((item) => {
          const done = item.count === 0;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className={`is-${item.tone}${active === item.id ? " is-on" : ""}${done ? " is-clear" : ""}`}
                aria-current={active === item.id ? "location" : undefined}
                onClick={() => setActive(item.id)}
              >
                <span className="odq-rail-icon" aria-hidden="true"><i className={`fa-solid ${done ? "fa-check" : item.icon}`} /></span>
                <span className="odq-rail-label">{item.label}</span>
                <em aria-label={item.count === null ? "Not available" : `${item.count} to check`}>{item.count === null ? "–" : nf(item.count)}</em>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Missing details, switched between gaps without reloading the page. */
export function MissingDetails({ pupils, initial }: { pupils: GapPupil[]; initial: Gap }) {
  const [view, setView] = useState<Gap>(initial);
  const [all, setAll] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (view === "dob") url.searchParams.delete("missing");
    else url.searchParams.set("missing", view);
    if (url.href !== window.location.href) window.history.replaceState(null, "", url);
  }, [view]);

  const counts = useMemo(
    () => Object.fromEntries(GAPS.map((gap) => [gap.value, pupils.filter((pupil) => pupil.gaps.includes(gap.value)).length])) as Record<Gap, number>,
    [pupils],
  );
  const current = GAPS.find((gap) => gap.value === view) ?? GAPS[0];
  const list = useMemo(() => pupils.filter((pupil) => pupil.gaps.includes(view)), [pupils, view]);
  const shown = all ? list : list.slice(0, LIMIT);

  return (
    <>
      <div className="odq-tabs" role="tablist" aria-label="Missing detail">
        {GAPS.map((gap) => (
          <button
            key={gap.value}
            type="button"
            role="tab"
            aria-selected={view === gap.value}
            className={`${view === gap.value ? "is-on" : ""}${counts[gap.value] ? "" : " is-zero"}`}
            onClick={() => {
              setView(gap.value);
              setAll(false);
            }}
          >
            <span>{gap.label}</span>
            <em>{nf(counts[gap.value])}</em>
          </button>
        ))}
      </div>
      {list.length ? (
        <ul className="odq-list" key={view} role="tabpanel">
          {shown.map((pupil, index) => (
            <li key={pupil.id} className="odq-row" style={{ "--i": Math.min(index, 12) } as React.CSSProperties}>
              <PupilCell pupil={pupil}>
                {pupil.gaps.length > 1 ? (
                  <span className="odq-gaps">
                    <span>Missing</span>
                    {GAPS.filter((gap) => pupil.gaps.includes(gap.value)).map((gap) => (
                      <em key={gap.value} className={gap.value === view ? "is-on" : ""}>{gap.tag}</em>
                    ))}
                  </span>
                ) : null}
              </PupilCell>
              <div className="odq-acts">
                <Link className="odq-btn" href={`${OFFICE}/students/${pupil.id}?tab=${current.tab}`}>
                  <i className="fa-solid fa-pen" aria-hidden="true" /> {current.action}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Clear title="Nothing missing here">Every active pupil has this detail recorded.</Clear>
      )}
      {list.length > shown.length ? (
        <footer className="odq-sec-foot">
          <button type="button" className="odq-more" onClick={() => setAll(true)}>
            Show all {nf(list.length)} <i className="fa-solid fa-chevron-down" aria-hidden="true" />
          </button>
        </footer>
      ) : null}
    </>
  );
}
