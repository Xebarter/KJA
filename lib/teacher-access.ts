import { cache } from "react";
import { classLabel, loadCurrentTerm, streamOf, type TermRow } from "@/lib/academics";
import { operationalCampus } from "@/lib/campuses";
import { isDesktopProcess } from "@/lib/desktop";
import { forget, remember } from "@/lib/remember";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import type { TeacherAccess, TeacherClassPost, TeacherSubjectPost } from "@/lib/teacher";

type SubjectEmbed = { name?: string } | { name?: string }[] | null;

/** Soft-nav TTL - sidebar hops reuse staff/assignments without re-hitting service role every time. */
const SESSION_MS = 60_000;

type TeacherSession = {
  staffId: string;
  profile: { id: string; role: string; full_name: string | null; email: string | null };
  classes: TeacherClassPost[];
  subjects: TeacherSubjectPost[];
  term: TermRow | null;
  termError: string | null;
};

function embedName(value: SubjectEmbed) {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.name || "Subject";
}

async function loadTeacherSession(userId: string, authEmail: string | null, metaName: string | null, metaStaffId: string | null): Promise<TeacherSession | { error: string }> {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase is not connected yet." };
  const service = serviceClient();

  let staffId: string | null = null;
  let profile = {
    id: userId,
    role: "",
    full_name: metaName,
    email: authEmail,
  };

  if (service) {
    const [{ data: staff }, { data: profileRow }] = await Promise.all([
      service.from("teaching_staff").select("id, full_name, email, active, profile_id").eq("profile_id", userId).eq("active", true).maybeSingle(),
      service.from("profiles").select("id, role, full_name, email").eq("id", userId).maybeSingle(),
    ]);

    let row = staff;
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
      const email = String(row.email || profileRow?.email || authEmail || "").trim().toLowerCase() || null;
      const name = String(row.full_name || profileRow?.full_name || profile.full_name || "Teacher").trim() || "Teacher";
      const needsProfile = !profileRow || profileRow.role !== "staff" || profileRow.full_name !== name || (profileRow.email || null) !== email;
      const needsLink = row.profile_id !== userId;
      // Only write when something is actually wrong - upserts on every nav made Desktop soft-nav crawl.
      if (needsProfile) {
        await service.from("profiles").upsert({
          id: userId,
          role: "staff",
          email,
          full_name: name,
        });
        forget(`academics-session:${userId}`);
      }
      if (needsLink) {
        await service.from("teaching_staff").update({ profile_id: userId, ...(email ? { email } : {}) }).eq("id", row.id);
      }
      profile = { id: userId, role: "staff", full_name: name, email };
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
        email: (profileRow.email as string | null) ?? authEmail,
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

  const termPack = await loadCurrentTerm(supabase);
  const term = termPack.term;
  let classes: TeacherClassPost[] = [];
  let subjects: TeacherSubjectPost[] = [];

  const db = service ?? supabase;
  if (term) {
    const [leadQuery, postQuery] = await Promise.all([
      db.from("class_teachers").select("class_code, stream, campus").eq("term_id", term.id).eq("staff_id", staffId),
      db.from("subject_teachers").select("class_code, stream, campus, subject_id, subjects(name)").eq("term_id", term.id).eq("staff_id", staffId),
    ]);
    classes = (leadQuery.data || [])
      .map((row) => {
        const campus = operationalCampus(row.campus as string | null);
        return {
          classCode: String(row.class_code),
          stream: streamOf(row.stream as string | null),
          campus,
          label: classLabel(String(row.class_code), row.stream as string | null, campus),
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
    subjects = (postQuery.data || [])
      .map((row) => {
        const campus = operationalCampus(row.campus as string | null);
        return {
          classCode: String(row.class_code),
          stream: streamOf(row.stream as string | null),
          campus,
          subjectId: String(row.subject_id),
          subjectName: embedName(row.subjects as SubjectEmbed),
          label: classLabel(String(row.class_code), row.stream as string | null, campus),
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label) || a.subjectName.localeCompare(b.subjectName));
  }

  return {
    staffId,
    profile,
    classes,
    subjects,
    term,
    termError: termPack.error,
  };
}

/**
 * Teacher desk access - independent of the academics office gate.
 * Uses the service role to resolve/repair teaching_staff.profile_id + profiles.role=staff
 * so Desktop proxy/RLS cannot leave a valid teacher locked out.
 *
 * Session payload is remembered briefly so Desktop sidebar soft-navs stay instant.
 */
export const requireTeacher = cache(async function requireTeacher(): Promise<TeacherAccess | { error: string }> {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase is not connected yet." };

  // Desktop: getSession is local (JWT/cookie) - same pattern as requireOffice. Website
  // still uses getUser. Soft-nav must not wait on an auth network round-trip.
  const authUser = isDesktopProcess()
    ? (await supabase.auth.getSession()).data.session?.user ?? null
    : (await supabase.auth.getUser()).data.user;
  if (!authUser?.id) return { error: "Your session has expired. Sign in again." };

  const userId = authUser.id;
  const mustResetPassword = Boolean(authUser.user_metadata?.must_reset_password);
  const metaStaffId = authUser.user_metadata?.teaching_staff_id
    ? String(authUser.user_metadata.teaching_staff_id)
    : null;

  let session: TeacherSession;
  try {
    const loaded = await remember(`teacher-session:${userId}`, SESSION_MS, async () => {
      const result = await loadTeacherSession(
        userId,
        authUser.email ?? null,
        (authUser.user_metadata?.full_name as string | null) ?? null,
        metaStaffId,
      );
      if ("error" in result) throw new Error(result.error);
      return result;
    });
    session = loaded;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "This account is not linked to a teacher on Academics → Staff. Ask the office to issue a desk sign-in." };
  }

  return {
    supabase,
    user: { id: userId, email: session.profile.email || authUser.email || "" },
    profile: session.profile,
    staffId: session.staffId,
    mustResetPassword,
    term: session.term,
    termError: session.termError,
    classes: session.classes,
    subjects: session.subjects,
  };
});
