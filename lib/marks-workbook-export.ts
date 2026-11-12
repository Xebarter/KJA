import type { SupabaseClient } from "@supabase/supabase-js";
import {
  bandMidpoint,
  classLabel,
  classOrder,
  classSection,
  kampalaToday,
  kindLabel,
  mapBand,
  markbookClosed,
  num,
  streamOf,
} from "@/lib/academics";
import { ensureOtherMarkbooks } from "@/lib/academics-other-papers";
import { loadRoll } from "@/lib/academics-roll";
import { operationalCampus } from "@/lib/campuses";
import { contentDisposition } from "@/lib/download-headers";
import {
  buildMarksWorkbook,
  marksWorkbookFilename,
  MarksBookError,
  type MarksBookBand,
  type MarksBookPaper,
  type MarksBookScore,
} from "@/lib/marks-workbook";
import {
  groupSkillsByDomain,
  loadDivisionCatalogue,
  nurseryDivision,
  type ProgressCodeRow,
} from "@/lib/nursery-dsba";
import {
  buildNurseryDsbaWorkbook,
  NurseryDsbaBookError,
  nurseryDsbaWorkbookFilename,
  type NurseryDsbaBookPaper,
  type NurseryDsbaBookRating,
} from "@/lib/nursery-dsba-workbook";
import { isCocurricularSubject } from "@/lib/subject-kind";
import { className, fetchAll, isUuid } from "@/lib/students";

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

type DsbaPaperRow = {
  id: string;
  term_id: string;
  campus: string;
  class_code: string;
  stream: string | null;
  name: string;
  kind: string;
  held_on: string | null;
  status: string | null;
};

function longDay(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function shortDay(iso: string | null) {
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export type MarksWorkbookAuth = {
  supabase: SupabaseClient;
  userId: string;
  /** Office backfills Other markbooks; teachers skip that write. */
  office: boolean;
  /**
   * When set (teacher desk), only these assessment ids may be exported.
   * Keys are assessment UUIDs the teacher is allowed to mark.
   */
  allowedPaperIds?: Set<string>;
};

function workbookResponse(bytes: Buffer | Uint8Array, filename: string) {
  const bodyBytes = Uint8Array.from(Buffer.from(bytes));
  try {
    return new Response(bodyBytes, {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": contentDisposition(filename),
        "cache-control": "no-store",
      },
    });
  } catch (headerError) {
    console.error("[marks-workbook-export] response headers", headerError);
    return new Response(bodyBytes, {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": contentDisposition("KJA marks.xlsx"),
        "cache-control": "no-store",
      },
    });
  }
}

