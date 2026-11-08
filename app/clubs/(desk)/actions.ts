"use server";

import { revalidatePath } from "next/cache";
import { classLabel } from "@/lib/academics";
import { persistActiveClubCampus, refreshClubs, requireClubs } from "@/lib/clubs-access";
import { CLUB_CATEGORIES, clubFits, isClubSection } from "@/lib/clubs";
import { CLUBS_BASE, isClubAttendanceStatus } from "@/lib/clubs-nav";
import { ACADEMICS_BASE } from "@/lib/academics-nav";
import { kampalaToday, parseAmount } from "@/lib/accounts-format";
import { CLUB_CAMPUSES, isClubCampus } from "@/lib/campuses";
import { studentInFundsScope } from "@/lib/club-funds-scope";
import { field, type ActionResult } from "@/lib/office-forms";
import { everyWord, isUuid, normalizePhone, phoneIsValid, searchNeedle, searchWords } from "@/lib/students";
import { logClubs } from "@/lib/system-logs";

export async function setActiveClubCampus(campus: string): Promise<ActionResult> {
  if (!isClubCampus(campus)) return { error: "Unknown campus." };
  const auth = await requireClubs();
  if ("error" in auth) return { error: auth.error };
  if (!auth.clubCampuses.includes(campus)) return { error: "You cannot open that campus." };
  await persistActiveClubCampus(campus);
  refreshClubs();
  return { ok: "Campus switched." };
}

/** Name / number filter against `students` (not the admissions directory view). */
function clubPupilSearchFilter(raw: string) {
  const needle = searchNeedle(raw);
  const words = searchWords(raw);
  if (!needle || !words.length) return "";
  return [everyWord(words, ["full_name", "preferred_name"]), `student_number.ilike.%${needle}%`].join(",");
}

export type ClubPupilHit = {
  id: string;
  full_name: string;
  student_number: string;
  class_code: string | null;
  stream: string | null;
  campus: string | null;
  label: string;
};

function refreshAcademicsTimetable() {
  revalidatePath(`${ACADEMICS_BASE}/timetable`);
  revalidatePath("/student/timetable");
}

function campusField(raw: string) {
  const value = raw.trim();
  if (!value || value === "All campuses") return "All campuses";
  if ((CLUB_CAMPUSES as readonly string[]).includes(value)) return value;
  return null;
}

export async function saveClub(form: FormData): Promise<ActionResult> {
  const auth = await requireClubs("catalogue");
  if ("error" in auth) return { error: auth.error };
  const id = String(form.get("id") || "");
  if (!isUuid(id)) return { error: "Choose a club to edit." };
  const title = field(form, "title", 80);
  const category = field(form, "category", 80);
  const section = String(form.get("section") || "");
  const description = field(form, "description", 400);
  const meeting = field(form, "meeting", 120);
  const campus = campusField(String(form.get("campus") || ""));
  const fee = parseAmount(form.get("fee_amount"));
  if (!title) return { error: "Enter the club name." };
  if (!category) return { error: "Choose a category." };
  if (!isClubSection(section)) return { error: "Choose who the club is for." };
  if (fee === null || fee < 0) return { error: "Enter the fee in shillings." };
  if (campus === null) return { error: "Choose a campus." };

  const { error } = await auth.supabase
    .from("clubs")
    .update({
      title,
      category,
      section,
      description,
      meeting,
      campus,
      fee_amount: fee,
      active: form.get("active") === "on",
      published: form.get("active") === "on",
    })
    .eq("id", id);
  if (error) return { error: error.message.includes("duplicate") ? "Another club already uses that name." : "The club could not be saved." };
  await logClubs(auth.supabase, auth.user.id, {
    kind: "edit",
    body: `Updated club “${title}”.`,
    entityType: "club",
    entityId: id,
  });
  refreshClubs(CLUBS_BASE, `${CLUBS_BASE}/catalogue`, `${CLUBS_BASE}/catalogue/${id}`, `${CLUBS_BASE}/register`);
  revalidatePath("/account/clubs");
  return { ok: `${title} saved.` };
}

