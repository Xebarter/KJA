import { createClient, supabaseConfigured } from "@/lib/supabase/server";
import { getContent } from "@/lib/content";
import { classLabel as academicsClassLabel } from "@/lib/academics";
import {
  classLabel,
  displayName,
  type StudentClassmate,
  type StudentHomework,
  type StudentLesson,
  type StudentMessage,
  type StudentNotice,
  type StudentProfileRow,
  type StudentReport,
  type StudentSelf,
} from "@/lib/student";
import type { Article } from "@/lib/types";

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
    mustResetPassword: false,
    displayName: "Student",
    classLabel: "",
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
    .select("id, full_name, preferred_name, class_code, stream, campus, student_number, photo_path, status, profile_id")
    .eq("profile_id", user.id)
    .maybeSingle();

  const student = studentRes.data as StudentSelf | null;
  if (!student) {
    return {
      ...empty,
      user,
      profile,
      mustResetPassword: Boolean(user.user_metadata?.must_reset_password),
      displayName: profile.full_name || "Student",
    };
  }

  const termRes = await supabase.from("fee_terms").select("id").eq("is_current", true).maybeSingle();
  const termId = termRes.data?.id as string | undefined;
  const todayWeekday = weekdayKampala();

  const classmateIdsRes = await supabase.rpc("classmate_ids");
  const classmateIdList = Array.isArray(classmateIdsRes.data)
    ? classmateIdsRes.data.map((id: unknown) => String(id)).filter(Boolean)
    : [];

  const [classmateRows, homeworkRows, completions, notifications, slots, subjects, cardRows, content] = await Promise.all([
    classmateIdList.length
      ? rows<StudentClassmate>(
          supabase.from("students").select("id, full_name, preferred_name, photo_path").in("id", classmateIdList).order("full_name"),
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
  ]);

  const classmates = classmateRows.filter((row) => row.id !== student.id);

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

  // Unread messages: messages from others in my conversations after a simple heuristic —
  // count messages not from me in the last load window; proper read receipts are out of v1,
  // so we approximate with notifications of kind "messages" unread + recent inbound.
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
    student,
    classmates,
    homework,
    notifications,
    unread: notifications.filter((item) => !item.read).length,
    unreadMessages,
    lessonsToday: todayWeekday >= 1 && todayWeekday <= 5 ? lessonsToday : [],
    reports,
    events,
    mustResetPassword: Boolean(user.user_metadata?.must_reset_password),
    displayName: displayName(student),
    classLabel: classLabel(student.class_code, student.stream),
  };
}

export async function loadStudentMessages(conversationId?: string) {
  const { user, supabase } = await getStudentSession();
  if (!user || !supabase) return { student: null, classmates: [], conversations: [], messages: [] as StudentMessage[] };

  const studentRes = await supabase
    .from("students")
    .select("id, full_name, preferred_name, class_code, stream, photo_path")
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
        supabase.from("students").select("id, full_name, preferred_name, photo_path").in("id", classmateIdList).order("full_name"),
      )
    : [];

  const convs = await rows<{ id: string; student_low_id: string; student_high_id: string }>(
    supabase
      .from("student_conversations")
      .select("id, student_low_id, student_high_id")
      .or(`student_low_id.eq.${student.id},student_high_id.eq.${student.id}`)
      .order("created_at", { ascending: false }),
  );

  const peerIds = convs.map((c) => (c.student_low_id === student.id ? c.student_high_id : c.student_low_id));
  const peerMap = new Map(classmates.map((c) => [c.id, c]));
  for (const id of peerIds) {
    if (!peerMap.has(id)) {
      const { data } = await supabase.from("students").select("id, full_name, preferred_name, photo_path").eq("id", id).maybeSingle();
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

  const conversations = convs.map((c) => {
    const peerId = c.student_low_id === student.id ? c.student_high_id : c.student_low_id;
    const peer = peerMap.get(peerId) || { id: peerId, full_name: "Classmate", preferred_name: null, photo_path: null };
    return {
      id: c.id,
      student_low_id: c.student_low_id,
      student_high_id: c.student_high_id,
      peer,
      last: lastByConv.get(c.id),
      unread: 0,
    };
  }).sort((a, b) => String(b.last?.created_at || "").localeCompare(String(a.last?.created_at || "")));

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
