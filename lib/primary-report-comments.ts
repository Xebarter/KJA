import type { SupabaseClient } from "@supabase/supabase-js";
import { streamOf } from "@/lib/academics";
import { operationalCampus } from "@/lib/campuses";

const COMMENT_MAX = 2000;

export type PrimaryClassCommentRow = {
  id: string;
  student_id: string;
  term_id: string;
  campus: string;
  class_code: string | null;
  stream: string;
  comment: string | null;
  updated_at: string;
};

export type PrimarySubjectCommentRow = {
  id: string;
  student_id: string;
  term_id: string;
  subject_id: string;
  campus: string;
  class_code: string | null;
  stream: string;
  comment: string | null;
  updated_at: string;
};

export type PrimaryActivityCommentRow = {
  id: string;
  student_id: string;
  term_id: string;
  slot: number;
  subject_id: string | null;
  activity_name: string | null;
  campus: string;
  class_code: string | null;
  stream: string;
  comment: string | null;
  updated_at: string;
};

export type PrimaryClassCommentUpsert = {
  student_id: string;
  term_id: string;
  campus?: string | null;
  class_code?: string | null;
  stream?: string | null;
  comment: string | null;
  updated_by?: string | null;
};

export type PrimarySubjectCommentUpsert = PrimaryClassCommentUpsert & {
  subject_id: string;
};

export type PrimaryActivityCommentUpsert = PrimaryClassCommentUpsert & {
  slot: number;
  subject_id?: string | null;
  activity_name?: string | null;
};

/** Store first, then card/line text. */
export function resolvePrimaryComment(
  storeComment: string | null | undefined,
  cardComment: string | null | undefined,
): string | null {
  const store = (storeComment || "").trim();
  if (store) return store;
  const card = (cardComment || "").trim();
  return card || null;
}

function trimComment(value: string | null | undefined) {
  const text = (value || "").trim();
  return text ? text.slice(0, COMMENT_MAX) : null;
}

async function pullInChunks<T>(
  studentIds: string[] | null | undefined,
  pull: (slice?: string[]) => Promise<T[]>,
): Promise<T[]> {
  const rows: T[] = [];
  if (studentIds?.length) {
    for (let index = 0; index < studentIds.length; index += 80) {
      rows.push(...(await pull(studentIds.slice(index, index + 80))));
    }
    return rows;
  }
  return pull();
}

function filterStream<T extends { stream: string }>(rows: T[], stream?: string) {
  if (stream === undefined) return rows;
  const want = streamOf(stream);
  return rows.filter((row) => streamOf(row.stream) === want);
}

export async function loadPrimaryClassComments(
  supabase: SupabaseClient,
  input: { termId: string; classCode?: string; stream?: string; studentIds?: string[] },
): Promise<PrimaryClassCommentRow[]> {
  const rows = await pullInChunks(input.studentIds, async (slice) => {
    let query = supabase
      .from("primary_class_comments")
      .select("id, student_id, term_id, campus, class_code, stream, comment, updated_at")
      .eq("term_id", input.termId);
    if (input.classCode) query = query.eq("class_code", input.classCode);
    if (slice?.length) query = query.in("student_id", slice);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []) as PrimaryClassCommentRow[];
  });
  return filterStream(rows, input.stream);
}

export async function loadPrimarySubjectComments(
  supabase: SupabaseClient,
  input: { termId: string; classCode?: string; stream?: string; subjectId?: string; studentIds?: string[] },
): Promise<PrimarySubjectCommentRow[]> {
  const rows = await pullInChunks(input.studentIds, async (slice) => {
    let query = supabase
      .from("primary_subject_comments")
      .select("id, student_id, term_id, subject_id, campus, class_code, stream, comment, updated_at")
      .eq("term_id", input.termId);
    if (input.classCode) query = query.eq("class_code", input.classCode);
    if (input.subjectId) query = query.eq("subject_id", input.subjectId);
    if (slice?.length) query = query.in("student_id", slice);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []) as PrimarySubjectCommentRow[];
  });
  return filterStream(rows, input.stream);
}

export async function loadPrimaryActivityComments(
  supabase: SupabaseClient,
  input: { termId: string; classCode?: string; stream?: string; studentIds?: string[] },
): Promise<PrimaryActivityCommentRow[]> {
  const rows = await pullInChunks(input.studentIds, async (slice) => {
    let query = supabase
      .from("primary_activity_comments")
      .select("id, student_id, term_id, slot, subject_id, activity_name, campus, class_code, stream, comment, updated_at")
      .eq("term_id", input.termId);
    if (input.classCode) query = query.eq("class_code", input.classCode);
    if (slice?.length) query = query.in("student_id", slice);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []) as PrimaryActivityCommentRow[];
  });
  return filterStream(rows, input.stream);
}

