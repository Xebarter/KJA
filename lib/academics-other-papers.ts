import { mapSubject, num, streamOf, subjectFits } from "@/lib/academics";
import { isCocurricularSubject } from "@/lib/subject-kind";
import { fetchAll } from "@/lib/students";
import type { SupabaseClient } from "@supabase/supabase-js";

type PaperRow = {
  id: string;
  class_code: string;
  stream: string | null;
  subject_id: string;
  name: string;
  kind: string;
  max_score: number | string;
  weight: number | string;
  held_on: string | null;
  status: string | null;
};

function sittingKey(paper: Pick<PaperRow, "name" | "kind" | "held_on">) {
  return `${paper.name.trim().toLowerCase()}|${paper.kind}|${paper.held_on || ""}`;
}

/**
 * Add missing markbooks for Other (cocurricular) subjects onto every existing sitting.
 * Assessments set before Other subjects were added never included them — this fills the gap
 * so they appear on the Marks workbook card.
 */
export async function ensureOtherMarkbooks(
  supabase: SupabaseClient,
  termId: string,
  userId: string,
): Promise<{ added: number; otherSubjectCount: number }> {
  const [papers, subjectRows] = await Promise.all([
    fetchAll<PaperRow>((from, to) =>
      supabase
        .from("assessments")
        .select("id, class_code, stream, subject_id, name, kind, max_score, weight, held_on, status")
        .eq("term_id", termId)
        .order("id")
        .range(from, to),
    ),
    supabase.from("subjects").select("*").eq("active", true).order("sort_order"),
  ]);

  if (subjectRows.error) throw new Error(subjectRows.error.message);
  const subjects = ((subjectRows.data || []) as Record<string, unknown>[]).map(mapSubject);
  const otherSubjects = subjects.filter((subject) => isCocurricularSubject(subject));
  if (!otherSubjects.length || !papers.length) {
    return { added: 0, otherSubjectCount: otherSubjects.length };
  }

  const taken = new Set(
    papers.map((paper) => `${paper.class_code}|${streamOf(paper.stream)}|${paper.subject_id}|${sittingKey(paper)}`),
  );

  /** One template paper per sitting × class × stream (for weight / max / date). */
  const templates = new Map<string, PaperRow>();
  for (const paper of papers) {
    const key = `${sittingKey(paper)}|${paper.class_code}|${streamOf(paper.stream)}`;
    if (!templates.has(key)) templates.set(key, paper);
  }

  const fresh: Record<string, unknown>[] = [];
  for (const template of templates.values()) {
    for (const subject of otherSubjects) {
      if (!subjectFits(subject, template.class_code)) continue;
      const key = `${template.class_code}|${streamOf(template.stream)}|${subject.id}|${sittingKey(template)}`;
      if (taken.has(key)) continue;
      taken.add(key);
      fresh.push({
        term_id: termId,
        class_code: template.class_code,
        stream: streamOf(template.stream),
        subject_id: subject.id,
        name: template.name,
        kind: template.kind,
        max_score: num(template.max_score) ?? 100,
        weight: num(template.weight) ?? 1,
        held_on: template.held_on,
        status: "open",
        created_by: userId,
      });
    }
  }

  for (let index = 0; index < fresh.length; index += 80) {
    const slice = fresh.slice(index, index + 80);
    const { error } = await supabase.from("assessments").insert(slice);
    if (error) {
      // Older schemas may not have status yet — retry without it.
      if (/status|42703/i.test(error.message)) {
        const plain = slice.map(({ status: _status, ...row }) => row);
        const again = await supabase.from("assessments").insert(plain);
        if (again.error) throw new Error(again.error.message);
        continue;
      }
      throw new Error(error.message);
    }
  }

  return { added: fresh.length, otherSubjectCount: otherSubjects.length };
}
