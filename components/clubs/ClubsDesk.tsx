"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createClub, officeConsent, saveClub, withdrawConsent } from "@/app/clubs/(desk)/actions";
import { Dialog, Feedback, useOfficeAction } from "@/components/accounts/client";
import { StudentFace } from "@/components/StudentFace";
import { CLUB_CATEGORIES, clubFits, clubListHref, type ClubListFilters } from "@/lib/clubs";
import { CATEGORY_ICONS, categoryTone } from "@/lib/clubs-desk";
import { CLUBS_BASE } from "@/lib/clubs-nav";
import { amount, parseAmount } from "@/lib/accounts-format";
import { CLUB_CAMPUSES, isClubCampus } from "@/lib/campuses";
import type { ActionResult } from "@/lib/office-forms";
import { SCHOOL_CLASSES, className } from "@/lib/students";

export type CatalogueClub = {
  id: string;
  title: string;
  category: string;
  fee: number;
  section: string;
  description: string | null;
  meeting: string | null;
  campus: string | null;
  active: boolean;
};

export type ClubStripItem = CatalogueClub & { audience: string; icon: string };

const WHO = [
  { value: "nursery", label: "Nursery", hint: "Only nursery classes can join." },
  { value: "primary", label: "Primary", hint: "Only primary classes can join." },
  { value: "both", label: "All classes", hint: "Every class can join." },
] as const;

function categoryChoices(current?: string | null) {
  if (current && !(CLUB_CATEGORIES as readonly string[]).includes(current)) return [current, ...CLUB_CATEGORIES];
  return [...CLUB_CATEGORIES];
}

function feeDraft(raw: string) {
  return raw.replace(/[^\d.,kKmM]/g, "").slice(0, 14);
}

