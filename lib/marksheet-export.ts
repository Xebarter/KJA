import type { SupabaseClient } from "@supabase/supabase-js";
import {
  bandMidpoint,
  classLabel,
  classSection,
  kampalaLong,
  kindLabel,
  loadCurrentTerm,
  mapBand,
  num,
  ranks,
  streamOf,
  weightedPercent,
  type BandRow,
  type TermRow,
} from "@/lib/academics";
import { loadRoll } from "@/lib/academics-roll";
import { operationalCampus } from "@/lib/campuses";
import {
  readCombinedMarksheetQuery,
  readMarksheetQuery,
  sittingColumns,
  sittingKey,
  type CombinedMarksheetQuery,
  type CombinedSitting,
  type MarksheetQuery,
  type SittingPaper,
} from "@/lib/marksheet";
import {
  arrangeMarksheet,
  markPercent,
  marksheetDisplayAverage,
  marksheetFileSlug,
  marksheetSortLabel,
  marksheetSortSlug,
  marksheetVisibleSubjects,
  markTone,
  parseMarksheetSort,
  type MarksheetSort,
} from "@/lib/marksheet-order";
import type { MarksheetWorkbookInput, MarksheetWorkbookMark } from "@/lib/marksheet-workbook";
import { fetchAll } from "@/lib/students";
import { normalizeSubjectKind } from "@/lib/subject-kind";
import { readFile } from "node:fs/promises";
import path from "node:path";

type PaperRow = {
  id: string;
  subject_id: string;
  stream: string | null;
  campus?: string | null;
  name: string;
  kind: string;
  max_score: number | string;
  weight: number | string;
  held_on: string | null;
  subjects: { name?: string; sort_order?: number | string; kind?: string | null } | { name?: string; sort_order?: number | string; kind?: string | null }[] | null;
};

type ScoreRow = { assessment_id: string; student_id: string; score: number | string | null; missed: boolean };

export type MarksheetExportFormat = "xlsx" | "pdf";

export type MarksheetExportPayload = MarksheetWorkbookInput & {
  sort: MarksheetSort;
  sheetLabel: string;
  filenameBase: string;
};

