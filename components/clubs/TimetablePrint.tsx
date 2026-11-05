"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/accounts/client";
import { CLUBS_BASE } from "@/lib/clubs-nav";

export type TimetablePrintClub = { id: string; title: string; count: number };

function timetableHref(ids: string[], all: boolean, campus?: string) {
  const params = new URLSearchParams();
  if (campus) params.set("campus", campus);
  if (!all) for (const id of ids) params.append("clubs", id);
  const query = params.toString();
  return query ? `${CLUBS_BASE}/timetable/pdf?${query}` : `${CLUBS_BASE}/timetable/pdf`;
}

export function TimetablePrint({ clubs, campus = "" }: { clubs: TimetablePrintClub[]; campus?: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"all" | "choose">("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const needle = query.trim().toLowerCase();
  const visible = needle ? clubs.filter((club) => club.title.toLowerCase().includes(needle)) : clubs;
  const chosen = mode === "all" ? clubs : clubs.filter((club) => picked.includes(club.id));
  const slots = chosen.reduce((sum, club) => sum + club.count, 0);
  const canPrint = chosen.length > 0;
  const showSearch = clubs.length > 6;

  useEffect(() => {
    if (open && mode === "choose") searchRef.current?.focus();
  }, [open, mode]);

  if (!clubs.length) {
    return (
      <button type="button" className="clubs-head-btn" disabled title="Add weekly slots on a club page first">
        <i className="fa-solid fa-print" aria-hidden="true" /> Print timetable
      </button>
    );
  }

  if (clubs.length === 1) {
    return (
      <a
        className="clubs-head-btn is-primary"
        href={timetableHref([clubs[0].id], false, campus)}
        target="_blank"
        rel="noreferrer"
        title="Print this club's weekly timetable"
      >
        <i className="fa-solid fa-print" aria-hidden="true" /> Print timetable
      </a>
    );
  }

  const shownIds = visible.map((club) => club.id);
  const shownOn = shownIds.length > 0 && shownIds.every((id) => picked.includes(id));
  const selectLabel = needle ? (shownOn ? "Clear shown" : "Select shown") : picked.length === clubs.length ? "Clear" : "Select all";
  const printLabel =
    mode === "all" || chosen.length === clubs.length
      ? "Print all"
      : chosen.length === 1
        ? "Print 1 club"
        : `Print ${chosen.length} clubs`;

  const toggleShown = () => {
    const hide = new Set(shownIds);
    setPicked((current) => {
      if (shownOn) return current.filter((id) => !hide.has(id));
      return [...new Set([...current, ...shownIds])];
    });
  };

  return (
    <>
      <button
        type="button"
        className="clubs-head-btn is-primary"
        title="Print weekly timetables, one club to a page"
        onClick={() => {
          setMode("all");
          setPicked([]);
          setQuery("");
          setOpen(true);
        }}
      >
        <i className="fa-solid fa-print" aria-hidden="true" /> Print timetable
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Print club timetable"
        description="Each club starts on its own page with its weekly slots."
      >
        <div className="clb-print-pick">
          <div className="clb-print-switch" role="group" aria-label="Which clubs to print">
            <button type="button" aria-pressed={mode === "all"} onClick={() => setMode("all")}>
              All clubs
            </button>
            <button type="button" aria-pressed={mode === "choose"} onClick={() => setMode("choose")}>
              Choose clubs
            </button>
          </div>
          {showSearch || mode === "choose" ? (
            <div className="clb-print-tools">
              {showSearch ? (
                <label className="clb-find">
                  <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                  <span className="visually-hidden">Find a club</span>
                  <input
                    ref={searchRef}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape" && query) {
                        event.preventDefault();
                        event.stopPropagation();
                        setQuery("");
                      }
                    }}
                    placeholder="Find a club"
                    autoComplete="off"
                  />
                </label>
              ) : null}
              {mode === "choose" ? (
                <button type="button" className="clb-print-link" onClick={toggleShown} disabled={!visible.length}>
                  {selectLabel}
                </button>
              ) : null}
            </div>
          ) : null}
          {visible.length ? (
            <div className="clb-print-scroll">
              <div className={`clb-print-cols${mode === "choose" ? " is-choice" : ""}`} aria-hidden="true">
                {mode === "choose" ? <span /> : null}
                <span>Club</span>
                <span>Slots</span>
              </div>
              <ul className="clb-print-list" aria-label={mode === "choose" ? "Clubs to include" : "Clubs on this timetable"}>
                {visible.map((club) => {
                  const on = mode === "choose" && picked.includes(club.id);
                  return (
                    <li key={club.id}>
                      {mode === "choose" ? (
                        <label className={`clb-print-row is-choice${on ? " is-on" : ""}`}>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() =>
                              setPicked((current) =>
                                current.includes(club.id) ? current.filter((id) => id !== club.id) : [...current, club.id],
                              )
                            }
                          />
                          <span className="clb-print-box" aria-hidden="true" />
                          <span className="clb-print-name">{club.title}</span>
                          <span className="clb-print-count">{club.count}</span>
                        </label>
                      ) : (
                        <div className="clb-print-row">
                          <span className="clb-print-name">{club.title}</span>
                          <span className="clb-print-count">{club.count}</span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="clb-print-none">No club matches “{query.trim()}”.</p>
          )}
          <div className="clb-print-foot">
            <p className="clb-print-sum">
              {chosen.length ? (
                <>
                  <strong>{chosen.length}</strong> {chosen.length === 1 ? "club" : "clubs"}
                  <span aria-hidden="true">·</span>
                  <strong>{slots}</strong> {slots === 1 ? "slot" : "slots"}
                </>
              ) : (
                "None selected"
              )}
            </p>
            <button type="button" className="clb-print-cancel" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="clb-print-go"
              disabled={!canPrint}
              onClick={() => {
                if (!canPrint) return;
                const printAll = mode === "all" || chosen.length === clubs.length;
                window.open(
                  timetableHref(chosen.map((club) => club.id), printAll, campus),
                  "_blank",
                  "noopener,noreferrer",
                );
                setOpen(false);
              }}
            >
              {printLabel}
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
