"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClubDialog } from "@/components/account/ClubDialog";
import {
  childSummary,
  chosenClubs,
  clubIcon,
  clubStatus,
  needsPayment,
  isConfirmed,
  type ClubChild,
  type ClubPatch,
} from "@/components/account/club-model";
import { checkClubPayment } from "@/app/account/(portal)/clubs/actions";
import type { ClubPaymentView } from "@/lib/payments/clubs";
import { initials } from "@/lib/applications";

export type { ClubChoice, ClubChild, ClubPatch } from "@/components/account/club-model";
export { needsPayment, isConfirmed } from "@/components/account/club-model";

const WAIT_MS = 150_000;

export function ClubsView({
  family,
  phone,
  online,
  termLabel,
}: {
  family: ClubChild[];
  phone: string;
  online: boolean;
  termLabel: string | null;
}) {
  const router = useRouter();
  const serverKey = family.map((child) => `${child.id}:${child.clubs.map((club) => [club.id, club.state, club.consentId, club.receiptNo, club.collectionId].join("~")).join(",")}`).join("|");
  const [patches, setPatches] = useState<Record<string, ClubPatch>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<{ childId: string; text: string } | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const starts = useRef(new Map<string, number>());
  const familyRef = useRef(family);
  familyRef.current = family;

  useEffect(() => {
    setPatches({});
  }, [serverKey]);

  const view = useMemo(() => family.map((child) => ({
    ...child,
    clubs: child.clubs.map((club) => {
      const patch = patches[`${child.id}:${club.id}`];
      return patch ? { ...club, ...patch } : club;
    }),
  })), [family, patches]);

  const pendingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const child of view) {
      for (const club of child.clubs) {
        if (club.state === "waiting" && club.collectionId) ids.add(club.collectionId);
      }
    }
    return [...ids];
  }, [view]);
  const pendingKey = pendingIds.join("|");

  for (const id of pendingIds) {
    if (!starts.current.has(id)) starts.current.set(id, Date.now());
  }

  const applyRef = useRef<(payment: ClubPaymentView) => void>(() => undefined);
  applyRef.current = (payment) => {
    let childId = "";
    setPatches((current) => {
      const next = { ...current };
      let changed = false;
      for (const child of familyRef.current) {
        const involved = child.clubs.some((club) => (current[`${child.id}:${club.id}`]?.collectionId ?? club.collectionId) === payment.id);
        if (!involved) continue;
        childId = child.id;
        if (payment.status === "failed") {
          for (const club of child.clubs) {
            const key = `${child.id}:${club.id}`;
            if ((current[key]?.collectionId ?? club.collectionId) !== payment.id) continue;
            next[key] = { ...current[key], state: "consented", collectionId: null };
            changed = true;
          }
        }
        if (payment.status === "paid") {
          for (const line of payment.lines) {
            if (!child.clubs.some((club) => club.id === line.id)) continue;
            next[`${child.id}:${line.id}`] = { state: "paid", receiptNo: line.receiptNo, collectionId: null };
            changed = true;
          }
        }
      }
      return changed ? next : current;
    });
    if (payment.status === "failed" && childId) {
      setNotice({ childId, text: "The request was declined or timed out. You have not been charged." });
    }
    if (payment.status === "paid") router.refresh();
  };

  useEffect(() => {
    if (!pendingKey) return;
    const ids = pendingKey.split("|");
    const live = ids.filter((id) => Date.now() - (starts.current.get(id) || 0) <= WAIT_MS);
    if (!live.length) return;
    const timer = window.setTimeout(async () => {
      for (const id of live) {
        const result = await checkClubPayment(id).catch(() => null);
        if (result && "payment" in result && result.payment.status !== "pending") applyRef.current(result.payment);
      }
      setClock(Date.now());
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [pendingKey, clock]);

  const toPay = view.reduce((sum, child) => sum + child.clubs.filter(needsPayment).length, 0);
  const confirmed = view.reduce((sum, child) => sum + child.clubs.filter(isConfirmed).length, 0);
  const openChild = view.find((child) => child.id === openId) ?? null;

  function patch(childId: string, clubId: string, next: ClubPatch) {
    setPatches((current) => ({ ...current, [`${childId}:${clubId}`]: { ...current[`${childId}:${clubId}`], ...next } }));
  }

  async function checkNow(id: string) {
    setChecking(true);
    const result = await checkClubPayment(id).catch(() => null);
    setChecking(false);
    if (!result || !("payment" in result)) {
      if (openChild) setNotice({ childId: openChild.id, text: "We couldn't check the payment just now. Try again in a moment." });
      return;
    }
    if (result.payment.status === "pending") return;
    applyRef.current(result.payment);
  }

  return (
    <div className="ov cl">
      <section className="ch-hero cl-hero">
        <div className="ch-hero-copy">
          <p className="ch-kicker">Co-curricular</p>
          <h1>Clubs</h1>
          <p>Each child is listed with the clubs you have chosen. Open a child to give consent and pay.</p>
          <ol className="cl-steps">
            <li><span>1</span> Consent</li>
            <li><span>2</span> Pay</li>
            <li><span>3</span> Confirmed</li>
          </ol>
        </div>
        {view.length ? (
          <dl className="ch-hero-stats">
            <div>
              <dt>Children</dt>
              <dd>{view.length}</dd>
            </div>
            <div>
              <dt>To pay</dt>
              <dd>{toPay}</dd>
            </div>
            <div>
              <dt>Confirmed</dt>
              <dd>{confirmed}</dd>
            </div>
          </dl>
        ) : null}
      </section>

      {view.length ? (
        <div className="cl-family">
          {view.map((child) => {
            const chosen = chosenClubs(child);
            const due = child.clubs.some(needsPayment);
            const summary = childSummary(child);
            return (
              <button key={child.id} type="button" className="cl-child" onClick={() => { setNotice(null); setOpenId(child.id); }}>
                <span className="cl-child-head">
                  <span className="ov-child-avatar" aria-hidden="true">{initials(child.name)}</span>
                  <span>
                    <strong>{child.name}</strong>
                    <small>{child.detail}</small>
                  </span>
                </span>
                <span className={`cl-child-summary${due ? " is-due" : chosen.length ? " is-done" : ""}`}>{summary}</span>
                {chosen.length ? (
                  <ul className="cl-child-list">
                    {chosen.map((club) => {
                      const status = clubStatus(club);
                      return (
                        <li key={club.id}>
                          <i className={`fa-solid ${clubIcon(club.title)}`} aria-hidden="true" />
                          <span>{club.title}</span>
                          <em className={`is-${status.tone}`}>{status.label}</em>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <span className="cl-child-none">No clubs yet</span>
                )}
                <span className="cl-child-go">
                  {due ? "Pay and manage" : "Choose clubs"}
                  <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <section className="ov-panel">
          <div className="ov-empty">
            <i className="fa-solid fa-children" aria-hidden="true" />
            <p>Clubs appear here once the admissions office enrols your children.</p>
          </div>
        </section>
      )}

      {openChild ? (
        <ClubDialog
          child={openChild}
          phone={phone}
          online={online}
          termLabel={termLabel}
          notice={notice?.childId === openChild.id ? notice.text : ""}
          checking={checking}
          stalled={openChild.clubs.some((club) => club.state === "waiting" && club.collectionId && Date.now() - (starts.current.get(club.collectionId) || clock) > WAIT_MS)}
          onClose={() => setOpenId(null)}
          onPatch={(clubId, next) => patch(openChild.id, clubId, next)}
          onCheck={checkNow}
          onNotice={(text) => setNotice(text ? { childId: openChild.id, text } : null)}
        />
      ) : null}
    </div>
  );
}
