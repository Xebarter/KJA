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
import { CopyButton, Feedback, useOfficeAction } from "@/components/office/client";
import { Detail } from "@/components/office/ui";
import { initials, whatsappLink } from "@/lib/applications";
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
    const address = [family.street, family.home_address, family.home_area, family.country].filter(Boolean).join(", ");
    return (
      <>
        <dl className="ofc-facts is-stack">
          <Detail label="Mailing name">{family.mailing_name}</Detail>
          <Detail label="Home area">{family.home_area}</Detail>
          <Detail label="Street">{family.street}</Detail>
          <Detail label="Address">{family.home_address}</Detail>
          <Detail label="Country">{family.country}</Detail>
          {family.notes ? <Detail label="Notes"><span className="ofc-pre">{family.notes}</span></Detail> : null}
        </dl>
        <Feedback result={result} className="ofc-flush" />
        <div className="ofc-fam-home-actions">
          <button type="button" className="ofc-chip-btn" onClick={() => setEditing(true)}><i className="fa-solid fa-pen" aria-hidden="true" /> Edit home details</button>
          {address ? (
            <a className="ofc-chip-btn" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer">
              <i className="fa-solid fa-map-location-dot" aria-hidden="true" /> Open in Maps
            </a>
          ) : null}
        </div>
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
      <div className="ofc-fields ofc-fam-home-fields">
        <Field label="Mailing name" wide><input name="mailing_name" defaultValue={family.mailing_name ?? ""} placeholder="e.g. Mr and Mrs Kato" autoFocus /></Field>
        <Field label="Home area"><input name="home_area" defaultValue={family.home_area ?? ""} placeholder="e.g. Muyenga" /></Field>
        <Field label="Country"><input name="country" defaultValue={family.country ?? ""} /></Field>
        <Field label="Street" wide><input name="street" defaultValue={family.street ?? ""} /></Field>
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
      <p className="ofc-fam-form-title">{guardian ? `Edit ${guardian.full_name}` : "Add a parent or guardian"}</p>
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
        <Field label="Full name" wide><input name="full_name" defaultValue={guardian?.full_name ?? ""} required autoFocus /></Field>
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
      <ul className="ofc-people ofc-fam-people">
        {guardians.map((guardian) => {
          if (editing === guardian.id) {
            return (
              <li key={guardian.id} className="is-editing">
                <GuardianForm familyId={familyId} guardian={guardian} taken={taken} onDone={() => setEditing(null)} />
              </li>
            );
          }
          const whatsapp = whatsappLink(guardian.phone);
          const work = [guardian.occupation, guardian.employer].filter(Boolean).join(" at ");
          const otherPhones = [
            guardian.phone_alt ? { label: "Other", value: guardian.phone_alt } : null,
            guardian.work_phone ? { label: "Work", value: guardian.work_phone } : null,
          ].filter((entry): entry is { label: string; value: string } => Boolean(entry));
          return (
            <li key={guardian.id} className={guardian.is_primary ? "is-primary" : ""}>
              <div className="ofc-person-head">
                <span className={`ofc-person-avatar is-${guardian.relationship}`} aria-hidden="true">{initials(guardian.full_name)}</span>
                <div>
                  <strong>{[guardian.title, guardian.full_name].filter(Boolean).join(" ")}</strong>
                  <span>{cap(guardian.relationship)}{work ? ` · ${work}` : ""}</span>
                </div>
                {guardian.is_primary ? <span className="ofc-person-badge">Main contact</span> : null}
              </div>
              {guardian.phone || guardian.email ? (
                <div className="ofc-person-actions">
                  {guardian.phone ? (
                    <span className="ofc-chip-group">
                      <a className="ofc-chip-btn" href={telHref(guardian.phone)}><i className="fa-solid fa-phone" aria-hidden="true" /> {displayPhone(guardian.phone)}</a>
                      <CopyButton value={displayPhone(guardian.phone)} label={`${guardian.full_name}'s phone number`} />
                    </span>
                  ) : null}
                  {whatsapp ? (
                    <a className="ofc-chip-btn is-whatsapp" href={whatsapp} target="_blank" rel="noreferrer"><i className="fa-brands fa-whatsapp" aria-hidden="true" /> WhatsApp</a>
                  ) : null}
                  {guardian.email ? (
                    <span className="ofc-chip-group">
                      <a className="ofc-chip-btn" href={`mailto:${guardian.email}`}><i className="fa-regular fa-envelope" aria-hidden="true" /> {guardian.email}</a>
                      <CopyButton value={guardian.email} label={`${guardian.full_name}'s email`} />
                    </span>
                  ) : null}
                </div>
              ) : <p className="ofc-person-none">No phone or email on file</p>}
              {otherPhones.length ? (
                <p className="ofc-person-more">
                  {otherPhones.map((entry) => (
                    <a key={entry.label} href={telHref(entry.value)}>{entry.label}: {displayPhone(entry.value)}</a>
                  ))}
                </p>
              ) : null}
              {guardian.nationality || guardian.user_id ? (
                <p className="ofc-fam-person-tags">
                  {guardian.nationality ? <span><i className="fa-solid fa-earth-africa" aria-hidden="true" /> {guardian.nationality}</span> : null}
                  {guardian.user_id ? <span><i className="fa-solid fa-circle-user" aria-hidden="true" /> Parent portal account</span> : null}
                </p>
              ) : null}
              {guardian.notes ? <p className="ofc-fam-person-note">{guardian.notes}</p> : null}
              <div className="ofc-fam-person-foot">
                <button type="button" className="ofc-fam-act" onClick={() => setEditing(guardian.id)}>
                  <i className="fa-solid fa-pen" aria-hidden="true" /> Edit
                </button>
                <button
                  type="button"
                  className="ofc-fam-act is-danger"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(`Remove ${guardian.full_name} from this family? Their phone numbers stay in the contact list.`)) run(() => deleteGuardian(guardian.id, familyId));
                  }}
                >
                  <i className="fa-regular fa-trash-can" aria-hidden="true" /> Remove
                </button>
              </div>
            </li>
          );
        })}
        {editing === "new" ? (
          <li className="is-editing">
            <GuardianForm familyId={familyId} taken={taken} onDone={() => setEditing(null)} />
          </li>
        ) : (
          <li className="ofc-fam-add">
            <button type="button" onClick={() => setEditing("new")}>
              <span aria-hidden="true"><i className="fa-solid fa-plus" /></span>
              {guardians.length ? "Add a parent or guardian" : "No parents on file yet. Add a parent or guardian"}
            </button>
          </li>
        )}
      </ul>
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
      <p className="ofc-fam-form-title">{contact ? "Edit contact" : "Add a contact"}</p>
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
          <input name="value" type={kind === "phone" ? "tel" : "email"} defaultValue={contact ? (contact.kind === "phone" ? displayPhone(contact.value) : contact.value) : ""} required autoFocus />
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
  const firstPhone = contacts.find((contact) => contact.kind === "phone")?.id;
  return (
    <div className="ofc-contact-editor">
      {contacts.length ? (
        <ol className="ofc-fam-contacts">
          {contacts.map((contact, index) => {
            if (editing === contact.id) {
              return (
                <li key={contact.id} className="is-editing">
                  <ContactForm familyId={familyId} contact={contact} onDone={() => setEditing(null)} />
                </li>
              );
            }
            const phone = contact.kind === "phone";
            const shown = phone ? displayPhone(contact.value) : contact.value;
            const meta = [contact.name, cap(contact.relationship), contact.phone_type && contact.phone_type !== "mobile" ? cap(contact.phone_type) : null, contact.label].filter(Boolean);
            return (
              <li key={contact.id} className={contact.needs_check ? "is-check" : ""}>
                <span className="ofc-fam-order" aria-label={`Call order ${index + 1}`}>{index + 1}</span>
                <span className={`ofc-fam-kind${phone ? "" : " is-email"}`} aria-hidden="true">
                  <i className={phone ? (contact.phone_type === "work" ? "fa-solid fa-briefcase" : contact.phone_type === "landline" ? "fa-solid fa-phone-volume" : "fa-solid fa-mobile-screen") : "fa-regular fa-envelope"} />
                </span>
                <div className="ofc-fam-contact-body">
                  <p>
                    <a href={phone ? telHref(contact.value) : `mailto:${contact.value}`}>{shown}</a>
                    {contact.id === firstPhone ? <span className="ofc-fam-sos">Emergency</span> : null}
                  </p>
                  {meta.length ? <small>{meta.join(" · ")}</small> : null}
                  {contact.needs_check ? (
                    <p className="ofc-fam-check">
                      <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> Not confirmed since the import. Call to check it.
                      <button type="button" disabled={pending} onClick={() => run(() => resolveContact(contact.id, familyId))}>
                        <i className="fa-solid fa-check" aria-hidden="true" /> Mark checked
                      </button>
                    </p>
                  ) : null}
                </div>
                <div className="ofc-fam-contact-actions">
                  <CopyButton value={shown} label={phone ? "the number" : "the email"} />
                  <button type="button" className="ofc-icon-btn" disabled={pending || index === 0} title="Call earlier" aria-label="Move up" onClick={() => run(() => moveContact(contact.id, familyId, "up"))}>
                    <i className="fa-solid fa-arrow-up" aria-hidden="true" />
                  </button>
                  <button type="button" className="ofc-icon-btn" disabled={pending || index === contacts.length - 1} title="Call later" aria-label="Move down" onClick={() => run(() => moveContact(contact.id, familyId, "down"))}>
                    <i className="fa-solid fa-arrow-down" aria-hidden="true" />
                  </button>
                  <button type="button" className="ofc-icon-btn" title="Edit" aria-label={`Edit ${shown}`} onClick={() => setEditing(contact.id)}>
                    <i className="fa-solid fa-pen" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="ofc-icon-btn is-danger"
                    disabled={pending}
                    title="Remove"
                    aria-label={`Remove ${shown}`}
                    onClick={() => {
                      if (window.confirm(`Remove ${shown} from this family's contacts?`)) run(() => deleteContact(contact.id, familyId));
                    }}
                  >
                    <i className="fa-regular fa-trash-can" aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : editing !== "new" ? <p className="ofc-empty-line">No phone numbers or emails on file.</p> : null}
      {editing === "new" ? (
        <ContactForm familyId={familyId} onDone={() => setEditing(null)} />
      ) : (
        <button type="button" className="ofc-chip-btn" onClick={() => setEditing("new")}><i className="fa-solid fa-plus" aria-hidden="true" /> Add a contact</button>
      )}
      <Feedback result={result} className="ofc-flush" />
    </div>
  );
}
