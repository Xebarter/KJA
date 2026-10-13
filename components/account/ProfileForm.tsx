"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { signOutAccount } from "@/app/account/actions";

type Values = { full_name: string; phone: string; address: string };
const FIELDS = ["full_name", "phone", "address"] as const;

function Field({ id, label, icon, hint, badge, children }: { id: string; label: string; icon: string; hint?: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <div className="pf-field">
      <div className="pf-label">
        <label htmlFor={id}>{label}</label>
        {badge}
      </div>
      <div className="pf-input">
        <i className={`fa-solid ${icon}`} aria-hidden="true" />
        {children}
      </div>
      {hint ? <p className="pf-hint" id={`${id}-hint`}>{hint}</p> : null}
    </div>
  );
}

export function ProfileForm({ action, initial, email }: { action: (formData: FormData) => Promise<void>; initial: Values; email: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [saved, setSaved] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const read = (): Values => {
    const data = new FormData(formRef.current ?? undefined);
    return { full_name: String(data.get("full_name") ?? "").trim(), phone: String(data.get("phone") ?? "").trim(), address: String(data.get("address") ?? "").trim() };
  };

  const onInput = () => {
    const now = read();
    setDirty(FIELDS.some((key) => now[key] !== saved[key]));
    if (status !== "idle") setStatus("idle");
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const next = read();
    startTransition(async () => {
      try {
        await action(data);
        setSaved(next);
        setDirty(false);
        setStatus("saved");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setStatus("error");
      }
    });
  };

  const reset = () => {
    const form = formRef.current;
    if (!form) return;
    for (const key of FIELDS) {
      const control = form.elements.namedItem(key) as HTMLInputElement | HTMLTextAreaElement | null;
      if (control) control.value = saved[key];
    }
    setDirty(false);
    setStatus("idle");
  };

  let note: ReactNode = <><i className="fa-solid fa-shield-halved" aria-hidden="true" /> Used on applications and school communication.</>;
  if (pending) note = <><span className="pf-spinner" aria-hidden="true" /> Saving your details…</>;
  else if (status === "error") note = <><i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {error}</>;
  else if (status === "saved") note = <><i className="fa-solid fa-circle-check" aria-hidden="true" /> All changes saved.</>;
  else if (dirty) note = <><i className="fa-solid fa-pen" aria-hidden="true" /> You have unsaved changes.</>;

  return (
    <form ref={formRef} className="pf-form" onSubmit={onSubmit} onInput={onInput}>
      <fieldset className="pf-section">
        <legend>
          <span className="pf-section-icon"><i className="fa-solid fa-user" aria-hidden="true" /></span>
          <span>
            <strong>Personal details</strong>
            <small>How the school addresses you.</small>
          </span>
        </legend>
        <div className="pf-fields">
          <Field id="full_name" label="Full name" icon="fa-id-card">
            <input id="full_name" name="full_name" defaultValue={initial.full_name} required autoComplete="name" placeholder="e.g. Sarah Namukasa" />
          </Field>
          <Field
            id="email"
            label="Email address"
            icon="fa-envelope"
            badge={<span className="pf-lock"><i className="fa-solid fa-lock" aria-hidden="true" /> Sign-in email</span>}
            hint="This is the email you sign in with, so it can't be changed here."
          >
            <input id="email" value={email} disabled aria-describedby="email-hint" />
          </Field>
        </div>
      </fieldset>

      <fieldset className="pf-section">
        <legend>
          <span className="pf-section-icon"><i className="fa-solid fa-address-book" aria-hidden="true" /></span>
          <span>
            <strong>Contact information</strong>
            <small>So the school can reach you about your children.</small>
          </span>
        </legend>
        <div className="pf-fields">
          <Field id="phone" label="Phone number" icon="fa-phone" hint="Include the country code, e.g. +256.">
            <input id="phone" name="phone" type="tel" defaultValue={initial.phone} autoComplete="tel" placeholder="+256 7XX XXX XXX" aria-describedby="phone-hint" />
          </Field>
          <Field id="address" label="Home address" icon="fa-location-dot">
            <textarea id="address" name="address" rows={2} defaultValue={initial.address} autoComplete="street-address" placeholder="House, street, area and city" />
          </Field>
        </div>
      </fieldset>

      <div className={`pf-savebar${dirty ? " is-dirty" : ""}${status === "saved" && !pending ? " is-saved" : ""}${status === "error" && !pending ? " is-error" : ""}`}>
        <p className="pf-savebar-note" role="status" aria-live="polite">{note}</p>
        <div className="pf-savebar-actions">
          <button type="button" className="ov-btn pf-btn-ghost" onClick={reset} disabled={!dirty || pending}>
            Discard
          </button>
          <button type="submit" className="ov-btn ov-btn-dark" disabled={!dirty || pending}>
            <i className="fa-solid fa-check" aria-hidden="true" /> {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </form>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="ov-btn pf-btn-ghost pf-signout"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await signOutAccount();
          router.push("/");
          router.refresh();
        })
      }
    >
      <i className="fa-solid fa-arrow-right-from-bracket" aria-hidden="true" /> {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
