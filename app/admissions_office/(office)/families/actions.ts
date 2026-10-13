"use server";

import {
  EMAIL,
  boolField,
  emailField,
  field,
  logFamily,
  longField,
  phoneField,
  type ActionResult,
} from "@/lib/office-forms";
import { refreshOffice, requireOffice } from "@/lib/office";
import { CONTACT_RELATIONSHIPS, OFFICE, cap, displayPhone, isUuid, normalizePhone, phoneIsValid } from "@/lib/students";

function familyPath(id: string) {
  return `${OFFICE}/families/${id}`;
}

export async function updateFamily(formData: FormData): Promise<ActionResult> {
  const auth = await requireOffice();
  if ("error" in auth) return { error: auth.error };
  const id = String(formData.get("id") || "");
  if (!isUuid(id)) return { error: "This family could not be found." };
  const patch = {
    mailing_name: field(formData, "mailing_name", 160),
    home_area: field(formData, "home_area", 120),
    street: field(formData, "street", 160),
    home_address: field(formData, "home_address", 300),
    country: field(formData, "country", 60),
    notes: longField(formData, "notes", 2000),
  };
  const { error } = await auth.supabase.from("families").update(patch).eq("id", id);
  if (error) return { error: error.message };
  await logFamily(auth.supabase, auth.user.id, id, "Updated the family's address details");
  refreshOffice(familyPath(id));
  return { ok: "Family details saved." };
}

export async function saveGuardian(formData: FormData): Promise<ActionResult> {
  const auth = await requireOffice();
  if ("error" in auth) return { error: auth.error };
  const { supabase, user } = auth;
  const id = String(formData.get("id") || "");
  const familyId = String(formData.get("family_id") || "");
  if (!isUuid(familyId)) return { error: "This family could not be found." };
  const relationship = String(formData.get("relationship") || "");
  if (!["father", "mother", "guardian"].includes(relationship)) return { error: "Choose father, mother or guardian." };
  const fullName = field(formData, "full_name", 120);
  if (!fullName) return { error: "Enter the name." };
  const values = {
    family_id: familyId,
    relationship,
    title: field(formData, "title", 20),
    full_name: fullName,
    nationality: field(formData, "nationality", 80),
    occupation: field(formData, "occupation", 120),
    employer: field(formData, "employer", 120),
    phone: phoneField(formData, "phone"),
    phone_alt: phoneField(formData, "phone_alt"),
    work_phone: phoneField(formData, "work_phone"),
    email: emailField(formData, "email"),
    is_primary: boolField(formData, "is_primary"),
    notes: longField(formData, "notes", 1000),
  };
  for (const key of ["phone", "phone_alt", "work_phone"] as const) {
    if (values[key] && !phoneIsValid(values[key])) return { error: `Check the ${key === "phone" ? "phone" : key === "phone_alt" ? "other phone" : "work phone"} number.` };
  }
  if (values.email && !EMAIL.test(values.email)) return { error: "Check the email address." };

  if (values.is_primary) await supabase.from("guardians").update({ is_primary: false }).eq("family_id", familyId).neq("id", isUuid(id) ? id : "00000000-0000-0000-0000-000000000000");
  const result = isUuid(id)
    ? await supabase.from("guardians").update(values).eq("id", id)
    : await supabase.from("guardians").insert(values);
  if (result.error) {
    if (result.error.code === "23505") return { error: `This family already has a ${relationship}. Edit that record instead.` };
    return { error: result.error.message };
  }

  // Keep the family's contact list in step with the parents' main phone and email.
  const contacts = [
    values.phone ? { kind: "phone", value: values.phone, phone_type: "mobile" } : null,
    values.phone_alt ? { kind: "phone", value: values.phone_alt, phone_type: "mobile" } : null,
    values.work_phone ? { kind: "phone", value: values.work_phone, phone_type: "work" } : null,
    values.email ? { kind: "email", value: values.email, phone_type: null } : null,
  ].filter(Boolean) as { kind: string; value: string; phone_type: string | null }[];
  if (contacts.length) {
    const { data: existing } = await supabase.from("family_contacts").select("kind, value, position").eq("family_id", familyId);
    const have = new Set((existing || []).map((row) => `${row.kind}|${row.value}`));
    let position = Math.max(-1, ...(existing || []).map((row) => row.position as number)) + 1;
    const fresh = contacts
      .filter((contact) => !have.has(`${contact.kind}|${contact.value}`))
      .map((contact) => ({ ...contact, family_id: familyId, relationship, name: fullName, position: position++ }));
    if (fresh.length) await supabase.from("family_contacts").insert(fresh);
  }

  await logFamily(supabase, user.id, familyId, `${isUuid(id) ? "Updated" : "Added"} the ${relationship}'s details (${fullName})`);
  refreshOffice(familyPath(familyId));
  return { ok: `${cap(relationship)} saved.` };
}