async function prepareNurseryDsbaWorkbookResponse(
  auth: MarksWorkbookAuth,
  ids: string[],
): Promise<Response> {
  const papers: DsbaPaperRow[] = [];
  for (let index = 0; index < ids.length; index += 80) {
    const slice = ids.slice(index, index + 80);
    const result = await auth.supabase
      .from("developmental_assessments")
      .select("id, term_id, campus, class_code, stream, name, kind, held_on, status")
      .in("id", slice);
    if (result.error) {
      return new Response(
        "The nursery developmental assessments could not be loaded. Run supabase/0077_nursery_dsba.sql if needed.",
        { status: 500 },
      );
    }
    papers.push(...((result.data || []) as DsbaPaperRow[]));
  }
  if (papers.length !== ids.length) {
    return new Response("Some of those nursery assessments are no longer on the list.", { status: 400 });
  }
  const signature = new Set(papers.map((paper) => `${paper.term_id}|${paper.name}|${paper.kind}|${paper.held_on || ""}`));
  if (signature.size !== 1) return new Response("Choose classes from one assessment.", { status: 400 });

  const open = papers.filter((paper) => !markbookClosed(paper.status));
  if (!open.length) {
    return new Response(
      "Those developmental assessments are locked. Unlock them before downloading a skills workbook.",
      { status: 400 },
    );
  }

  const termId = String(open[0].term_id);
  const classCodes = [...new Set(open.map((paper) => paper.class_code))];
  const [termQuery, roll] = await Promise.all([
    auth.supabase.from("fee_terms").select("label").eq("id", termId).maybeSingle(),
    loadRoll(auth.supabase, auth.userId, classCodes),
  ]);

  const onRoll = new Set(roll.map((pupil) => `${pupil.class_code}|${streamOf(pupil.stream)}`));
  const usable = open.filter((paper) => onRoll.has(`${paper.class_code}|${streamOf(paper.stream)}`));
  if (!usable.length) return new Response("None of the chosen nursery classes have pupils on roll.", { status: 400 });

  const bookPapers: NurseryDsbaBookPaper[] = [];
  let progressCodes: ProgressCodeRow[] = [];
  type CatalogueOk = Exclude<Awaited<ReturnType<typeof loadDivisionCatalogue>>, { error: string }>;
  const catalogueCache = new Map<string, CatalogueOk>();

  for (const paper of usable) {
    const divisionId = nurseryDivision(paper.class_code);
    if (!divisionId) {
      return new Response(`${classLabel(paper.class_code, paper.stream)} is not a nursery division.`, { status: 400 });
    }
    let catalogue = catalogueCache.get(divisionId);
    if (!catalogue) {
      const loaded = await loadDivisionCatalogue(auth.supabase, divisionId);
      if ("error" in loaded && loaded.error) {
        return new Response(loaded.error, { status: 500 });
      }
      catalogue = loaded as CatalogueOk;
      catalogueCache.set(divisionId, catalogue);
    }
    if (!progressCodes.length) progressCodes = catalogue.progressCodes;
    const grouped = groupSkillsByDomain(catalogue.domains, catalogue.skills);
    const skills = grouped.flatMap((group) =>
      group.skills.map((skill) => ({
        id: skill.id,
        domainId: group.domain.id,
        domainName: group.domain.name,
        domainSort: group.domain.sort_order,
        description: skill.description,
        sort: skill.sort_order,
        value_kind: skill.value_kind,
      })),
    );
    if (!skills.length) {
      return new Response(
        `No developmental skills are linked to ${classLabel(paper.class_code, paper.stream)} yet.`,
        { status: 400 },
      );
    }
    bookPapers.push({
      id: paper.id,
      campus: operationalCampus(paper.campus),
      classCode: paper.class_code,
      className: className(paper.class_code),
      stream: streamOf(paper.stream),
      label: classLabel(paper.class_code, paper.stream),
      order: classOrder(paper.class_code) ?? 99,
      skills,
    });
  }

  if (!progressCodes.length) {
    return new Response("Set the nursery progress codes before downloading a skills workbook.", { status: 400 });
  }

  const ratings: NurseryDsbaBookRating[] = [];
  const codeById = new Map(progressCodes.map((row) => [row.id, row.code]));
  for (let index = 0; index < usable.length; index += 40) {
    const slice = usable.slice(index, index + 40).map((paper) => paper.id);
    const ratingRows = await fetchAll<{
      assessment_id: string;
      student_id: string;
      skill_id: string;
      progress_code_id: string | null;
      numeric_value: number | null;
    }>((from, to) =>
      auth.supabase
        .from("skill_ratings")
        .select("assessment_id, student_id, skill_id, progress_code_id, numeric_value")
        .in("assessment_id", slice)
        .or("progress_code_id.not.is.null,numeric_value.not.is.null")
        .order("assessment_id")
        .range(from, to),
    ).catch(
      () =>
        [] as {
          assessment_id: string;
          student_id: string;
          skill_id: string;
          progress_code_id: string | null;
          numeric_value: number | null;
        }[],
    );
    for (const row of ratingRows) {
      const code = row.progress_code_id
        ? codeById.get(row.progress_code_id) || null
        : row.numeric_value !== null && row.numeric_value !== undefined
          ? String(row.numeric_value)
          : null;
      if (!code) continue;
      ratings.push({
        assessmentId: row.assessment_id,
        studentId: row.student_id,
        skillId: row.skill_id,
        code,
      });
    }
  }

  const bytes = await buildNurseryDsbaWorkbook({
    termId,
    term: termQuery.data?.label || "Current term",
    name: usable[0].name,
    kind: usable[0].kind,
    kindLabel: kindLabel(usable[0].kind),
    heldOn: shortDay(usable[0].held_on),
    heldOnIso: usable[0].held_on || "",
    preparedOn: longDay(kampalaToday()),
    papers: bookPapers,
    pupils: roll.map((pupil) => ({
      id: pupil.id,
      number: pupil.student_number || "",
      name: pupil.full_name,
      classCode: pupil.class_code || "",
      stream: streamOf(pupil.stream),
    })),
    ratings,
    progressCodes,
  });
  const labels = [...new Set(bookPapers.map((paper) => paper.label))];
  return workbookResponse(bytes, nurseryDsbaWorkbookFilename(usable[0].name, labels));
}

