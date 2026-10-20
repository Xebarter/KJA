import { bandMidpoint, classLabel, classOrder, classSection, kampalaToday, kindLabel, mapBand, markbookClosed, num, requireAcademics, streamOf } from "@/lib/academics";
import { loadRoll } from "@/lib/academics-roll";
import { buildMarksWorkbook, marksWorkbookFilename, MarksBookError, type MarksBookBand, type MarksBookPaper, type MarksBookScore } from "@/lib/marks-workbook";
import { isCocurricularSubject } from "@/lib/subject-kind";
import { className, fetchAll, isUuid } from "@/lib/students";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

function longDay(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function shortDay(iso: string | null) {
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export async function POST(request: Request) {
  const auth = await requireAcademics();
  if ("error" in auth) return new Response(auth.error, { status: 401 });
  let body: { papers?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response("Choose at least one subject.", { status: 400 });
  }
  const ids = [...new Set((Array.isArray(body.papers) ? body.papers : []).filter((id): id is string => typeof id === "string" && isUuid(id)))];
  if (!ids.length) return new Response("Choose at least one subject.", { status: 400 });
  if (ids.length > 250) return new Response("Choose 250 markbooks or fewer for one workbook.", { status: 400 });

  try {
    const papers: PaperRow[] = [];
    for (let index = 0; index < ids.length; index += 80) {
      const slice = ids.slice(index, index + 80);
      const result = await auth.supabase.from("assessments").select("id, term_id, class_code, stream, subject_id, name, kind, max_score, held_on, status").in("id", slice);
      if (result.error) return new Response("The markbooks could not be loaded.", { status: 500 });
      papers.push(...((result.data || []) as PaperRow[]));
    }
    if (papers.length !== ids.length) return new Response("Some of those markbooks are no longer on the list.", { status: 400 });
    const signature = new Set(papers.map((paper) => `${paper.term_id}|${paper.name}|${paper.kind}|${paper.held_on || ""}`));
    if (signature.size !== 1) return new Response("Choose subjects from one assessment.", { status: 400 });
    const open = papers.filter((paper) => !markbookClosed(paper.status));
    if (!open.length) return new Response("Those markbooks are locked. Unlock them on the class marksheet before downloading a sheet.", { status: 400 });

    const termId = String(papers[0].term_id);
    const subjectIds = [...new Set(open.map((paper) => paper.subject_id))];
    const [termQuery, subjectQuery, roll, bandsQuery] = await Promise.all([
      auth.supabase.from("fee_terms").select("label").eq("id", termId).maybeSingle(),
      auth.supabase.from("subjects").select("id, name, sort_order, kind, default_skills").in("id", subjectIds),
      loadRoll(auth.supabase, auth.user.id),
      open.some((paper) => classSection(paper.class_code) === "nursery")
        ? auth.supabase.from("grade_bands").select("*").eq("section", "nursery").order("sort_order")
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (subjectQuery.error) return new Response("The subjects could not be loaded.", { status: 500 });
    if (bandsQuery.error) return new Response("The progress bands could not be loaded.", { status: 500 });
    const subjectName = new Map((subjectQuery.data || []).map((subject) => [String(subject.id), String(subject.name)]));
    const subjectOrder = new Map((subjectQuery.data || []).map((subject) => [String(subject.id), num(subject.sort_order) ?? 0]));
    const subjectMeta = new Map((subjectQuery.data || []).map((subject) => {
      let raw = subject.default_skills;
      if (typeof raw === "string") {
        try { raw = JSON.parse(raw); } catch { raw = []; }
      }
      const skills = Array.isArray(raw)
        ? raw
            .map((item) => typeof item === "string" ? item.trim() : "")
            .filter(Boolean)
            .slice(0, 8)
        : [];
      return [String(subject.id), { kind: String(subject.kind || "core"), skills }] as const;
    }));
    const onRoll = new Set(roll.map((pupil) => `${pupil.class_code}|${streamOf(pupil.stream)}`));
    const usable = open.filter((paper) => onRoll.has(`${paper.class_code}|${streamOf(paper.stream)}`));
    if (!usable.length) return new Response("None of the chosen classes have pupils on roll.", { status: 400 });
    const scores: { assessment_id: string; student_id: string; score: number | null; missed: boolean; skills?: unknown }[] = [];
    for (let index = 0; index < usable.length; index += 80) {
      const slice = usable.slice(index, index + 80).map((paper) => paper.id);
      try {
        scores.push(...await fetchAll<{ assessment_id: string; student_id: string; score: number | null; missed: boolean; skills?: unknown }>((from, to) =>
          auth.supabase.from("assessment_scores").select("assessment_id, student_id, score, missed, skills").in("assessment_id", slice).order("assessment_id").range(from, to),
        ));
      } catch {
        scores.push(...await fetchAll<{ assessment_id: string; student_id: string; score: number | null; missed: boolean }>((from, to) =>
          auth.supabase.from("assessment_scores").select("assessment_id, student_id, score, missed").in("assessment_id", slice).order("assessment_id").range(from, to),
        ));
      }
    }

    const marks: MarksBookScore[] = scores.map((score) => ({
      assessmentId: score.assessment_id,
      studentId: score.student_id,
      score: num(score.score),
      missed: Boolean(score.missed),
      skills: Array.isArray(score.skills)
        ? score.skills
            .map((item) => {
              if (!item || typeof item !== "object") return null;
              const label = typeof (item as { label?: unknown }).label === "string" ? (item as { label: string }).label.trim() : "";
              if (!label) return null;
              return { label, acquired: Boolean((item as { acquired?: unknown }).acquired) };
            })
            .filter((item): item is { label: string; acquired: boolean } => Boolean(item))
        : [],
    }));

    const scoreSkillsByPaper = new Map<string, string[]>();
    for (const mark of marks) {
      for (const skill of mark.skills || []) {
        const list = scoreSkillsByPaper.get(mark.assessmentId) || [];
        if (!list.some((label) => label.toLowerCase() === skill.label.toLowerCase())) {
          list.push(skill.label);
          scoreSkillsByPaper.set(mark.assessmentId, list);
        }
      }
    }

    const bookPapers: MarksBookPaper[] = usable.map((paper) => {
      const meta = subjectMeta.get(paper.subject_id);
      const other = isCocurricularSubject(meta?.kind);
      const fromCatalogue = other ? meta?.skills || [] : [];
      const fromScores = other ? scoreSkillsByPaper.get(paper.id) || [] : [];
      const skills: string[] = [];
      for (const label of [...fromCatalogue, ...fromScores]) {
        if (!skills.some((row) => row.toLowerCase() === label.toLowerCase())) skills.push(label);
        if (skills.length >= 8) break;
      }
      return {
        id: paper.id,
        classCode: paper.class_code,
        className: className(paper.class_code),
        stream: streamOf(paper.stream),
        label: classLabel(paper.class_code, paper.stream),
        order: classOrder(paper.class_code) ?? 99,
        section: classSection(paper.class_code),
        subject: subjectName.get(paper.subject_id) || "Subject",
        maxScore: num(paper.max_score) ?? 100,
        sort: subjectOrder.get(paper.subject_id) ?? 0,
        skills,
        skillsFreeText: other && skills.length === 0,
      };
    });
    const bands: MarksBookBand[] = ((bandsQuery.data || []) as Record<string, unknown>[]).map(mapBand).map((band) => ({
      label: band.label,
      min: band.min_score,
      max: band.max_score,
      midpoint: bandMidpoint(band),
    }));
    const heldOn = shortDay(papers[0].held_on);
    const bytes = await buildMarksWorkbook({
      termId,
      term: termQuery.data?.label || "Current term",
      name: papers[0].name,
      kind: papers[0].kind,
      kindLabel: kindLabel(papers[0].kind),
      heldOn,
      heldOnIso: papers[0].held_on || "",
      preparedOn: longDay(kampalaToday()),
      papers: bookPapers,
      pupils: roll.map((pupil) => ({
        id: pupil.id,
        number: pupil.student_number || "",
        name: pupil.full_name,
        classCode: pupil.class_code || "",
        stream: streamOf(pupil.stream),
      })),
      scores: marks,
      bands,
    });
    const labels = [...new Set(bookPapers.map((paper) => paper.label))];
    const filename = marksWorkbookFilename(papers[0].name, labels);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${filename.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof MarksBookError ? error.message : "The workbook could not be prepared.";
    return new Response(message, { status: 400 });
  }
}
