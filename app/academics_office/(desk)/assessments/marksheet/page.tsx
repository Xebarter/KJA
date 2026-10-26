import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { MarksheetDesk, type MarksheetPupil, type MarksheetStatus, type MarksheetSubject } from "@/components/academics/MarksheetDesk";
import { AcademicsGate, Empty } from "@/components/academics/ui";
import { ACADEMICS_BASE, bandMidpoint, classLabel, classSection, kindLabel, loadCurrentTerm, mapBand, markbookClosed, num, streamOf, type BandRow } from "@/lib/academics";
import { openAcademics } from "@/lib/academics-access";
import { loadRoll } from "@/lib/academics-roll";
import { readMarksheetQuery, sittingColumns, type SittingPaper } from "@/lib/marksheet";
import { fetchAll } from "@/lib/students";

export const metadata = { title: "Marksheet" };

type PaperRow = {
  id: string;
  subject_id: string;
  stream: string | null;
  name: string;
  kind: string;
  max_score: number | string;
  weight: number | string;
  held_on: string | null;
  status: string | null;
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
  return {
    name: row?.name || "Subject",
    sort: num(row?.sort_order) ?? 0,
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
    status: paper.status,
    heldOn: paper.held_on,
  };
}

function sheetStatus(status: string | null): MarksheetStatus {
  if (status === "approved" || status === "submitted") return status;
  return "open";
}

function bandFor(bands: BandRow[], score: number) {
  return bands.find((band) => Math.abs(bandMidpoint(band) - score) < 0.2)
    || bands.find((band) => score >= band.min_score && score <= band.max_score)
    || null;
}

function BackLink() {
  return <Link href={`${ACADEMICS_BASE}/assessments`}>All papers</Link>;
}