export async function upsertPrimaryClassComments(
  supabase: SupabaseClient,
  entries: PrimaryClassCommentUpsert[],
) {
  if (!entries.length) return;
  const now = new Date().toISOString();
  const payload = entries.map((entry) => ({
    student_id: entry.student_id,
    term_id: entry.term_id,
    campus: operationalCampus(entry.campus),
    class_code: entry.class_code ?? null,
    stream: streamOf(entry.stream),
    comment: trimComment(entry.comment),
    updated_at: now,
    updated_by: entry.updated_by ?? null,
  }));
  for (let index = 0; index < payload.length; index += 40) {
    const slice = payload.slice(index, index + 40);
    const { error } = await supabase.from("primary_class_comments").upsert(slice, { onConflict: "student_id,term_id" });
    if (error) throw new Error(error.message);
  }
}

export async function upsertPrimarySubjectComments(
  supabase: SupabaseClient,
  entries: PrimarySubjectCommentUpsert[],
) {
  if (!entries.length) return;
  const now = new Date().toISOString();
  const payload = entries.map((entry) => ({
    student_id: entry.student_id,
    term_id: entry.term_id,
    subject_id: entry.subject_id,
    campus: operationalCampus(entry.campus),
    class_code: entry.class_code ?? null,
    stream: streamOf(entry.stream),
    comment: trimComment(entry.comment),
    updated_at: now,
    updated_by: entry.updated_by ?? null,
  }));
  for (let index = 0; index < payload.length; index += 40) {
    const slice = payload.slice(index, index + 40);
    const { error } = await supabase
      .from("primary_subject_comments")
      .upsert(slice, { onConflict: "student_id,term_id,subject_id" });
    if (error) throw new Error(error.message);
  }
}

export async function upsertPrimaryActivityComments(
  supabase: SupabaseClient,
  entries: PrimaryActivityCommentUpsert[],
) {
  if (!entries.length) return;
  const now = new Date().toISOString();
  const payload = entries.map((entry) => ({
    student_id: entry.student_id,
    term_id: entry.term_id,
    slot: entry.slot,
    subject_id: entry.subject_id ?? null,
    activity_name: entry.activity_name?.trim() || null,
    campus: operationalCampus(entry.campus),
    class_code: entry.class_code ?? null,
    stream: streamOf(entry.stream),
    comment: trimComment(entry.comment),
    updated_at: now,
    updated_by: entry.updated_by ?? null,
  }));
  for (let index = 0; index < payload.length; index += 40) {
    const slice = payload.slice(index, index + 40);
    const { error } = await supabase
      .from("primary_activity_comments")
      .upsert(slice, { onConflict: "student_id,term_id,slot" });
    if (error) throw new Error(error.message);
  }
}

