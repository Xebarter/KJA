"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { consentToClubs, payClub, withdrawClubConsent } from "@/app/account/(portal)/clubs/actions";
import {
  CLUB_SHORT,
  chosenClubs,
  clubBucket,
  clubIcon,
  clubStatus,
  needsPayment,
  ugx,
  type ClubChild,
  type ClubPatch,
} from "@/components/account/club-model";
import { CLUB_CATEGORIES } from "@/lib/clubs";
import { networkOf, normalizeMsisdn } from "@/lib/payments/mobile";

function saveLabel(picks: number, drops: number) {
  if (picks && drops) {
    const count = picks + drops;
    return count === 1 ? "Save 1 change" : `Save ${count} changes`;
  }
  if (picks) return picks === 1 ? "Consent to 1 club" : `Consent to ${picks} clubs`;
  return drops === 1 ? "Withdraw 1 club" : `Withdraw ${drops} clubs`;
}

export function ClubDialog({
  child,
  phone,
  online,
  termLabel,
  notice,
  checking,
  stalled,
  onClose,
  onPatch,
  onCheck,
  onNotice,
}: {
  child: ClubChild;
  phone: string;
  online: boolean;
  termLabel: string | null;
  notice: string;
  checking: boolean;
  stalled: boolean;
  onClose: () => void;
  onPatch: (clubId: string, patch: ClubPatch) => void;
  onCheck: (collectionId: string) => Promise<void>;
  onNotice: (text: string) => void;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [pickIds, setPickIds] = useState<string[]>([]);
  const [dropIds, setDropIds] = useState<string[]>([]);
  const [number, setNumber] = useState(phone);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const chosen = chosenClubs(child);
  const waiting = chosen.filter((club) => club.state === "waiting");
  const pendingId = waiting.find((club) => club.collectionId)?.collectionId ?? null;
  const payable = chosen.filter((club) => needsPayment(club) && club.state !== "waiting" && !dropIds.includes(club.id));
  const categories = CLUB_CATEGORIES.filter((name) => child.clubs.some((club) => clubBucket(club) === name));
  const categoryNames = child.clubs.some((club) => clubBucket(club) === "Other") ? [...categories, "Other"] : [...categories];
  const activeCategory = category === "All" || categoryNames.includes(category) ? category : "All";
  const needle = query.trim().toLowerCase();
  const visible = child.clubs.filter((club) => {
    if (activeCategory !== "All" && clubBucket(club) !== activeCategory) return false;
    if (!needle) return true;
    return `${club.title} ${club.category} ${CLUB_SHORT[clubBucket(club)] || ""}`.toLowerCase().includes(needle);
  });
  const grouped = !needle && activeCategory === "All"
    ? categoryNames.map((name) => ({ category: name, clubs: visible.filter((club) => clubBucket(club) === name) })).filter((group) => group.clubs.length)
    : [{ category: "", clubs: visible }];

  const picks = child.clubs.filter((club) => club.state === "open" && pickIds.includes(club.id));
  const drops = chosen.filter((club) => club.state !== "paid" && club.state !== "waiting" && dropIds.includes(club.id) && club.consentId);
  const payClubs = payable;
  const payTotal = payClubs.reduce((sum, club) => sum + club.fee, 0);
  const network = networkOf(normalizeMsisdn(number));
  const titleId = `cl-dialog-${child.id}`;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setPickIds([]);
    setDropIds([]);
    setQuery("");
    setCategory("All");
    setError("");
  }, [child.id]);

  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  onCloseRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    if (!mounted) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const node = panelRef.current;
    const focus = document.activeElement as HTMLElement | null;
    node?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter((item) => !item.hasAttribute("disabled"));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      focus?.focus();
    };
  }, [mounted]);

  function checked(club: (typeof child.clubs)[number]) {
    if (club.state === "paid" || club.state === "waiting") return true;
    if (club.state === "open") return pickIds.includes(club.id);
    return !dropIds.includes(club.id);
  }

  function toggle(club: (typeof child.clubs)[number], on: boolean) {
    if (club.state === "paid" || club.state === "waiting") return;
    if (club.state === "open") {
      setPickIds((current) => on ? [...current, club.id] : current.filter((id) => id !== club.id));
      return;
    }
    setDropIds((current) => on ? current.filter((id) => id !== club.id) : current.includes(club.id) ? current : [...current, club.id]);
  }

  async function save() {
    if (!picks.length && !drops.length) return;
    setBusy("save");
    setError("");
    const failed: string[] = [];
    if (picks.length) {
      const data = new FormData();
      data.set("student_id", child.id);
      for (const club of picks) data.append("club_id", club.id);
      const result = await consentToClubs(data);
      const saved = result.consents || [];
      for (const row of saved) onPatch(row.clubId, { state: "consented", consentId: row.id });
      if (saved.length) setPickIds((current) => current.filter((id) => !saved.some((row) => row.clubId === id)));
      if ("error" in result && result.error) failed.push(result.error);
    }
    for (const club of drops) {
      const data = new FormData();
      data.set("id", club.consentId || "");
      const result = await withdrawClubConsent(data);
      if ("error" in result && result.error) {
        failed.push(result.error);
        continue;
      }
      setDropIds((current) => current.filter((id) => id !== club.id));
      onPatch(club.id, { state: "open", consentId: null, collectionId: null });
    }
    setBusy("");
    if (failed.length) setError(failed[0]);
    else onNotice("");
    router.refresh();
  }

  async function pay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payClubs.length) return;
    if (!network) {
      setError("Enter a valid MTN or Airtel number.");
      return;
    }
    setBusy("pay");
    setError("");
    onNotice("");
    const data = new FormData();
    data.set("student_id", child.id);
    data.set("phone", number);
    for (const club of payClubs) data.append("club_id", club.id);
    const result = await payClub(data);
    setBusy("");
    if ("error" in result) {
      setError(result.error);
      return;
    }
    if (result.payment.status === "pending") {
      for (const line of result.payment.lines) onPatch(line.id, { state: "waiting", collectionId: result.payment.id });
    }
    if (result.payment.status === "paid") {
      for (const line of result.payment.lines) onPatch(line.id, { state: "paid", receiptNo: line.receiptNo, collectionId: null });
      router.refresh();
    }
    if (result.payment.status === "failed") {
      onNotice("The request was declined or timed out. You have not been charged.");
    }
  }

  const dialog = (
    <div className="kja-account ov cl">
      <div className="cl-modal" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
        <div
          ref={panelRef}
          className="cl-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
        >
          <header className="cl-dialog-head">
            <div>
              <p>Clubs</p>
              <h2 id={titleId}>{child.name}</h2>
              <span>{child.detail}</span>
            </div>
            <button type="button" className="cl-dialog-x" aria-label="Close" onClick={onClose} disabled={!!busy}>
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </header>

          <div className="cl-dialog-body">
            <section>
              <h3>Clubs for {child.name.split(" ")[0]}</h3>
              <p className="cl-dialog-lead">Tick a club to give consent. Untick one to take consent away. Confirmed and waiting clubs stay ticked.</p>
              {child.clubs.length ? (
                <>
                  <div className="cl-tools">
                    <label className="cl-search">
                      <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                      <span className="visually-hidden">Search clubs</span>
                      <input type="search" value={query} placeholder="Search clubs" onChange={(event) => setQuery(event.target.value)} />
                      {query ? (
                        <button type="button" className="cl-search-clear" aria-label="Clear search" onClick={() => setQuery("")}>
                          <i className="fa-solid fa-xmark" aria-hidden="true" />
                        </button>
                      ) : null}
                    </label>
                    {categoryNames.length > 1 ? (
                      <div className="cl-cats" role="group" aria-label="Club category">
                        <button type="button" aria-pressed={activeCategory === "All"} onClick={() => setCategory("All")}>All</button>
                        {categoryNames.map((name) => (
                          <button key={name} type="button" aria-pressed={activeCategory === name} onClick={() => setCategory(name)}>
                            {CLUB_SHORT[name] || name}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {visible.length ? grouped.map((group) => (
                    <div className="cl-group" key={group.category || "matches"}>
                      {group.category ? <h3>{group.category}</h3> : null}
                      <ul className="cl-all">
                        {group.clubs.map((club) => {
                          const on = checked(club);
                          const locked = club.state === "paid" || club.state === "waiting";
                          const dropping = dropIds.includes(club.id);
                          const adding = club.state === "open" && pickIds.includes(club.id);
                          const status = dropping ? { label: "Remove", tone: "drop" as const } : adding ? { label: "Add", tone: "add" as const } : club.state === "open" ? null : clubStatus(club);
                          const tone = dropping ? "drop" : adding ? "add" : club.state === "open" ? "open" : clubStatus(club).tone;
                          return (
                            <li key={club.id} className={`is-${tone}`}>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={on}
                                  disabled={locked || !!busy}
                                  onChange={(event) => toggle(club, event.target.checked)}
                                />
                                <i className={`fa-solid ${clubIcon(club.title)}`} aria-hidden="true" />
                                <span>
                                  <strong>{club.title}</strong>
                                  <small>
                                    {club.fee > 0 ? ugx(club.fee) : "No fee"}
                                    {club.receiptNo ? ` · Receipt ${club.receiptNo}` : ""}
                                  </small>
                                </span>
                                {status ? <em className={`is-${status.tone}`}>{status.label}</em> : null}
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )) : (
                    <p className="cl-dialog-empty">No clubs match these filters.</p>
                  )}
                </>
              ) : (
                <p className="cl-dialog-empty">No clubs are open for this class yet.</p>
              )}
            </section>
          </div>

          <footer className="cl-dialog-foot">
            {notice ? <p className="cl-act-error" role="alert">{notice}</p> : null}
            {error ? <p className="cl-act-error" role="alert">{error}</p> : null}
            {pendingId ? (
              <div className="cl-act">
                <p className="cl-state is-wait"><span className="cl-wait-dot" aria-hidden="true" /> {stalled ? "Still waiting" : "Check your phone"}</p>
                <p className="cl-state-note">
                  {stalled
                    ? "If you already approved the prompt, check again."
                    : `Approve ${ugx(waiting.reduce((sum, club) => sum + club.fee, 0))} on your phone for ${waiting.map((club) => club.title).join(", ")}.`}
                </p>
                <button type="button" className="ov-btn ov-btn-dark" onClick={() => onCheck(pendingId)} disabled={checking || !!busy}>{checking ? "Checking…" : "I've approved"}</button>
              </div>
            ) : null}
            {picks.length || drops.length ? (
              <button type="button" className="ov-btn ov-btn-dark" onClick={save} disabled={!!busy}>
                {busy === "save" ? "Saving…" : saveLabel(picks.length, drops.length)}
              </button>
            ) : null}
            {!pendingId && payClubs.length && termLabel && online ? (
              <form className="cl-pay" onSubmit={pay}>
                <label className="cl-field">
                  <span>Mobile money number</span>
                  <input type="tel" inputMode="tel" autoComplete="tel" placeholder="0772 123 456" value={number} onChange={(event) => setNumber(event.target.value)} required />
                </label>
                <button className="ov-btn ov-btn-gold" type="submit" disabled={!!busy || !network}>{busy === "pay" ? "Sending…" : `Pay ${ugx(payTotal)}`}</button>
                <p className="cl-pay-hint">{network || "Enter an MTN or Airtel number."}{termLabel ? ` · ${termLabel}` : ""} · {payClubs.length === 1 ? payClubs[0].title : `${payClubs.length} clubs`}</p>
              </form>
            ) : null}
            {!pendingId && payable.length && termLabel && !online ? <p className="cl-state-note">Pay {ugx(payable.reduce((sum, club) => sum + club.fee, 0))} at the accounts office.</p> : null}
            {!pendingId && payable.length && !termLabel ? <p className="cl-state-note">Payment opens when the term begins.</p> : null}
          </footer>
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(dialog, document.body);
}
