import Link from "next/link";
import { redirect } from "next/navigation";
import { saveClassTeacherMarksheet, saveClassTeacherMarksheetScores } from "@/app/teacher/actions";
import { DevelopmentalMarksheetDesk } from "@/components/academics/DevelopmentalMarksheetDesk";
import { MarksheetDesk, type MarksheetPupil, type MarksheetStatus, type MarksheetSubject } from "@/components/academics/MarksheetDesk";
import { AcademicsGate, Empty } from "@/components/academics/ui";
import {
  MarksheetClassPicker,
  MarksheetNotice,
  MarksheetSittingPicker,
  NurseryDsbaSittingPicker,
} from "@/components/teacher/MarksheetHome";
import {
  bandMidpoint,
  classLabel,
  classSection,
  kindLabel,
  mapBand,
  markbookClosed,
  num,
  streamFromQuery,
  streamOf,
  streamQuery,
  type BandRow,
} from "@/lib/academics";
import { loadRoll } from "@/lib/academics-roll";
import { operationalCampus } from "@/lib/campuses";
import {
  marksheetHref,
  readCombinedMarksheetQuery,
  readMarksheetQuery,
  sittingKey,
  type CombinedSitting,
  type SittingPaper,
} from "@/lib/marksheet";
import {
  groupSkillsByDomain,
  loadDivisionCatalogue,
  mapDevelopmentalAssessment,
  nurseryDivision,
} from "@/lib/nursery-dsba";
import { fetchAll, isUuid } from "@/lib/students";
import { normalizeSubjectKind } from "@/lib/subject-kind";
import { leadsClass, TEACHER_BASE } from "@/lib/teacher";
import { requireTeacher } from "@/lib/teacher-access";

export const metadata = { title: "Marksheet" };

const PATH = `${TEACHER_BASE}/marksheet`;

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
  status: string | null;
  subjects: { name?: string; sort_order?: number | string; kind?: string | null } | { name?: string; sort_order?: number | string; kind?: string | null }[] | null;
};

type ScoreRow = { assessment_id: string; student_id: string; score: number | string | null; missed: boolean };

type SittingChoice = {
  key: string;
  name: string;
  kind: string;
  heldOn: string;
  kindLabel: string;
  heldLabel: string;
  subjects: number;
  open: number;
  href: string;
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
  return (
    bands.find((band) => Math.abs(bandMidpoint(band) - score) < 0.2) ||
    bands.find((band) => score >= band.min_score && score <= band.max_score) ||
    null
  );
}

function classHref(post: { classCode: string; stream: string; campus: string }) {
  const params = new URLSearchParams({
    class: post.classCode,
    stream: streamQuery(post.stream),
    campus: post.campus,
  });
  return `${PATH}?${params.toString()}`;
}

