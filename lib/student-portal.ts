import { createClient, supabaseConfigured } from "@/lib/supabase/server";
import { getContent } from "@/lib/content";
import { classLabel as academicsClassLabel } from "@/lib/academics";
import {
  classLabel,
  displayName,
  type StudentAcademicDate,
  type StudentAttendanceDay,
  type StudentAttendanceSummary,
  type StudentClassmate,
  type StudentClub,
  type StudentHomework,
  type StudentLesson,
  type StudentMessage,
  type StudentNotice,
  type StudentProfileRow,
  type StudentReport,
  type StudentSelf,
  type StudentTeacher,
} from "@/lib/student";
import type { Article } from "@/lib/types";

async function loadAcademicDateRows(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  termId: string,
) {
  const scoped = await supabase
    .from("academic_dates")
    .select("id, title, kind, starts_on, ends_on, campus, note, class_code, stream")
    .eq("term_id", termId)
    .order("starts_on");
  if (scoped.error && /class_code|schema cache|does not exist/i.test(scoped.error.message)) {
    const plain = await supabase
      .from("academic_dates")
      .select("id, title, kind, starts_on, ends_on, campus, note")
      .eq("term_id", termId)
      .order("starts_on");
    return plain.data || [];
  }
  return scoped.data || [];
}

async function rows<T>(query: PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  try {
    const { data } = await query;
    return data ?? [];
  } catch {
    return [];
  }
}

export async function getStudentSession() {
  if (!supabaseConfigured()) return { user: null, supabase: null };
  const supabase = await createClient();
  if (!supabase) return { user: null, supabase: null };
  const { data: { user } } = await supabase.auth.getUser();
  return { user, supabase };
}

function weekdayKampala(date = new Date()) {
  const day = new Date(date.toLocaleString("en-US", { timeZone: "Africa/Kampala" })).getDay();
  return day === 0 ? 7 : day;
}

const emptyAttendance: StudentAttendanceSummary = {
  present: 0,
  late: 0,
  absent: 0,
  excused: 0,
  total: 0,
  percent: 0,
  recent: [],
};

function summarizeAttendance(days: StudentAttendanceDay[]): StudentAttendanceSummary {
  const present = days.filter((d) => d.status === "present").length;
  const late = days.filter((d) => d.status === "late").length;
  const absent = days.filter((d) => d.status === "absent").length;
  const excused = days.filter((d) => d.status === "excused").length;
  const total = days.length;
  const counted = present + late;
  const percent = total ? Math.round((counted / total) * 100) : 0;
  return {
    present,
    late,
    absent,
    excused,
    total,
    percent,
    recent: [...days].sort((a, b) => b.attended_on.localeCompare(a.attended_on)).slice(0, 14),
  };
}

