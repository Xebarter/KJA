import { readFile } from "node:fs/promises";
import path from "node:path";
import { bandMidpoint, classLabel, classSection, kampalaLong, kindLabel, loadCurrentTerm, mapBand, num, ranks, streamOf, weightedPercent, type BandRow } from "@/lib/academics";
import { requireAcademics } from "@/lib/academics-access";
import { loadRoll } from "@/lib/academics-roll";
import { readMarksheetQuery, sittingColumns, type SittingPaper } from "@/lib/marksheet";
import { arrangeMarksheet, markPercent, marksheetSortLabel, marksheetWorkbookFilename, markTone, parseMarksheetSort } from "@/lib/marksheet-order";
import { buildMarksheetWorkbook } from "@/lib/marksheet-workbook";
import { fetchAll } from "@/lib/students";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PaperRow = {
  id: string;
  subject_id: string;
  stream: string | null;
  name: string;
  kind: string;
  max_score: number | string;
  weight: number | string;
  held_on: string | null;
  subjects: { name?: string; sort_order?: number | string } | { name?: string; sort_order?: number | string }[] | null;
};

type ScoreRow = { assessment_id: string; student_id: string; score: number | string | null; missed: boolean };

function shortDay(iso: string | null) {
  if (!iso) return "Date not set";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return "Date not set";
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function subjectOf(value: PaperRow["subjects"]) {
  const row = Array.isArray(value) ? value[0] : value;
  return { name: row?.name || "Subject", sort: num(row?.sort_order) ?? 0 };
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
  };
}

function bandFor(bands: BandRow[], score: number) {
  return bands.find((band) => Math.abs(bandMidpoint(band) - score) < 0.2)
    || bands.find((band) => score >= band.min_score && score <= band.max_score)
    || null;
}

async function readLogo() {
  const candidates = [
    path.join(process.cwd(), "public", "images", "kja-logo-transparent.png"),
    path.join(process.cwd(), "public", "images", "kja-logo.png"),
  ];
  for (const file of candidates) {
    try {
      return await readFile(file);
    } catch {
      /* The register still builds without the crest. */
    }
  }
  return null;
}

