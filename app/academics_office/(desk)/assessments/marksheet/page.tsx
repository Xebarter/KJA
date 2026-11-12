import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { DevelopmentalMarksheetDesk } from "@/components/academics/DevelopmentalMarksheetDesk";
import { MarksheetDesk, type MarksheetPupil, type MarksheetStatus, type MarksheetSubject } from "@/components/academics/MarksheetDesk";
import { AcademicsGate, Empty } from "@/components/academics/ui";
import { NurseryDsbaSittingPicker } from "@/components/teacher/MarksheetHome";
import { ACADEMICS_BASE, bandMidpoint, classLabel, classSection, kindLabel, loadCurrentTerm, markbookClosed, num, streamFromQuery, streamOf, streamQuery, type BandRow } from "@/lib/academics";
import { openAcademics } from "@/lib/academics-access";
import { loadRoll } from "@/lib/academics-roll";
import { operationalCampus } from "@/lib/campuses";
import { readMarksheetQuery, sittingColumns, type SittingPaper } from "@/lib/marksheet";
import {
  groupSkillsByDomain,
  loadDivisionCatalogue,
  mapDevelopmentalAssessment,
  nurseryDivision,
} from "@/lib/nursery-dsba";
import { fetchAll, isUuid } from "@/lib/students";
import { normalizeSubjectKind } from "@/lib/subject-kind";

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
  subjects: { name?: string; sort_order?: number | string; kind?: string | null } | { name?: string; sort_order?: number | string; kind?: string | null }[] | null;
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
    status: paper.status,
    heldOn: paper.held_on,
    kind: subject.kind,
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

