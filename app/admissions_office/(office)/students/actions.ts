"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { statusInfo } from "@/lib/applications";
import {
  EMAIL,
  boolField,
  dateField,
  emailField,
  field,
  logStudents,
  longField,
  phoneField,
  triField,
  type ActionResult,
} from "@/lib/office-forms";
import { refreshOffice, requireOffice } from "@/lib/office";
import { forgetPrefix } from "@/lib/remember";
import { STUDENT_PHOTO_BUCKET } from "@/lib/student-photos";
import {
  OFFICE,
  className,
  displayPhone,
  everyWord,
  isClassCode,
  isStudentStatus,
  isUuid,
  phoneIsValid,
  searchNeedle,
  searchWords,
  studentSearchFilter,
  studentStatusInfo,
  todayIso,
} from "@/lib/students";
import type { SidebarHit } from "@/lib/sidebar-search";

const MAX_BULK = 300;

/** Student fields shared by the new-student and edit forms. */
function studentFields(form: FormData) {
  const surname = field(form, "surname", 80);
  const given = field(form, "given_names", 120);
  const dob = dateField(form, "date_of_birth");
  const enrolled = dateField(form, "enrolled_on");
  const classCode = field(form, "class_code", 4);
  const sex = field(form, "sex", 1);
  const errors: string[] = [];
  if (!surname) errors.push("Enter the surname.");
  if (!given) errors.push("Enter the given names.");
  if (dob.error) errors.push("Enter a valid date of birth.");
  if (enrolled.error) errors.push("Enter a valid enrolment date.");
  if (classCode && !isClassCode(classCode)) errors.push("Choose a valid class.");
  if (sex && sex !== "M" && sex !== "F") errors.push("Choose the sex.");
  if (dob.value && dob.value > todayIso()) errors.push("The date of birth can't be in the future.");
  const values = {
    surname,
    given_names: given,
    full_name: [surname, given].filter(Boolean).join(" "),
    preferred_name: field(form, "preferred_name", 80),
    formal_name: field(form, "formal_name", 160),
    sex: sex as "M" | "F" | null,
    date_of_birth: dob.value,
    class_code: classCode,
    stream: field(form, "stream", 20)?.toUpperCase() ?? null,
    house: field(form, "house", 30),
    tutor_group: field(form, "tutor_group", 40),
    campus: field(form, "campus", 60),
    religion: field(form, "religion", 60),
    nationality: field(form, "nationality", 80),
    home_language: field(form, "home_language", 60),
    enrolled_on: enrolled.value,
    transferred_from: field(form, "transferred_from", 160),
    exam_index_number: field(form, "exam_index_number", 40),
    passport_or_id: field(form, "passport_or_id", 60),
    staff_child: boolField(form, "staff_child"),
    staff_category: boolField(form, "staff_child") ? field(form, "staff_category", 60) : null,
    medical_notes: longField(form, "medical_notes", 2000),
    panadol_allowed: triField(form, "panadol_allowed"),
  };
  return { values, errors };
}

const LABELS: Record<string, string> = {
  full_name: "name",
  preferred_name: "preferred name",
  formal_name: "formal name",
  sex: "sex",
  date_of_birth: "date of birth",
  class_code: "class",
  stream: "stream",
  house: "house",
  tutor_group: "tutor group",
  campus: "campus",
  religion: "religion",
  nationality: "nationality",
  home_language: "home language",
  enrolled_on: "enrolment date",
  transferred_from: "previous school",
  exam_index_number: "exam index number",
  passport_or_id: "passport or ID",
  staff_child: "staff child",
  staff_category: "staff category",
  medical_notes: "medical notes",
  panadol_allowed: "Panadol consent",
};

function describe(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "blank";
  if (key === "class_code") return className(String(value));
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value).length > 40 ? `${String(value).slice(0, 40)}…` : String(value);
}

async function uniqueFamilyCode(supabase: SupabaseClient, studentNumber: string) {
  const base = `F${studentNumber}`;
  const { data } = await supabase.from("families").select("family_code").like("family_code", `${base}%`);
  const taken = new Set((data || []).map((row) => row.family_code as string));
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 100; suffix += 1) if (!taken.has(`${base}-${suffix}`)) return `${base}-${suffix}`;
  return `${base}-${Date.now()}`;
}