export async function GET(request: Request) {
  const auth = await requireAcademics();
  if ("error" in auth) return new Response(auth.error, { status: 401 });
  const url = new URL(request.url);
  const query = readMarksheetQuery({
    name: url.searchParams.get("name"),
    kind: url.searchParams.get("kind"),
    held: url.searchParams.get("held"),
    classCode: url.searchParams.get("class"),
    stream: url.searchParams.get("stream"),
    combine: url.searchParams.get("combine"),
  });
  if (!query) return new Response("Choose a class marksheet.", { status: 400 });

  const termPack = await loadCurrentTerm(auth.supabase);
  if (termPack.error || !termPack.term) return new Response(termPack.error || "Set a current term before opening a marksheet.", { status: 400 });
  const term = termPack.term;
  const nursery = classSection(query.classCode) === "nursery";

  let papersRequest = auth.supabase
    .from("assessments")
    .select("id, subject_id, stream, name, kind, max_score, weight, held_on, subjects(name, sort_order)")
    .eq("term_id", term.id)
    .eq("name", query.name)
    .eq("kind", query.kind)
    .eq("class_code", query.classCode);
  if (!query.combine) papersRequest = papersRequest.eq("stream", query.stream);
  papersRequest = query.held ? papersRequest.eq("held_on", query.held) : papersRequest.is("held_on", null);
  const [papersQuery, roll, bandsQuery] = await Promise.all([
    papersRequest,
    loadRoll(auth.supabase, auth.user.id),
    nursery ? auth.supabase.from("grade_bands").select("*").eq("section", "nursery").order("sort_order") : Promise.resolve({ data: [], error: null }),
  ]);
  if (papersQuery.error || bandsQuery.error) return new Response("The marksheet could not be prepared.", { status: 500 });
  const loaded = ((papersQuery.data || []) as PaperRow[]).map(sittingPaper);
  const classRoll = roll.filter((pupil) => pupil.class_code === query.classCode);
  const combined = query.combine && new Set(classRoll.map((pupil) => streamOf(pupil.stream))).size > 1;
  const sitting = combined ? loaded : loaded.filter((paper) => paper.stream === query.stream);
  const columns = combined
    ? sittingColumns(sitting)
    : [...sitting].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).map((paper) => ({
      subjectId: paper.subjectId,
      name: paper.name,
      sort: paper.sort,
      maxScore: paper.maxScore,
      weight: paper.weight,
      papers: [paper],
    }));
  if (!columns.length) return new Response("This marksheet is not on the list.", { status: 404 });
  const roster = combined ? classRoll : classRoll.filter((pupil) => streamOf(pupil.stream) === query.stream);
  if (!roster.length) return new Response("No pupils are on this class roll.", { status: 400 });

  const scores = await fetchAll<ScoreRow>((from, to) =>
    auth.supabase.from("assessment_scores").select("assessment_id, student_id, score, missed").in("assessment_id", sitting.map((paper) => paper.id)).order("assessment_id").range(from, to),
  );
  const saved = new Map(scores.map((score) => [`${score.assessment_id}|${score.student_id}`, { score: num(score.score), missed: Boolean(score.missed) }]));
  const bands = ((bandsQuery.data || []) as Record<string, unknown>[]).map(mapBand);
  const subjects = columns.map((column) => ({
    id: combined ? column.subjectId : column.papers[0].id,
    name: column.name,
    maxScore: column.maxScore,
    weight: column.weight,
  }));
  const sort = parseMarksheetSort(url.searchParams.get("sort"), new Set(subjects.map((subject) => subject.id)));
  const sortSubject = subjects.find((subject) => sort.endsWith(`:${subject.id}`));

  const modeled = roster.map((pupil, rollIndex) => {
    const pupilStream = streamOf(pupil.stream);
    const marks = columns.map((column) => {
      const paper = column.papers.find((item) => item.stream === pupilStream);
      if (!paper) {
        return { value: "—" as const, tone: markTone(null, false, true), percent: null, score: null, missed: false, max: 0, weight: 0, expected: false };
      }
      const mark = saved.get(`${paper.id}|${pupil.id}`);
      const missed = Boolean(mark?.missed);
      const score = !mark || missed ? null : mark.score;
      const blank = !missed && score === null;
      const percent = markPercent(score, paper.maxScore, missed);
      const band = nursery && score !== null ? bandFor(bands, score) : null;
      const value = missed ? "Abs" : score === null ? "—" : nursery ? (band?.label || "—") : score;
      return {
        value,
        tone: markTone(percent, missed, blank),
        percent,
        score: missed ? null : score,
        missed,
        max: paper.maxScore,
        weight: paper.weight,
        expected: true,
      };
    });
    const percents = Object.fromEntries(subjects.map((subject, index) => [subject.id, marks[index]?.percent ?? null]));
    return {
      id: pupil.id,
      name: pupil.full_name,
      number: pupil.student_number || "",
      stream: pupilStream,
      roll: rollIndex,
      marks,
      average: weightedPercent(marks),
      gaps: marks.filter((mark) => mark.expected && !mark.missed && mark.score === null).length,
      percents,
    };
  });
  const positions = ranks(modeled.flatMap((row) => row.average === null ? [] : [{ id: row.id, value: row.average }]));
  const arranged = arrangeMarksheet(modeled, sort);
  const scored = arranged.filter((row) => row.average !== null);
  const classAverage = scored.length
    ? Math.round((scored.reduce((sum, row) => sum + (row.average || 0), 0) / scored.length) * 10) / 10
    : null;
  const subjectAverages = subjects.map((subject, index) => {
    const percents = arranged.flatMap((row) => {
      const mark = row.marks[index];
      if (!mark || mark.missed || mark.percent === null) return [];
      return [mark.percent];
    });
    return percents.length ? Math.round((percents.reduce((sum, value) => sum + value, 0) / percents.length) * 10) / 10 : null;
  });

  const sheetLabel = combined ? `${classLabel(query.classCode)} all streams` : classLabel(query.classCode, query.stream);
  const bytes = await buildMarksheetWorkbook({
    term: term.label,
    name: query.name,
    kindLabel: kindLabel(query.kind),
    classLabel: combined ? classLabel(query.classCode) : classLabel(query.classCode, query.stream),
    heldLabel: shortDay(sitting[0]?.heldOn || query.held || null),
    preparedOn: kampalaLong(),
    sortLabel: marksheetSortLabel(sort, sortSubject?.name || ""),
    combined,
    nursery,
    subjects: subjects.map((subject, index) => ({ name: subject.name, maxScore: subject.maxScore, average: subjectAverages[index] ?? null })),
    pupils: arranged.map((row) => ({
      number: combined && row.stream ? [row.number, row.stream].filter(Boolean).join(" · ") : row.number,
      name: row.name,
      marks: row.marks.map((mark) => ({ value: mark.value, tone: mark.tone, percent: mark.percent })),
      average: row.average,
      position: positions.get(row.id) ?? null,
    })),
    classAverage,
    logo: await readLogo(),
  });
  const filename = marksheetWorkbookFilename({
    classLabel: sheetLabel,
    name: query.name,
    held: query.held,
    sort,
    subjectName: sortSubject?.name || "",
  });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "no-store",
    },
  });
}