export async function getStudentPortal() {
  const empty = {
    user: null as { id: string } | null,
    profile: null as StudentProfileRow | null,
    student: null as StudentSelf | null,
    classmates: [] as StudentClassmate[],
    homework: [] as StudentHomework[],
    notifications: [] as StudentNotice[],
    unread: 0,
    unreadMessages: 0,
    lessonsToday: [] as StudentLesson[],
    reports: [] as StudentReport[],
    events: [] as Article[],
    attendance: emptyAttendance,
    clubs: [] as StudentClub[],
    teachers: [] as StudentTeacher[],
    classTeacher: null as StudentTeacher | null,
    academicDates: [] as StudentAcademicDate[],
    mustResetPassword: false,
    displayName: "Student",
    classLabel: "",
    termLabel: null as string | null,
  };

  const { user, supabase } = await getStudentSession();
  if (!user || !supabase) return empty;

  const profileRes = await supabase.from("profiles").select("id, role, full_name, email").eq("id", user.id).maybeSingle();
  const profile = (profileRes.data as StudentProfileRow | null) ?? {
    id: user.id,
    role: "student",
    full_name: user.user_metadata?.full_name || "",
    email: user.email ?? "",
  };

  const studentRes = await supabase
    .from("students")
    .select("id, full_name, preferred_name, class_code, stream, campus, student_number, photo_path, status, profile_id, house, sex")
    .eq("profile_id", user.id)
    .maybeSingle();

  let student = studentRes.data as StudentSelf | null;
  if (studentRes.error && /house|sex/i.test(studentRes.error.message)) {
    const fallback = await supabase
      .from("students")
      .select("id, full_name, preferred_name, class_code, stream, campus, student_number, photo_path, status, profile_id")
      .eq("profile_id", user.id)
      .maybeSingle();
    student = fallback.data
      ? ({ ...fallback.data, house: null, sex: null } as StudentSelf)
      : null;
  }

  if (!student) {
    return {
      ...empty,
      user,
      profile,
      mustResetPassword: Boolean(user.user_metadata?.must_reset_password),
      displayName: profile.full_name || "Student",
    };
  }

  const termRes = await supabase.from("fee_terms").select("id, label").eq("is_current", true).maybeSingle();
  const termId = termRes.data?.id as string | undefined;
  const todayWeekday = weekdayKampala();

  const classmateIdsRes = await supabase.rpc("classmate_ids");
  const classmateIdList = Array.isArray(classmateIdsRes.data)
    ? classmateIdsRes.data.map((id: unknown) => String(id)).filter(Boolean)
    : [];

  const [
    classmateRows,
    homeworkRows,
    completions,
    notifications,
    slots,
    subjects,
    cardRows,
    content,
    attendanceRows,
    consentRows,
    clubRows,
    paymentRows,
    classTeacherRows,
    subjectTeacherRows,
    academicDateRows,
  ] = await Promise.all([
    classmateIdList.length
      ? rows<StudentClassmate>(
          supabase
            .from("students")
            .select("id, full_name, preferred_name, photo_path, house")
            .in("id", classmateIdList)
            .order("full_name"),
        )
      : Promise.resolve([] as StudentClassmate[]),
    termId
      ? rows<{
          id: string;
          title: string;
          instructions: string | null;
          due_on: string;
          published_at: string | null;
          class_code: string;
          stream: string;
          subject_id: string;
        }>(
          supabase
            .from("homework_assignments")
            .select("id, title, instructions, due_on, published_at, class_code, stream, subject_id")
            .not("published_at", "is", null)
            .eq("term_id", termId)
            .eq("class_code", student.class_code || "")
            .eq("stream", student.stream || "")
            .order("due_on"),
        )
      : Promise.resolve([]),
    rows<{ assignment_id: string; done_at: string }>(
      supabase.from("homework_completions").select("assignment_id, done_at").eq("student_id", student.id),
    ),
    rows<StudentNotice>(
      supabase.from("notifications").select("id, title, body, href, kind, read, created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
    ),
    termId && student.class_code
      ? rows<{
          id: string;
          weekday: number;
          period: number;
          starts_at: string | null;
          ends_at: string | null;
          subject_id: string;
          room: string | null;
        }>(
          supabase
            .from("timetable_slots")
            .select("id, weekday, period, starts_at, ends_at, subject_id, room")
            .eq("term_id", termId)
            .eq("class_code", student.class_code)
            .eq("stream", student.stream || "")
            .eq("weekday", Math.min(todayWeekday, 5))
            .order("period"),
        )
      : Promise.resolve([]),
    rows<{ id: string; name: string }>(supabase.from("subjects").select("id, name").order("name")),
    rows<{ id: string; class_code: string | null; stream: string | null; published_at: string | null; fee_terms: { label: string } | { label: string }[] | null }>(
      supabase
        .from("report_cards")
        .select("id, class_code, stream, published_at, fee_terms(label)")
        .eq("status", "published")
        .eq("student_id", student.id)
        .order("published_at", { ascending: false }),
    ),
    getContent(),
    termId
      ? rows<StudentAttendanceDay>(
          supabase
            .from("attendance")
            .select("attended_on, status")
            .eq("student_id", student.id)
            .eq("term_id", termId)
            .order("attended_on", { ascending: false }),
        )
      : Promise.resolve([]),
    rows<{ id: string; club_id: string; consented_at: string }>(
      supabase
        .from("club_consents")
        .select("id, club_id, consented_at")
        .eq("student_id", student.id)
        .is("withdrawn_at", null)
        .order("consented_at", { ascending: false }),
    ),
    rows<{ id: string; title: string; campus: string | null; meeting: string | null; description: string | null }>(
      supabase.from("clubs").select("id, title, campus, meeting, description").eq("published", true).order("title"),
    ),
    termId
      ? rows<{ club_id: string }>(
          supabase
            .from("club_payments")
            .select("club_id")
            .eq("student_id", student.id)
            .eq("term_id", termId)
            .is("voided_at", null),
        )
      : Promise.resolve([]),
    termId && student.class_code
      ? rows<{ staff_id: string }>(
          supabase
            .from("class_teachers")
            .select("staff_id")
            .eq("term_id", termId)
            .eq("class_code", student.class_code)
            .eq("stream", student.stream || ""),
        )
      : Promise.resolve([]),
    termId && student.class_code
      ? rows<{ staff_id: string; subject_id: string }>(
          supabase
            .from("subject_teachers")
            .select("staff_id, subject_id")
            .eq("term_id", termId)
            .eq("class_code", student.class_code)
            .eq("stream", student.stream || ""),
        )
      : Promise.resolve([]),
    termId ? loadAcademicDateRows(supabase, termId) : Promise.resolve([]),
  ]);

  const classmates = classmateRows
    .filter((row) => row.id !== student.id)
    .map((row) => ({ ...row, house: row.house ?? null }));

  const doneMap = new Map(completions.map((row) => [row.assignment_id, row.done_at]));
  const subjectName = new Map(subjects.map((row) => [row.id, row.name]));
  const homework: StudentHomework[] = homeworkRows.map((row) => ({
    ...row,
    subject_name: subjectName.get(row.subject_id) || null,
    done: doneMap.has(row.id),
    done_at: doneMap.get(row.id) || null,
  }));

  const lessonsToday: StudentLesson[] = slots.map((slot) => ({
    id: slot.id,
    weekday: slot.weekday,
    period: slot.period,
    starts_at: slot.starts_at,
    ends_at: slot.ends_at,
    subject_name: subjectName.get(slot.subject_id) || "Lesson",
    room: slot.room,
  }));

  const reports: StudentReport[] = cardRows.map((card) => {
    const term = Array.isArray(card.fee_terms) ? card.fee_terms[0]?.label : card.fee_terms?.label;
    return {
      id: card.id,
      term: term || "Term",
      class_label: academicsClassLabel(card.class_code, card.stream) || classLabel(card.class_code, card.stream),
      published_at: card.published_at,
    };
  });

  const events = [...content.events]
    .filter((event) => event.starts_on)
    .sort((a, b) => String(a.starts_on).localeCompare(String(b.starts_on)));

  const attendance = summarizeAttendance(
    attendanceRows.map((row) => ({
      attended_on: row.attended_on,
      status: row.status as StudentAttendanceDay["status"],
    })),
  );

  const paidClubs = new Set(paymentRows.map((row) => row.club_id));
  const clubById = new Map(clubRows.map((row) => [row.id, row]));
  const clubs: StudentClub[] = consentRows
    .map((consent) => {
      const club = clubById.get(consent.club_id);
      if (!club) return null;
      return {
        id: consent.id,
        club_id: club.id,
        title: club.title,
        campus: club.campus,
        meeting: club.meeting,
        description: club.description,
        consented_at: consent.consented_at,
        paid: paidClubs.has(club.id),
      };
    })
    .filter(Boolean) as StudentClub[];

  const staffIds = [
    ...new Set([
      ...classTeacherRows.map((row) => row.staff_id),
      ...subjectTeacherRows.map((row) => row.staff_id),
    ]),
  ];
  let staffRows: { id: string; full_name: string; title: string | null; photo_path: string | null }[] = [];
  if (staffIds.length) {
    const withPhoto = await supabase
      .from("teaching_staff")
      .select("id, full_name, title, photo_path")
      .in("id", staffIds)
      .eq("active", true);
    if (withPhoto.error && /photo_path|schema cache|does not exist/i.test(withPhoto.error.message)) {
      const fallback = await rows<{ id: string; full_name: string; title: string | null }>(
        supabase.from("teaching_staff").select("id, full_name, title").in("id", staffIds).eq("active", true),
      );
      staffRows = fallback.map((row) => ({ ...row, photo_path: null }));
    } else {
      staffRows = ((withPhoto.data || []) as { id: string; full_name: string; title: string | null; photo_path: string | null }[]);
    }
  }
  const staffById = new Map(staffRows.map((row) => [row.id, row]));

  const classTeacherStaff = classTeacherRows[0] ? staffById.get(classTeacherRows[0].staff_id) : null;
  const classTeacher: StudentTeacher | null = classTeacherStaff
    ? {
        id: classTeacherStaff.id,
        staff_id: classTeacherStaff.id,
        full_name: classTeacherStaff.full_name,
        title: classTeacherStaff.title,
        subject_name: null,
        photo_path: classTeacherStaff.photo_path,
        role: "class",
      }
    : null;

  const teachers: StudentTeacher[] = subjectTeacherRows
    .map((row) => {
      const staff = staffById.get(row.staff_id);
      if (!staff) return null;
      return {
        id: `${staff.id}:${row.subject_id}`,
        staff_id: staff.id,
        full_name: staff.full_name,
        title: staff.title,
        subject_name: subjectName.get(row.subject_id) || "Subject",
        photo_path: staff.photo_path,
        role: "subject" as const,
      };
    })
    .filter(Boolean) as StudentTeacher[];

  const academicDates = academicDateRows
    .filter((row) => {
      const classCode = "class_code" in row ? row.class_code : null;
      const stream = "stream" in row ? row.stream : null;
      if (classCode && (classCode !== student.class_code || (stream || "") !== (student.stream || ""))) return false;
      return !row.campus || !student.campus || row.campus === student.campus || /all/i.test(row.campus || "");
    })
    .map((row) => ({
      id: row.id,
      title: row.title,
      kind: row.kind as StudentAcademicDate["kind"],
      starts_on: row.starts_on,
      ends_on: row.ends_on,
      campus: row.campus,
      note: row.note,
    }));

  let unreadMessages = 0;
  const convRes = await supabase
    .from("student_conversations")
    .select("id")
    .or(`student_low_id.eq.${student.id},student_high_id.eq.${student.id}`);
  const convIds = (convRes.data || []).map((row) => row.id);
  if (convIds.length) {
    const { count } = await supabase
      .from("student_messages")
      .select("id", { count: "exact", head: true })
      .in("conversation_id", convIds)
      .neq("sender_student_id", student.id)
      .eq("hidden", false)
      .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString());
    unreadMessages = count || 0;
  }

  return {
    user,
    profile,
    student: {
      ...student,
      house: student.house ?? null,
      sex: student.sex ?? null,
    },
    classmates,
    homework,
    notifications,
    unread: notifications.filter((item) => !item.read).length,
    unreadMessages,
    lessonsToday: todayWeekday >= 1 && todayWeekday <= 5 ? lessonsToday : [],
    reports,
    events,
    attendance,
    clubs,
    teachers,
    classTeacher,
    academicDates,
    mustResetPassword: Boolean(user.user_metadata?.must_reset_password),
    displayName: displayName(student),
    classLabel: classLabel(student.class_code, student.stream),
    termLabel: (termRes.data?.label as string | undefined) || null,
  };
}

