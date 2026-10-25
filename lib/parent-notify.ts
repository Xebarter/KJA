/** Notify linked parent portal accounts when pupils receive school deliveries. */

type NotifyClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ error: { message: string } | null; data?: unknown }>;
};

export async function notifyClassParents(
  supabase: NotifyClient,
  input: {
    classCode: string;
    stream?: string | null;
    title: string;
    body?: string | null;
    href?: string;
    kind?: string;
  },
) {
  const { error } = await supabase.rpc("notify_class_parents", {
    p_class_code: input.classCode,
    p_stream: input.stream || "",
    p_title: input.title,
    p_body: input.body || null,
    p_href: input.href || "/account/notifications",
    p_kind: input.kind || "school",
  });
  if (error && /notify_class_parents|schema cache|does not exist/i.test(error.message)) {
    // Migration 0051 not applied yet — pupils still get notified by the caller.
    return;
  }
  if (error) throw new Error(error.message);
}

export async function notifyStudentParents(
  supabase: NotifyClient,
  input: {
    studentIds: string[];
    title: string;
    body?: string | null;
    href?: string;
    kind?: string;
  },
) {
  const ids = [...new Set(input.studentIds.filter(Boolean))];
  if (!ids.length) return;
  const { error } = await supabase.rpc("notify_student_parents", {
    p_student_ids: ids,
    p_title: input.title,
    p_body: input.body || null,
    p_href: input.href || "/account/notifications",
    p_kind: input.kind || "school",
  });
  if (error && /notify_student_parents|schema cache|does not exist/i.test(error.message)) {
    return;
  }
  if (error) throw new Error(error.message);
}
