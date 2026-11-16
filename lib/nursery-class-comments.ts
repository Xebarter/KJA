import type { SupabaseClient } from "@supabase/supabase-js";
import { streamOf } from "@/lib/academics";
import { operationalCampus } from "@/lib/campuses";

export type NurseryClassCommentRow = {
  id: string;
  student_id: string;
  term_id: string;
  campus: string;
  class_code: string | null;
  stream: string;
  comment: string | null;
  updated_at: string;
};

export type NurseryClassCommentUpsert = {
  student_id: string;
  term_id: string;
  campus?: string | null;
  class_code?: string | null;
  stream?: string | null;
  comment: string | null;
  updated_by?: string | null;
};

/**
 * Display / prefill order: manual store first, then report-card text
 * (including auto-generated engine comments).
 */
export function resolveNurseryClassTeacherComment(
  storeComment: string | null | undefined,
  cardComment: string | null | undefined,
): string | null {
  const store = (storeComment || "").trim();
  if (store) return store;
  const card = (cardComment || "").trim();
  return card || null;
}

/** Merge store + card maps into student_id → resolved comment. */
export function mergeNurseryCommentMaps(
  storeByStudent: Map<string, string | null | undefined>,
  cardByStudent: Map<string, string | null | undefined>,
  studentIds: string[],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const id of studentIds) {
    const resolved = resolveNurseryClassTeacherComment(storeByStudent.get(id), cardByStudent.get(id));
    if (resolved) out.set(id, resolved);
  }
  return out;
}

/** Load nursery class comments for a term (optionally filtered by class/stream). */
export async function loadNurseryClassComments(
  supabase: SupabaseClient,
  input: { termId: string; classCode?: string; stream?: string; studentIds?: string[] },
): Promise<NurseryClassCommentRow[]> {
  const rows: NurseryClassCommentRow[] = [];
  const studentIds = input.studentIds?.length ? [...new Set(input.studentIds)] : null;

  const pull = async (slice?: string[]) => {
    let query = supabase
      .from("nursery_class_comments")
      .select("id, student_id, term_id, campus, class_code, stream, comment, updated_at")
      .eq("term_id", input.termId);
    if (input.classCode) query = query.eq("class_code", input.classCode);
    if (slice?.length) query = query.in("student_id", slice);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []) as NurseryClassCommentRow[];
  };

  if (studentIds) {
    for (let index = 0; index < studentIds.length; index += 80) {
      rows.push(...(await pull(studentIds.slice(index, index + 80))));
    }
  } else {
    rows.push(...(await pull()));
  }

  if (input.stream === undefined) return rows;
  const stream = streamOf(input.stream);
  return rows.filter((row) => streamOf(row.stream) === stream);
}

/** Upsert one or more nursery class comments (source of truth). */
export async function upsertNurseryClassComments(
  supabase: SupabaseClient,
  entries: NurseryClassCommentUpsert[],
) {
  if (!entries.length) return;
  const now = new Date().toISOString();
  const payload = entries.map((entry) => ({
    student_id: entry.student_id,
    term_id: entry.term_id,
    campus: operationalCampus(entry.campus),
    class_code: entry.class_code ?? null,
    stream: streamOf(entry.stream),
    comment: entry.comment?.trim() ? entry.comment.trim().slice(0, 2000) : null,
    updated_at: now,
    updated_by: entry.updated_by ?? null,
  }));

  for (let index = 0; index < payload.length; index += 40) {
    const slice = payload.slice(index, index + 40);
    const { error } = await supabase
      .from("nursery_class_comments")
      .upsert(slice, { onConflict: "student_id,term_id" });
    if (error) throw new Error(error.message);
  }
}

/**
 * Mirror store comments onto non-published report cards for the same pupils/term.
 * Does not clear a card when the store comment is null unless `clearBlank` is true.
 */
export async function mirrorNurseryCommentsOntoCards(
  supabase: SupabaseClient,
  input: {
    termId: string;
    studentIds: string[];
    commentsByStudent: Map<string, string | null>;
    clearBlank?: boolean;
  },
) {
  if (!input.studentIds.length) return;
  const cards: { id: string; student_id: string; status: string; class_teacher_comment: string | null }[] = [];
  for (let index = 0; index < input.studentIds.length; index += 80) {
    const slice = input.studentIds.slice(index, index + 80);
    const { data, error } = await supabase
      .from("report_cards")
      .select("id, student_id, status, class_teacher_comment")
      .eq("term_id", input.termId)
      .in("student_id", slice);
    if (error) throw new Error(error.message);
    cards.push(...((data || []) as typeof cards));
  }

  const now = new Date().toISOString();
  for (const card of cards) {
    if (card.status === "published") continue;
    if (!input.commentsByStudent.has(card.student_id)) continue;
    const next = input.commentsByStudent.get(card.student_id) ?? null;
    const trimmed = next?.trim() ? next.trim().slice(0, 2000) : null;
    if (!input.clearBlank && trimmed === null && !(card.class_teacher_comment || "").trim()) continue;
    if ((card.class_teacher_comment || "").trim() === (trimmed || "")) continue;
    const { error } = await supabase
      .from("report_cards")
      .update({ class_teacher_comment: trimmed, updated_at: now })
      .eq("id", card.id)
      .neq("status", "published");
    if (error) throw new Error(error.message);
  }
}

/** Map student_id → comment for a term (used by prepare / print fallback). */
export async function nurseryCommentMapForTerm(
  supabase: SupabaseClient,
  termId: string,
  studentIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!studentIds.length) return map;
  try {
    const rows = await loadNurseryClassComments(supabase, { termId, studentIds });
    for (const row of rows) {
      const text = (row.comment || "").trim();
      if (text) map.set(row.student_id, text);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/nursery_class_comments|schema cache|does not exist/i.test(message)) return map;
    throw error;
  }
  return map;
}