type NewGuardian = { relationship: "father" | "mother" | "guardian"; full_name: string; phone: string | null; email: string | null; occupation: string | null };

function guardianFromForm(form: FormData, prefix: "father" | "mother" | "guardian"): NewGuardian | null {
  const name = field(form, `${prefix}_name`, 120);
  if (!name) return null;
  return {
    relationship: prefix,
    full_name: name,
    phone: phoneField(form, `${prefix}_phone`),
    email: emailField(form, `${prefix}_email`),
    occupation: field(form, `${prefix}_occupation`, 120),
  };
}

export async function createStudent(formData: FormData): Promise<ActionResult> {
  const auth = await requireOffice("students");
  if ("error" in auth) return { error: auth.error };
  const { supabase, user } = auth;
  const { values, errors } = studentFields(formData);
  if (!values.class_code) errors.push("Choose a class.");

  const familyMode = String(formData.get("family_mode") || "new");
  const familyId = String(formData.get("family_id") || "");
  const guardians = (["father", "mother", "guardian"] as const).map((key) => guardianFromForm(formData, key)).filter(Boolean) as NewGuardian[];
  if (familyMode === "existing" && !isUuid(familyId)) errors.push("Choose the family, or add a new one.");
  if (familyMode === "new") {
    if (!guardians.length) errors.push("Add at least one parent or guardian.");
    for (const guardian of guardians) {
      if (guardian.phone && !phoneIsValid(guardian.phone)) errors.push(`Check the ${guardian.relationship}'s phone number.`);
      if (guardian.email && !EMAIL.test(guardian.email)) errors.push(`Check the ${guardian.relationship}'s email address.`);
    }
    if (!guardians.some((guardian) => guardian.phone)) errors.push("Add a phone number for at least one parent or guardian.");
  }
  if (errors.length) return { error: errors.join(" ") };

  let studentNumber = field(formData, "student_number", 20);
  if (!studentNumber) {
    const { data, error } = await supabase.rpc("next_student_number");
    if (error) return { error: `Couldn't pick a student number: ${error.message}. Run supabase/0011_admissions_office.sql first.` };
    studentNumber = String(data);
  }
  const { data: clash } = await supabase.from("students").select("id, full_name").eq("student_number", studentNumber).maybeSingle();
  if (clash) return { error: `Student number ${studentNumber} already belongs to ${clash.full_name}. Leave it blank to use the next free number.` };

  const applicationId = String(formData.get("application_id") || "");
  const fromApplication = isUuid(applicationId) ? applicationId : null;

  let family = familyMode === "existing" ? familyId : "";
  if (familyMode === "new") {
    const code = await uniqueFamilyCode(supabase, studentNumber);
    const { data: created, error } = await supabase
      .from("families")
      .insert({
        family_code: code,
        mailing_name: field(formData, "mailing_name", 160) ?? guardians.map((guardian) => guardian.full_name).join(" & "),
        home_area: field(formData, "home_area", 120),
        home_address: field(formData, "home_address", 300),
        country: field(formData, "country", 60) ?? "Uganda",
      })
      .select("id")
      .single();
    if (error) return { error: `The family couldn't be saved: ${error.message}` };
    family = created.id;
    const { error: guardianError } = await supabase.from("guardians").insert(
      guardians.map((guardian, index) => ({ ...guardian, family_id: family, is_primary: index === 0 })),
    );
    if (guardianError) return { error: `The parents couldn't be saved: ${guardianError.message}` };
    const contacts = guardians.flatMap((guardian) => [
      guardian.phone ? { kind: "phone", value: guardian.phone, phone_type: "mobile" } : null,
      guardian.email ? { kind: "email", value: guardian.email, phone_type: null } : null,
    ].filter(Boolean).map((contact) => ({ ...contact!, relationship: guardian.relationship, name: guardian.full_name })));
    const seen = new Set<string>();
    const unique = contacts.filter((contact) => {
      const key = `${contact.kind}|${contact.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (unique.length) {
      await supabase.from("family_contacts").insert(unique.map((contact, position) => ({ ...contact, family_id: family, position })));
    }
  } else {
    const { data: exists } = await supabase.from("families").select("id").eq("id", family).maybeSingle();
    if (!exists) return { error: "That family no longer exists. Choose another." };
  }

  const { data: student, error } = await supabase
    .from("students")
    .insert({
      ...values,
      student_number: studentNumber,
      family_id: family,
      enrolled_on: values.enrolled_on ?? todayIso(),
      status: "active",
      admitted_from_application: fromApplication,
    })
    .select("id")
    .single();
  if (error) return { error: `The student couldn't be saved: ${error.message}` };

  const body = `Enrolled in ${className(values.class_code)}${values.stream ? ` ${values.stream}` : ""} as student ${studentNumber}`
    + (fromApplication ? " from an admission application" : "");
  await logStudents(supabase, user.id, [student.id], "enrol", body);

  let warning: string | undefined;
  if (fromApplication) {
    const { data: app } = await supabase.from("applications").select("status").eq("id", fromApplication).maybeSingle();
    const patch: Record<string, unknown> = { student_id: student.id };
    if (app && app.status !== "enrolled") patch.status = "enrolled";
    const { error: linkError } = await supabase.from("applications").update(patch).eq("id", fromApplication);
    if (linkError) warning = `The student was saved, but the application couldn't be linked: ${linkError.message}`;
    else {
      await supabase.from("application_activity").insert([
        ...(app && app.status !== "enrolled"
          ? [{ application_id: fromApplication, actor_id: user.id, kind: "status", body: `Moved from ${statusInfo(app.status).label} to Enrolled` }]
          : []),
        { application_id: fromApplication, actor_id: user.id, kind: "note", body: `Added to the student register as ${values.full_name} (${studentNumber})` },
      ]);
      forgetPrefix("admin-badges");
      revalidatePath("/admin", "layout");
    }
  }

  refreshOffice();
  return { ok: `${values.full_name} is enrolled as student ${studentNumber}.`, id: student.id, warning };
}

export async function updateStudent(formData: FormData): Promise<ActionResult> {
  const auth = await requireOffice("students");
  if ("error" in auth) return { error: auth.error };
  const { supabase, user } = auth;
  const id = String(formData.get("id") || "");
  if (!isUuid(id)) return { error: "This student could not be found." };
  const { values, errors } = studentFields(formData);
  const studentNumber = field(formData, "student_number", 20);
  if (!studentNumber) errors.push("Enter the student number.");
  if (errors.length) return { error: errors.join(" ") };

  const { data: current, error: loadError } = await supabase.from("students").select("*").eq("id", id).maybeSingle();
  if (loadError) return { error: loadError.message };
  if (!current) return { error: "This student no longer exists." };
  const expected = String(formData.get("updated_at") || "");
  if (expected && new Date(current.updated_at).getTime() !== new Date(expected).getTime()) {
    return { error: "Someone else changed this student while you were editing. Refresh the page to see the latest, then try again." };
  }
  if (studentNumber !== current.student_number) {
    const { data: clash } = await supabase.from("students").select("full_name").eq("student_number", studentNumber).neq("id", id).maybeSingle();
    if (clash) return { error: `Student number ${studentNumber} already belongs to ${clash.full_name}.` };
  }

  const next: Record<string, unknown> = { ...values, student_number: studentNumber };
  const patch: Record<string, unknown> = {};
  const changes: string[] = [];
  let classChanged = false;
  for (const [key, value] of Object.entries(next)) {
    const before = (current as Record<string, unknown>)[key];
    if ((before ?? null) === (value ?? null)) continue;
    patch[key] = value;
    if (key === "surname" || key === "given_names") continue;
    if (key === "class_code" || key === "stream") classChanged = true;
    if (key === "medical_notes") changes.push("Updated the medical notes");
    else if (key === "student_number") changes.push(`Changed the student number from ${before} to ${value}`);
    else changes.push(`Changed ${LABELS[key] ?? key} from ${describe(key, before)} to ${describe(key, value)}`);
  }
  if (!Object.keys(patch).length) return { ok: "No changes to save." };

  const { error } = await supabase.from("students").update(patch).eq("id", id);
  if (error) return { error: error.message };
  await logStudents(supabase, user.id, [id], classChanged ? "class" : "edit", changes.join(". "));
  refreshOffice(`${OFFICE}/students/${id}`);
  return { ok: "Saved." };
}

export type StatusChange = { id: string; status: string; date?: string; reason?: string; classCode?: string };

export async function changeStudentStatus(input: StatusChange): Promise<ActionResult> {
  const auth = await requireOffice("students");
  if ("error" in auth) return { error: auth.error };
  const { supabase, user } = auth;
  if (!isUuid(input.id)) return { error: "This student could not be found." };
  if (!isStudentStatus(input.status)) return { error: "Choose a valid status." };
  const date = input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : todayIso();
  const reason = String(input.reason ?? "").trim().slice(0, 300) || null;

  const { data: current } = await supabase.from("students").select("status, full_name, class_code").eq("id", input.id).maybeSingle();
  if (!current) return { error: "This student no longer exists." };

  const patch: Record<string, unknown> = { status: input.status };
  let body: string;
  if (input.status === "active") {
    if (input.classCode && !isClassCode(input.classCode)) return { error: "Choose a valid class." };
    Object.assign(patch, { left_on: null, left_reason: null, transferred_to: null });
    if (input.classCode) patch.class_code = input.classCode;
    body = `Re-admitted${input.classCode ? ` into ${className(input.classCode)}` : ""}${reason ? `: ${reason}` : ""}`;
  } else {
    if (input.status === "transferred" && !reason) return { error: "Enter the school the student is moving to." };
    Object.assign(patch, { left_on: date, left_reason: reason });
    if (input.status === "transferred") patch.transferred_to = reason;
    body = `${studentStatusInfo(input.status).label} on ${date}${reason ? `: ${reason}` : ""}`;
  }
  const { error } = await supabase.from("students").update(patch).eq("id", input.id);
  if (error) return { error: error.message };
  await logStudents(supabase, user.id, [input.id], "status", body);
  refreshOffice(`${OFFICE}/students/${input.id}`);
  return { ok: input.status === "active" ? `${current.full_name} is active again.` : `${current.full_name} is now marked ${studentStatusInfo(input.status).label.toLowerCase()}.` };
}

export type BulkChange = { class_code?: string; stream?: string; house?: string; campus?: string; status?: string };

export async function bulkUpdateStudents(list: string[], change: BulkChange): Promise<ActionResult> {
  const auth = await requireOffice("students");
  if ("error" in auth) return { error: auth.error };
  const { supabase, user } = auth;
  const targets = [...new Set(list.filter(isUuid))].slice(0, MAX_BULK);
  if (!targets.length) return { error: "Select at least one student." };

  const patch: Record<string, unknown> = {};
  let body = "";
  let kind = "edit";
  if (change.class_code !== undefined) {
    if (!isClassCode(change.class_code)) return { error: "Choose a valid class." };
    patch.class_code = change.class_code;
    kind = "class";
    body = `Moved to ${className(change.class_code)}`;
  } else if (change.stream !== undefined) {
    const stream = change.stream.trim().toUpperCase().slice(0, 20);
    patch.stream = stream || null;
    kind = "class";
    body = stream ? `Moved to stream ${stream}` : "Removed from their stream";
  } else if (change.house !== undefined) {
    const house = change.house.trim().slice(0, 30);
    patch.house = house || null;
    body = house ? `Placed in ${house} house` : "Removed from their house";
  } else if (change.campus !== undefined) {
    const campus = change.campus.trim().slice(0, 60);
    patch.campus = campus || null;
    body = campus ? `Campus set to ${campus}` : "Campus cleared";
  } else if (change.status !== undefined) {
    if (!isStudentStatus(change.status)) return { error: "Choose a valid status." };
    patch.status = change.status;
    kind = "status";
    if (change.status === "active") Object.assign(patch, { left_on: null, left_reason: null });
    else patch.left_on = todayIso();
    body = `Marked ${studentStatusInfo(change.status).label.toLowerCase()} in a bulk update`;
  } else {
    return { error: "Nothing to change." };
  }

  const { error } = await supabase.from("students").update(patch).in("id", targets);
  if (error) return { error: error.message };
  await logStudents(supabase, user.id, targets, kind, body);
  refreshOffice();
  return { ok: `Updated ${targets.length} student${targets.length === 1 ? "" : "s"}.` };
}

export async function setStudentFamily(id: string, familyId: string): Promise<ActionResult> {
  const auth = await requireOffice("students");
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(id) || !isUuid(familyId)) return { error: "Choose a family." };
  const { data: family } = await auth.supabase.from("families").select("family_code, mailing_name").eq("id", familyId).maybeSingle();
  if (!family) return { error: "That family no longer exists." };
  const { error } = await auth.supabase.from("students").update({ family_id: familyId }).eq("id", id);
  if (error) return { error: error.message };
  await logStudents(auth.supabase, auth.user.id, [id], "edit", `Linked to family ${family.family_code}${family.mailing_name ? ` (${family.mailing_name})` : ""}`);
  refreshOffice(`${OFFICE}/students/${id}`);
  return { ok: "Family linked." };
}

export async function addStudentNote(formData: FormData): Promise<ActionResult> {
  const auth = await requireOffice("students");
  if ("error" in auth) return { error: auth.error };
  const id = String(formData.get("id") || "");
  const body = longField(formData, "body", 4000);
  if (!isUuid(id)) return { error: "This student could not be found." };
  if (!body) return { error: "Write a note first." };
  const { error } = await auth.supabase.from("student_activity").insert({ student_id: id, actor_id: auth.user.id, kind: "note", body });
  if (error) return { error: error.message };
  refreshOffice(`${OFFICE}/students/${id}`);
  return { ok: "Note added." };
}

export async function deleteStudentNote(noteId: string, studentId: string): Promise<ActionResult> {
  const auth = await requireOffice("students");
  if ("error" in auth) return { error: auth.error };
  const { error } = await auth.supabase.from("student_activity").delete().eq("id", noteId).eq("actor_id", auth.user.id).eq("kind", "note");
  if (error) return { error: error.message };
  refreshOffice(`${OFFICE}/students/${studentId}`);
  return { ok: "Note deleted." };
}

const PHOTO_TYPES: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };

/** Replaces a student's photo. The browser shrinks it to a small square before sending. */
export async function setStudentPhoto(formData: FormData): Promise<ActionResult> {
  const auth = await requireOffice("students");
  if ("error" in auth) return { error: auth.error };
  const id = String(formData.get("id") || "");
  const photo = formData.get("photo");
  if (!isUuid(id)) return { error: "This student could not be found." };
  if (!(photo instanceof File) || !photo.size) return { error: "Choose a photo first." };
  const extension = PHOTO_TYPES[photo.type];
  if (!extension) return { error: "Use a JPG, PNG or WebP photo." };
  if (photo.size > 1024 * 1024) return { error: "That photo is too large. Try a smaller one." };

  const { data: current, error: readError } = await auth.supabase.from("students").select("photo_path").eq("id", id).maybeSingle();
  if (readError) {
    return { error: /photo_path/.test(readError.message) ? "Run supabase/0013_student_photos.sql in Supabase to turn on photos." : readError.message };
  }
  if (!current) return { error: "This student no longer exists." };

  const path = `${id}/${Date.now()}.${extension}`;
  const bucket = auth.supabase.storage.from(STUDENT_PHOTO_BUCKET);
  const { error: uploadError } = await bucket.upload(path, photo, { contentType: photo.type, upsert: false });
  if (uploadError) {
    return { error: /bucket not found/i.test(uploadError.message) ? "Run supabase/0013_student_photos.sql in Supabase to turn on photos." : uploadError.message };
  }
  const { error } = await auth.supabase.from("students").update({ photo_path: path }).eq("id", id);
  if (error) {
    await bucket.remove([path]);
    return { error: error.message };
  }
  if (current.photo_path) await bucket.remove([current.photo_path as string]);
  await logStudents(auth.supabase, auth.user.id, [id], "edit", current.photo_path ? "Changed the photo" : "Added a photo");
  refreshOffice(`${OFFICE}/students`, `${OFFICE}/students/${id}`);
  return { ok: "Photo saved." };
}

/** Clears the import warnings on a student once someone has checked the record. */
export async function resolveStudentReview(id: string): Promise<ActionResult> {
  const auth = await requireOffice("students", "data-quality");
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(id)) return { error: "This student could not be found." };
  const { data: current } = await auth.supabase.from("students").select("import_notes").eq("id", id).maybeSingle();
  if (!current) return { error: "This student no longer exists." };
  const notes = (current.import_notes as string[] | null) ?? [];
  const { error } = await auth.supabase.from("students").update({ import_notes: [] }).eq("id", id);
  if (error) return { error: error.message };
  await logStudents(auth.supabase, auth.user.id, [id], "review", `Checked the record and cleared ${notes.length === 1 ? "an import warning" : `${notes.length} import warnings`}${notes.length ? `: ${notes.join("; ")}` : ""}`);
  refreshOffice(`${OFFICE}/students/${id}`);
  return { ok: "Marked as checked." };
}

