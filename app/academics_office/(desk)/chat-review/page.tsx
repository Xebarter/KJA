import { hideStudentMessage } from "@/app/academics_office/(desk)/chat-review/actions";
import { AcademicsGate } from "@/components/academics/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { ChatReviewDesk } from "@/components/academics/ChatReviewDesk";
import { classLabel, groupPupils } from "@/lib/academics";
import { openAcademics } from "@/lib/academics-access";
import { loadRoll } from "@/lib/academics-roll";
import "./chat-review.css";

export const metadata = { title: "Chat review" };

export default async function ChatReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Chat review" state={opened} />;
  const { supabase, office, user } = opened.auth;
  if (!office) {
    return (
      <div className="app-page">
        <PageHeader kicker="Safeguarding" icon="fa-shield-halved" title="Chat review" description="Office staff only." />
        <p className="admin-empty">Chat review is for academics office staff.</p>
      </div>
    );
  }

  const query = await searchParams;
  const classKey = String(Array.isArray(query.class) ? query.class[0] : query.class || "");
  const flaggedOnly = String(Array.isArray(query.flagged) ? query.flagged[0] : query.flagged || "") === "1";

  const pupils = await loadRoll(supabase, user.id);
  const groups = groupPupils(pupils);
  const classOptions = groups.map((g) => ({
    value: `${g.code}|${g.stream}`,
    label: classLabel(g.code, g.stream),
    classCode: g.code,
    stream: g.stream,
  }));

  const match = classOptions.find((c) => c.value === classKey) || classOptions[0];
  let studentIds: string[] = [];
  if (match) {
    studentIds = pupils
      .filter((p) => p.class_code === match.classCode && (p.stream || "") === (match.stream || ""))
      .map((p) => p.id);
  }

  const names = new Map(pupils.map((p) => [p.id, p.full_name]));

  let messages: {
    id: string;
    body: string;
    flagged: boolean;
    hidden: boolean;
    created_at: string;
    sender_student_id: string;
    conversation_id: string;
  }[] = [];
  let loadError: string | null = null;

  if (studentIds.length) {
    const convs = await supabase
      .from("student_conversations")
      .select("id")
      .or(
        studentIds.map((id) => `student_low_id.eq.${id}`).join(",") +
          "," +
          studentIds.map((id) => `student_high_id.eq.${id}`).join(","),
      )
      .limit(200);
    if (convs.error) loadError = convs.error.message;
    const convIds = (convs.data || []).map((c) => c.id);
    if (convIds.length) {
      const result = await supabase
        .from("student_messages")
        .select("id, body, flagged, hidden, created_at, sender_student_id, conversation_id")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false })
        .limit(120);
      if (result.error) loadError = result.error.message;
      else messages = result.data || [];
    }
  }

  if (loadError && /student_messages|student_conversations|0029/i.test(loadError)) {
    return <AcademicsGate title="Chat review" state={{ notice: "schema", message: `${loadError} — run supabase/0029_student_portal.sql` }} />;
  }

  const rows = messages.map((msg) => ({
    ...msg,
    sender_name: names.get(msg.sender_student_id) || "Student",
  }));

  return (
    <div className="app-page scr-page">
      <PageHeader
        kicker="Safeguarding"
        icon="fa-shield-halved"
        title="Chat review"
        description={
          <>
            Check classmate messages by class. <strong>Flagged</strong> notes need a look. Hide anything that should not stay visible to pupils.
          </>
        }
      />
      <ChatReviewDesk
        classes={classOptions}
        selected={match?.value || ""}
        flaggedOnly={flaggedOnly}
        rows={rows}
        hideAction={hideStudentMessage}
      />
    </div>
  );
}