function shortDay(iso: string | null) {
  if (!iso) return "Date not set";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return "Date not set";
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function subjectOf(value: PaperRow["subjects"]) {
  const row = Array.isArray(value) ? value[0] : value;
  return {
    name: row?.name || "Subject",
    sort: num(row?.sort_order) ?? 0,
    kind: normalizeSubjectKind(row?.kind),
  };
}

function sittingPaper(paper: PaperRow): SittingPaper {
  const subject = subjectOf(paper.subjects);
  return {
    id: paper.id,
    subjectId: paper.subject_id,
    stream: streamOf(paper.stream),
    name: subject.name,
    sort: subject.sort,
    maxScore: num(paper.max_score) ?? 100,
    weight: num(paper.weight) ?? 0,
    status: null,
    heldOn: paper.held_on,
    kind: subject.kind,
  };
}

function bandFor(bands: BandRow[], score: number) {
  return (
    bands.find((band) => Math.abs(bandMidpoint(band) - score) < 0.2) ||
    bands.find((band) => score >= band.min_score && score <= band.max_score) ||
    null
  );
}

/** Site header logo first (`images/kja-logo.png`), then the transparent crest. */
export async function readMarksheetLogo() {
  const candidates = [
    path.join(process.cwd(), "public", "images", "kja-logo.png"),
    path.join(process.cwd(), "public", "images", "kja-logo-transparent.png"),
  ];
  for (const file of candidates) {
    try {
      return await readFile(file);
    } catch {
      /* Header mark is optional. */
    }
  }
  return null;
}

export function marksheetExportFilename(input: {
  classLabel: string;
  name: string;
  held: string;
  sort: MarksheetSort;
  subjectName?: string;
  format: MarksheetExportFormat;
}) {
  const parts = [
    marksheetFileSlug(input.classLabel),
    marksheetFileSlug(input.name),
    input.held || "undated",
    marksheetSortSlug(input.sort, input.subjectName || ""),
  ].filter(Boolean);
  const ext = input.format === "pdf" ? "pdf" : "xlsx";
  return `${parts.join("-").slice(0, 140)}.${ext}`;
}

export function parseMarksheetExportFormat(raw: string | null | undefined): MarksheetExportFormat {
  return raw === "pdf" ? "pdf" : "xlsx";
}

export type MarksheetExportQuery = MarksheetQuery | CombinedMarksheetQuery;

function isAssessmentsCombinedQuery(query: MarksheetExportQuery): query is CombinedMarksheetQuery {
  return "sittings" in query && Array.isArray(query.sittings);
}

export async function loadMarksheetExportPayload(input: {
  supabase: SupabaseClient;
  userId: string;
  query: MarksheetExportQuery;
  sortRaw: string | null;
  campuses?: string[];
  campusFilter?: string;
  term?: TermRow | null;
}): Promise<{ error: string; status: number } | { ok: true; payload: MarksheetExportPayload }> {
  const termPack = input.term
    ? { term: input.term, error: null as string | null }
    : await loadCurrentTerm(input.supabase);
  if (termPack.error || !termPack.term) {
    return { error: termPack.error || "Set a current term before opening a marksheet.", status: 400 };
  }
  const term = termPack.term;
  const nursery = classSection(input.query.classCode) === "nursery";
  const campus = input.campusFilter ? operationalCampus(input.campusFilter) : null;
  const combinedQuery = isAssessmentsCombinedQuery(input.query) ? input.query : null;
  const singleQuery = isAssessmentsCombinedQuery(input.query) ? null : input.query;
  const assessmentsCombined = combinedQuery !== null;
  const sittings: CombinedSitting[] = combinedQuery ? combinedQuery.sittings : [];
  const sittingOrder = combinedQuery
    ? new Map(sittings.map((sitting, index) => [sittingKey(sitting), index]))
    : null;

  let papersRequest = input.supabase
    .from("assessments")
    .select("id, subject_id, stream, campus, name, kind, max_score, weight, held_on, subjects(name, sort_order, kind)")
    .eq("term_id", term.id)
    .eq("class_code", input.query.classCode);
  if (combinedQuery) {
    papersRequest = papersRequest.eq("stream", input.query.stream);
  } else if (singleQuery) {
    papersRequest = papersRequest.eq("name", singleQuery.name).eq("kind", singleQuery.kind);
    if (!singleQuery.combine) papersRequest = papersRequest.eq("stream", singleQuery.stream);
    papersRequest = singleQuery.held ? papersRequest.eq("held_on", singleQuery.held) : papersRequest.is("held_on", null);
  }

  const [papersQuery, roll, bandsQuery] = await Promise.all([
    papersRequest,
    loadRoll(input.supabase, input.userId, [input.query.classCode], input.campuses),
    nursery
      ? input.supabase.from("grade_bands").select("*").eq("section", "nursery").order("sort_order")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (papersQuery.error || bandsQuery.error) {
    return { error: "The marksheet could not be prepared.", status: 500 };
  }

  const loadedRows = ((papersQuery.data || []) as PaperRow[]).filter(
    (paper) => !campus || operationalCampus(paper.campus) === campus,
  );
  const assessmentLabels = new Map(
    sittings.map((sitting) => [
      sittingKey(sitting),
      [sitting.name, shortDay(sitting.held || null)].filter((part) => part && part !== "Date not set").join(" · ") || sitting.name,
    ]),
  );
  const combinedPapers = assessmentsCombined
    ? loadedRows
        .map((paper) => {
          const key = `${paper.name}\u001f${paper.kind}\u001f${paper.held_on || ""}`;
          return {
            paper: sittingPaper(paper),
            key,
            groupLabel: assessmentLabels.get(key) || paper.name,
          };
        })
        .filter((entry) => sittingOrder!.has(entry.key))
        .sort((a, b) => {
          const bySitting = (sittingOrder!.get(a.key) ?? 0) - (sittingOrder!.get(b.key) ?? 0);
          if (bySitting) return bySitting;
          return a.paper.sort - b.paper.sort || a.paper.name.localeCompare(b.paper.name) || a.paper.id.localeCompare(b.paper.id);
        })
    : [];
  const loaded = assessmentsCombined ? combinedPapers.map((entry) => entry.paper) : loadedRows.map(sittingPaper);
  const classRoll = roll.filter((pupil) => {
    if (pupil.class_code !== input.query.classCode) return false;
    if (campus && operationalCampus(pupil.campus) !== campus) return false;
    return true;
  });
  const combined =
    Boolean(singleQuery?.combine) &&
    new Set(classRoll.map((pupil) => streamOf(pupil.stream))).size > 1;
  const sitting = assessmentsCombined
    ? loaded
    : combined
      ? loaded
      : loaded.filter((paper) => paper.stream === input.query.stream);
  const columns = assessmentsCombined
    ? combinedPapers.map(({ paper, key, groupLabel }) => ({
        subjectId: paper.subjectId,
        name: paper.name,
        sort: paper.sort,
        maxScore: paper.maxScore,
        weight: paper.weight,
        kind: paper.kind || ("core" as const),
        papers: [paper],
        groupKey: key,
        groupLabel,
      }))
    : combined
      ? sittingColumns(sitting).map((column) => ({ ...column, groupKey: undefined as string | undefined, groupLabel: undefined as string | undefined }))
      : [...sitting]
          .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
          .map((paper) => ({
            subjectId: paper.subjectId,
            name: paper.name,
            sort: paper.sort,
            maxScore: paper.maxScore,
            weight: paper.weight,
            kind: paper.kind || ("core" as const),
            papers: [paper],
            groupKey: undefined as string | undefined,
            groupLabel: undefined as string | undefined,
          }));
  if (!columns.length) return { error: "This marksheet is not on the list.", status: 404 };
  const roster = combined ? classRoll : classRoll.filter((pupil) => streamOf(pupil.stream) === input.query.stream);
  if (!roster.length) return { error: "No pupils are on this class roll.", status: 400 };

  const scores = await fetchAll<ScoreRow>((from, to) =>
    input.supabase
      .from("assessment_scores")
      .select("assessment_id, student_id, score, missed")
      .in(
        "assessment_id",
        sitting.map((paper) => paper.id),
      )
      .order("assessment_id")
      .range(from, to),
  );
  const saved = new Map(
    scores.map((score) => [`${score.assessment_id}|${score.student_id}`, { score: num(score.score), missed: Boolean(score.missed) }]),
  );
  const bands = ((bandsQuery.data || []) as Record<string, unknown>[]).map(mapBand);
  const subjects = columns.map((column) => ({
    id: assessmentsCombined || !combined ? column.papers[0].id : column.subjectId,
    subjectId: column.subjectId,
    name: column.name,
    maxScore: column.maxScore,
    weight: column.weight,
    kind: column.kind || column.papers[0]?.kind || "core",
    groupKey: column.groupKey,
    groupLabel: column.groupLabel,
  }));
  const sortIds = new Set<string>();
  for (const subject of subjects) {
    sortIds.add(subject.id);
    if (subject.subjectId) sortIds.add(subject.subjectId);
  }
  const sort = parseMarksheetSort(input.sortRaw, sortIds);
  const sortSubject = subjects.find(
    (subject) => sort.endsWith(`:${subject.id}`) || sort.endsWith(`:${subject.subjectId}`),
  );
  const visibleIds = new Set(marksheetVisibleSubjects(subjects, sort).map((subject) => subject.id));
  const visibleIndexes = subjects.flatMap((subject, index) => (visibleIds.has(subject.id) ? [index] : []));

  const modeled = roster.map((pupil, rollIndex) => {
    const pupilStream = streamOf(pupil.stream);
    const marks = columns.map((column) => {
      const paper = column.papers.find((item) => item.stream === pupilStream) || (assessmentsCombined ? column.papers[0] : undefined);
      if (!paper) {
        return {
          value: "-" as const,
          tone: markTone(null, false, true),
          percent: null,
          score: null,
          missed: false,
          max: 0,
          weight: 0,
          expected: false,
          kind: column.kind || "core",
        };
      }
      const mark = saved.get(`${paper.id}|${pupil.id}`);
      const missed = Boolean(mark?.missed);
      const score = !mark || missed ? null : mark.score;
      const blank = !missed && score === null;
      const percent = markPercent(score, paper.maxScore, missed);
      const band = nursery && score !== null ? bandFor(bands, score) : null;
      const value = missed ? "Abs" : score === null ? "-" : nursery ? band?.label || "-" : score;
      return {
        value,
        tone: markTone(percent, missed, blank),
        percent,
        score: missed ? null : score,
        missed,
        max: paper.maxScore,
        weight: paper.weight,
        expected: true,
        kind: paper.kind || column.kind || "core",
      };
    });
    const percents: Record<string, number | null> = Object.fromEntries(
      subjects.map((subject, index) => [subject.id, marks[index]?.percent ?? null]),
    );
    const byCatalogue = new Map<string, number[]>();
    subjects.forEach((subject, index) => {
      const catalogueId = subject.subjectId;
      if (!catalogueId || catalogueId === subject.id) return;
      if (!byCatalogue.has(catalogueId)) byCatalogue.set(catalogueId, []);
      const percent = marks[index]?.percent;
      if (percent === null || percent === undefined) return;
      byCatalogue.get(catalogueId)!.push(percent);
    });
    for (const [catalogueId, values] of byCatalogue) {
      percents[catalogueId] = values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : null;
    }
    return {
      id: pupil.id,
      name: pupil.full_name,
      number: pupil.student_number || "",
      stream: pupilStream,
      roll: rollIndex,
      marks,
      average: weightedPercent(marks),
      academicAverage: weightedPercent(marks.filter((mark) => mark.kind !== "cocurricular")),
      otherAverage: weightedPercent(marks.filter((mark) => mark.kind === "cocurricular")),
      gaps: marks.filter((mark) => mark.expected && !mark.missed && mark.score === null).length,
      percents,
    };
  });

  const positions = ranks(
    modeled.flatMap((row) => {
      const value = marksheetDisplayAverage(row, sort);
      return value === null ? [] : [{ id: row.id, value }];
    }),
  );
  const arranged = arrangeMarksheet(modeled, sort);
  const scored = arranged.flatMap((row) => {
    const value = marksheetDisplayAverage(row, sort);
    return value === null ? [] : [value];
  });
  const classAverage = scored.length
    ? Math.round((scored.reduce((sum, value) => sum + value, 0) / scored.length) * 10) / 10
    : null;
  const subjectAverages = subjects.map((_subject, index) => {
    const percents = arranged.flatMap((row) => {
      const mark = row.marks[index];
      if (!mark || mark.missed || mark.percent === null) return [];
      return [mark.percent];
    });
    return percents.length ? Math.round((percents.reduce((sum, value) => sum + value, 0) / percents.length) * 10) / 10 : null;
  });

  const combinedNames = combinedQuery ? sittings.map((sitting) => sitting.name).join(" · ") : "";
  const sheetLabel = combinedQuery
    ? classLabel(input.query.classCode, input.query.stream)
    : combined
      ? `${classLabel(input.query.classCode)} all streams`
      : classLabel(input.query.classCode, input.query.stream);
  const classLabelText = combinedQuery
    ? classLabel(input.query.classCode, input.query.stream)
    : combined
      ? classLabel(input.query.classCode)
      : classLabel(input.query.classCode, input.query.stream);
  const exportName = combinedQuery ? combinedNames || "Combined" : singleQuery?.name || "Assessment";
  const exportKindLabel = combinedQuery ? "Combined" : kindLabel(singleQuery?.kind || "");
  const exportHeldLabel = combinedQuery
    ? `${sittings.length} assessments`
    : shortDay(sitting[0]?.heldOn || singleQuery?.held || null);
  const sortLabel = marksheetSortLabel(sort, sortSubject?.name || "");
  const logo = await readMarksheetLogo();

  const payload: MarksheetExportPayload = {
    term: term.label,
    name: exportName,
    kindLabel: exportKindLabel,
    classLabel: classLabelText,
    heldLabel: exportHeldLabel,
    preparedOn: kampalaLong(),
    sortLabel,
    combined: combined || assessmentsCombined,
    nursery,
    subjects: visibleIndexes.map((index) => ({
      name: subjects[index].name,
      maxScore: subjects[index].maxScore,
      average: subjectAverages[index] ?? null,
      groupKey: subjects[index].groupKey,
      groupLabel: subjects[index].groupLabel,
    })),
    pupils: arranged.map((row) => ({
      number: combined && row.stream ? [row.number, row.stream].filter(Boolean).join(" · ") : row.number,
      name: row.name,
      marks: visibleIndexes.map((index) => {
        const mark = row.marks[index];
        return { value: mark.value, tone: mark.tone, percent: mark.percent } as MarksheetWorkbookMark;
      }),
      average: marksheetDisplayAverage(row, sort),
      position: positions.get(row.id) ?? null,
    })),
    classAverage,
    logo,
    sort,
    sheetLabel,
    filenameBase: marksheetExportFilename({
      classLabel: sheetLabel,
      name: exportName,
      held: combinedQuery ? "combined" : singleQuery?.held || "",
      sort,
      subjectName: sortSubject?.name || "",
      format: "xlsx",
    }).replace(/\.xlsx$/i, ""),
  };

  return { ok: true, payload };
}

export function marksheetExportQueryFromUrl(url: URL): MarksheetExportQuery | null {
  const combined = readCombinedMarksheetQuery({
    mode: url.searchParams.get("mode"),
    classCode: url.searchParams.get("class"),
    stream: url.searchParams.get("stream"),
    sittings: url.searchParams.getAll("s"),
  });
  if (combined) return combined;
  return readMarksheetQuery({
    name: url.searchParams.get("name"),
    kind: url.searchParams.get("kind"),
    held: url.searchParams.get("held"),
    classCode: url.searchParams.get("class"),
    stream: url.searchParams.get("stream"),
    combine: url.searchParams.get("combine"),
  });
}