export async function dismissDuplicate(a: string, b: string): Promise<ActionResult> {
  const auth = await requireOffice("students", "data-quality");
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(a) || !isUuid(b) || a === b) return { error: "Choose two different students." };
  const [first, second] = a < b ? [a, b] : [b, a];
  const { error } = await auth.supabase
    .from("student_duplicate_dismissals")
    .upsert({ student_a: first, student_b: second, dismissed_by: auth.user.id }, { onConflict: "student_a,student_b" });
  if (error) return { error: error.message };
  await logStudents(auth.supabase, auth.user.id, [first, second], "review", "Confirmed this isn't a duplicate record");
  refreshOffice();
  return { ok: "Marked as different children." };
}

export type FamilyMatch = {
  id: string;
  code: string;
  name: string;
  area: string | null;
  parents: string[];
  phones: string[];
  children: string[];
};

/** Finds families by family code, parent name, phone, email or a child's name. Used by the family picker. */
export async function searchFamilies(raw: string): Promise<{ error?: string; items: FamilyMatch[] }> {
  const auth = await requireOffice("students", "families");
  if ("error" in auth) return { error: auth.error, items: [] };
  const { supabase } = auth;
  const needle = searchNeedle(String(raw || "")).slice(0, 60);
  if (needle.length < 2) return { items: [] };
  const like = `%${needle}%`;
  const digits = needle.replace(/\D/g, "");
  const phoneLike = digits.length >= 6 ? `%${digits.slice(-9)}%` : null;

  const [families, guardians, contacts, students] = await Promise.all([
    supabase.from("families").select("id").or(`family_code.ilike.${like},mailing_name.ilike.${like}`).limit(20),
    supabase.from("guardians").select("family_id").or([`full_name.ilike.${like}`, `email.ilike.${like}`, ...(phoneLike ? [`phone.ilike.${phoneLike}`] : [])].join(",")).limit(20),
    phoneLike ? supabase.from("family_contacts").select("family_id").ilike("value", phoneLike).limit(20) : Promise.resolve({ data: [] }),
    supabase.from("students").select("family_id").ilike("full_name", like).not("family_id", "is", null).limit(20),
  ]);
  const ids = [...new Set([
    ...(families.data || []).map((row) => row.id as string),
    ...(guardians.data || []).map((row) => row.family_id as string),
    ...((contacts.data || []) as { family_id: string }[]).map((row) => row.family_id),
    ...(students.data || []).map((row) => row.family_id as string),
  ])].filter(Boolean).slice(0, 12);
  if (!ids.length) return { items: [] };

  const [{ data: rows }, { data: parentRows }, { data: kids }] = await Promise.all([
    supabase.from("families").select("id, family_code, mailing_name, home_area").in("id", ids),
    supabase.from("guardians").select("family_id, full_name, phone").in("family_id", ids),
    supabase.from("students").select("family_id, full_name, class_code, status").in("family_id", ids).order("date_of_birth"),
  ]);
  const items = (rows || []).map((family) => {
    const parents = (parentRows || []).filter((row) => row.family_id === family.id);
    return {
      id: family.id as string,
      code: family.family_code as string,
      name: (family.mailing_name as string | null) || parents.map((row) => row.full_name).join(" & ") || family.family_code,
      area: family.home_area as string | null,
      parents: parents.map((row) => row.full_name as string),
      phones: parents.map((row) => displayPhone(row.phone as string | null)).filter(Boolean),
      children: (kids || [])
        .filter((row) => row.family_id === family.id)
        .map((row) => `${row.full_name}${row.status === "active" && row.class_code ? ` (${row.class_code})` : row.status !== "active" ? ` (${row.status})` : ""}`),
    };
  });
  items.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  return { items };
}

