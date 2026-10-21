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
      <div className="sm-wrap">
        <div className="sm-gate">
          <span aria-hidden="true">
            <i className="fa-solid fa-comments" />
          </span>
          <h1>Messages unavailable</h1>
          <p>Your pupil record is not linked yet, so messaging is unavailable.</p>
        </div>
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