export default async function MarksheetPage({ searchParams }: { searchParams: Promise<{ name?: string; kind?: string; held?: string; class?: string; stream?: string; combine?: string }> }) {
  const query = await searchParams;
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Marksheet" state={opened} />;
  const { supabase, office, user, staffId } = opened.auth;
  const parsed = readMarksheetQuery({ name: query.name, kind: query.kind, held: query.held, classCode: query.class, stream: query.stream, combine: query.combine });
  const name = parsed?.name || "";
  const kind = parsed?.kind || "";
  const held = parsed?.held || "";
  const classCode = parsed?.classCode || "";
  const stream = parsed?.stream ?? null;
  const termPack = await loadCurrentTerm(supabase);
  if (termPack.error) return <AcademicsGate title="Marksheet" state={{ notice: "schema", message: termPack.error }} />;
  const term = termPack.term;
  if (!term) {
    return (
      <div className="app-page ofc-page asm-page msh-page">
        <PageHeader kicker="Assessment" icon="fa-table-cells" title="Marksheet" description="Set a current term before opening a marksheet." />
        <Empty title="No current term" />
      </div>
    );
  }
  if (!parsed || stream === null) {
    return (
      <div className="app-page ofc-page asm-page msh-page">
        <PageHeader kicker="Assessment" icon="fa-table-cells" title="Marksheet" description={<>{term.label}. Open an assessment, then choose a class.</>} />
        <Empty title="Choose a class marksheet"><BackLink /></Empty>
      </div>
    );
  }

  const nursery = classSection(classCode) === "nursery";
  const combineRequested = Boolean(parsed?.combine);
  let papersRequest = supabase
    .from("assessments")
    .select("id, subject_id, stream, name, kind, max_score, weight, held_on, status, subjects(name, sort_order)")
    .eq("term_id", term.id)
    .eq("name", name)
    .eq("kind", kind)
    .eq("class_code", classCode);
  if (!combineRequested) papersRequest = papersRequest.eq("stream", stream);
  papersRequest = held ? papersRequest.eq("held_on", held) : papersRequest.is("held_on", null);
  const [papersQuery, roll, bandsQuery, taughtQuery] = await Promise.all([
    papersRequest,
    loadRoll(supabase, user.id),
    nursery ? supabase.from("grade_bands").select("*").eq("section", "nursery").order("sort_order") : Promise.resolve({ data: [], error: null }),
    !office && staffId
      ? supabase.from("subject_teachers").select("subject_id, stream").eq("term_id", term.id).eq("class_code", classCode).eq("staff_id", staffId)
      : Promise.resolve({ data: [] as { subject_id: string; stream: string | null }[], error: null }),
  ]);
  if (papersQuery.error) return <AcademicsGate title="Marksheet" state={{ notice: "schema", message: papersQuery.error.message }} />;
  if (bandsQuery.error) return <AcademicsGate title="Marksheet" state={{ notice: "schema", message: bandsQuery.error.message }} />;
  if (taughtQuery.error) return <AcademicsGate title="Marksheet" state={{ notice: "schema", message: taughtQuery.error.message }} />;
  const classRoll = roll.filter((pupil) => pupil.class_code === classCode);
  const streamCount = new Set(classRoll.map((pupil) => streamOf(pupil.stream))).size;
  const combined = combineRequested && streamCount > 1;
  const loaded = ((papersQuery.data || []) as PaperRow[]).map(sittingPaper).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name) || a.stream.localeCompare(b.stream) || a.id.localeCompare(b.id));
  const papers = combined ? loaded : loaded.filter((paper) => paper.stream === stream);
  const label = combined ? classLabel(classCode) : classLabel(classCode, stream);
  if (!papers.length) {
    return (
      <div className="app-page ofc-page asm-page msh-page">
        <PageHeader kicker="Assessment" icon="fa-table-cells" title={label} description={<>{term.label}. This assessment is not on the list for this class.</>} actions={<Link className="admin-hero-btn" href={`${ACADEMICS_BASE}/assessments`}>All papers</Link>} />
        <Empty title="This marksheet is not on the list"><BackLink /></Empty>
      </div>
    );
  }

  const columns = combined
    ? sittingColumns(papers)
    : papers.map((paper) => ({ subjectId: paper.subjectId, name: paper.name, sort: paper.sort, maxScore: paper.maxScore, weight: paper.weight, papers: [paper] }));
  const roster = combined ? classRoll : classRoll.filter((pupil) => streamOf(pupil.stream) === stream);
  const taught = new Set((taughtQuery.data || []).flatMap((row) => {
    const subjectId = String(row.subject_id);
    const rowStream = streamOf(row.stream);
    if (!combined && rowStream !== stream) return [];
    return [combined ? `${rowStream}|${subjectId}` : subjectId];
  }));
  const canEdit = (paper: SittingPaper) => !markbookClosed(paper.status) && (office || taught.has(combined ? `${paper.stream}|${paper.subjectId}` : paper.subjectId));
  const scores = await fetchAll<ScoreRow>((from, to) =>
    supabase.from("assessment_scores").select("assessment_id, student_id, score, missed").in("assessment_id", papers.map((paper) => paper.id)).order("assessment_id").range(from, to),
  );
  const saved = new Map(scores.map((score) => [`${score.assessment_id}|${score.student_id}`, { score: num(score.score), missed: Boolean(score.missed) }]));
  const bands = ((bandsQuery.data || []) as Record<string, unknown>[]).map(mapBand);
  const subjects: MarksheetSubject[] = columns.map((column) => {
    const statuses = column.papers.map((paper) => sheetStatus(paper.status));
    const status = statuses.every((item) => item === "approved") ? "approved" : statuses.some((item) => item !== "open") ? "submitted" : "open";
    const samplePaper = column.papers[0];
    return {
      id: combined ? column.subjectId : samplePaper.id,
      subjectId: column.subjectId,
      name: column.name,
      href: combined ? "" : `${ACADEMICS_BASE}/assessments/${samplePaper.id}`,
      status,
      maxScore: column.maxScore,
      weight: column.weight,
      locked: column.papers.every((paper) => markbookClosed(paper.status)),
      editable: column.papers.some((paper) => canEdit(paper)),
    };
  });
  const pupils: MarksheetPupil[] = roster.map((pupil, rollIndex) => {
    const pupilStream = streamOf(pupil.stream);
    const cells = columns.map((column) => column.papers.find((paper) => paper.stream === pupilStream) || null);
    return {
      id: pupil.id,
      name: pupil.full_name,
      number: pupil.student_number || "",
      photoPath: pupil.photo_path,
      href: `${ACADEMICS_BASE}/students/${pupil.id}`,
      roll: rollIndex,
      stream: pupilStream,
      papers: cells.map((paper) => paper ? {
        id: paper.id,
        status: sheetStatus(paper.status),
        locked: markbookClosed(paper.status),
        editable: canEdit(paper),
        maxScore: paper.maxScore,
        weight: paper.weight,
      } : { id: "", status: "open" as const, locked: false, editable: false, maxScore: 0, weight: 0 }),
      marks: cells.map((paper) => {
        if (!paper) return { score: null, missed: false, bandId: "" };
        const mark = saved.get(`${paper.id}|${pupil.id}`);
        if (!mark || (!mark.missed && mark.score === null)) return { score: null, missed: false, bandId: "" };
        if (mark.missed) return { score: null, missed: true, bandId: "" };
        const score = mark.score ?? 0;
        return { score, missed: false, bandId: nursery ? bandFor(bands, score)?.id || "" : "" };
      }),
    };
  });
  const sample = papers[0];

  if (!roster.length) {
    return (
      <div className="app-page ofc-page asm-page msh-page">
        <PageHeader kicker="Assessment" icon="fa-table-cells" title={label} description={<>{sample?.name} · {kindLabel(kind)} · {shortDay(sample?.heldOn || null)} · {term.label}</>} actions={<Link className="admin-hero-btn" href={`${ACADEMICS_BASE}/assessments`}>All papers</Link>} />
        <Empty title="No pupils in this class" />
      </div>
    );
  }

  return (
    <MarksheetDesk
      subjects={subjects}
      pupils={pupils}
      office={office}
      nursery={nursery}
      streamCount={streamCount}
      bands={bands.map((band) => ({ id: band.id, label: band.label, midpoint: bandMidpoint(band) }))}
      heading={{
        classLabel: label,
        kindLabel: kindLabel(kind),
        heldLabel: shortDay(sample?.heldOn || null),
        termLabel: term.label,
      }}
      identity={{ termId: term.id, name, kind, heldOn: held, classCode, stream, combine: combined }}
    />
  );
}