type OfficeRow = {
  id: string;
  full_name: string;
  student_number: string;
  class_code: string | null;
  stream: string | null;
  status: string;
};

function officeHit(row: OfficeRow): SidebarHit {
  const status = row.status === "active" ? "" : ` · ${studentStatusInfo(row.status).label}`;
  return {
    id: row.id,
    href: `${OFFICE}/students/${row.id}`,
    title: row.full_name,
    meta: `${row.student_number} · ${className(row.class_code)}${row.stream ? ` ${row.stream}` : ""}${status}`,
    icon: "fa-user",
  };
}

/** Live sidebar matches: name in any word order, student number, family code, or a parent phone. */
export async function searchOffice(raw: string): Promise<{ error?: string; hits: SidebarHit[] }> {
  const auth = await requireOffice();
  if ("error" in auth) return { error: auth.error, hits: [] };
  const needle = searchNeedle(raw).slice(0, 60);
  const words = searchWords(raw);
  if (needle.length < 2 || !words.length) return { hits: [] };
  const filter = studentSearchFilter(needle);
  const columns = "id, full_name, student_number, class_code, stream, status";
  const ranked = (rows: OfficeRow[]) =>
    [...rows].sort((a, b) => Number(a.status !== "active") - Number(b.status !== "active") || a.full_name.localeCompare(b.full_name)).slice(0, 8).map(officeHit);

  if (filter) {
    const { data, error } = await auth.supabase.from("student_directory").select(columns).or(filter).limit(8);
    if (!error) return { hits: ranked((data || []) as OfficeRow[]) };
  }

  const like = `%${needle}%`;
  const { data, error } = await auth.supabase
    .from("students")
    .select(columns)
    .or([everyWord(words, ["full_name"]), `student_number.ilike.${like}`].join(","))
    .limit(8);
  if (error) return { error: error.message, hits: [] };
  return { hits: ranked((data || []) as OfficeRow[]) };
}