/** Build the marks Excel response shared by academics office and teacher desks. */
export async function prepareMarksWorkbookResponse(
  request: Request,
  auth: MarksWorkbookAuth,
): Promise<Response> {
  let body: { papers?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response("Choose at least one subject.", { status: 400 });
  }
  const ids = [
    ...new Set(
      (Array.isArray(body.papers) ? body.papers : []).filter(
        (id): id is string => typeof id === "string" && isUuid(id),
      ),
    ),
  ];
  if (!ids.length) return new Response("Choose at least one subject.", { status: 400 });
  if (ids.length > 250) return new Response("Choose 250 markbooks or fewer for one workbook.", { status: 400 });
  if (auth.allowedPaperIds) {
    const denied = ids.filter((id) => !auth.allowedPaperIds!.has(id));
    if (denied.length) return new Response("Those markbooks are not assigned to your desk.", { status: 403 });
  }

  try {
    const primaryPapers: PaperRow[] = [];
    const dsbaPapers: DsbaPaperRow[] = [];
    for (let index = 0; index < ids.length; index += 80) {
      const slice = ids.slice(index, index + 80);
      const [primaryResult, dsbaResult] = await Promise.all([
        auth.supabase
          .from("assessments")
          .select("id, term_id, class_code, stream, subject_id, name, kind, max_score, held_on, status")
          .in("id", slice),
        auth.supabase
          .from("developmental_assessments")
          .select("id, term_id, campus, class_code, stream, name, kind, held_on, status")
          .in("id", slice),
      ]);
      if (primaryResult.error) return new Response("The markbooks could not be loaded.", { status: 500 });
      if (dsbaResult.error && !/developmental_assessments|schema cache|does not exist/i.test(dsbaResult.error.message)) {
        return new Response("The nursery assessments could not be loaded.", { status: 500 });
      }
      primaryPapers.push(...((primaryResult.data || []) as PaperRow[]));
      if (!dsbaResult.error) dsbaPapers.push(...((dsbaResult.data || []) as DsbaPaperRow[]));
    }

    const primaryIds = new Set(primaryPapers.map((paper) => paper.id));
    const dsbaIds = new Set(dsbaPapers.map((paper) => paper.id));
    const unresolved = ids.filter((id) => !primaryIds.has(id) && !dsbaIds.has(id));
    if (unresolved.length) return new Response("Some of those markbooks are no longer on the list.", { status: 400 });
    if (primaryIds.size && dsbaIds.size) {
      return new Response("Choose nursery or primary papers, not both.", { status: 400 });
    }
    if (dsbaIds.size) return await prepareNurseryDsbaWorkbookResponse(auth, ids);

    const papers = primaryPapers;
    const signature = new Set(papers.map((paper) => `${paper.term_id}|${paper.name}|${paper.kind}|${paper.held_on || ""}`));
    if (signature.size !== 1) return new Response("Choose subjects from one assessment.", { status: 400 });

    const termId = String(papers[0].term_id);
    const sample = papers[0];
    if (auth.office) {
      try {
        await ensureOtherMarkbooks(auth.supabase, termId, auth.userId);
      } catch {
        /* Still build from available papers. */
      }
    }

    // Pull Other subjects for the chosen classes when the picker only had Academic papers.
    if (auth.office || !auth.allowedPaperIds) {
      const sittingRows = await fetchAll<PaperRow>((from, to) => {
        let query = auth.supabase
          .from("assessments")
          .select("id, term_id, class_code, stream, subject_id, name, kind, max_score, held_on, status")
          .eq("term_id", termId)
          .eq("name", sample.name)
          .eq("kind", sample.kind);
        query = sample.held_on ? query.eq("held_on", sample.held_on) : query.is("held_on", null);
        return query.order("id").range(from, to);
      });
      const chosenKeys = new Set(papers.map((paper) => `${paper.class_code}|${streamOf(paper.stream)}`));
      const { data: kindRows } = await auth.supabase.from("subjects").select("id, kind").eq("active", true);
      const otherIds = new Set(
        (kindRows || [])
          .filter((row) => isCocurricularSubject(String(row.kind || "")))
          .map((row) => String(row.id)),
      );
      const have = new Set(papers.map((paper) => paper.id));
      for (const row of sittingRows) {
        if (have.has(row.id)) continue;
        if (!chosenKeys.has(`${row.class_code}|${streamOf(row.stream)}`)) continue;
        if (!otherIds.has(row.subject_id)) continue;
        if (auth.allowedPaperIds && !auth.allowedPaperIds.has(row.id)) continue;
        papers.push(row);
        have.add(row.id);
      }
    }

    const open = papers.filter((paper) => !markbookClosed(paper.status));
    if (!open.length) {
      return new Response(
        "Those markbooks are locked. Unlock them on the class marksheet before downloading a sheet.",
        { status: 400 },
      );
    }

    const subjectIds = [...new Set(open.map((paper) => paper.subject_id))];
    const classCodes = [...new Set(open.map((paper) => paper.class_code))];
    const [termQuery, subjectQuery, roll, bandsQuery] = await Promise.all([
      auth.supabase.from("fee_terms").select("label").eq("id", termId).maybeSingle(),
      auth.supabase.from("subjects").select("id, name, sort_order, kind, default_skills").in("id", subjectIds),
      loadRoll(auth.supabase, auth.userId, classCodes),
      open.some((paper) => classSection(paper.class_code) === "nursery")
        ? auth.supabase.from("grade_bands").select("*").eq("section", "nursery").order("sort_order")
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (subjectQuery.error) return new Response("The subjects could not be loaded.", { status: 500 });
    if (bandsQuery.error) return new Response("The progress bands could not be loaded.", { status: 500 });

    const subjectName = new Map((subjectQuery.data || []).map((subject) => [String(subject.id), String(subject.name)]));
    const subjectOrder = new Map((subjectQuery.data || []).map((subject) => [String(subject.id), num(subject.sort_order) ?? 0]));
    const subjectMeta = new Map(
      (subjectQuery.data || []).map((subject) => {
        let raw = subject.default_skills;
        if (typeof raw === "string") {
          try {
            raw = JSON.parse(raw);
          } catch {
            raw = [];
          }
        }
        const skills = Array.isArray(raw)
          ? raw
              .map((item) => (typeof item === "string" ? item.trim() : ""))
              .filter(Boolean)
              .slice(0, 8)
          : [];
        return [String(subject.id), { kind: String(subject.kind || "core"), skills }] as const;
      }),
    );
    const onRoll = new Set(roll.map((pupil) => `${pupil.class_code}|${streamOf(pupil.stream)}`));
    const usable = open.filter((paper) => onRoll.has(`${paper.class_code}|${streamOf(paper.stream)}`));
    if (!usable.length) return new Response("None of the chosen classes have pupils on roll.", { status: 400 });

    const scores: { assessment_id: string; student_id: string; score: number | null; missed: boolean; skills?: unknown }[] = [];
    for (let index = 0; index < usable.length; index += 80) {
      const slice = usable.slice(index, index + 80).map((paper) => paper.id);
      try {
        scores.push(
          ...(await fetchAll<{ assessment_id: string; student_id: string; score: number | null; missed: boolean; skills?: unknown }>((from, to) =>
            auth.supabase
              .from("assessment_scores")
              .select("assessment_id, student_id, score, missed, skills")
              .in("assessment_id", slice)
              .order("assessment_id")
              .range(from, to),
          )),
        );
      } catch {
        scores.push(
          ...(await fetchAll<{ assessment_id: string; student_id: string; score: number | null; missed: boolean }>((from, to) =>
            auth.supabase
              .from("assessment_scores")
              .select("assessment_id, student_id, score, missed")
              .in("assessment_id", slice)
              .order("assessment_id")
              .range(from, to),
          )),
        );
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
    return workbookResponse(bytes, marksWorkbookFilename(papers[0].name, labels));
  } catch (error) {
    console.error("[marks-workbook-export]", error);
    if (error instanceof MarksBookError || error instanceof NurseryDsbaBookError) {
      return new Response(error.message, { status: 400 });
    }
    // Never rethrow - Next turns uncaught route errors into HTML 500 pages that
    // the Assessments UI can only show as a generic "could not be prepared" message.
    return new Response("The workbook could not be prepared.", { status: 500 });
  }
}