export default async function MarksheetPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; kind?: string; held?: string; class?: string; stream?: string; combine?: string; dsba?: string; campus?: string }>;
}) {
  const query = await searchParams;
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Marksheet" state={opened} />;
  const { supabase, office, user, staffId, campuses } = opened.auth;
  const parsed = readMarksheetQuery({ name: query.name, kind: query.kind, held: query.held, classCode: query.class, stream: query.stream, combine: query.combine });
  const name = parsed?.name || "";
  const kind = parsed?.kind || "";
  const held = parsed?.held || "";
  const classCode = parsed?.classCode || (query.class || "").trim();
  const stream = parsed?.stream ?? streamFromQuery(query.stream);
  const dsbaParam = isUuid(query.dsba || "") ? String(query.dsba) : "";
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

  const nurseryClass = Boolean(classCode && classSection(classCode) === "nursery");
  if (!classCode || stream === null || (!parsed && !nurseryClass)) {
    return (
      <div className="app-page ofc-page asm-page msh-page">
        <PageHeader kicker="Assessment" icon="fa-table-cells" title="Marksheet" description={<>{term.label}. Open an assessment, then choose a class.</>} />
        <Empty title="Choose a class marksheet"><BackLink /></Empty>
      </div>
    );
  }

  const nursery = classSection(classCode) === "nursery";
  if (nursery) {
    const PATH = `${ACADEMICS_BASE}/assessments/marksheet`;
    const classListHref = `${PATH}?${new URLSearchParams({ class: classCode, stream: streamQuery(stream) }).toString()}`;
    const dsbaQuery = await supabase
      .from("developmental_assessments")
      .select("*")
      .eq("term_id", term.id)
      .eq("class_code", classCode)
      .eq("stream", stream)
      .order("held_on", { ascending: false });
    if (dsbaQuery.error) {
      return <AcademicsGate title="Marksheet" state={{ notice: "schema", message: dsbaQuery.error.message }} />;
    }
    const wantedCampus = (query.campus || "").trim();
    const dsbaRows = ((dsbaQuery.data || []) as Record<string, unknown>[])
      .map((row) => mapDevelopmentalAssessment(row))
      .filter((row) => {
        if (!row.campus) return true;
        const campus = operationalCampus(row.campus);
        if (wantedCampus) return campus === wantedCampus;
        if (office && campuses?.length) return campuses.includes(campus);
        return true;
      });

    const streamKey = stream;
    function sittingHref(id: string) {
      const params = new URLSearchParams({
        class: classCode,
        stream: streamQuery(streamKey),
        dsba: id,
      });
      if (wantedCampus) params.set("campus", wantedCampus);
      return `${PATH}?${params.toString()}`;
    }

    const sittings = dsbaRows.map((row) => ({
      id: row.id,
      name: row.name,
      kindLabel: kindLabel(row.kind),
      heldLabel: shortDay(row.held_on),
      status: (row.status === "approved" ? "approved" : row.status === "submitted" ? "submitted" : "open") as
        | "open"
        | "submitted"
        | "approved",
      href: sittingHref(row.id),
    }));

    let selectedId = dsbaParam;
    if (!selectedId && name && kind) {
      const match = dsbaRows.find(
        (row) => row.name === name && row.kind === kind && (row.held_on || "") === (held || ""),
      );
      if (match) selectedId = match.id;
    }
    if (!selectedId && sittings.length === 1) selectedId = sittings[0].id;

    if (selectedId) {
      const paper = dsbaRows.find((row) => row.id === selectedId);
      if (!paper) {
        return (
          <div className="app-page ofc-page asm-page msh-page">
            <PageHeader
              kicker="Assessment"
              icon="fa-table-cells"
              title={classLabel(classCode, stream)}
              description={<>{term.label} · Developmental Skills-Based Assessment</>}
              actions={<Link className="admin-hero-btn" href={classListHref}>Sittings</Link>}
            />
            <Empty title="Sitting not found">That developmental sitting is not on this class list.</Empty>
          </div>
        );
      }
      const divisionId = nurseryDivision(paper.class_code);
      if (!divisionId) {
        return <AcademicsGate title="Marksheet" state={{ notice: "schema", message: "This class is not a nursery division." }} />;
      }
      const campusFilter = wantedCampus || (paper.campus ? operationalCampus(paper.campus) : undefined);
      const [pupils, ratingRows, catalogue] = await Promise.all([
        loadRoll(supabase, user.id, [paper.class_code], office ? (campusFilter ? [campusFilter] : campuses) : undefined).then((rows) =>
          rows.filter((pupil) => pupil.class_code === paper.class_code && streamOf(pupil.stream) === streamOf(paper.stream)),
        ),
        fetchAll<{ student_id: string; skill_id: string; progress_code_id: string | null; numeric_value: number | null }>((from, to) =>
          supabase
            .from("skill_ratings")
            .select("student_id, skill_id, progress_code_id, numeric_value")
            .eq("assessment_id", paper.id)
            .order("student_id")
            .range(from, to),
        ),
        loadDivisionCatalogue(supabase, divisionId),
      ]);
      if ("error" in catalogue) {
        return <AcademicsGate title="Marksheet" state={{ notice: "schema", message: catalogue.error }} />;
      }
      if (!pupils.length) {
        return (
          <div className="app-page ofc-page asm-page msh-page">
            <PageHeader
              kicker="Assessment"
              icon="fa-table-cells"
              title={classLabel(paper.class_code, paper.stream)}
              description={<>{term.label} · {paper.name}</>}
              actions={<Link className="admin-hero-btn" href={classListHref}>Sittings</Link>}
            />
            <Empty title="No pupils on this roll">Add pupils to this class before entering skill codes.</Empty>
          </div>
        );
      }
      const grouped = groupSkillsByDomain(catalogue.domains, catalogue.skills);
      const ratings: Record<string, string> = {};
      for (const row of ratingRows) {
        if (row.progress_code_id) ratings[`${row.student_id}|${row.skill_id}`] = String(row.progress_code_id);
        else if (row.numeric_value !== null && row.numeric_value !== undefined) {
          ratings[`${row.student_id}|${row.skill_id}`] = String(row.numeric_value);
        }
      }
      const phase = paper.status === "approved" ? "approved" : paper.status === "submitted" ? "submitted" : "open";
      const exportParams = new URLSearchParams({ dsba: paper.id });
      if (campusFilter) exportParams.set("campus", campusFilter);
      return (
        <DevelopmentalMarksheetDesk
          assessmentId={paper.id}
          domains={grouped.map((row) => ({
            id: row.domain.id,
            name: row.domain.name,
            sort: row.domain.sort_order,
            skills: row.skills.map((skill) => ({
              id: skill.id,
              description: skill.description,
              sort: skill.sort_order,
              value_kind: skill.value_kind,
            })),
          }))}
          progressCodes={catalogue.progressCodes}
          pupils={pupils.map((pupil, index) => ({
            id: pupil.id,
            name: pupil.full_name,
            number: pupil.student_number || "",
            photoPath: pupil.photo_path,
            roll: index + 1,
          }))}
          ratings={ratings}
          phase={phase}
          office={office}
          heading={{
            classLabel: classLabel(paper.class_code, paper.stream),
            sittingName: paper.name,
            kindLabel: kindLabel(paper.kind),
            heldLabel: shortDay(paper.held_on),
            termLabel: term.label,
          }}
          closeHref={sittings.length > 1 ? classListHref : `${ACADEMICS_BASE}/assessments`}
          exportHref={`${PATH}/export?${exportParams.toString()}`}
          allowExport
        />
      );
    }

    return (
      <div className="app-page ofc-page asm-page msh-page">
        <NurseryDsbaSittingPicker
          classLabel={classLabel(classCode, stream)}
          termLabel={term.label}
          sittings={sittings}
          assessmentsHref={`${ACADEMICS_BASE}/assessments`}
        />
      </div>
    );
  }

  if (!parsed) {
    return (
      <div className="app-page ofc-page asm-page msh-page">
        <PageHeader kicker="Assessment" icon="fa-table-cells" title="Marksheet" description={<>{term.label}. Open an assessment, then choose a class.</>} />
        <Empty title="Choose a class marksheet"><BackLink /></Empty>
      </div>
    );
  }
  const combineRequested = Boolean(parsed?.combine);
  let papersRequest = supabase
    .from("assessments")
    .select("id, subject_id, stream, name, kind, max_score, weight, held_on, status, subjects(name, sort_order, kind)")
    .eq("term_id", term.id)
    .eq("name", name)
    .eq("kind", kind)
    .eq("class_code", classCode);
  if (!combineRequested) papersRequest = papersRequest.eq("stream", stream);
  papersRequest = held ? papersRequest.eq("held_on", held) : papersRequest.is("held_on", null);
  const [papersQuery, roll, taughtQuery] = await Promise.all([
    papersRequest,
    loadRoll(supabase, user.id, undefined, office ? campuses : undefined),
    !office && staffId
      ? supabase.from("subject_teachers").select("subject_id, stream").eq("term_id", term.id).eq("class_code", classCode).eq("staff_id", staffId)
      : Promise.resolve({ data: [] as { subject_id: string; stream: string | null }[], error: null }),
  ]);
  if (papersQuery.error) return <AcademicsGate title="Marksheet" state={{ notice: "schema", message: papersQuery.error.message }} />;
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
    : papers.map((paper) => ({
        subjectId: paper.subjectId,
        name: paper.name,
        sort: paper.sort,
        maxScore: paper.maxScore,
        weight: paper.weight,
        kind: paper.kind || "core" as const,
        papers: [paper],
      }));
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
  const bands: BandRow[] = [];
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
      kind: column.kind || samplePaper.kind || "core",
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