export async function createClub(form: FormData): Promise<ActionResult> {
  const auth = await requireClubs("catalogue");
  if ("error" in auth) return { error: auth.error };
  const title = field(form, "title", 80);
  const category = field(form, "category", 80);
  const section = String(form.get("section") || "");
  const description = field(form, "description", 400);
  const meeting = field(form, "meeting", 120);
  const campus = campusField(String(form.get("campus") || ""));
  const fee = parseAmount(form.get("fee_amount"));
  if (!title) return { error: "Enter the club name." };
  if (!category || !(CLUB_CATEGORIES as readonly string[]).includes(category)) return { error: "Choose a category." };
  if (!isClubSection(section)) return { error: "Choose who the club is for." };
  if (fee === null || fee < 0) return { error: "Enter the fee in shillings." };
  if (campus === null) return { error: "Choose a campus." };
  const open = form.get("active") === "on";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const [{ data: numbered, error: numberError }, { data: ordered, error: orderError }] = await Promise.all([
      auth.supabase.from("clubs").select("guide_no").not("guide_no", "is", null).order("guide_no", { ascending: false }).limit(1).maybeSingle(),
      auth.supabase.from("clubs").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (numberError || orderError) return { error: "The club could not be added." };
    const guideNo = (Number(numbered?.guide_no) || 0) + 1;
    const sortOrder = Math.max(guideNo, (Number(ordered?.sort_order) || 0) + 1);
    const { error } = await auth.supabase.from("clubs").insert({
      title,
      category,
      section,
      description,
      meeting: meeting || "To be announced",
      campus,
      fee_amount: fee,
      active: open,
      published: open,
      guide_no: guideNo,
      sort_order: sortOrder,
    });
    if (!error) {
      await logClubs(auth.supabase, auth.user.id, {
        kind: "create",
        body: `Added club “${title}”.`,
        entityType: "club",
      });
      refreshClubs(CLUBS_BASE, `${CLUBS_BASE}/catalogue`, `${CLUBS_BASE}/register`);
      revalidatePath("/account/clubs");
      return { ok: `${title} added.` };
    }
    if (error.code === "23505" && /title/i.test(error.message)) return { error: "Another club already uses that name." };
    if (error.code === "23505" && attempt === 0) continue;
    if (error.code === "42501") return { error: "Clubs cannot be added until the latest database update is applied." };
    return { error: "The club could not be added." };
  }
  return { error: "The club could not be added. Try again." };
}

/** Live pupil search for desk consent — campus-scoped for clubs staff. */
export async function searchClubPupils(raw: string): Promise<{ error?: string; rows: ClubPupilHit[] }> {
  const auth = await requireClubs("register");
  if ("error" in auth) return { error: auth.error, rows: [] };
  const needle = searchNeedle(raw).slice(0, 60);
  const words = searchWords(raw);
  if (needle.length < 2 || !words.length) return { rows: [] };
  const filter = clubPupilSearchFilter(needle);
  if (!filter) return { rows: [] };

  const { data, error } = await auth.supabase
    .from("students")
    .select("id, full_name, student_number, class_code, stream, campus, status")
    .eq("status", "active")
    .or(filter)
    .order("full_name")
    .limit(24);
  if (error) return { error: "Pupil search failed.", rows: [] };

  if (!auth.activeCampus) return { error: "Choose a campus first.", rows: [] };
  const rows: ClubPupilHit[] = (data || [])
    .filter((row) => studentInFundsScope((row.campus as string | null) ?? null, auth.campuses, auth.activeCampus))
    .map((row) => ({
      id: row.id as string,
      full_name: row.full_name as string,
      student_number: (row.student_number as string) || "",
      class_code: (row.class_code as string | null) ?? null,
      stream: (row.stream as string | null) ?? null,
      campus: (row.campus as string | null) ?? null,
      label: [
        row.full_name,
        row.student_number,
        row.class_code ? classLabel(row.class_code as string, row.stream as string | null) : null,
        row.campus,
      ]
        .filter(Boolean)
        .join(" · "),
    }));
  return { rows };
}

export async function officeConsent(form: FormData): Promise<ActionResult> {
  const auth = await requireClubs("register");
  if ("error" in auth) return { error: auth.error };
  const studentId = String(form.get("student_id") || "");
  const clubIds = [...new Set(form.getAll("club_id").map(String))].filter(isUuid);
  if (!isUuid(studentId) || !clubIds.length) return { error: "Choose the pupil and at least one club." };

  const [{ data: student }, { data: clubRows }, { data: existingRows }] = await Promise.all([
    auth.supabase.from("students").select("id, full_name, class_code, campus, status").eq("id", studentId).maybeSingle(),
    auth.supabase.from("clubs").select("id, title, active, section").in("id", clubIds),
    auth.supabase.from("club_consents").select("id, club_id").eq("student_id", studentId).in("club_id", clubIds).is("withdrawn_at", null),
  ]);
  if (!student || student.status !== "active") return { error: "That pupil is not on the register." };
  if (!auth.activeCampus) return { error: "Choose a campus first." };
  if (!studentInFundsScope((student.campus as string | null) ?? null, auth.campuses, auth.activeCampus)) {
    return { error: "That pupil is outside your working campus." };
  }

  const clubs = clubRows || [];
  if (clubs.length !== clubIds.length) return { error: "One of those clubs is not on the catalogue." };
  if (clubs.some((club) => !club.active)) return { error: "One of those clubs is not open for consent." };
  if (clubs.some((club) => !clubFits(club.section, student.class_code))) {
    return { error: "One of those clubs is not offered for this pupil's class." };
  }

  const already = new Set((existingRows || []).map((row) => row.club_id as string));
  const fresh = clubs.filter((club) => !already.has(club.id));
  if (!fresh.length) {
    return {
      error:
        clubIds.length === 1
          ? "This pupil already has an open consent for that club."
          : "This pupil already has open consent for those clubs.",
    };
  }

  const saved: { id: string; title: string }[] = [];
  for (const club of fresh) {
    const { error } = await auth.supabase.from("club_consents").insert({
      student_id: studentId,
      club_id: club.id,
      user_id: auth.user.id,
    });
    if (error) {
      if (error.code === "23505") continue;
      if (saved.length) {
        refreshClubs(`${CLUBS_BASE}/register`, ...saved.map((row) => `${CLUBS_BASE}/catalogue/${row.id}`), CLUBS_BASE);
        return {
          error: `Saved ${saved.length} consent${saved.length === 1 ? "" : "s"}, then one failed.`,
          warning: saved.map((row) => row.title).join(", "),
        };
      }
      return { error: "The consent could not be saved." };
    }
    saved.push({ id: club.id, title: club.title });
  }

  if (!saved.length) {
    return {
      error:
        clubIds.length === 1
          ? "This pupil already has an open consent for that club."
          : "This pupil already has open consent for those clubs.",
    };
  }

  const titles = saved.map((row) => row.title);
  const summary =
    titles.length === 1
      ? titles[0]
      : titles.length === 2
        ? `${titles[0]} and ${titles[1]}`
        : `${titles[0]} and ${titles.length - 1} more`;
  await logClubs(auth.supabase, auth.user.id, {
    kind: "consent",
    body: `Recorded club consent for ${student.full_name} · ${summary}.`,
    entityType: "club",
    entityId: saved[0].id,
    studentId,
  });
  refreshClubs(`${CLUBS_BASE}/register`, ...saved.map((row) => `${CLUBS_BASE}/catalogue/${row.id}`), CLUBS_BASE);
  const skipped = already.size;
  const ok =
    saved.length === 1
      ? `Consent recorded for ${student.full_name} · ${saved[0].title}.`
      : `Consent recorded for ${student.full_name} in ${saved.length} clubs.`;
  return skipped ? { ok, warning: `${skipped} already consented club${skipped === 1 ? "" : "s"} skipped.` } : { ok };
}

export async function withdrawConsent(form: FormData): Promise<ActionResult> {
  const auth = await requireClubs("register");
  if ("error" in auth) return { error: auth.error };
  const id = String(form.get("id") || "");
  if (!isUuid(id)) return { error: "Choose the consent to withdraw." };
  const { data, error } = await auth.supabase
    .from("club_consents")
    .update({ withdrawn_at: new Date().toISOString() })
    .eq("id", id)
    .is("withdrawn_at", null)
    .select("id, club_id")
    .maybeSingle();
  if (error || !data) return { error: "The consent could not be withdrawn." };
  await logClubs(auth.supabase, auth.user.id, {
    kind: "withdraw",
    body: "Withdrew a club consent.",
    entityType: "club_consent",
    entityId: id,
    severity: "notice",
  });
  refreshClubs(`${CLUBS_BASE}/register`, `${CLUBS_BASE}/catalogue/${data.club_id}`, CLUBS_BASE);
  return { ok: "Consent withdrawn." };
}

export async function saveLeader(form: FormData): Promise<ActionResult> {
  const auth = await requireClubs("catalogue");
  if ("error" in auth) return { error: auth.error };
  const clubId = String(form.get("club_id") || "");
  const profileId = String(form.get("profile_id") || "");
  const roleRaw = String(form.get("role") || "patron");
  const role = roleRaw === "lead" ? "patron" : roleRaw;
  const phone = normalizePhone(String(form.get("phone") || ""));
  if (!isUuid(clubId) || !isUuid(profileId)) return { error: "Choose the club and the staff member." };
  if (role !== "patron" && role !== "assistant") return { error: "Choose patron or assistant." };
  if (!phoneIsValid(phone)) return { error: "Enter a valid phone number for the patron." };
  const { error } = await auth.supabase.from("club_leaders").insert({
    club_id: clubId,
    profile_id: profileId,
    role,
    phone,
    active: true,
  });
  if (error) {
    if (error.code === "23505") return { error: "That person is already a patron for this club." };
    if (/phone|column/i.test(error.message)) {
      return { error: "Apply 0068_club_patrons.sql so patron phone numbers can be saved." };
    }
    return { error: "The patron could not be added. Apply the clubs desk migration if this is the first time." };
  }
  refreshClubs(`${CLUBS_BASE}/catalogue/${clubId}`);
  return { ok: "Patron added." };
}

export async function removeLeader(form: FormData): Promise<ActionResult> {
  const auth = await requireClubs("catalogue");
  if ("error" in auth) return { error: auth.error };
  const id = String(form.get("id") || "");
  if (!isUuid(id)) return { error: "Choose a patron to remove." };
  const { data, error } = await auth.supabase
    .from("club_leaders")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("club_id")
    .maybeSingle();
  if (error || !data) return { error: "The patron could not be removed." };
  refreshClubs(`${CLUBS_BASE}/catalogue/${data.club_id}`);
  return { ok: "Patron removed." };
}

export async function saveSchedule(form: FormData): Promise<ActionResult> {
  const auth = await requireClubs("catalogue", "timetable", "sessions");
  if ("error" in auth) return { error: auth.error };
  const clubId = String(form.get("club_id") || "");
  const weekday = Number(form.get("weekday"));
  const start = String(form.get("start_time") || "").trim();
  const end = String(form.get("end_time") || "").trim();
  const venue = field(form, "venue", 120);
  const campus = campusField(String(form.get("campus") || "")) || "";
  const notes = field(form, "notes", 200);
  if (!isUuid(clubId)) return { error: "Choose a club." };
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return { error: "Choose a weekday." };
  if (!/^\d{2}:\d{2}/.test(start) || !/^\d{2}:\d{2}/.test(end)) return { error: "Enter start and end times." };
  if (end <= start) return { error: "End time must be after the start." };
  const { error } = await auth.supabase.from("club_schedules").insert({
    club_id: clubId,
    weekday,
    start_time: start.length === 5 ? `${start}:00` : start,
    end_time: end.length === 5 ? `${end}:00` : end,
    venue,
    campus: campus === "All campuses" ? "" : campus,
    notes,
    active: true,
  });
  if (error) return { error: "The schedule could not be saved. Apply the clubs desk migration if this is the first time." };
  await logClubs(auth.supabase, auth.user.id, {
    kind: "timetable",
    body: "Saved a club schedule slot.",
    entityType: "club",
    entityId: clubId,
  });
  refreshClubs(`${CLUBS_BASE}/catalogue/${clubId}`, `${CLUBS_BASE}/timetable`);
  refreshAcademicsTimetable();
  return { ok: "Schedule saved. It will show on class timetables as club time." };
}

export async function removeSchedule(form: FormData): Promise<ActionResult> {
  const auth = await requireClubs("catalogue", "timetable", "sessions");
  if ("error" in auth) return { error: auth.error };
  const id = String(form.get("id") || "");
  if (!isUuid(id)) return { error: "Choose a schedule to remove." };
  const { data, error } = await auth.supabase
    .from("club_schedules")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("club_id")
    .maybeSingle();
  if (error || !data) return { error: "The schedule could not be removed." };
  refreshClubs(`${CLUBS_BASE}/catalogue/${data.club_id}`, `${CLUBS_BASE}/timetable`);
  refreshAcademicsTimetable();
  return { ok: "Schedule removed." };
}

export async function createSession(form: FormData): Promise<ActionResult> {
  const auth = await requireClubs("timetable", "sessions");
  if ("error" in auth) return { error: auth.error };
  const clubId = String(form.get("club_id") || "");
  const heldOn = String(form.get("held_on") || "").trim() || kampalaToday();
  const scheduleId = String(form.get("schedule_id") || "");
  const venue = field(form, "venue", 120);
  const notes = field(form, "notes", 200);
  if (!isUuid(clubId)) return { error: "Choose a club." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(heldOn)) return { error: "Choose the meeting date." };

  const [{ data: term }, { data: schedule }] = await Promise.all([
    auth.supabase.from("fee_terms").select("id").eq("is_current", true).maybeSingle(),
    scheduleId && isUuid(scheduleId)
      ? auth.supabase.from("club_schedules").select("id, venue").eq("id", scheduleId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const { data, error } = await auth.supabase
    .from("club_sessions")
    .insert({
      club_id: clubId,
      held_on: heldOn,
      schedule_id: schedule?.id ?? null,
      term_id: term?.id ?? null,
      venue: venue || schedule?.venue || "",
      notes,
      created_by: auth.user.id,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: "The meeting could not be created. Apply the clubs desk migration if this is the first time." };
  refreshClubs(`${CLUBS_BASE}/timetable`, `${CLUBS_BASE}/timetable/${data.id}`, `${CLUBS_BASE}/catalogue/${clubId}`);
  return { ok: "Meeting created.", id: data.id };
}

export async function saveAttendance(form: FormData): Promise<ActionResult> {
  const auth = await requireClubs("timetable", "sessions");
  if ("error" in auth) return { error: auth.error };
  const sessionId = String(form.get("session_id") || "");
  if (!isUuid(sessionId)) return { error: "Choose a meeting." };

  const rows: { session_id: string; student_id: string; status: string; note: string; marked_by: string }[] = [];
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("status:")) continue;
    const studentId = key.slice("status:".length);
    if (!isUuid(studentId)) continue;
    const status = String(value || "");
    if (!isClubAttendanceStatus(status)) continue;
    const note = field(form, `note:${studentId}`, 120) || "";
    rows.push({
      session_id: sessionId,
      student_id: studentId,
      status,
      note,
      marked_by: auth.user.id,
    });
  }
  if (!rows.length) return { error: "Mark at least one learner." };

  const { error } = await auth.supabase.from("club_attendance").upsert(rows, { onConflict: "session_id,student_id" });
  if (error) return { error: "Attendance could not be saved. Apply the clubs desk migration if this is the first time." };
  refreshClubs(`${CLUBS_BASE}/timetable/${sessionId}`, `${CLUBS_BASE}/timetable`);
  return { ok: `Saved attendance for ${rows.length} learner${rows.length === 1 ? "" : "s"}.` };
}