export async function deleteGuardian(id: string, familyId: string): Promise<ActionResult> {
  const auth = await requireOffice();
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(id) || !isUuid(familyId)) return { error: "This record could not be found." };
  const { data: guardian } = await auth.supabase.from("guardians").select("full_name, relationship").eq("id", id).maybeSingle();
  const { error } = await auth.supabase.from("guardians").delete().eq("id", id).eq("family_id", familyId);
  if (error) return { error: error.message };
  if (guardian) await logFamily(auth.supabase, auth.user.id, familyId, `Removed the ${guardian.relationship} (${guardian.full_name}) from the family`);
  refreshOffice(familyPath(familyId));
  return { ok: "Removed." };
}

export async function saveContact(formData: FormData): Promise<ActionResult> {
  const auth = await requireOffice();
  if ("error" in auth) return { error: auth.error };
  const { supabase, user } = auth;
  const id = String(formData.get("id") || "");
  const familyId = String(formData.get("family_id") || "");
  if (!isUuid(familyId)) return { error: "This family could not be found." };
  const kind = String(formData.get("kind") || "phone") === "email" ? "email" : "phone";
  const raw = field(formData, "value", 160);
  if (!raw) return { error: kind === "phone" ? "Enter the phone number." : "Enter the email address." };
  const value = kind === "phone" ? normalizePhone(raw) : raw.toLowerCase();
  if (kind === "phone" && !phoneIsValid(value)) return { error: "Enter a full phone number, e.g. 0772 123 456 or +256 772 123 456." };
  if (kind === "email" && !EMAIL.test(value)) return { error: "Enter a valid email address." };
  const relationship = String(formData.get("relationship") || "other");
  const phoneType = String(formData.get("phone_type") || "");
  const values = {
    family_id: familyId,
    kind,
    value,
    relationship: (CONTACT_RELATIONSHIPS as readonly string[]).includes(relationship) ? relationship : "other",
    name: field(formData, "name", 120),
    phone_type: kind === "phone" && ["mobile", "work", "landline"].includes(phoneType) ? phoneType : null,
    label: field(formData, "label", 120),
    needs_check: false,
  };
  let result;
  if (isUuid(id)) {
    result = await supabase.from("family_contacts").update(values).eq("id", id).eq("family_id", familyId);
  } else {
    const { data: last } = await supabase.from("family_contacts").select("position").eq("family_id", familyId).order("position", { ascending: false }).limit(1);
    result = await supabase.from("family_contacts").insert({ ...values, position: ((last?.[0]?.position as number | undefined) ?? -1) + 1 });
  }
  if (result.error) {
    if (result.error.code === "23505") return { error: "This family already has that contact." };
    return { error: result.error.message };
  }
  await logFamily(supabase, user.id, familyId, `${isUuid(id) ? "Updated" : "Added"} a family contact: ${kind === "phone" ? displayPhone(value) : value}${values.name ? ` (${values.name})` : ""}`);
  refreshOffice(familyPath(familyId));
  return { ok: "Contact saved." };
}

export async function deleteContact(id: string, familyId: string): Promise<ActionResult> {
  const auth = await requireOffice();
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(id) || !isUuid(familyId)) return { error: "This contact could not be found." };
  const { data: contact } = await auth.supabase.from("family_contacts").select("kind, value").eq("id", id).maybeSingle();
  const { error } = await auth.supabase.from("family_contacts").delete().eq("id", id).eq("family_id", familyId);
  if (error) return { error: error.message };
  if (contact) await logFamily(auth.supabase, auth.user.id, familyId, `Removed a family contact: ${contact.kind === "phone" ? displayPhone(contact.value) : contact.value}`);
  refreshOffice(familyPath(familyId));
  return { ok: "Contact removed." };
}

/** Marks a contact the import flagged as checked. */
export async function resolveContact(id: string, familyId: string): Promise<ActionResult> {
  const auth = await requireOffice();
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(id) || !isUuid(familyId)) return { error: "This contact could not be found." };
  const { data: contact } = await auth.supabase.from("family_contacts").select("kind, value").eq("id", id).maybeSingle();
  const { error } = await auth.supabase.from("family_contacts").update({ needs_check: false }).eq("id", id).eq("family_id", familyId);
  if (error) return { error: error.message };
  if (contact) await logFamily(auth.supabase, auth.user.id, familyId, `Checked the family contact ${contact.kind === "phone" ? displayPhone(contact.value) : contact.value}`);
  refreshOffice(familyPath(familyId));
  return { ok: "Marked as checked." };
}

export async function moveContact(id: string, familyId: string, direction: "up" | "down"): Promise<ActionResult> {
  const auth = await requireOffice();
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(id) || !isUuid(familyId)) return { error: "This contact could not be found." };
  const { data } = await auth.supabase.from("family_contacts").select("id, position").eq("family_id", familyId).order("position").order("created_at");
  const list = (data || []) as { id: string; position: number }[];
  const index = list.findIndex((row) => row.id === id);
  const swap = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swap < 0 || swap >= list.length) return { ok: "Already there." };
  [list[index], list[swap]] = [list[swap], list[index]];
  await Promise.all(list.map((row, position) => auth.supabase.from("family_contacts").update({ position }).eq("id", row.id)));
  refreshOffice(familyPath(familyId));
  return { ok: "Order saved." };
}