export async function loadStudentMessages(conversationId?: string) {
  const { user, supabase } = await getStudentSession();
  if (!user || !supabase) return { student: null, classmates: [], conversations: [], messages: [] as StudentMessage[] };

  const studentRes = await supabase
    .from("students")
    .select("id, full_name, preferred_name, class_code, stream, photo_path, house, sex, campus, student_number, status, profile_id")
    .eq("profile_id", user.id)
    .maybeSingle();
  const student = studentRes.data as StudentSelf | null;
  if (!student) return { student: null, classmates: [], conversations: [], messages: [] as StudentMessage[] };

  const classmateIdsRes = await supabase.rpc("classmate_ids");
  const classmateIdList = Array.isArray(classmateIdsRes.data)
    ? classmateIdsRes.data.map((id: unknown) => String(id)).filter(Boolean)
    : [];
  const classmates = classmateIdList.length
    ? await rows<StudentClassmate>(
        supabase.from("students").select("id, full_name, preferred_name, photo_path, house").in("id", classmateIdList).order("full_name"),
      )
    : [];

  let classGroupId: string | null = null;
  if (student.class_code) {
    const { data: ensured } = await supabase.rpc("ensure_my_class_group");
    classGroupId = ensured ? String(ensured) : null;
  }

  type ConvRow = {
    id: string;
    kind: string | null;
    student_low_id: string | null;
    student_high_id: string | null;
    class_code: string | null;
    stream: string | null;
  };

  const dmConvs = await rows<ConvRow>(
    supabase
      .from("student_conversations")
      .select("id, kind, student_low_id, student_high_id, class_code, stream")
      .eq("kind", "dm")
      .or(`student_low_id.eq.${student.id},student_high_id.eq.${student.id}`)
      .order("created_at", { ascending: false }),
  );

  const groupConvs = classGroupId
    ? await rows<ConvRow>(
        supabase
          .from("student_conversations")
          .select("id, kind, student_low_id, student_high_id, class_code, stream")
          .eq("id", classGroupId),
      )
    : student.class_code
      ? await rows<ConvRow>(
          supabase
            .from("student_conversations")
            .select("id, kind, student_low_id, student_high_id, class_code, stream")
            .eq("kind", "class_group")
            .eq("class_code", student.class_code)
            .eq("stream", student.stream || ""),
        )
      : [];

  const convs = [...groupConvs, ...dmConvs];

  const peerIds = dmConvs.map((c) => (c.student_low_id === student.id ? c.student_high_id! : c.student_low_id!));
  const peerMap = new Map(classmates.map((c) => [c.id, c]));
  for (const id of peerIds) {
    if (!peerMap.has(id)) {
      const { data } = await supabase.from("students").select("id, full_name, preferred_name, photo_path, house").eq("id", id).maybeSingle();
      if (data) peerMap.set(id, data as StudentClassmate);
    }
  }

  const allMessages = convs.length
    ? await rows<StudentMessage>(
        supabase
          .from("student_messages")
          .select("id, conversation_id, sender_student_id, body, flagged, created_at")
          .in("conversation_id", convs.map((c) => c.id))
          .eq("hidden", false)
          .order("created_at", { ascending: false })
          .limit(500),
      )
    : [];

  const lastByConv = new Map<string, StudentMessage>();
  for (const msg of allMessages) {
    if (!lastByConv.has(msg.conversation_id)) lastByConv.set(msg.conversation_id, msg);
  }

  const classTitle = classLabel(student.class_code, student.stream);
  const memberCount = classmates.length + 1;

  const conversations = convs
    .map((c) => {
      const kind = c.kind === "class_group" ? ("class_group" as const) : ("dm" as const);
      if (kind === "class_group") {
        const title = `${classTitle || "Class"} group`;
        return {
          id: c.id,
          kind,
          student_low_id: null,
          student_high_id: null,
          class_code: c.class_code,
          stream: c.stream,
          title,
          member_count: memberCount,
          peer: {
            id: `class-group:${c.class_code}:${c.stream || ""}`,
            full_name: title,
            preferred_name: null,
            photo_path: null,
            house: null,
          },
          last: lastByConv.get(c.id),
          unread: 0,
        };
      }
      const peerId = c.student_low_id === student.id ? c.student_high_id! : c.student_low_id!;
      const peer = peerMap.get(peerId) || {
        id: peerId,
        full_name: "Classmate",
        preferred_name: null,
        photo_path: null,
        house: null,
      };
      return {
        id: c.id,
        kind,
        student_low_id: c.student_low_id,
        student_high_id: c.student_high_id,
        class_code: null,
        stream: null,
        peer,
        last: lastByConv.get(c.id),
        unread: 0,
      };
    })
    .sort((a, b) => {
      if (a.kind === "class_group" && b.kind !== "class_group") return -1;
      if (b.kind === "class_group" && a.kind !== "class_group") return 1;
      return String(b.last?.created_at || "").localeCompare(String(a.last?.created_at || ""));
    });

  const messages = conversationId
    ? await rows<StudentMessage>(
        supabase
          .from("student_messages")
          .select("id, conversation_id, sender_student_id, body, flagged, created_at")
          .eq("conversation_id", conversationId)
          .eq("hidden", false)
          .order("created_at", { ascending: true })
          .limit(200),
      )
    : [];

  return { student, classmates, conversations, messages };
}
