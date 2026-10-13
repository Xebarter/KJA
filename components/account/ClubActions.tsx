"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cancelClubSignup, signupClub } from "@/app/account/actions";

function errorText(err: unknown) {
  return err instanceof Error && err.message ? err.message : "Something went wrong. Please try again.";
}

function useFlash() {
  const [flash, setFlash] = useState("");
  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(""), 3600);
    return () => window.clearTimeout(timer);
  }, [flash]);
  return [flash, setFlash] as const;
}

export function ClubJoin({
  clubId,
  available,
  hasKids,
}: {
  clubId: string;
  available: { id: string; name: string }[];
  hasKids: boolean;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [flash, setFlash] = useFlash();

  const join = async (child: { id: string; name: string }) => {
    setBusy(child.id);
    setError("");
    const formData = new FormData();
    formData.set("club_id", clubId);
    formData.set("child_id", child.id);
    try {
      await signupClub(formData);
      setFlash(`Request sent for ${child.name}`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy("");
    }
  };

  let body: React.ReactNode;
  if (!hasKids) {
    body = (
      <Link className="cl-add-link" href="/account/children">
        <i className="fa-solid fa-plus" aria-hidden="true" /> Add a child to sign up
      </Link>
    );
  } else if (!available.length) {
    body = flash ? null : (
      <span className="cl-all-in">
        <i className="fa-solid fa-circle-check" aria-hidden="true" /> Everyone&apos;s signed up
      </span>
    );
  } else if (available.length === 1) {
    const child = available[0];
    body = (
      <button className="cl-join" type="button" onClick={() => join(child)} disabled={!!busy}>
        {busy ? <span className="cl-spinner" aria-hidden="true" /> : <i className="fa-solid fa-plus" aria-hidden="true" />}
        {busy ? "Sending…" : `Sign up ${child.name}`}
      </button>
    );
  } else {
    body = (
      <div className="cl-join-group" role="group" aria-label="Sign up a child">
        <span className="cl-join-label">Sign up</span>
        {available.map((child) => (
          <button className="cl-join-chip" type="button" key={child.id} onClick={() => join(child)} disabled={!!busy} aria-label={`Sign up ${child.name}`}>
            {busy === child.id ? <span className="cl-spinner" aria-hidden="true" /> : <i className="fa-solid fa-plus" aria-hidden="true" />}
            {child.name}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="cl-card-foot">
      {body}
      {flash ? (
        <span className="cl-flash" role="status">
          <i className="fa-solid fa-paper-plane" aria-hidden="true" /> {flash}
        </span>
      ) : null}
      {error ? (
        <p className="cl-alert" role="alert">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {error}
        </p>
      ) : null}
    </div>
  );
}

export function SignupWithdraw({ id, label }: { id: string; label: string }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const withdraw = async () => {
    setBusy(true);
    setError("");
    const formData = new FormData();
    formData.set("id", id);
    try {
      await cancelClubSignup(formData);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  if (!confirming) {
    return (
      <button className="cl-x" type="button" onClick={() => setConfirming(true)} aria-label={`Withdraw from ${label}`} title="Withdraw">
        <i className="fa-solid fa-xmark" aria-hidden="true" />
      </button>
    );
  }

  return (
    <span className="cl-confirm" role="alertdialog" aria-label={`Withdraw from ${label}?`}>
      <span>{error || "Withdraw?"}</span>
      <button className="cl-confirm-yes" type="button" onClick={withdraw} disabled={busy}>
        {busy ? <span className="cl-spinner" aria-hidden="true" /> : null}
        {busy ? "…" : "Yes"}
      </button>
      <button className="cl-confirm-no" type="button" onClick={() => setConfirming(false)} disabled={busy}>
        Keep
      </button>
    </span>
  );
}