export type IssueLoginResult = ActionResult & { email?: string; password?: string };

/** Create a student portal login and link it to the pupil record. */
export async function issueStudentLogin(studentId: string, formData: FormData): Promise<IssueLoginResult> {
  const auth = await requireOffice("students");
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(studentId)) return { error: "Invalid student." };

  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!EMAIL.test(email)) return { error: "Enter a valid email address." };

  const { data: student, error: studentError } = await auth.supabase
    .from("students")
    .select("id, full_name, preferred_name, profile_id, status")
    .eq("id", studentId)
    .maybeSingle();
  if (studentError) return { error: studentError.message };
  if (!student) return { error: "Student not found." };
  if (student.profile_id) return { error: "This student already has a portal login." };

  const { linkStudentPortalLogin } = await import("@/lib/student-portal-login");
  const display = (student.preferred_name || student.full_name || "Student").trim();
  const result = await linkStudentPortalLogin({ studentId, email, displayName: display });
  if (result.error) return { error: result.error };

  await logStudents(auth.supabase, auth.user.id, [studentId], "note", `Issued student portal login for ${result.email}.`);
  refreshOffice(`${OFFICE}/students/${studentId}`);
  return {
    ok: result.ok,
    email: result.email,
    password: result.password,
  };
}

/** Unlink and disable a student portal login. */
export async function revokeStudentLogin(studentId: string): Promise<ActionResult> {
  const auth = await requireOffice("students");
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(studentId)) return { error: "Invalid student." };

  const { data: student, error: studentError } = await auth.supabase
    .from("students")
    .select("id, full_name, profile_id")
    .eq("id", studentId)
    .maybeSingle();
  if (studentError) return { error: studentError.message };
  if (!student?.profile_id) return { error: "This student has no portal login." };

  const { unlinkStudentPortalLogin } = await import("@/lib/student-portal-login");
  const result = await unlinkStudentPortalLogin(student.profile_id, studentId);
  if (result.error) return { error: result.error };

  await logStudents(auth.supabase, auth.user.id, [studentId], "note", "Revoked student portal login.");
  refreshOffice(`${OFFICE}/students/${studentId}`);
  return { ok: result.ok };
}