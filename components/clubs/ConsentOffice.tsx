"use client";

import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { officeConsent, searchClubPupils, type ClubPupilHit } from "@/app/clubs/(desk)/actions";
import { Dialog, Feedback, useOfficeAction } from "@/components/accounts/client";
import { clubFits } from "@/lib/clubs";
import { searchWords } from "@/lib/students";

type ClubOption = { id: string; title: string; section: string | null };

const DEBOUNCE_MS = 90;

export function ConsentOffice({ clubs }: { clubs: ClubOption[] }) {
  const [open, setOpen] = useState(false);
  const [pupil, setPupil] = useState<ClubPupilHit | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const { result, setResult, pending, run } = useOfficeAction();

  const matchingClubs = useMemo(() => {
    if (!pupil) return clubs;
    return clubs.filter((club) => clubFits(club.section, pupil.class_code));
  }, [clubs, pupil]);

  useEffect(() => {
    setPicked((current) => current.filter((id) => matchingClubs.some((club) => club.id === id)));
  }, [matchingClubs]);

  function reset() {
    setPupil(null);
    setPicked([]);
    setResult(null);
  }

  return (
    <>
      <button
        type="button"
        className="clubs-head-btn is-primary"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <i className="fa-solid fa-handshake" aria-hidden="true" /> Desk consent
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Record consent"
        description="Search any pupil, then tick one or more clubs when a parent consents at the desk."
      >
        <form
          className="clubs-consent-form"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (!pupil) {
              setResult({ error: "Choose the pupil." });
              return;
            }
            if (!picked.length) {
              setResult({ error: "Choose at least one club." });
              return;
            }
            const data = new FormData();
            data.set("student_id", pupil.id);
            for (const clubId of picked) data.append("club_id", clubId);
            run(() => officeConsent(data), () => {
              setOpen(false);
              reset();
            });
          }}
        >
          <div className="clubs-consent-fields">
            <PupilSearch
              value={pupil}
              onChange={(next) => {
                setPupil(next);
                setPicked([]);
                setResult(null);
              }}
            />

            {pupil ? (
              <fieldset className="clubs-dialog-fieldset clubs-consent-clubs">
                <legend>
                  Clubs <em>{picked.length ? `${picked.length} selected` : "pick one or more"}</em>
                </legend>
                {matchingClubs.length ? (
                  <ul className="clubs-consent-list" role="group" aria-label="Clubs">
                    {matchingClubs.map((club) => {
                      const on = picked.includes(club.id);
                      return (
                        <li key={club.id}>
                          <label className={`clubs-consent-club${on ? " is-on" : ""}`}>
                            <input
                              type="checkbox"
                              name="club_id"
                              value={club.id}
                              checked={on}
                              onChange={(event) => {
                                const next = event.target.checked
                                  ? [...picked, club.id]
                                  : picked.filter((id) => id !== club.id);
                                setPicked(next);
                                setResult(null);
                              }}
                            />
                            <span>{club.title}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="clubs-consent-empty">No open clubs fit this pupil&apos;s class.</p>
                )}
                {matchingClubs.length > 1 ? (
                  <div className="clubs-consent-bulk">
                    <button
                      type="button"
                      className="clubs-reg-ghost"
                      onClick={() => {
                        setPicked(matchingClubs.map((club) => club.id));
                        setResult(null);
                      }}
                    >
                      Select all
                    </button>
                    {picked.length ? (
                      <button
                        type="button"
                        className="clubs-reg-ghost"
                        onClick={() => {
                          setPicked([]);
                          setResult(null);
                        }}
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </fieldset>
            ) : (
              <p className="clubs-consent-hint">Find a pupil first, then choose the clubs.</p>
            )}

            <Feedback result={result} />
          </div>
          <div className="clubs-dialog-foot">
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="admin-btn" disabled={pending || !pupil || !picked.length}>
              {pending
                ? "Saving…"
                : picked.length > 1
                  ? `Save ${picked.length} consents`
                  : "Save consent"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

function PupilSearch({
  value,
  onChange,
}: {
  value: ClubPupilHit | null;
  onChange: (pupil: ClubPupilHit | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ClubPupilHit[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const deferred = useDeferredValue(query);
  const words = useMemo(() => searchWords(deferred), [deferred]);

  useEffect(() => {
    const text = deferred.trim();
    if (value || text.length < 2) {
      setRows([]);
      setLoading(false);
      setSearched(false);
      setError("");
      return;
    }
    let live = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      searchClubPupils(text)
        .then((result) => {
          if (!live) return;
          setRows(result.rows);
          setError(result.error || "");
          setActive(0);
          setSearched(true);
          setMenuOpen(true);
        })
        .catch(() => {
          if (!live) return;
          setError("Search failed. Check your connection.");
          setRows([]);
          setSearched(true);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [deferred, value]);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

  if (value) {
    return (
      <div className="clubs-dialog-field">
        <span>Pupil</span>
        <div className="clubs-consent-picked">
          <div>
            <strong>{value.full_name}</strong>
            <small>{value.label.replace(`${value.full_name} · `, "")}</small>
          </div>
          <button
            type="button"
            className="clubs-reg-ghost"
            onClick={() => {
              onChange(null);
              setQuery("");
              window.setTimeout(() => input.current?.focus(), 0);
            }}
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="clubs-dialog-field clubs-consent-search" ref={root}>
      <span>Pupil</span>
      <div className={`clubs-consent-search-box${loading ? " is-loading" : ""}`}>
        <i className={`fa-solid ${loading ? "fa-spinner fa-spin" : "fa-magnifying-glass"}`} aria-hidden="true" />
        <input
          ref={input}
          type="search"
          value={query}
          autoComplete="off"
          autoFocus
          placeholder="Name or student number"
          role="combobox"
          aria-expanded={menuOpen && (rows.length > 0 || searched)}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={rows[active] ? `${listId}-${rows[active].id}` : undefined}
          onChange={(event) => {
            setQuery(event.target.value);
            setMenuOpen(true);
          }}
          onFocus={() => setMenuOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && rows.length) {
              event.preventDefault();
              setActive((current) => (current + 1) % rows.length);
              setMenuOpen(true);
            } else if (event.key === "ArrowUp" && rows.length) {
              event.preventDefault();
              setActive((current) => (current - 1 + rows.length) % rows.length);
              setMenuOpen(true);
            } else if (event.key === "Enter" && rows[active]) {
              event.preventDefault();
              onChange(rows[active]);
              setQuery("");
              setMenuOpen(false);
            } else if (event.key === "Escape") {
              setMenuOpen(false);
            }
          }}
        />
      </div>
      {menuOpen && query.trim().length >= 2 ? (
        <ul className="clubs-consent-hits" id={listId} role="listbox" aria-label="Matching pupils">
          {rows.map((row, index) => (
            <li key={row.id}>
              <button
                type="button"
                id={`${listId}-${row.id}`}
                role="option"
                aria-selected={index === active}
                className={index === active ? "is-active" : undefined}
                onMouseEnter={() => setActive(index)}
                onClick={() => {
                  onChange(row);
                  setQuery("");
                  setMenuOpen(false);
                }}
              >
                <strong>
                  <Hit text={row.full_name} words={words} />
                </strong>
                <small>
                  <Hit text={row.label.replace(`${row.full_name} · `, "")} words={words} />
                </small>
              </button>
            </li>
          ))}
          {!loading && searched && !rows.length ? (
            <li className="clubs-consent-miss">{error || "No matching pupils."}</li>
          ) : null}
        </ul>
      ) : null}
      {query.trim().length > 0 && query.trim().length < 2 ? (
        <small className="clubs-consent-hint">Type at least two characters.</small>
      ) : null}
    </div>
  );
}

function Hit({ text, words }: { text: string; words: string[] }) {
  if (!words.length || !text) return <>{text}</>;
  const lower = text.toLowerCase();
  const marks = new Array<boolean>(text.length).fill(false);
  for (const word of words) {
    if (!word) continue;
    let at = lower.indexOf(word);
    while (at !== -1) {
      for (let i = at; i < at + word.length && i < text.length; i += 1) marks[i] = true;
      at = lower.indexOf(word, at + word.length);
    }
  }
  const parts: { text: string; on: boolean }[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const last = parts[parts.length - 1];
    if (last && last.on === marks[i]) last.text += text[i];
    else parts.push({ text: text[i], on: marks[i] });
  }
  return <>{parts.map((part, index) => (part.on ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>))}</>;
}
