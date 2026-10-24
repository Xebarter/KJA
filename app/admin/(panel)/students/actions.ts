"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-applications";
import { EMAIL, dateField, field } from "@/lib/office-forms";
import { className, isClassCode, isUuid, todayIso } from "@/lib/students";
import { linkStudentPortalLogin, unlinkStudentPortalLogin, type PortalLoginResult } from "@/lib/student-portal-login";

const ADMIN_STUDENTS = "/admin/students";

type ActionResult = { error?: string; ok?: string; studentId?: string };

function refresh() {
  revalidatePath(ADMIN_STUDENTS);
}

async function uniqueFamilyCode(supabase: SupabaseClient, studentNumber: string) {
  const base = `F${studentNumber}`;
  const { data } = await supabase.from("families").select("family_code").like("family_code", `${base}%`);
  const taken = new Set((data || []).map((row) => row.family_code as string));
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 100; suffix += 1) if (!taken.has(`${base}-${suffix}`)) return `${base}-${suffix}`;
  return `${base}-${Date.now()}`;
}

/** Slim pupil create for portal access (placeholder family + optional login). */
export async function createStudentForPortal(formData: FormData): Promise<ActionResult & PortalLoginResult> {
  const auth = await requireAdmin("students");
  if ("error" in auth) return { error: auth.error };

  const surname = field(formData, "surname", 80);
  const given = field(formData, "given_names", 120);
  const classCode = field(formData, "class_code", 4);
  const stream = field(formData, "stream", 20)?.toUpperCase() ?? null;
  const sex = field(formData, "sex", 1);
  const dob = dateField(formData, "date_of_birth");
  const emailRaw = String(formData.get("email") || "").trim().toLowerCase();
  const issueLogin = Boolean(emailRaw);

  const errors: string[] = [];
  if (!surname) errors.push("Enter the surname.");
  if (!given) errors.push("Enter the given names.");
  if (!classCode || !isClassCode(classCode)) errors.push("Choose a valid class.");
  if (dob.error) errors.push("Enter a valid date of birth.");
  if (dob.value && dob.value > todayIso()) errors.push("The date of birth can't be in the future.");
  if (sex && sex !== "M" && sex !== "F") errors.push("Choose the sex.");
  if (issueLogin && !EMAIL.test(emailRaw)) errors.push("Enter a valid login email.");
  if (errors.length) return { error: errors.join(" ") };

  const { data: numberData, error: numberError } = await auth.supabase.rpc("next_student_number");
  if (numberError) return { error: `Couldn't pick a student number: ${numberError.message}.` };
  const studentNumber = String(numberData);

  const familyCode = await uniqueFamilyCode(auth.supabase, studentNumber);
  const fullName = [surname, given].filter(Boolean).join(" ");
  const { data: family, error: familyError } = await auth.supabase
    .from("families")
    .insert({
      family_code: familyCode,
      mailing_name: fullName,
      country: "Uganda",
    })
    .select("id")
    .single();
  if (familyError || !family) return { error: familyError?.message || "Could not create the family record." };

  await auth.supabase.from("guardians").insert({
    family_id: family.id,
    relationship: "guardian",
    full_name: `${fullName} (portal)`,
    email: issueLogin ? emailRaw : null,
    is_primary: true,
  });

  const { data: student, error: studentError } = await auth.supabase
    .from("students")
    .insert({
      surname,
      given_names: given,
      full_name: fullName,
      sex: sex === "M" || sex === "F" ? sex : null,
      date_of_birth: dob.value,
      class_code: classCode,
      stream,
      student_number: studentNumber,
      family_id: family.id,
      enrolled_on: todayIso(),
      status: "active",
    })
    .select("id, full_name, preferred_name")
    .single();
  if (studentError || !student) {
    await auth.supabase.from("families").delete().eq("id", family.id);
    return { error: studentError?.message || "Could not create the student." };
  }

  if (!issueLogin) {
    refresh();
    return {
      ok: `${fullName} added in ${className(classCode)}. Issue a portal login when ready.`,
      studentId: student.id,
    };
  }

  const login = await linkStudentPortalLogin({
    studentId: student.id,
    email: emailRaw,
    displayName: (student.preferred_name || student.full_name || fullName).trim(),
  });
  refresh();
  if (login.error) {
    return {
      error: `${fullName} was created, but the login failed: ${login.error}`,
      studentId: student.id,
    };
  }
  return {
    ok: login.ok,
    studentId: student.id,
    email: login.email,
    password: login.password,
  };
}

export async function issueAdminStudentLogin(studentId: string, formData: FormData): Promise<PortalLoginResult> {
  const auth = await requireAdmin("students");
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(studentId)) return { error: "Invalid student." };

  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!EMAIL.test(email)) return { error: "Enter a valid email address." };

  const { data: student, error: studentError } = await auth.supabase
    .from("students")
    .select("id, full_name, preferred_name, profile_id")
    .eq("id", studentId)
    .maybeSingle();
  if (studentError) return { error: studentError.message };
  if (!student) return { error: "Student not found." };
  if (student.profile_id) return { error: "This student already has a portal login." };

  const result = await linkStudentPortalLogin({
    studentId,
    email,
    displayName: (student.preferred_name || student.full_name || "Student").trim(),
  });
  refresh();
  return result;
}

export async function revokeAdminStudentLogin(studentId: string): Promise<ActionResult> {
  const auth = await requireAdmin("students");
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(studentId)) return { error: "Invalid student." };

  const { data: student, error: studentError } = await auth.supabase
    .from("students")
    .select("id, profile_id")
    .eq("id", studentId)
    .maybeSingle();
  if (studentError) return { error: studentError.message };
  if (!student?.profile_id) return { error: "This student has no portal login." };

  const result = await unlinkStudentPortalLogin(student.profile_id, studentId);
  refresh();
  return result;
}