export default async function TeacherMarksheetPage({
  searchParams,
}: {
  searchParams: Promise<{
    name?: string;
    kind?: string;
    held?: string;
    class?: string;
    stream?: string;
    campus?: string;
    mode?: string;
    s?: string | string[];
    dsba?: string;
  }>;
}) {
  const query = await searchParams;
  const teacher = await requireTeacher();
  if ("error" in teacher) return <AcademicsGate title="Marksheet" state={{ notice: "auth", message: teacher.error }} />;
  if (teacher.termError) return <AcademicsGate title="Marksheet" state={{ notice: "schema", message: teacher.termError }} />;
  if (!teacher.classes.length) {
    return (
      <Empty icon="fa-table-cells" title="Not a class teacher">
        The marksheet is for the class you lead this term.
      </Empty>
    );
  }

  const { supabase, user, term, classes } = teacher;
  if (!term) {
    return (
      <MarksheetNotice
        title="Marksheet"
        lede="Set a current term before opening a marksheet."
        emptyTitle="No current term"
      >
        Ask the academics office to mark a term as current.
      </MarksheetNotice>
    );
  }

  const classCode = query.class || "";
  const stream = streamFromQuery(query.stream);
  const wantedCampus = query.campus || "";

  if (!classCode && classes.length === 1) {
    redirect(classHref(classes[0]));
  }

  const current =
    classes.find(
      (post) =>
        post.classCode === classCode &&
        (stream === null || post.stream === stream) &&
        (!wantedCampus || post.campus === wantedCampus) &&
        leadsClass(classes, post.classCode, post.stream, post.campus),
    ) || null;

  if (!current) {
    return (
      <MarksheetClassPicker
        termLabel={term.label}
        classes={classes.map((post) => ({
          key: `${post.campus}|${post.classCode}|${post.stream}`,
          label: post.label,
          campus: post.campus,
          href: classHref(post),
        }))}
      />
    );
  }

  if (classSection(current.classCode) === "nursery") {
    const classesHref = classes.length > 1 ? PATH : undefined;
    const backToClass = classHref(current);
    const dsbaQuery = await supabase
      .from("developmental_assessments")
      .select("*")
      .eq("term_id", term.id)
      .eq("class_code", current.classCode)
      .eq("stream", streamOf(current.stream))
      .order("held_on", { ascending: false });
    if (dsbaQuery.error) {
      return <AcademicsGate title="Marksheet" state={{ notice: "schema", message: dsbaQuery.error.message }} />;
    }
    const dsbaRows = ((dsbaQuery.data || []) as Record<string, unknown>[])
      .map((row) => mapDevelopmentalAssessment(row))
      .filter((row) => !row.campus || operationalCampus(row.campus) === current.campus);

    const led = current;
    function sittingHref(id: string) {
      const params = new URLSearchParams({
        class: led.classCode,
        stream: streamQuery(led.stream),
        campus: led.campus,
        dsba: id,
      });
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

    let selectedId = isUuid(query.dsba || "") ? String(query.dsba) : "";
    if (!selectedId) {
      const parsedNursery = readMarksheetQuery({
        name: query.name,
        kind: query.kind,
        held: query.held,
        classCode: current.classCode,
        stream: streamQuery(current.stream),
      });
      if (parsedNursery) {
        const match = dsbaRows.find(
          (row) =>
            row.name === parsedNursery.name &&
            row.kind === parsedNursery.kind &&
            (row.held_on || "") === (parsedNursery.held || ""),
        );
        if (match) selectedId = match.id;
      }
    }

    if (selectedId) {
      const paper = dsbaRows.find((row) => row.id === selectedId);
      if (!paper) {
        return (
          <MarksheetNotice
            title={current.label}
            lede={`${term.label} · Developmental Skills-Based Assessment`}
            emptyTitle="Sitting not found"
            actions={
              <Link className="tch-hero-btn is-primary" href={backToClass}>
                <i className="fa-solid fa-list" aria-hidden="true" /> Assessments
              </Link>
            }
          >
            That developmental sitting is not on this class list.
          </MarksheetNotice>
        );
      }
      const divisionId = nurseryDivision(paper.class_code);
      if (!divisionId) {
        return <AcademicsGate title="Marksheet" state={{ notice: "schema", message: "This class is not a nursery division." }} />;
      }
      const [pupils, ratingsQuery, catalogue] = await Promise.all([
        loadRoll(supabase, user.id, [paper.class_code], [current.campus]).then((rows) =>
          rows.filter((pupil) => pupil.class_code === paper.class_code && streamOf(pupil.stream) === streamOf(paper.stream)),
        ),
        supabase.from("skill_ratings").select("student_id, skill_id, progress_code_id").eq("assessment_id", paper.id),
        loadDivisionCatalogue(supabase, divisionId),
      ]);
      if ("error" in catalogue) {
        return <AcademicsGate title="Marksheet" state={{ notice: "schema", message: catalogue.error }} />;
      }
      if (ratingsQuery.error) {
        return <AcademicsGate title="Marksheet" state={{ notice: "schema", message: ratingsQuery.error.message }} />;
      }
      if (!pupils.length) {
        return (
          <MarksheetNotice
            title={current.label}
            lede={`${term.label} · ${paper.name}`}
            emptyTitle="No pupils on this roll"
            actions={
              <Link className="tch-hero-btn is-primary" href={backToClass}>
                <i className="fa-solid fa-list" aria-hidden="true" /> Sittings
              </Link>
            }
          >
            Add pupils to this class before entering skill codes.
          </MarksheetNotice>
        );
      }
      const grouped = groupSkillsByDomain(catalogue.domains, catalogue.skills);
      const ratings: Record<string, string> = {};
      for (const row of ratingsQuery.data || []) {
        if (row.progress_code_id) ratings[`${row.student_id}|${row.skill_id}`] = String(row.progress_code_id);
      }
      const phase = paper.status === "approved" ? "approved" : paper.status === "submitted" ? "submitted" : "open";
      const exportParams = new URLSearchParams({
        dsba: paper.id,
        campus: current.campus,
      });
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
          office={false}
          heading={{
            classLabel: classLabel(paper.class_code, paper.stream),
            sittingName: paper.name,
            kindLabel: kindLabel(paper.kind),
            heldLabel: shortDay(paper.held_on),
            termLabel: term.label,
          }}
          closeHref={backToClass}
          exportHref={`${PATH}/export?${exportParams.toString()}`}
          allowExport
        />
      );
    }

    return (
      <NurseryDsbaSittingPicker
        classLabel={current.label}
        termLabel={term.label}
        campus={current.campus}
        sittings={sittings}
        classesHref={classesHref}
        assessmentsHref={`${TEACHER_BASE}/assessments`}
      />
    );
  }

  const parsed = readMarksheetQuery({
    name: query.name,
    kind: query.kind,
    held: query.held,
    classCode: current.classCode,
    stream: streamQuery(current.stream),
  });

  const papersQuery = await supabase
    .from("assessments")
    .select("id, subject_id, stream, campus, name, kind, max_score, weight, held_on, status, subjects(name, sort_order, kind)")
    .eq("term_id", term.id)
    .eq("class_code", current.classCode)
    .eq("stream", current.stream);

  if (papersQuery.error) {
    return <AcademicsGate title="Marksheet" state={{ notice: "schema", message: papersQuery.error.message }} />;
  }

  const allPapers = ((papersQuery.data || []) as PaperRow[]).filter(
    (paper) => operationalCampus(paper.campus) === current.campus && streamOf(paper.stream) === current.stream,
  );

  const sittingsMap = new Map<string, SittingChoice>();
  for (const paper of allPapers) {
    const heldOn = paper.held_on || "";
    const key = `${paper.name}\u001f${paper.kind}\u001f${heldOn}`;
    const existing = sittingsMap.get(key);
    const open = paper.status !== "submitted" && paper.status !== "approved";
    if (!existing) {
      sittingsMap.set(key, {
        key,
        name: paper.name,
        kind: paper.kind,
        heldOn,
        kindLabel: kindLabel(paper.kind),
        heldLabel: shortDay(paper.held_on),
        subjects: 1,
        open: open ? 1 : 0,
        href: marksheetHref({
          name: paper.name,
          kind: paper.kind,
          classCode: current.classCode,
          stream: current.stream,
          heldOn,
          campus: current.campus,
          basePath: PATH,
        }),
      });
    } else {
      existing.subjects += 1;
      if (open) existing.open += 1;
    }
  }
  const sittings = [...sittingsMap.values()].sort((a, b) => {
    const held = (b.heldOn || "").localeCompare(a.heldOn || "") || a.heldLabel.localeCompare(b.heldLabel);
    if (held) return held;
    return a.kindLabel.localeCompare(b.kindLabel) || a.name.localeCompare(b.name);
  });

  const backToClass = classHref(current);
  const classesHref = classes.length > 1 ? PATH : undefined;

  const combined = readCombinedMarksheetQuery({
    mode: query.mode,
    classCode: current.classCode,
    stream: streamQuery(current.stream),
    sittings: query.s,
  });

  if (!parsed && !combined) {
    return (
      <MarksheetSittingPicker
        classLabel={current.label}
        termLabel={term.label}
        campus={current.campus}
        classCode={current.classCode}
        stream={current.stream}
        basePath={PATH}
        sittings={sittings}
        classesHref={classesHref}
      />
    );
  }

  const selectedSittings: CombinedSitting[] = combined
    ? combined.sittings
    : parsed
      ? [{ name: parsed.name, kind: parsed.kind, held: parsed.held }]
      : [];

  const sittingOrder = new Map(selectedSittings.map((sitting, index) => [sittingKey(sitting), index]));
  const sittingMeta = new Map(
    selectedSittings.map((sitting) => [
      sittingKey(sitting),
      {
        name: sitting.name,
        kindLabel: kindLabel(sitting.kind),
        heldLabel: shortDay(sitting.held || null),
      },
    ]),
  );

  const papers = allPapers
    .filter((paper) => sittingOrder.has(`${paper.name}\u001f${paper.kind}\u001f${paper.held_on || ""}`))
    .map((paper) => {
      const key = `${paper.name}\u001f${paper.kind}\u001f${paper.held_on || ""}`;
      return { paper: sittingPaper(paper), key };
    })
    .sort((a, b) => {
      const bySitting = (sittingOrder.get(a.key) ?? 0) - (sittingOrder.get(b.key) ?? 0);
      if (bySitting) return bySitting;
      return a.paper.sort - b.paper.sort || a.paper.name.localeCompare(b.paper.name) || a.paper.id.localeCompare(b.paper.id);
    });

  if (!papers.length) {
    return (
      <MarksheetNotice
        title={current.label}
        lede={<>{term.label}. This assessment is not on the list for this class.</>}
        emptyTitle="This marksheet is not on the list"
        actions={
          <>
            <Link className="tch-hero-btn is-primary" href={backToClass}>
              <i className="fa-solid fa-list" aria-hidden="true" /> Assessments
            </Link>
            {classesHref ? (
              <Link className="tch-hero-btn" href={classesHref}>
                <i className="fa-solid fa-layer-group" aria-hidden="true" /> Classes
              </Link>
            ) : null}
          </>
        }
      >
        <Link href={backToClass}>Choose another assessment</Link>
      </MarksheetNotice>
    );
  }

  const sheetPapers = papers.map((entry) => entry.paper);
  const isCombined = Boolean(combined);
  const nursery = false;
  const [roll] = await Promise.all([
    loadRoll(supabase, user.id, [current.classCode], [current.campus]),
  ]);
  const bandsQuery = { data: [] as Record<string, unknown>[], error: null as { message: string } | null };

  const roster = roll.filter(
    (pupil) =>
      pupil.class_code === current.classCode &&
      streamOf(pupil.stream) === current.stream &&
      operationalCampus(pupil.campus) === current.campus,
  );

  const headingLede = isCombined
    ? `${selectedSittings.length} assessments · ${term.label}`
    : `${parsed!.name} · ${kindLabel(parsed!.kind)} · ${shortDay(sheetPapers[0]?.heldOn || null)} · ${term.label}`;

  if (!roster.length) {
    return (
      <MarksheetNotice
        title={current.label}
        lede={headingLede}
        emptyTitle="No pupils in this class"
        actions={
          <Link className="tch-hero-btn is-primary" href={backToClass}>
            <i className="fa-solid fa-list" aria-hidden="true" /> Assessments
          </Link>
        }
      >
        Add pupils to this stream before entering marks.
      </MarksheetNotice>
    );
  }

  const canEdit = (paper: SittingPaper) => !markbookClosed(paper.status);
  const scores = await fetchAll<ScoreRow>((from, to) =>
    supabase
      .from("assessment_scores")
      .select("assessment_id, student_id, score, missed")
      .in(
        "assessment_id",
        sheetPapers.map((paper) => paper.id),
      )
      .order("assessment_id")
      .range(from, to),
  );
  const saved = new Map(
    scores.map((score) => [`${score.assessment_id}|${score.student_id}`, { score: num(score.score), missed: Boolean(score.missed) }]),
  );
  const bands = ((bandsQuery.data || []) as Record<string, unknown>[]).map(mapBand);

  const subjects: MarksheetSubject[] = papers.map(({ paper, key }) => {
    const meta = sittingMeta.get(key);
    const groupLabel = isCombined && meta ? `${meta.name} · ${meta.heldLabel}` : undefined;
    return {
      id: paper.id,
      subjectId: paper.subjectId,
      name: paper.name,
      href: "",
      status: sheetStatus(paper.status),
      maxScore: paper.maxScore,
      weight: paper.weight,
      locked: markbookClosed(paper.status),
      editable: canEdit(paper),
      kind: paper.kind || "core",
      groupKey: isCombined ? key : undefined,
      groupLabel,
      sittingLabel: groupLabel,
    };
  });

  const pupils: MarksheetPupil[] = roster.map((pupil, rollIndex) => ({
    id: pupil.id,
    name: pupil.full_name,
    number: pupil.student_number || "",
    photoPath: pupil.photo_path,
    href: `${TEACHER_BASE}/marksheet`,
    roll: rollIndex,
    stream: streamOf(pupil.stream),
    papers: sheetPapers.map((paper) => ({
      id: paper.id,
      status: sheetStatus(paper.status),
      locked: markbookClosed(paper.status),
      editable: canEdit(paper),
      maxScore: paper.maxScore,
      weight: paper.weight,
    })),
    marks: sheetPapers.map((paper) => {
      const mark = saved.get(`${paper.id}|${pupil.id}`);
      if (!mark || (!mark.missed && mark.score === null)) return { score: null, missed: false, bandId: "" };
      if (mark.missed) return { score: null, missed: true, bandId: "" };
      const score = mark.score ?? 0;
      return { score, missed: false, bandId: nursery ? bandFor(bands, score)?.id || "" : "" };
    }),
  }));

  const combinedNames = selectedSittings.map((sitting) => sitting.name).join(" · ");
  const identitySittings = selectedSittings.map((sitting) => ({
    name: sitting.name,
    kind: sitting.kind,
    heldOn: sitting.held,
  }));

  return (
    <MarksheetDesk
      subjects={subjects}
      pupils={pupils}
      office={false}
      nursery={nursery}
      streamCount={1}
      allowExport={true}
      closeHref={backToClass}
      sheetHrefBase={PATH}
      exportHrefBase={`${PATH}/export`}
      saveAction={saveClassTeacherMarksheet}
      saveScoresAction={saveClassTeacherMarksheetScores}
      bands={bands.map((band) => ({ id: band.id, label: band.label, midpoint: bandMidpoint(band) }))}
      heading={{
        classLabel: current.label,
        kindLabel: isCombined ? "Combined" : kindLabel(parsed!.kind),
        heldLabel: isCombined ? `${selectedSittings.length} assessments` : shortDay(sheetPapers[0]?.heldOn || null),
        termLabel: term.label,
      }}
      identity={{
        termId: term.id,
        name: isCombined ? combinedNames : parsed!.name,
        kind: isCombined ? selectedSittings[0]?.kind || parsed!.kind : parsed!.kind,
        heldOn: isCombined ? "" : parsed!.held,
        classCode: current.classCode,
        stream: current.stream,
        combine: false,
        campus: current.campus,
        combined: isCombined,
        sittings: isCombined ? identitySittings : undefined,
      }}
    />
  );
}
