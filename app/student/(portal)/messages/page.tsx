import { StudentMessagesInbox } from "@/components/student/MessagesInbox";
import { loadStudentMessages } from "@/lib/student-portal";

export const metadata = { title: "Messages" };

export default async function StudentMessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const conversationId = String(Array.isArray(query.c) ? query.c[0] : query.c || "");
  const data = await loadStudentMessages(conversationId || undefined);

  if (!data.student) {
    return (
      <div className="hw-empty">
        <i className="fa-solid fa-comments" aria-hidden="true" />
        <p>Your pupil record is not linked yet, so messaging is unavailable.</p>
      </div>
    );
  }

  return (
    <StudentMessagesInbox
      student={data.student}
      classmates={data.classmates}
      conversations={data.conversations}
      initialConversationId={conversationId || undefined}
      initialMessages={data.messages}
    />
  );
}
