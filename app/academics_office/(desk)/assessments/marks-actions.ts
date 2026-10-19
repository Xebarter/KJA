"use server";

import { ACADEMICS_BASE, bandMidpoint, classLabel, classSection, kindLabel, logAcademics, mapBand, markbookClosed, num, refreshAcademics, requireAcademics, streamOf } from "@/lib/academics";
import { loadRoll } from "@/lib/academics-roll";
import { MarksBookError, interpretMark, parseMarksWorkbook } from "@/lib/marks-workbook";
import { isUuid } from "@/lib/students";

export type MarksPreview = {
  name: string;
  detail: string;
  sheets: { label: string; subjects: string[]; scores: number; missed: number; cleared: number }[];
  warnings: string[];
  issues: { where: string; message: string }[];
  issueCount: number;
  ready: number;
};

export type MarksImportResult = { error?: string; ok?: string; preview?: MarksPreview };

type PaperRow = {
  id: string;
  term_id: string;
  class_code: string;
  stream: string | null;
  subject_id: string;
  name: string;
  kind: string;
  max_score: number | string;
  held_on: string | null;
  status: string | null;
};

function shortDay(iso: string | null) {
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function nf(value: number) {
  return value.toLocaleString("en-GB");
}

export async function importMarks(formData: FormData): Promise<MarksImportResult> {
  const auth = await requireAcademics();
  if ("error" in auth) return { error: auth.error };
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose the completed marks workbook." };
  if (file.size > 8 * 1024 * 1024) return { error: "That workbook is too large." };
  if (!file.name.toLowerCase().endsWith(".xlsx")) return { error: "Upload the Excel workbook (.xlsx) downloaded from this page." };

  let parsed: Awaited<ReturnType<typeof parseMarksWorkbook>>;
  try {
    parsed = await parseMarksWorkbook(Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    return { error: error instanceof MarksBookError ? error.message : "That file could not be read. Download a fresh workbook from this page." };
  }

  const ids = parsed.paperIds.filter(isUuid);
  const papers: PaperRow[] = [];
  for (let index = 0; index < ids.length; index += 80) {
    const slice = ids.slice(index, index + 80);
    const result = await auth.supabase.from("assessments").select("id, term_id, class_code, stream, subject_id, name, kind, max_score, held_on, status").in("id", slice);
    if (result.error) return { error: "The markbooks in this workbook could not be checked." };
    papers.push(...((result.data || []) as PaperRow[]));
  }
  if (!papers.length) return { error: "This workbook does not match any markbooks still on the list." };
  const signature = new Set(papers.map((paper) => `${paper.term_id}|${paper.name}|${paper.kind}|${paper.held_on || ""}`));
  if (signature.size !== 1) return { error: "This workbook mixes more than one assessment. Download a fresh sheet." };

  const nursery = papers.some((paper) => classSection(paper.class_code) === "nursery");
  const [roll, bandsQuery] = await Promise.all([
    loadRoll(auth.supabase, auth.user.id),
    nursery
      ? auth.supabase.from("grade_bands").select("*").eq("section", "nursery").order("sort_order")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (bandsQuery.error) return { error: "The progress bands could not be loaded." };
  const bands = ((bandsQuery.data || []) as Record<string, unknown>[]).map(mapBand).map((band) => ({ label: band.label, midpoint: bandMidpoint(band) }));
  const byPaper = new Map(papers.map((paper) => [paper.id, paper]));
  const byPupil = new Map(roll.map((pupil) => [pupil.id, pupil]));
  const sample = papers[0];
  const warnings: string[] = [];
  const warned = new Set<string>();
  const issues = parsed.issues.map((issue) => ({
    where: [issue.sheet, issue.cell, issue.pupil].filter(Boolean).join(" · "),
    message: issue.message,
  }));
  let issueCount = parsed.issueCount;
  const problem = (where: string, message: string) => {
    issueCount += 1;
    if (issues.length < 40) issues.push({ where, message });
  };
  for (const gap of parsed.missing) {
    warnings.push(gap.count === 1
      ? `${gap.label} is missing 1 pupil from the downloaded roll. That saved mark stays as it is.`
      : `${gap.label} is missing ${nf(gap.count)} pupils from the downloaded roll. Their saved marks stay as they are.`);
  }

  const tally = new Map(parsed.sheets.map((sheet) => [sheet.name, { label: sheet.label, subjects: sheet.subjects, scores: 0, missed: 0, cleared: 0 }]));
  const rows: { assessment_id: string; student_id: string; score: number | null; missed: boolean }[] = [];
  const seen = new Set<string>();

  for (const entry of parsed.entries) {
    const where = [entry.label, entry.cell, entry.pupil].filter(Boolean).join(" · ");
    const paper = byPaper.get(entry.paperId);
    if (!paper) {
      problem(where, "This markbook is no longer on the list.");
      continue;
    }
    const label = classLabel(paper.class_code, paper.stream);
    if (markbookClosed(paper.status)) {
      const warning = `${entry.subject} for ${label} is locked, so those cells were left unchanged.`;
      if (!warned.has(warning)) {
        warned.add(warning);
        warnings.push(warning);
      }
      continue;
    }
    if (seen.has(`${paper.id}|${entry.studentId}`)) {
      problem(where, `${entry.pupil || "This pupil"} has two marks for ${entry.subject}.`);
      continue;
    }
    const pupil = byPupil.get(entry.studentId);
    if (!pupil) {
      problem(where, `${entry.pupil || "This pupil"} is not on the active roll.`);
      continue;
    }
    if ((pupil.class_code || "") !== paper.class_code || streamOf(pupil.stream) !== streamOf(paper.stream)) {
      problem(where, `${pupil.full_name} is now in ${classLabel(pupil.class_code, pupil.stream)}, so this mark was not taken.`);
      continue;
    }
    const nurseryPaper = classSection(paper.class_code) === "nursery";
    const decision = interpretMark(entry.raw, nurseryPaper, num(paper.max_score) ?? 100, bands);
    if (decision.kind === "bad") {
      problem(where, decision.message);
      continue;
    }
    seen.add(`${paper.id}|${entry.studentId}`);
    const bucket = tally.get(entry.sheet);
    if (decision.kind === "missed") {
      rows.push({ assessment_id: paper.id, student_id: entry.studentId, score: null, missed: true });
      if (bucket) bucket.missed += 1;
    } else if (decision.kind === "clear") {
      rows.push({ assessment_id: paper.id, student_id: entry.studentId, score: null, missed: false });
      if (bucket) bucket.cleared += 1;
    } else {
      rows.push({ assessment_id: paper.id, student_id: entry.studentId, score: decision.score, missed: false });
      if (bucket) bucket.scores += 1;
    }
  }

  const preview: MarksPreview = {
    name: sample.name,
    detail: [kindLabel(sample.kind), shortDay(sample.held_on)].filter(Boolean).join(" · "),
    sheets: [...tally.values()],
    warnings,
    issues,
    issueCount,
    ready: rows.length,
  };
  if (formData.get("intent") !== "commit") return { preview };
  if (issueCount) return { preview };
  if (!rows.length) {
    return { preview, error: warnings[0] || "The workbook has no marks to save. Enter a mark, ABS, or CLEAR, then upload it again." };
  }

  let saved = 0;
  for (let index = 0; index < rows.length; index += 200) {
    const slice = rows.slice(index, index + 200);
    const { error } = await auth.supabase.from("assessment_scores").upsert(slice, { onConflict: "assessment_id,student_id" });
    if (error) {
      return { error: saved ? "Some marks were saved, then the upload stopped. Check the markbooks and upload the file again." : error.message };
    }
    saved += slice.length;
  }
  const submitIds = [...new Set(rows.filter((row) => row.missed || row.score !== null).map((row) => row.assessment_id))];
  for (let index = 0; index < submitIds.length; index += 80) {
    const slice = submitIds.slice(index, index + 80);
    const { error } = await auth.supabase.from("assessments").update({ status: "submitted" }).in("id", slice).eq("status", "open");
    if (error) return { error: "The marks were saved, but they could not be submitted. Open the class marksheet and approve the subjects that are complete." };
  }
  const scores = rows.filter((row) => !row.missed && row.score !== null).length;
  const missed = rows.filter((row) => row.missed).length;
  const cleared = rows.filter((row) => !row.missed && row.score === null).length;
  const lead = scores
    ? `Submitted ${nf(scores)} ${scores === 1 ? "mark" : "marks"} for ${sample.name}.`
    : missed
      ? `Submitted ${nf(missed)} ${missed === 1 ? "absence" : "absences"} for ${sample.name}.`
      : `Updated ${sample.name}.`;
  const extra = [
    missed && scores ? `${nf(missed)} ${missed === 1 ? "pupil was" : "pupils were"} marked absent.` : "",
    cleared ? `${nf(cleared)} ${cleared === 1 ? "saved mark was" : "saved marks were"} removed.` : "",
    submitIds.length ? "They are submitted on the class marksheet." : "",
  ].filter(Boolean).join(" ");
  await logAcademics(auth.supabase, auth.user.id, {
    kind: "marks",
    body: submitIds.length
      ? `Submitted marks for ${sample.name} from a workbook (${nf(rows.length)} ${rows.length === 1 ? "cell" : "cells"}).`
      : `Uploaded marks for ${sample.name} (${nf(rows.length)} ${rows.length === 1 ? "cell" : "cells"}).`,
  });
  refreshAcademics(`${ACADEMICS_BASE}/assessments`);
  return { ok: extra ? `${lead} ${extra}` : lead };
}