export async function mirrorPrimaryClassCommentsOntoCards(
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
    const trimmed = trimComment(next);
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

export async function mirrorPrimarySubjectCommentsOntoLines(
  supabase: SupabaseClient,
  input: {
    termId: string;
    studentIds: string[];
    /** student_id|subject_id → comment */
    commentsByKey: Map<string, string | null>;
    clearBlank?: boolean;
  },
) {
  if (!input.studentIds.length || !input.commentsByKey.size) return;
  const cards: { id: string; student_id: string; status: string }[] = [];
  for (let index = 0; index < input.studentIds.length; index += 80) {
    const slice = input.studentIds.slice(index, index + 80);
    const { data, error } = await supabase
      .from("report_cards")
      .select("id, student_id, status")
      .eq("term_id", input.termId)
      .in("student_id", slice);
    if (error) throw new Error(error.message);
    cards.push(...((data || []) as typeof cards));
  }
  const writable = cards.filter((card) => card.status !== "published");
  if (!writable.length) return;

  const cardIds = writable.map((card) => card.id);
  const lines: { report_card_id: string; subject_id: string; teacher_comment: string | null }[] = [];
  for (let index = 0; index < cardIds.length; index += 80) {
    const slice = cardIds.slice(index, index + 80);
    const { data, error } = await supabase
      .from("report_lines")
      .select("report_card_id, subject_id, teacher_comment")
      .in("report_card_id", slice);
    if (error) throw new Error(error.message);
    lines.push(...((data || []) as typeof lines));
  }

  const byCard = new Map(writable.map((card) => [card.id, card.student_id]));
  for (const line of lines) {
    const studentId = byCard.get(line.report_card_id);
    if (!studentId) continue;
    const key = `${studentId}|${line.subject_id}`;
    if (!input.commentsByKey.has(key)) continue;
    const trimmed = trimComment(input.commentsByKey.get(key));
    if (!input.clearBlank && trimmed === null && !(line.teacher_comment || "").trim()) continue;
    if ((line.teacher_comment || "").trim() === (trimmed || "")) continue;
    const { error } = await supabase
      .from("report_lines")
      .update({ teacher_comment: trimmed })
      .eq("report_card_id", line.report_card_id)
      .eq("subject_id", line.subject_id);
    if (error) throw new Error(error.message);
  }
}

export async function mirrorPrimaryActivityCommentsOntoSlots(
  supabase: SupabaseClient,
  input: {
    termId: string;
    studentIds: string[];
    /** student_id|slot → { comment, activity_name?, subject_id? } */
    commentsByKey: Map<
      string,
      { comment: string | null; activity_name?: string | null; subject_id?: string | null }
    >;
    clearBlank?: boolean;
  },
) {
  if (!input.studentIds.length || !input.commentsByKey.size) return;
  const cards: { id: string; student_id: string; status: string }[] = [];
  for (let index = 0; index < input.studentIds.length; index += 80) {
    const slice = input.studentIds.slice(index, index + 80);
    const { data, error } = await supabase
      .from("report_cards")
      .select("id, student_id, status")
      .eq("term_id", input.termId)
      .in("student_id", slice);
    if (error) throw new Error(error.message);
    cards.push(...((data || []) as typeof cards));
  }
  const writable = cards.filter((card) => card.status !== "published");
  if (!writable.length) return;

  const cardIds = writable.map((card) => card.id);
  const rows: {
    report_card_id: string;
    slot: number;
    comment: string | null;
    activity_name: string | null;
    subject_id: string | null;
  }[] = [];
  for (let index = 0; index < cardIds.length; index += 80) {
    const slice = cardIds.slice(index, index + 80);
    const { data, error } = await supabase
      .from("report_card_activities")
      .select("report_card_id, slot, comment, activity_name, subject_id")
      .in("report_card_id", slice);
    if (error) throw new Error(error.message);
    rows.push(...((data || []) as typeof rows));
  }

  const byCard = new Map(writable.map((card) => [card.id, card.student_id]));
  for (const row of rows) {
    const studentId = byCard.get(row.report_card_id);
    if (!studentId) continue;
    const key = `${studentId}|${row.slot}`;
    if (!input.commentsByKey.has(key)) continue;
    const next = input.commentsByKey.get(key)!;
    const trimmed = trimComment(next.comment);
    if (!input.clearBlank && trimmed === null && !(row.comment || "").trim()) continue;
    if ((row.comment || "").trim() === (trimmed || "")) continue;
    const patch: Record<string, unknown> = { comment: trimmed };
    if (next.activity_name != null && next.activity_name.trim()) patch.activity_name = next.activity_name.trim();
    if (next.subject_id) patch.subject_id = next.subject_id;
    const { error } = await supabase
      .from("report_card_activities")
      .update(patch)
      .eq("report_card_id", row.report_card_id)
      .eq("slot", row.slot);
    if (error) throw new Error(error.message);
  }
}

/** Map student_id → class comment for prepare / print. */
export async function primaryClassCommentMapForTerm(
  supabase: SupabaseClient,
  termId: string,
  studentIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!studentIds.length) return map;
  try {
    const rows = await loadPrimaryClassComments(supabase, { termId, studentIds });
    for (const row of rows) {
      const text = (row.comment || "").trim();
      if (text) map.set(row.student_id, text);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/primary_class_comments|schema cache|does not exist/i.test(message)) return map;
    throw error;
  }
  return map;
}

/** Map student_id|subject_id → subject comment. */
export async function primarySubjectCommentMapForTerm(
  supabase: SupabaseClient,
  termId: string,
  studentIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!studentIds.length) return map;
  try {
    const rows = await loadPrimarySubjectComments(supabase, { termId, studentIds });
    for (const row of rows) {
      const text = (row.comment || "").trim();
      if (text) map.set(`${row.student_id}|${row.subject_id}`, text);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/primary_subject_comments|schema cache|does not exist/i.test(message)) return map;
    throw error;
  }
  return map;
}

/** Map student_id|slot → activity comment. */
export async function primaryActivityCommentMapForTerm(
  supabase: SupabaseClient,
  termId: string,
  studentIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!studentIds.length) return map;
  try {
    const rows = await loadPrimaryActivityComments(supabase, { termId, studentIds });
    for (const row of rows) {
      const text = (row.comment || "").trim();
      if (text) map.set(`${row.student_id}|${row.slot}`, text);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/primary_activity_comments|schema cache|does not exist/i.test(message)) return map;
    throw error;
  }
  return map;
}

export function isPrimaryStoreMissing(message: string) {
  return /primary_class_comments|primary_subject_comments|primary_activity_comments|schema cache|does not exist/i.test(
    message,
  );
}
