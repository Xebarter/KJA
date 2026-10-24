import { cache } from "react";
import { classLabel, loadCurrentTerm, streamOf } from "@/lib/academics";
import { forget } from "@/lib/remember";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import type { TeacherAccess, TeacherClassPost, TeacherSubjectPost } from "@/lib/teacher";

type SubjectEmbed = { name?: string } | { name?: string }[] | null;

function embedName(value: SubjectEmbed) {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.name || "Subject";
}

/**
 * Teacher desk access — independent of the academics office gate.
 * Uses the service role to resolve/repair teaching_staff.profile_id + profiles.role=staff
 * so Desktop proxy/RLS cannot leave a valid teacher locked out.
 */
export const requireTeacher = cache(async function requireTeacher(): Promise<TeacherAccess | { error: string }> {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase is not connected yet." };

  const { data: userData } = await supabase.auth.getUser();
  const authUser = userData.user;
  if (!authUser?.id) return { error: "Your session has expired. Sign in again." };

  const userId = authUser.id;
  const service = serviceClient();

  let staffId: string | null = null;
  let profile = {
    id: userId,
    role: "",
    full_name: (authUser.user_metadata?.full_name as string | null) ?? null,
    email: authUser.email ?? null,
  };

  if (service) {
    const [{ data: staff }, { data: profileRow }] = await Promise.all([
      service.from("teaching_staff").select("id, full_name, email, active, profile_id").eq("profile_id", userId).eq("active", true).maybeSingle(),
      service.from("profiles").select("id, role, full_name, email").eq("id", userId).maybeSingle(),
    ]);

    let row = staff;
    const metaStaffId = authUser.user_metadata?.teaching_staff_id
      ? String(authUser.user_metadata.teaching_staff_id)
      : null;
    if (!row?.id && metaStaffId) {
      const { data: byMeta } = await service
        .from("teaching_staff")
        .select("id, full_name, email, active, profile_id")
        .eq("id", metaStaffId)
        .eq("active", true)
        .maybeSingle();
      row = byMeta;
    }

    if (row?.id) {
      staffId = String(row.id);
      const email = String(row.email || profileRow?.email || authUser.email || "").trim().toLowerCase() || null;
      const name = String(row.full_name || profileRow?.full_name || profile.full_name || "Teacher").trim() || "Teacher";
      await service.from("profiles").upsert({
        id: userId,
        role: "staff",
        email,
        full_name: name,
      });
      if (row.profile_id !== userId) {
        await service.from("teaching_staff").update({ profile_id: userId, ...(email ? { email } : {}) }).eq("id", row.id);
      }
      profile = { id: userId, role: "staff", full_name: name, email };
      forget(`academics-session:${userId}`);
    } else if (profileRow) {
      profile = {
        id: userId,
        role: String(profileRow.role ?? ""),
        full_name: (profileRow.full_name as string | null) ?? profile.full_name,
        email: (profileRow.email as string | null) ?? profile.email,
      };
    }
  } else {
    const { data: profileRow } = await supabase.from("profiles").select("id, role, full_name, email").eq("id", userId).maybeSingle();
    if (profileRow) {
      profile = {
        id: userId,
        role: String(profileRow.role ?? ""),
        full_name: (profileRow.full_name as string | null) ?? null,
        email: (profileRow.email as string | null) ?? authUser.email ?? null,
      };
    }
    if (profile.role === "staff") {
      const { data: teacher } = await supabase
        .from("teaching_staff")
        .select("id")
        .eq("profile_id", userId)
        .eq("active", true)
        .maybeSingle();
      if (teacher?.id) staffId = String(teacher.id);
    }
  }

  if (!staffId) {
    return { error: "This account is not linked to a teacher on Academics → Staff. Ask the office to issue a desk sign-in." };
  }

  const mustResetPassword = Boolean(authUser.user_metadata?.must_reset_password);
  const termPack = await loadCurrentTerm(supabase);
  const term = termPack.term;
  let classes: TeacherClassPost[] = [];
  let subjects: TeacherSubjectPost[] = [];

  // Prefer service client for assignment reads when RLS is strict; fall back to user client.
  const db = service ?? supabase;
  if (term) {
    const [leadQuery, postQuery] = await Promise.all([
      db.from("class_teachers").select("class_code, stream").eq("term_id", term.id).eq("staff_id", staffId),
      db.from("subject_teachers").select("class_code, stream, subject_id, subjects(name)").eq("term_id", term.id).eq("staff_id", staffId),
    ]);
    classes = (leadQuery.data || [])
      .map((row) => ({
        classCode: String(row.class_code),
        stream: streamOf(row.stream as string | null),
        label: classLabel(String(row.class_code), row.stream as string | null),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    subjects = (postQuery.data || [])
      .map((row) => ({
        classCode: String(row.class_code),
        stream: streamOf(row.stream as string | null),
        subjectId: String(row.subject_id),
        subjectName: embedName(row.subjects as SubjectEmbed),
        label: classLabel(String(row.class_code), row.stream as string | null),
      }))
      .sort((a, b) => a.label.localeCompare(b.label) || a.subjectName.localeCompare(b.subjectName));
  }

  return {
    supabase,
    user: { id: userId, email: profile.email || authUser.email || "" },
    profile,
    staffId,
    mustResetPassword,
    term,
    termError: termPack.error,
    classes,
    subjects,
  };
});