function ClubForm({
  club,
  pending,
  result,
  submitLabel,
  pendingLabel,
  onCancel,
  onSubmit,
}: {
  club?: CatalogueClub | null;
  pending: boolean;
  result: ActionResult | null;
  submitLabel: string;
  pendingLabel: string;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  const choices = categoryChoices(club?.category);
  const [title, setTitle] = useState(club?.title ?? "");
  const [category, setCategory] = useState(club && choices.includes(club.category) ? club.category : choices[0]);
  const [section, setSection] = useState<string>(WHO.some((item) => item.value === club?.section) ? club!.section : "both");
  const [fee, setFee] = useState(club ? amount(club.fee) : "");
  const [note, setNote] = useState(club?.description ?? "");
  const [meeting, setMeeting] = useState(club?.meeting ?? "");
  const [campus, setCampus] = useState(club?.campus ?? "All campuses");
  const [openJoin, setOpenJoin] = useState(club ? club.active : true);
  const who = WHO.find((item) => item.value === section) ?? WHO[2];
  const feeValue = parseAmount(fee);
  const previewTitle = title.trim() || "Club name";

  useEffect(() => {
    const field = nameRef.current;
    if (!field) return;
    const frame = window.requestAnimationFrame(() => field.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <form className="clubs-dialog-form" onSubmit={onSubmit} aria-busy={pending}>
      {club ? <input type="hidden" name="id" value={club.id} /> : null}

      <div className="clubs-dialog-scroll">
        <aside className="clubs-dialog-preview" aria-live="polite">
          <span className={`clubs-dialog-preview-state${openJoin ? " is-open" : ""}`}>
            {openJoin ? "Open for parents" : "Closed"}
          </span>
          <div className="clubs-dialog-preview-icon" aria-hidden="true">
            <i className={`fa-solid ${CATEGORY_ICONS[category] || "fa-puzzle-piece"}`} />
          </div>
          <strong>{previewTitle}</strong>
          <p>
            {category}
            <span aria-hidden="true"> · </span>
            {who.label}
          </p>
          <dl>
            <div>
              <dt>Term fee</dt>
              <dd>{feeValue !== null ? `UGX ${amount(feeValue)}` : "Set a fee"}</dd>
            </div>
            <div>
              <dt>Meeting</dt>
              <dd>{meeting.trim() || "To be announced"}</dd>
            </div>
            <div>
              <dt>Campus</dt>
              <dd>{campus || "All campuses"}</dd>
            </div>
          </dl>
        </aside>

        <div className="clubs-dialog-fields">
          <section className="clubs-dialog-block">
            <header>
              <h3>Basics</h3>
              <p>What parents see first on the portal.</p>
            </header>

            <label className="clubs-dialog-field">
              <span>Club name</span>
              <input
                ref={nameRef}
                name="title"
                value={title}
                required
                maxLength={80}
                autoComplete="off"
                placeholder="Chess Club"
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>

            <fieldset className="clubs-dialog-fieldset">
              <legend>Category</legend>
              <div className="clubs-dialog-cats">
                {choices.map((name) => (
                  <label className="clubs-dialog-cat" key={name}>
                    <input
                      type="radio"
                      name="category"
                      value={name}
                      checked={category === name}
                      required
                      onChange={() => setCategory(name)}
                    />
                    <span>
                      <i className={`fa-solid ${CATEGORY_ICONS[name] || "fa-puzzle-piece"}`} aria-hidden="true" />
                      {name}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </section>

          <section className="clubs-dialog-block">
            <header>
              <h3>Audience & fee</h3>
              <p>Who may join, and what they pay this term.</p>
            </header>

            <div className="clubs-dialog-split">
              <fieldset className="clubs-dialog-fieldset">
                <legend>Who can join</legend>
                <div className="clubs-dialog-who">
                  {WHO.map((item) => (
                    <label key={item.value}>
                      <input
                        type="radio"
                        name="section"
                        value={item.value}
                        checked={section === item.value}
                        onChange={() => setSection(item.value)}
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
                <p className="clubs-dialog-hint">{who.hint}</p>
              </fieldset>

              <label className="clubs-dialog-field">
                <span>Term fee</span>
                <span className="clubs-dialog-money">
                  <b>UGX</b>
                  <input
                    name="fee_amount"
                    inputMode="decimal"
                    autoComplete="off"
                    required
                    placeholder="40,000"
                    value={fee}
                    onChange={(event) => setFee(feeDraft(event.target.value))}
                    onBlur={() => {
                      const parsed = parseAmount(fee);
                      if (parsed !== null) setFee(amount(parsed));
                    }}
                  />
                </span>
                <small>Charged once for the current term</small>
              </label>
            </div>
          </section>

          <section className="clubs-dialog-block">
            <header>
              <h3>When & where</h3>
              <p>Optional details shown beside the club.</p>
            </header>

            <div className="clubs-dialog-split">
              <label className="clubs-dialog-field">
                <span>
                  Meeting <em>Optional</em>
                </span>
                <input
                  name="meeting"
                  maxLength={120}
                  value={meeting}
                  placeholder="Wednesdays 3:30pm"
                  autoComplete="off"
                  onChange={(event) => setMeeting(event.target.value)}
                />
              </label>
              <label className="clubs-dialog-field">
                <span>Campus</span>
                <select name="campus" value={campus} onChange={(event) => setCampus(event.target.value)}>
                  <option value="All campuses">All campuses</option>
                  {CLUB_CAMPUSES.map((site) => (
                    <option key={site} value={site}>
                      {site}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="clubs-dialog-field">
              <span>
                Note for parents <em>{note.trim() ? `${note.length}/400` : "Optional"}</em>
              </span>
              <textarea
                name="description"
                rows={3}
                maxLength={400}
                value={note}
                placeholder="A short line parents see when they choose this club."
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
          </section>

          <label className={`clubs-dialog-open${openJoin ? " is-on" : ""}`}>
            <input type="checkbox" name="active" checked={openJoin} onChange={(event) => setOpenJoin(event.target.checked)} />
            <span className="clubs-dialog-open-copy">
              <strong>{openJoin ? "Open for parents" : "Closed"}</strong>
              <small>
                {openJoin
                  ? "Parents can see this club and consent this term."
                  : "Parents will not see it. Consents already given stay on record."}
              </small>
            </span>
            <span className="clubs-dialog-switch" aria-hidden="true" />
          </label>

          <Feedback result={result} />
        </div>
      </div>

      <div className="clubs-dialog-foot">
        <button type="button" className="admin-btn admin-btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="admin-btn" disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}

function submitClub(
  event: FormEvent<HTMLFormElement>,
  setResult: (result: ActionResult | null) => void,
  run: (task: () => Promise<ActionResult>, after?: (outcome: ActionResult) => void) => void,
  action: (form: FormData) => Promise<ActionResult>,
  done: () => void,
) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  if (parseAmount(data.get("fee_amount")) === null) {
    setResult({ error: "Enter the fee in shillings." });
    return;
  }
  run(() => action(data), done);
}

export function ClubEdit({ club, className = "clubs-cat-edit" }: { club: CatalogueClub; className?: string }) {
  const [open, setOpen] = useState(false);
  const { result, setResult, pending, run } = useOfficeAction();

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          setResult(null);
          setOpen(true);
        }}
      >
        <i className="fa-solid fa-pen" aria-hidden="true" /> Edit
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        wide
        title="Edit club"
        description="Changes show on the parent portal as soon as you save."
      >
        <ClubForm
          club={club}
          pending={pending}
          result={result}
          submitLabel="Save club"
          pendingLabel="Saving…"
          onCancel={() => setOpen(false)}
          onSubmit={(event) => submitClub(event, setResult, run, saveClub, () => setOpen(false))}
        />
      </Dialog>
    </>
  );
}

export function ClubCreate({ className = "" }: { className?: string } = {}) {
  const [open, setOpen] = useState(false);
  const { result, setResult, pending, run } = useOfficeAction();

  return (
    <>
      <button
        type="button"
        className={className || "clubs-head-btn is-primary"}
        onClick={() => {
          setResult(null);
          setOpen(true);
        }}
      >
        <i className="fa-solid fa-plus" aria-hidden="true" /> New club
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        wide
        title="New club"
        description="Add a club to the guide. Parents see it once it is open."
      >
        <ClubForm
          pending={pending}
          result={result}
          submitLabel="Add club"
          pendingLabel="Adding…"
          onCancel={() => setOpen(false)}
          onSubmit={(event) => submitClub(event, setResult, run, createClub, () => setOpen(false))}
        />
      </Dialog>
    </>
  );
}

/** @deprecated Prefer ClubCatalogueBoard on the Clubs page. */
export function ClubStrip({ clubs }: { clubs: ClubStripItem[] }) {
  return <ClubCatalogueBoard clubs={clubs} groups={[]} />;
}

export function ClubCatalogueBoard({
  clubs,
  groups,
}: {
  clubs: ClubStripItem[];
  groups: { category: string; icon: string; count: number }[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<"all" | "open" | "closed">("all");
  const deferred = useDeferredValue(query);
  const needle = deferred.trim().toLowerCase();

  const visible = useMemo(() => {
    const words = needle.split(/\s+/).filter(Boolean);
    return clubs.filter((club) => {
      if (category && club.category !== category) return false;
      if (status === "open" && !club.active) return false;
      if (status === "closed" && club.active) return false;
      if (!words.length) return true;
      const hay = `${club.title} ${club.category} ${club.audience} ${club.meeting || ""} ${club.campus || ""} ${club.description || ""}`.toLowerCase();
      return words.every((word) => hay.includes(word));
    });
  }, [clubs, needle, category, status]);

  const grouped = useMemo(() => {
    const order = groups.length ? groups.map((group) => group.category) : [...new Set(visible.map((club) => club.category))];
    return order
      .map((name) => ({
        category: name,
        icon: groups.find((group) => group.category === name)?.icon || CATEGORY_ICONS[name] || "fa-puzzle-piece",
        clubs: visible.filter((club) => club.category === name),
      }))
      .filter((group) => group.clubs.length);
  }, [visible, groups]);

  const filtered = Boolean(query.trim() || category || status !== "all");

  return (
    <section className="clubs-cat-board" aria-label="Clubs guide">
      <div className="clubs-cat-toolbar">
        <label className="clubs-cat-search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <span className="visually-hidden">Search clubs</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.preventDefault();
                setQuery("");
              }
            }}
            placeholder="Find a club…"
            autoComplete="off"
            aria-controls="club-catalogue"
          />
          {query ? (
            <button type="button" className="clubs-cat-clear" aria-label="Clear search" onClick={() => setQuery("")}>
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          ) : null}
        </label>

        <div className="clubs-cat-status" role="group" aria-label="Open or closed">
          {(
            [
              { value: "all", label: "All" },
              { value: "open", label: "Open" },
              { value: "closed", label: "Closed" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={status === tab.value ? "is-on" : ""}
              aria-pressed={status === tab.value}
              onClick={() => setStatus(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {groups.length ? (
        <div className="clubs-cat-chips" role="tablist" aria-label="Interest groups">
          <button
            type="button"
            role="tab"
            aria-selected={!category}
            className={!category ? "is-on" : ""}
            onClick={() => setCategory("")}
          >
            All groups
            <em>{clubs.length}</em>
          </button>
          {groups.map((group) => (
            <button
              key={group.category}
              type="button"
              role="tab"
              aria-selected={category === group.category}
              className={`tone-${categoryTone(group.category)}${category === group.category ? " is-on" : ""}`}
              onClick={() => setCategory(category === group.category ? "" : group.category)}
            >
              <i className={`fa-solid ${group.icon}`} aria-hidden="true" />
              {group.category}
              <em>{group.count}</em>
            </button>
          ))}
        </div>
      ) : null}

      <p className="clubs-cat-count" aria-live="polite">
        {filtered
          ? `${visible.length} of ${clubs.length} ${clubs.length === 1 ? "club" : "clubs"}`
          : `${clubs.length} ${clubs.length === 1 ? "club" : "clubs"} · each fee is for this term`}
        {filtered ? (
          <button
            type="button"
            className="clubs-cat-reset"
            onClick={() => {
              setQuery("");
              setCategory("");
              setStatus("all");
            }}
          >
            Clear filters
          </button>
        ) : null}
      </p>

      {grouped.length ? (
        <div className="clubs-cat-groups" id="club-catalogue">
          {grouped.map((group) => (
            <section key={group.category} className={`clubs-cat-group tone-${categoryTone(group.category)}`}>
              <header className="clubs-cat-group-head">
                <span className="clubs-cat-group-icon" aria-hidden="true">
                  <i className={`fa-solid ${group.icon}`} />
                </span>
                <div>
                  <h2>{group.category}</h2>
                  <p>
                    {group.clubs.length} {group.clubs.length === 1 ? "club" : "clubs"}
                  </p>
                </div>
              </header>
              <ul className="clubs-cat-strips">
                {group.clubs.map((club) => {
                  const detailHref = `${CLUBS_BASE}/catalogue/${club.id}`;
                  const meta = [club.audience, club.campus, club.meeting].filter(Boolean).join(" · ");
                  return (
                    <li key={club.id}>
                      <article className={`clubs-cat-strip tone-${categoryTone(club.category)}${club.active ? "" : " is-closed"}`}>
                        <Link className="clubs-cat-strip-hit" href={detailHref} aria-label={`Open ${club.title}`}>
                          <span className="visually-hidden">Open {club.title}</span>
                        </Link>
                        <span className="clubs-cat-strip-icon" aria-hidden="true">
                          <i className={`fa-solid ${club.icon}`} />
                        </span>
                        <div className="clubs-cat-strip-main">
                          <div className="clubs-cat-strip-title">
                            <h3>{club.title}</h3>
                            <span className={`clubs-cat-state${club.active ? " is-open" : ""}`}>
                              {club.active ? "Open" : "Closed"}
                            </span>
                          </div>
                          {meta ? <p className="clubs-cat-strip-meta">{meta}</p> : null}
                          {club.description ? <p className="clubs-cat-strip-note">{club.description}</p> : null}
                        </div>
                        <div className="clubs-cat-strip-fee">
                          <strong>{amount(club.fee)}</strong>
                          <span>UGX / term</span>
                        </div>
                        <div className="clubs-cat-strip-actions">
                          <ClubEdit club={club} className="clubs-cat-edit" />
                          <Link className="clubs-cat-open" href={detailHref} tabIndex={-1} aria-hidden="true">
                            <i className="fa-solid fa-chevron-right" aria-hidden="true" />
                          </Link>
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className="clubs-card">
          <p className="clubs-ov-empty">No clubs match{query.trim() ? ` “${query.trim()}”` : " these filters"}.</p>
        </div>
      )}
    </section>
  );
}

const FILTER_EVENT = "clb-filters";
const LIST_BASE = `${CLUBS_BASE}/register`;
const EMPTY_FILTERS: ClubListFilters = { q: "", pay: "", club: "", classCode: "", stream: "", campus: "", withdrawn: "" };

export type ClubConsentRow = {
  id: string;
  studentId: string;
  studentName: string;
  studentNumber: string;
  classCode: string;
  stream: string;
  classLabel: string;
  campus: string | null;
  photoPath: string | null;
  clubId: string;
  clubTitle: string;
  fee: number;
  status: "paid" | "waiting" | "unpaid" | "withdrawn";
  receiptNo: string | null;
  consentedAt: string;
  withdrawnAt: string | null;
};

export type ClubMembership = {
  consentId: string;
  clubId: string;
  title: string;
  fee: number;
  status: "paid" | "waiting" | "unpaid";
  receiptNo: string | null;
};

export type ClubPupilRow = {
  studentId: string;
  studentName: string;
  studentNumber: string;
  classCode: string;
  stream: string;
  classLabel: string;
  campus: string | null;
  photoPath: string | null;
  clubs: ClubMembership[];
};

export type ClubEditorOption = {
  id: string;
  title: string;
  section: string | null;
  fee: number;
};

export type { ClubListFilters };

const PAGE_SIZE = 50;
const CHIP_PREVIEW = 4;

const PAY_LABEL: Record<string, string> = {
  unpaid: "Not paid",
  waiting: "Waiting",
  paid: "Paid",
};

function cleanPay(value: string) {
  return value === "paid" || value === "unpaid" || value === "waiting" ? value : "";
}

function sameFilters(a: ClubListFilters, b: ClubListFilters) {
  return (
    a.q === b.q &&
    a.pay === b.pay &&
    a.club === b.club &&
    a.classCode === b.classCode &&
    a.stream === b.stream &&
    a.campus === b.campus &&
    (a.withdrawn || "") === (b.withdrawn || "")
  );
}

function readFilters(): ClubListFilters {
  const params = new URLSearchParams(window.location.search);
  return {
    q: params.get("q") ?? "",
    pay: cleanPay(params.get("pay") || ""),
    club: params.get("club") || "",
    classCode: params.get("class") || "",
    stream: params.get("stream") || "",
    campus: params.get("campus") || "",
    withdrawn: params.get("withdrawn") === "1" ? "1" : "",
  };
}

function writeFilters(filters: ClubListFilters) {
  const query = clubListHref(filters).slice(LIST_BASE.length);
  const url = `${window.location.pathname}${query}${window.location.hash}`;
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new Event(FILTER_EVENT));
}

/** Links into the register with a payment filter. */
export function ClubPayLink({
  href,
  value,
  initialPay,
  className = "",
  mark = true,
  children,
}: {
  href: string;
  value: string;
  initialPay: string;
  className?: string;
  mark?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      className={[className, mark && initialPay === value ? "is-on" : ""].filter(Boolean).join(" ")}
      href={href}
    >
      {children}
    </Link>
  );
}

type PrintClub = { id: string; title: string; count: number };

/** Print ignores payment tabs — every open consent (paid + unpaid) is on the roll with expected/collected totals. */
function rollHref(filters: ClubListFilters, clubIds?: readonly string[] | null) {
  const params = new URLSearchParams();
  const clubs = filters.club ? [filters.club] : clubIds?.length ? [...clubIds] : [];
  for (const id of clubs) params.append("clubs", id);
  if (filters.classCode) params.set("class", filters.classCode);
  if (filters.stream) params.set("stream", filters.stream);
  if (filters.campus) params.set("campus", filters.campus);
  if (filters.q.trim()) params.set("q", filters.q.trim());
  const query = params.toString();
  return query ? `${CLUBS_BASE}/roll/pdf?${query}` : `${CLUBS_BASE}/roll/pdf`;
}

function listFiltersActive(filters: ClubListFilters) {
  return Boolean(filters.club || filters.classCode || filters.stream || filters.campus || filters.q.trim());
}

function ClubRollPrint({ clubs, filters }: { clubs: PrintClub[]; filters: ClubListFilters }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"all" | "choose">("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const needle = query.trim().toLowerCase();
  const visible = needle ? clubs.filter((club) => club.title.toLowerCase().includes(needle)) : clubs;
  const chosen = mode === "all" ? clubs : clubs.filter((club) => picked.includes(club.id));
  const learners = chosen.reduce((sum, club) => sum + club.count, 0);
  const canPrint = chosen.length > 0;
  const showSearch = clubs.length > 6;
  const scoped = listFiltersActive(filters);
  const filteredHref = rollHref(filters, clubs.map((club) => club.id));
  const memberTotal = clubs.reduce((sum, club) => sum + club.count, 0);

  useEffect(() => {
    if (open && mode === "choose") searchRef.current?.focus();
  }, [open, mode]);

  if (!clubs.length) {
    return (
      <button type="button" className="clubs-reg-tool" disabled title="Nothing to print for this filter">
        <i className="fa-solid fa-print" aria-hidden="true" /> Print
      </button>
    );
  }

  if (scoped || clubs.length === 1) {
    const title = scoped
      ? "Print this filtered list: every consented member with expected and collected totals"
      : "Print this club: consented members with expected and collected totals";
    return (
      <a className="clubs-reg-tool" href={filteredHref} target="_blank" rel="noreferrer" title={title}>
        <i className="fa-solid fa-print" aria-hidden="true" /> Print
        {scoped ? <span className="clubs-reg-tool-meta">{memberTotal}</span> : null}
      </a>
    );
  }

  const shownIds = visible.map((club) => club.id);
  const shownOn = shownIds.length > 0 && shownIds.every((id) => picked.includes(id));
  const selectLabel = needle ? (shownOn ? "Clear shown" : "Select shown") : picked.length === clubs.length ? "Clear" : "Select all";
  const printLabel = mode === "all" || chosen.length === clubs.length
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
        className="clubs-reg-tool"
        title="Print consented learners with expected and collected totals, one club to a page"
        onClick={() => {
          setMode("all");
          setPicked([]);
          setQuery("");
          setOpen(true);
        }}
      >
        <i className="fa-solid fa-print" aria-hidden="true" /> Print
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Print club roll"
        description="Each club starts on its own page. Paid and unpaid consents both appear, with expected and collected totals."
      >
        <div className="clb-print-pick">
          <div className="clb-print-switch" role="group" aria-label="Which clubs to print">
            <button type="button" aria-pressed={mode === "all"} onClick={() => setMode("all")}>All clubs</button>
            <button type="button" aria-pressed={mode === "choose"} onClick={() => setMode("choose")}>Choose clubs</button>
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
                <button type="button" className="clb-print-link" onClick={toggleShown} disabled={!visible.length}>{selectLabel}</button>
              ) : null}
            </div>
          ) : null}
          {visible.length ? (
            <div className="clb-print-scroll">
              <div className={`clb-print-cols${mode === "choose" ? " is-choice" : ""}`} aria-hidden="true">
                {mode === "choose" ? <span /> : null}
                <span>Club</span>
                <span>Learners</span>
              </div>
              <ul className="clb-print-list" aria-label={mode === "choose" ? "Clubs to include" : "Clubs on this roll"}>
                {visible.map((club) => {
                  const on = mode === "choose" && picked.includes(club.id);
                  return (
                    <li key={club.id}>
                      {mode === "choose" ? (
                        <label className={`clb-print-row is-choice${on ? " is-on" : ""}`}>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => setPicked((current) => current.includes(club.id) ? current.filter((id) => id !== club.id) : [...current, club.id])}
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
                  <strong>{learners}</strong> {learners === 1 ? "learner" : "learners"}
                </>
              ) : "None selected"}
            </p>
            <button type="button" className="clb-print-cancel" onClick={() => setOpen(false)}>Cancel</button>
            <button
              type="button"
              className="clb-print-go"
              disabled={!canPrint}
              onClick={() => {
                if (!canPrint) return;
                const ids = mode === "all" || chosen.length === clubs.length ? null : picked;
                window.open(rollHref(filters, ids), "_blank", "noopener,noreferrer");
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

function classMatches(row: ClubPupilRow, classCode: string) {
  if (!classCode) return true;
  if (classCode === "none") return !row.classCode;
  return row.classCode === classCode;
}

function pupilMatches(row: ClubPupilRow, filters: ClubListFilters, query: string, ignorePay = false) {
  if (!ignorePay && filters.pay && !row.clubs.some((club) => club.status === filters.pay)) return false;
  if (filters.club && !row.clubs.some((club) => club.clubId === filters.club)) return false;
  if (!classMatches(row, filters.classCode)) return false;
  if (filters.stream && row.stream !== filters.stream) return false;
  if (filters.campus && (row.campus || "") !== filters.campus) return false;
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const clubText = row.clubs.map((club) => club.title).join(" ");
  return `${row.studentName} ${row.studentNumber} ${clubText} ${row.classLabel} ${row.campus ?? ""}`.toLowerCase().includes(needle);
}

function ClubChips({ clubs }: { clubs: ClubMembership[] }) {
  if (!clubs.length) return <span className="clubs-reg-none">No clubs yet</span>;
  const shown = clubs.slice(0, CHIP_PREVIEW);
  const more = clubs.length - shown.length;
  return (
    <ul className="clubs-reg-chips">
      {shown.map((club) => (
        <li key={club.clubId}>
          <span className={`clubs-reg-chip is-${club.status}`} title={club.status === "paid" ? "Paid" : club.status === "waiting" ? "Waiting on payment" : "Not paid"}>
            {club.title}
          </span>
        </li>
      ))}
      {more > 0 ? (
        <li>
          <span className="clubs-reg-chip is-more">+{more}</span>
        </li>
      ) : null}
    </ul>
  );
}

function PupilClubEditor({
  row,
  catalogue,
  onClose,
}: {
  row: ClubPupilRow;
  catalogue: ClubEditorOption[];
  onClose: () => void;
}) {
  const options = useMemo(
    () => catalogue.filter((club) => clubFits(club.section, row.classCode || null)).sort((a, b) => a.title.localeCompare(b.title)),
    [catalogue, row.classCode],
  );
  const membershipOf = useMemo(() => new Map(row.clubs.map((club) => [club.clubId, club])), [row.clubs]);
  const locked = useMemo(
    () => new Set(row.clubs.filter((club) => club.status === "paid" || club.status === "waiting").map((club) => club.clubId)),
    [row.clubs],
  );
  const original = useMemo(() => new Set(row.clubs.map((club) => club.clubId)), [row.clubs]);
  const [picked, setPicked] = useState(() => [...original]);
  const { result, setResult, pending, run } = useOfficeAction();

  const dirty = useMemo(() => {
    if (picked.length !== original.size) return true;
    return picked.some((id) => !original.has(id));
  }, [picked, original]);

  return (
    <div className="clubs-reg-expand" onClick={(event) => event.stopPropagation()}>
      <div className="clubs-reg-expand-head">
        <div>
          <strong>Manage clubs</strong>
          <p>Tick clubs to consent. Paid and waiting clubs stay locked.</p>
        </div>
        <button type="button" className="clubs-reg-ghost" onClick={onClose}>
          Close
        </button>
      </div>
      {options.length ? (
        <ul className="clubs-reg-edit-list" role="group" aria-label={`Clubs for ${row.studentName}`}>
          {options.map((club) => {
            const membership = membershipOf.get(club.id);
            const status = membership?.status;
            const on = picked.includes(club.id);
            const isLocked = locked.has(club.id);
            return (
              <li key={club.id}>
                <label className={`clubs-reg-edit-club${on ? " is-on" : ""}${status ? ` is-${status}` : ""}${isLocked ? " is-locked" : ""}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={isLocked || pending}
                    onChange={(event) => {
                      setResult(null);
                      setPicked((current) =>
                        event.target.checked ? [...current, club.id] : current.filter((id) => id !== club.id),
                      );
                    }}
                  />
                  <span className="clubs-reg-edit-copy">
                    <strong>{club.title}</strong>
                    <small>
                      {status === "paid"
                        ? membership?.receiptNo
                          ? `Paid · ${membership.receiptNo}`
                          : "Paid"
                        : status === "waiting"
                          ? "Waiting on mobile money"
                          : status === "unpaid"
                            ? `Consented · ${amount(club.fee)}`
                            : amount(club.fee)}
                    </small>
                  </span>
                  {status === "paid" ? <em className="clubs-reg-edit-tag is-paid">Paid</em> : null}
                  {status === "waiting" ? <em className="clubs-reg-edit-tag is-waiting">Waiting</em> : null}
                  {status === "unpaid" ? <em className="clubs-reg-edit-tag is-unpaid">Unpaid</em> : null}
                </label>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="clubs-reg-expand-empty">No open clubs fit this pupil&apos;s class.</p>
      )}
      <Feedback result={result} />
      <div className="clubs-reg-expand-foot">
        <button type="button" className="admin-btn admin-btn-ghost" onClick={onClose} disabled={pending}>
          Cancel
        </button>
        <button
          type="button"
          className="admin-btn"
          disabled={pending || !dirty}
          onClick={() => {
            const addIds = picked.filter((id) => !original.has(id));
            const dropIds = [...original].filter((id) => !picked.includes(id) && !locked.has(id));
            if (!addIds.length && !dropIds.length) {
              setResult({ error: "No changes to save." });
              return;
            }
            run(async () => {
              if (addIds.length) {
                const data = new FormData();
                data.set("student_id", row.studentId);
                for (const id of addIds) data.append("club_id", id);
                const added = await officeConsent(data);
                if (added.error) return added;
              }
              for (const clubId of dropIds) {
                const membership = membershipOf.get(clubId);
                if (!membership) continue;
                const data = new FormData();
                data.set("id", membership.consentId);
                const dropped = await withdrawConsent(data);
                if (dropped.error) return dropped;
              }
              const parts = [
                addIds.length ? `added ${addIds.length}` : "",
                dropIds.length ? `removed ${dropIds.length}` : "",
              ].filter(Boolean);
              return { ok: `Updated clubs for ${row.studentName} (${parts.join(", ")}).` };
            }, () => onClose());
          }}
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

export function ClubRegister({
  rows,
  catalogue,
  termLabel,
  filters: initial,
}: {
  rows: ClubPupilRow[];
  catalogue: ClubEditorOption[];
  termLabel: string;
  filters: ClubListFilters;
}) {
  const [filters, setFilters] = useState(initial);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState("");
  const deferredQuery = useDeferredValue(filters.q);
  const searching = deferredQuery !== filters.q;
  const echo = useRef(false);

  const apply = (next: ClubListFilters) => {
    echo.current = true;
    setFilters(next);
    writeFilters(next);
    setPage(1);
    setOpenId("");
    echo.current = false;
  };

  useEffect(() => {
    const sync = () => {
      if (echo.current) return;
      const next = readFilters();
      setFilters((current) => {
        if (sameFilters(current, next)) return current;
        setPage(1);
        setOpenId("");
        return next;
      });
    };
    window.addEventListener(FILTER_EVENT, sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener(FILTER_EVENT, sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  const clubs = useMemo(() => {
    const titles = new Map<string, string>();
    for (const club of catalogue) titles.set(club.id, club.title);
    for (const row of rows) {
      for (const club of row.clubs) titles.set(club.clubId, club.title);
    }
    return [...titles.entries()]
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [catalogue, rows]);

  const classes = useMemo(() => {
    const codes = [...new Set(rows.map((row) => row.classCode).filter(Boolean))];
    codes.sort((a, b) => {
      const left = SCHOOL_CLASSES.find((entry) => entry.code === a)?.order ?? 99;
      const right = SCHOOL_CLASSES.find((entry) => entry.code === b)?.order ?? 99;
      return left - right || a.localeCompare(b);
    });
    return codes;
  }, [rows]);
  const hasUnclassed = rows.some((row) => !row.classCode);
  const streams = useMemo(() => {
    const source = filters.classCode ? rows.filter((row) => classMatches(row, filters.classCode)) : rows;
    return [...new Set(source.map((row) => row.stream).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [rows, filters.classCode]);

  const campuses = useMemo(
    () =>
      [
        ...new Set(
          rows
            .map((row) => row.campus?.trim())
            .filter((campus): campus is string => {
              if (!campus) return false;
              return isClubCampus(campus);
            }),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const narrowed = useMemo(
    () => rows.filter((row) => pupilMatches(row, filters, deferredQuery, true)),
    [rows, filters, deferredQuery],
  );

  const printClubs = useMemo(() => {
    const counts = new Map<string, PrintClub>();
    for (const row of narrowed) {
      for (const club of row.clubs) {
        const current = counts.get(club.clubId);
        if (current) current.count += 1;
        else counts.set(club.clubId, { id: club.clubId, title: club.title, count: 1 });
      }
    }
    return [...counts.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [narrowed]);

  const visible = useMemo(
    () => (filters.pay ? narrowed.filter((row) => row.clubs.some((club) => club.status === filters.pay)) : narrowed),
    [narrowed, filters.pay],
  );

  const counts = {
    "": narrowed.length,
    unpaid: narrowed.filter((row) => row.clubs.some((club) => club.status === "unpaid")).length,
    waiting: narrowed.filter((row) => row.clubs.some((club) => club.status === "waiting")).length,
    paid: narrowed.filter((row) => row.clubs.some((club) => club.status === "paid")).length,
  };
  const tabs = [
    { value: "", label: "All", count: counts[""] },
    { value: "unpaid", label: "Not paid", count: counts.unpaid },
    { value: "waiting", label: "Waiting", count: counts.waiting },
    { value: "paid", label: "Paid", count: counts.paid },
  ];

  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const from = (safePage - 1) * PAGE_SIZE;
  const pageRows = visible.slice(from, from + PAGE_SIZE);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const clubTitle = clubs.find((club) => club.id === filters.club)?.title;
  const classLabelText = filters.classCode === "none" ? "No class" : filters.classCode ? className(filters.classCode) : "";
  const pills: { key: string; label: string; next: ClubListFilters }[] = [];
  if (filters.q) pills.push({ key: "q", label: `Search: “${filters.q.trim()}”`, next: { ...filters, q: "" } });
  if (clubTitle) pills.push({ key: "club", label: clubTitle, next: { ...filters, club: "" } });
  if (classLabelText) pills.push({ key: "class", label: `Class: ${classLabelText}`, next: { ...filters, classCode: "" } });
  if (filters.stream) pills.push({ key: "stream", label: `Stream ${filters.stream}`, next: { ...filters, stream: "" } });
  if (filters.campus) pills.push({ key: "campus", label: filters.campus, next: { ...filters, campus: "" } });
  if (filters.pay) pills.push({ key: "pay", label: PAY_LABEL[filters.pay] ?? "Payment", next: { ...filters, pay: "" } });
  const filtered = Boolean(filters.q || filters.pay || filters.club || filters.classCode || filters.stream || filters.campus);
  const needle = deferredQuery.trim();
  const exportQuery = new URLSearchParams(
    Object.fromEntries(
      Object.entries({
        q: filters.q,
        pay: filters.pay,
        club: filters.club,
        class: filters.classCode,
        stream: filters.stream,
        campus: filters.campus,
      }).filter(([, value]) => Boolean(value)),
    ),
  ).toString();

  return (
    <div className="clubs-reg is-pupils">
      <div className="clubs-reg-head">
        <div>
          <h2>{termLabel}</h2>
          <p aria-live="polite">
            {visible.length} {visible.length === 1 ? "pupil" : "pupils"}
            {needle ? ` matching “${needle}”` : ""}
            {visible.length > PAGE_SIZE ? ` · page ${safePage} of ${pages}` : ""}
          </p>
        </div>
        <div className="clubs-reg-tools">
          <a className="clubs-reg-tool" href={`${CLUBS_BASE}/register/export${exportQuery ? `?${exportQuery}` : ""}`}>
            <i className="fa-solid fa-file-csv" aria-hidden="true" /> CSV
          </a>
          <ClubRollPrint clubs={printClubs} filters={{ ...filters, withdrawn: "" }} />
        </div>
      </div>

      <div className="clubs-reg-tabs" role="tablist" aria-label="Payment status">
        {tabs.map((tab) => (
          <button
            key={tab.label}
            type="button"
            role="tab"
            aria-selected={filters.pay === tab.value}
            className={filters.pay === tab.value ? "is-on" : ""}
            onClick={() => apply({ ...filters, pay: tab.value, withdrawn: "" })}
          >
            {tab.label}
            <em>{tab.count}</em>
          </button>
        ))}
      </div>

      <form className="clubs-reg-filters" role="search" aria-label="Filter pupils" onSubmit={(event) => event.preventDefault()}>
        <div className="clubs-reg-filters-row">
          <label className={`clubs-cat-search${searching ? " is-searching" : ""}`}>
            <i className={`fa-solid ${searching ? "fa-spinner fa-spin" : "fa-magnifying-glass"}`} aria-hidden="true" />
            <span className="visually-hidden">Search pupils</span>
            <input
              type="search"
              value={filters.q}
              onChange={(event) => apply({ ...filters, q: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Escape" && filters.q) {
                  event.preventDefault();
                  apply({ ...filters, q: "" });
                }
              }}
              placeholder="Pupil name, number or club"
              autoComplete="off"
              aria-busy={searching}
              aria-controls="club-register"
            />
            {filters.q ? (
              <button type="button" className="clubs-cat-clear" aria-label="Clear search" onClick={() => apply({ ...filters, q: "" })}>
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            ) : null}
          </label>

          {clubs.length > 1 ? (
            <label className="clubs-reg-select">
              <span>Club</span>
              <select value={filters.club} onChange={(event) => apply({ ...filters, club: event.target.value })}>
                <option value="">All clubs</option>
                {clubs.map((club) => (
                  <option key={club.id} value={club.id}>
                    {club.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {classes.length > 1 || (classes.length === 1 && hasUnclassed) ? (
            <label className="clubs-reg-select">
              <span>Class</span>
              <select value={filters.classCode} onChange={(event) => apply({ ...filters, classCode: event.target.value, stream: "" })}>
                <option value="">All classes</option>
                {classes.map((code) => (
                  <option key={code} value={code}>
                    {className(code)}
                  </option>
                ))}
                {hasUnclassed ? <option value="none">No class</option> : null}
              </select>
            </label>
          ) : null}

          {streams.length > 1 || (filters.stream && !streams.includes(filters.stream)) ? (
            <label className="clubs-reg-select">
              <span>Stream</span>
              <select value={filters.stream} onChange={(event) => apply({ ...filters, stream: event.target.value })}>
                <option value="">Any stream</option>
                {(filters.stream && !streams.includes(filters.stream) ? [filters.stream, ...streams] : streams).map((stream) => (
                  <option key={stream} value={stream}>
                    Stream {stream}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {campuses.length > 1 ? (
            <label className="clubs-reg-select">
              <span>Campus</span>
              <select value={filters.campus} onChange={(event) => apply({ ...filters, campus: event.target.value })}>
                <option value="">All campuses</option>
                {campuses.map((campus) => (
                  <option key={campus} value={campus}>
                    {campus}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {pills.length ? (
          <div className="clubs-reg-pills" aria-label="Active filters">
            <span>Filtered by</span>
            <ul>
              {pills.map((pill) => (
                <li key={pill.key}>
                  <button type="button" onClick={() => apply(pill.next)} aria-label={`Remove filter ${pill.label}`}>
                    {pill.label} <i className="fa-solid fa-xmark" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
            {pills.length > 1 ? (
              <button type="button" className="clubs-cat-reset" onClick={() => apply(EMPTY_FILTERS)}>
                Clear all
              </button>
            ) : null}
          </div>
        ) : null}
      </form>

      {pageRows.length ? (
        <>
          <div className="clubs-reg-table-wrap">
            <table className="clubs-reg-table is-pupils" id="club-register">
              <thead>
                <tr>
                  <th scope="col">Pupil</th>
                  <th scope="col">Clubs</th>
                  <th scope="col" className="is-narrow">
                    <span className="visually-hidden">Expand</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => {
                  const open = openId === row.studentId;
                  return (
                    <tr key={row.studentId} className={open ? "is-open" : undefined}>
                      <td colSpan={3} className="clubs-reg-pupil-cell">
                        <button
                          type="button"
                          className="clubs-reg-row-btn"
                          aria-expanded={open}
                          onClick={() => setOpenId(open ? "" : row.studentId)}
                        >
                          <span className="clubs-reg-who">
                            <StudentFace className="clubs-reg-face" id={row.studentId} name={row.studentName} photoPath={row.photoPath} />
                            <span>
                              <strong className="clubs-reg-name">{row.studentName}</strong>
                              <small>{[row.studentNumber, row.classLabel, row.campus].filter(Boolean).join(" · ")}</small>
                            </span>
                          </span>
                          <span className="clubs-reg-clubs-cell" data-label="Clubs">
                            <ClubChips clubs={row.clubs} />
                          </span>
                          <span className={`clubs-reg-chevron${open ? " is-open" : ""}`} aria-hidden="true">
                            <i className="fa-solid fa-chevron-down" />
                          </span>
                        </button>
                        <div className={`clubs-reg-detail${open ? " is-open" : ""}`}>
                          {open ? (
                            <PupilClubEditor
                              key={`${row.studentId}:${row.clubs.map((club) => `${club.clubId}:${club.status}`).join(",")}`}
                              row={row}
                              catalogue={catalogue}
                              onClose={() => setOpenId("")}
                            />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 ? (
            <footer className="clubs-reg-pager">
              <span>
                Showing <strong>{from + 1}–{Math.min(from + PAGE_SIZE, visible.length)}</strong> of{" "}
                <strong>{visible.length.toLocaleString("en-GB")}</strong>
              </span>
              <div>
                <button
                  type="button"
                  className="clubs-reg-page-btn"
                  disabled={safePage <= 1}
                  onClick={() => {
                    setOpenId("");
                    setPage((current) => Math.max(1, current - 1));
                  }}
                >
                  <i className="fa-solid fa-chevron-left" aria-hidden="true" /> Previous
                </button>
                <span className="clubs-reg-page-num">
                  Page {safePage} of {pages}
                </span>
                <button
                  type="button"
                  className="clubs-reg-page-btn"
                  disabled={safePage >= pages}
                  onClick={() => {
                    setOpenId("");
                    setPage((current) => Math.min(pages, current + 1));
                  }}
                >
                  Next <i className="fa-solid fa-chevron-right" aria-hidden="true" />
                </button>
              </div>
            </footer>
          ) : null}
        </>
      ) : (
        <div className="clubs-reg-empty">
          <span className="clubs-ov-portal-icon" aria-hidden="true">
            <i className={`fa-solid ${filtered ? "fa-magnifying-glass" : "fa-users"}`} />
          </span>
          <strong>{filtered ? "No matches" : "No pupils on the register"}</strong>
          <p>
            {filtered
              ? "Try another name, club, class or payment filter."
              : "Active pupils appear here once the student register is available."}
          </p>
          {filtered ? (
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => apply(EMPTY_FILTERS)}>
              Clear filters
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
