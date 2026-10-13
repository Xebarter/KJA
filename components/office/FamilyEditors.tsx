"use client";

import { useState } from "react";
import {
  deleteContact,
  deleteGuardian,
  moveContact,
  resolveContact,
  saveContact,
  saveGuardian,
  updateFamily,
} from "@/app/admissions_office/(office)/families/actions";
import { Feedback, useOfficeAction } from "@/components/office/client";
import { CONTACT_RELATIONSHIPS, cap, displayPhone, telHref, type Family, type FamilyContact, type Guardian } from "@/lib/students";

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`ofc-field${wide ? " is-wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function FamilyDetailsForm({ family }: { family: Family }) {
  const [editing, setEditing] = useState(false);
  const { result, pending, run } = useOfficeAction();
  if (!editing) {
    return (
      <>
        <dl className="app-details">
          <div className="app-detail"><dt>Mailing name</dt><dd>{family.mailing_name || <span className="app-muted">Not recorded</span>}</dd></div>
          <div className="app-detail"><dt>Home area</dt><dd>{family.home_area || <span className="app-muted">Not recorded</span>}</dd></div>
          <div className="app-detail"><dt>Street</dt><dd>{family.street || <span className="app-muted">Not recorded</span>}</dd></div>
          <div className="app-detail"><dt>Country</dt><dd>{family.country || <span className="app-muted">Not recorded</span>}</dd></div>
          <div className="app-detail ofc-detail-wide"><dt>Address</dt><dd>{family.home_address || <span className="app-muted">Not recorded</span>}</dd></div>
          {family.notes ? <div className="app-detail ofc-detail-wide"><dt>Notes</dt><dd className="ofc-pre">{family.notes}</dd></div> : null}
        </dl>
        <Feedback result={result} className="ofc-flush" />
        <button type="button" className="app-link-btn ofc-edit-link" onClick={() => setEditing(true)}><i className="fa-solid fa-pen" aria-hidden="true" /> Edit family details</button>
      </>
    );
  }
  return (
    <form
      className="ofc-form is-compact"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        run(() => updateFamily(data), () => setEditing(false));
      }}
    >
      <input type="hidden" name="id" value={family.id} />
      <div className="ofc-fields">
        <Field label="Mailing name"><input name="mailing_name" defaultValue={family.mailing_name ?? ""} /></Field>
        <Field label="Home area"><input name="home_area" defaultValue={family.home_area ?? ""} /></Field>
        <Field label="Street"><input name="street" defaultValue={family.street ?? ""} /></Field>
        <Field label="Country"><input name="country" defaultValue={family.country ?? ""} /></Field>
        <Field label="Address" wide><input name="home_address" defaultValue={family.home_address ?? ""} /></Field>
        <Field label="Notes" wide><textarea name="notes" rows={3} defaultValue={family.notes ?? ""} /></Field>
      </div>
      <div className="ofc-row-actions">
        <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
        <button type="submit" className="admin-btn" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      </div>
      <Feedback result={result} className="ofc-flush" />
    </form>
  );
}

function GuardianForm({ familyId, guardian, taken, onDone }: { familyId: string; guardian?: Guardian; taken: string[]; onDone: () => void }) {
  const { result, pending, run } = useOfficeAction();
  const relationships = (["father", "mother", "guardian"] as const).filter((value) => value === guardian?.relationship || value === "guardian" || !taken.includes(value));
  return (
    <form
      className="ofc-form is-compact ofc-guardian-form"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        run(() => saveGuardian(data), onDone);
      }}
    >
      {guardian ? <input type="hidden" name="id" value={guardian.id} /> : null}
      <input type="hidden" name="family_id" value={familyId} />
      <div className="ofc-fields">
        <Field label="Relationship">
          <select name="relationship" defaultValue={guardian?.relationship ?? relationships[0]}>
            {relationships.map((value) => <option key={value} value={value}>{cap(value)}</option>)}
          </select>
        </Field>
        <Field label="Title">
          <select name="title" defaultValue={guardian?.title ?? ""}>
            <option value="">None</option>
            {[...new Set(["Mr", "Mrs", "Ms", "Dr", "Prof", "Rev", "Eng", "Hon", ...(guardian?.title ? [guardian.title] : [])])].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </Field>
        <Field label="Full name" wide><input name="full_name" defaultValue={guardian?.full_name ?? ""} required /></Field>
        <Field label="Mobile phone"><input name="phone" type="tel" defaultValue={displayPhone(guardian?.phone)} /></Field>
        <Field label="Other phone"><input name="phone_alt" type="tel" defaultValue={displayPhone(guardian?.phone_alt)} /></Field>
        <Field label="Work phone"><input name="work_phone" type="tel" defaultValue={displayPhone(guardian?.work_phone)} /></Field>
        <Field label="Email"><input name="email" type="email" defaultValue={guardian?.email ?? ""} /></Field>
        <Field label="Occupation"><input name="occupation" defaultValue={guardian?.occupation ?? ""} /></Field>
        <Field label="Employer"><input name="employer" defaultValue={guardian?.employer ?? ""} /></Field>
        <Field label="Nationality"><input name="nationality" defaultValue={guardian?.nationality ?? ""} /></Field>
        <div className="ofc-field">
          <span>Main contact</span>
          <label className="ofc-check"><input type="checkbox" name="is_primary" defaultChecked={guardian?.is_primary ?? false} /> Call this person first</label>
        </div>
        <Field label="Notes" wide><textarea name="notes" rows={2} defaultValue={guardian?.notes ?? ""} /></Field>
      </div>
      <div className="ofc-row-actions">
        <button type="button" className="admin-btn admin-btn-ghost" onClick={onDone}>Cancel</button>
        <button type="submit" className="admin-btn" disabled={pending}>{pending ? "Saving…" : guardian ? "Save" : "Add"}</button>
      </div>
      <Feedback result={result} className="ofc-flush" />
    </form>
  );
}

export function GuardianEditor({ familyId, guardians }: { familyId: string; guardians: Guardian[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const { result, pending, run } = useOfficeAction();
  const taken = guardians.map((guardian) => guardian.relationship);
  return (
    <div className="ofc-guardian-editor">
      <ul className="ofc-guardians">
        {guardians.map((guardian) => editing === guardian.id ? (
          <li key={guardian.id} className="is-editing">
            <GuardianForm familyId={familyId} guardian={guardian} taken={taken} onDone={() => setEditing(null)} />
          </li>
        ) : (
          <li key={guardian.id}>
            <span className="app-avatar app-avatar-md">{guardian.full_name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>
            <div>
              <strong>{[guardian.title, guardian.full_name].filter(Boolean).join(" ")}</strong>
              <small>
                {cap(guardian.relationship)}{guardian.is_primary ? " · Main contact" : ""}
                {[guardian.occupation, guardian.employer].filter(Boolean).length ? ` · ${[guardian.occupation, guardian.employer].filter(Boolean).join(", ")}` : ""}
                {guardian.user_id ? " · Has a parent portal account" : ""}
              </small>
              <span className="ofc-agenda-contact">
                {guardian.phone ? <a href={telHref(guardian.phone)}><i className="fa-solid fa-phone" aria-hidden="true" /> {displayPhone(guardian.phone)}</a> : null}
                {guardian.phone_alt ? <a href={telHref(guardian.phone_alt)}><i className="fa-solid fa-phone" aria-hidden="true" /> {displayPhone(guardian.phone_alt)}</a> : null}
                {guardian.work_phone ? <a href={telHref(guardian.work_phone)}><i className="fa-solid fa-briefcase" aria-hidden="true" /> {displayPhone(guardian.work_phone)}</a> : null}
                {guardian.email ? <a href={`mailto:${guardian.email}`}><i className="fa-regular fa-envelope" aria-hidden="true" /> {guardian.email}</a> : null}
              </span>
              {guardian.notes ? <p className="ofc-tiny app-muted">{guardian.notes}</p> : null}
            </div>
            <div className="ofc-item-actions">
              <button type="button" className="app-link-btn" onClick={() => setEditing(guardian.id)}>Edit</button>
              <button
                type="button"
                className="app-link-btn is-danger"
                disabled={pending}
                onClick={() => {
                  if (window.confirm(`Remove ${guardian.full_name} from this family? Their phone numbers stay in the contact list.`)) run(() => deleteGuardian(guardian.id, familyId));
                }}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      {!guardians.length && editing !== "new" ? <p className="app-muted">No parents or guardians on file.</p> : null}
      {editing === "new" ? (
        <GuardianForm familyId={familyId} taken={taken} onDone={() => setEditing(null)} />
      ) : (
        <button type="button" className="app-link-btn" onClick={() => setEditing("new")}><i className="fa-solid fa-plus" aria-hidden="true" /> Add a parent or guardian</button>
      )}
      <Feedback result={result} className="ofc-flush" />
    </div>
  );
}

function ContactForm({ familyId, contact, onDone }: { familyId: string; contact?: FamilyContact; onDone: () => void }) {
  const { result, pending, run } = useOfficeAction();
  const [kind, setKind] = useState<"phone" | "email">(contact?.kind ?? "phone");
  return (
    <form
      className="ofc-form is-compact ofc-contact-form"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        run(() => saveContact(data), onDone);
      }}
    >
      {contact ? <input type="hidden" name="id" value={contact.id} /> : null}
      <input type="hidden" name="family_id" value={familyId} />
      <div className="ofc-fields">
        <Field label="Type">
          <select name="kind" value={kind} onChange={(event) => setKind(event.target.value as "phone" | "email")}>
            <option value="phone">Phone</option>
            <option value="email">Email</option>
          </select>
        </Field>
        <Field label={kind === "phone" ? "Number" : "Address"}>
          <input name="value" type={kind === "phone" ? "tel" : "email"} defaultValue={contact ? (contact.kind === "phone" ? displayPhone(contact.value) : contact.value) : ""} required />
        </Field>
        {kind === "phone" ? (
          <Field label="Phone type">
            <select name="phone_type" defaultValue={contact?.phone_type ?? "mobile"}>
              <option value="mobile">Mobile</option>
              <option value="work">Work</option>
              <option value="landline">Landline</option>
            </select>
          </Field>
        ) : null}
        <Field label="Whose is it">
          <select name="relationship" defaultValue={contact?.relationship ?? "father"}>
            {CONTACT_RELATIONSHIPS.map((value) => <option key={value} value={value}>{cap(value)}</option>)}
          </select>
        </Field>
        <Field label="Name"><input name="name" defaultValue={contact?.name ?? ""} placeholder="e.g. Aunt Grace" /></Field>
        <Field label="Label"><input name="label" defaultValue={contact?.label ?? ""} placeholder="e.g. Picks up on Fridays" /></Field>
      </div>
      <div className="ofc-row-actions">
        <button type="button" className="admin-btn admin-btn-ghost" onClick={onDone}>Cancel</button>
        <button type="submit" className="admin-btn" disabled={pending}>{pending ? "Saving…" : contact ? "Save" : "Add contact"}</button>
      </div>
      <Feedback result={result} className="ofc-flush" />
    </form>
  );
}

/** The family's ordered contact list: who to call, in which order, with flags from the import. */
export function ContactEditor({ familyId, contacts }: { familyId: string; contacts: FamilyContact[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const { result, pending, run } = useOfficeAction();
  return (
    <div className="ofc-contact-editor">
      {contacts.length ? (
        <ol className="ofc-contact-list">
          {contacts.map((contact, index) => editing === contact.id ? (
            <li key={contact.id} className="is-editing">
              <ContactForm familyId={familyId} contact={contact} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={contact.id} className={contact.needs_check ? "is-check" : ""}>
              <span className="ofc-contact-order">{index + 1}</span>
              <i className={contact.kind === "phone" ? (contact.phone_type === "work" ? "fa-solid fa-briefcase" : "fa-solid fa-phone") : "fa-regular fa-envelope"} aria-hidden="true" />
              <div>
                <a href={contact.kind === "phone" ? telHref(contact.value) : `mailto:${contact.value}`}>{contact.kind === "phone" ? displayPhone(contact.value) : contact.value}</a>
                <small>
                  {[contact.name, cap(contact.relationship), contact.phone_type && contact.phone_type !== "mobile" ? contact.phone_type : null, contact.label].filter(Boolean).join(" · ")}
                </small>
                {contact.needs_check ? <small className="ofc-flag-text"><i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> The import couldn&apos;t confirm this. Call to check, then mark it checked.</small> : null}
              </div>
              <div className="ofc-item-actions">
                {contact.needs_check ? (
                  <button type="button" className="app-link-btn" disabled={pending} onClick={() => run(() => resolveContact(contact.id, familyId))}>Checked</button>
                ) : null}
                <button type="button" className="ofc-icon-btn" disabled={pending || index === 0} aria-label="Move up" onClick={() => run(() => moveContact(contact.id, familyId, "up"))}>
                  <i className="fa-solid fa-arrow-up" aria-hidden="true" />
                </button>
                <button type="button" className="ofc-icon-btn" disabled={pending || index === contacts.length - 1} aria-label="Move down" onClick={() => run(() => moveContact(contact.id, familyId, "down"))}>
                  <i className="fa-solid fa-arrow-down" aria-hidden="true" />
                </button>
                <button type="button" className="app-link-btn" onClick={() => setEditing(contact.id)}>Edit</button>
                <button
                  type="button"
                  className="app-link-btn is-danger"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm("Remove this contact?")) run(() => deleteContact(contact.id, familyId));
                  }}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
      ) : editing !== "new" ? <p className="app-muted">No contacts on file.</p> : null}
      {editing === "new" ? (
        <ContactForm familyId={familyId} onDone={() => setEditing(null)} />
      ) : (
        <button type="button" className="app-link-btn" onClick={() => setEditing("new")}><i className="fa-solid fa-plus" aria-hidden="true" /> Add a contact</button>
      )}
      <Feedback result={result} className="ofc-flush" />
    </div>
  );
}
