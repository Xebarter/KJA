import { hideStudentMessage } from "@/app/academics_office/(desk)/chat-review/actions";
import { AcademicsGate, Empty } from "@/components/academics/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { TeacherChatDesk, type ChatMessage, type ChatThread } from "@/components/teacher/ChatDesk";
import { streamOf } from "@/lib/academics";
import { loadRoll } from "@/lib/academics-roll";
import { TEACHER_BASE } from "@/lib/teacher";
import { requireTeacher } from "@/lib/teacher-access";
import "./chat.css";

export const metadata = { title: "Chat" };

type ConversationRow = {
  id: string;
  kind: string;
  class_code: string | null;
  stream: string | null;
  student_low_id: string | null;
  student_high_id: string | null;
};

type MessageRow = {
  id: string;
  body: string;
  flagged: boolean;
  hidden: boolean;
  created_at: string;
  sender_student_id: string;
  conversation_id: string;
};

export default async function TeacherChatPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const teacher = await requireTeacher();
  if ("error" in teacher) return <AcademicsGate title="Chat" state={{ notice: "auth", message: teacher.error }} />;
  if (!teacher.classes.length) {
    return (
      <Empty icon="fa-comments" title="Not a class teacher">
        Chat review is for the class you lead.
      </Empty>
    );
  }

  const query = await searchParams;
  const classKey = String(Array.isArray(query.class) ? query.class[0] : query.class || "");
  const flaggedOnly = String(Array.isArray(query.flagged) ? query.flagged[0] : query.flagged || "") === "1";
  const threadId = String(Array.isArray(query.c) ? query.c[0] : query.c || "");

  const pupils = await loadRoll(teacher.supabase, teacher.user.id);
  const classes = teacher.classes.map((post) => ({
    value: `${post.classCode}|${post.stream}`,
    label: post.label,
    classCode: post.classCode,
    stream: post.stream,
  }));
  const match = classes.find((row) => row.value === classKey) || classes[0];
  const classPupils = pupils.filter(
    (pupil) => pupil.class_code === match.classCode && streamOf(pupil.stream) === match.stream,
  );
  const studentIds = classPupils.map((pupil) => pupil.id);
  const names = new Map(pupils.map((pupil) => [pupil.id, pupil.full_name]));
  const photos = new Map(pupils.map((pupil) => [pupil.id, pupil.photo_path]));

  let conversations: ConversationRow[] = [];
  let messages: MessageRow[] = [];
  let loadError: string | null = null;

  if (studentIds.length) {
    const [group, direct] = await Promise.all([
      teacher.supabase
        .from("student_conversations")
        .select("id, kind, class_code, stream, student_low_id, student_high_id")
        .eq("kind", "class_group")
        .eq("class_code", match.classCode)
        .eq("stream", match.stream),
      teacher.supabase
        .from("student_conversations")
        .select("id, kind, class_code, stream, student_low_id, student_high_id")
        .eq("kind", "dm")
        .in("student_low_id", studentIds),
    ]);

    if (group.error) {
      loadError = /class_teacher_sees_conversation|schema cache/i.test(group.error.message)
        ? "Run supabase/0041_teacher_dashboard.sql to review class chat."
        : group.error.message;
    }
    if (direct.error && !loadError) loadError = direct.error.message;

    const inClass = new Set(studentIds);
    conversations = [
      ...((group.data || []) as ConversationRow[]),
      ...((direct.data || []) as ConversationRow[]).filter(
        (row) => row.student_high_id && inClass.has(String(row.student_high_id)),
      ),
    ];

    const convIds = conversations.map((row) => row.id);
    if (convIds.length && !loadError) {
      const result = await teacher.supabase
        .from("student_messages")
        .select("id, body, flagged, hidden, created_at, sender_student_id, conversation_id")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: true })
        .limit(240);
      if (result.error) loadError = result.error.message;
      else messages = (result.data || []) as MessageRow[];
    }
  }

  const byConversation = new Map<string, ChatMessage[]>();
  for (const row of messages) {
    const list = byConversation.get(row.conversation_id) || [];
    list.push({
      id: row.id,
      body: row.body,
      flagged: row.flagged,
      hidden: row.hidden,
      created_at: row.created_at,
      sender_id: row.sender_student_id,
      sender_name: names.get(row.sender_student_id) || "Pupil",
      sender_photo: photos.get(row.sender_student_id) || null,
      conversation_id: row.conversation_id,
    });
    byConversation.set(row.conversation_id, list);
  }

  const threads: ChatThread[] = conversations
    .map((conversation) => {
      const threadMessages = byConversation.get(conversation.id) || [];
      if (conversation.kind === "class_group") {
        return {
          id: conversation.id,
          kind: "class_group" as const,
          title: `${match.label} group`,
          subtitle: `${classPupils.length.toLocaleString("en-GB")} pupils · class chat`,
          peerIds: [],
          peerPhotos: [],
          messages: threadMessages,
        };
      }

      const low = conversation.student_low_id || "";
      const high = conversation.student_high_id || "";
      const lowName = names.get(low) || "Pupil";
      const highName = names.get(high) || "Pupil";
      return {
        id: conversation.id,
        kind: "dm" as const,
        title: `${lowName} & ${highName}`,
        subtitle: "Direct message between classmates",
        peerIds: [low, high].filter(Boolean),
        peerPhotos: [photos.get(low) || null, photos.get(high) || null],
        messages: threadMessages,
      };
    })
    .filter((thread) => thread.messages.length > 0)
    .sort((a, b) => {
      if (a.kind === "class_group" && b.kind !== "class_group") return -1;
      if (b.kind === "class_group" && a.kind !== "class_group") return 1;
      const aAt = a.messages[a.messages.length - 1]?.created_at || "";
      const bAt = b.messages[b.messages.length - 1]?.created_at || "";
      return String(bAt).localeCompare(String(aAt));
    });

  return (
    <div className="app-page ofc-page tch-page tch-chat-page">
      <PageHeader
        kicker="My class"
        icon="fa-comments"
        title="Class chat"
        description={
          <>
            Review conversations in <strong>{match.label}</strong>. Hide anything that should not stay visible in the Pupils App.
          </>
        }
      />
      {loadError ? (
        <p className="admin-empty">{loadError}</p>
      ) : (
        <TeacherChatDesk
          classes={classes.map((row) => ({ value: row.value, label: row.label }))}
          selectedClass={match.value}
          threads={threads}
          initialThreadId={threadId && threads.some((thread) => thread.id === threadId) ? threadId : undefined}
          flaggedOnly={flaggedOnly}
          hideAction={hideStudentMessage}
          basePath={`${TEACHER_BASE}/chat`}
        />
      )}
    </div>
  );
}
