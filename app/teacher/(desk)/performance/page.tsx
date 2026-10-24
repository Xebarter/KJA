import { Suspense } from "react";
import Link from "next/link";
import {
  PerformanceDesk,
  type PerfBand,
  type PerfKindOption,
  type PerfMark,
  type PerfPaper,
  type PerfPost,
  type PerfPupil,
  type PerfTone,
} from "@/components/teacher/PerformanceDesk";
import { AcademicsGate, Empty } from "@/components/academics/ui";
import {
  ASSESSMENT_KINDS,
  classSection,
  gradeFor,
  kindLabel,
  mapBand,
  num,
  ranks,
  streamOf,
  weightedPercent,
  type BandRow,
} from "@/lib/academics";
import { loadRoll } from "@/lib/academics-roll";
import { fetchAll } from "@/lib/students";
import { TEACHER_BASE } from "@/lib/teacher";
import { requireTeacher } from "@/lib/teacher-access";
import "./performance.css";

export const metadata = { title: "Performance" };

type PaperRow = {
  id: string;
  name: string;
  kind: string;
  max_score: number | string;
  weight: number | string;
  held_on: string | null;
  status: string | null;
};

type ScoreRow = {
  assessment_id: string;
  student_id: string;
  score: number | string | null;
  missed: boolean;
};

const nf = (value: number) => value.toLocaleString("en-GB");

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

function paperStatus(status: string | null): PerfPaper["status"] {
  if (status === "approved" || status === "submitted") return status;
  return "open";
}

function markText(score: number) {
  return score.toLocaleString("en-GB", { maximumFractionDigits: 1 });
}

function bandLabel(bands: BandRow[], score: number) {
  return (
    bands.find((band) => Math.abs(((band.min_score + band.max_score) / 2) - score) < 0.2)?.label ||
    bands.find((band) => score >= band.min_score && score <= band.max_score)?.label ||
    markText(score)
  );
}

function toneFor(percent: number | null): PerfTone {
  if (percent === null) return "mid";
  if (percent >= 80) return "high";
  if (percent < 50) return "low";
  return "mid";
}

function medianOf(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
}

function postKey(classCode: string, stream: string, subjectId: string) {
  return `${classCode}|${stream}|${subjectId}`;
}

export default async function TeacherPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ post?: string; pupil?: string; kind?: string }>;
}) {
  const query = await searchParams;
  const teacher = await requireTeacher();
  if ("error" in teacher) return <AcademicsGate title="Performance" state={{ notice: "auth", message: teacher.error }} />;
  if (teacher.termError) return <AcademicsGate title="Performance" state={{ notice: "schema", message: teacher.termError }} />;
  const { supabase, user, term, subjects } = teacher;
  if (!term) {
    return (
      <div className="app-page ofc-page tch-page perf-page">
        <header className="tch-hero">
          <p className="tch-hero-kicker">
            <i className="fa-solid fa-chart-column" aria-hidden="true" />
            Subjects
          </p>
          <h1>Performance</h1>
          <p className="tch-hero-lede">Class averages and pupil marks once a term is current.</p>
        </header>
        <Empty icon="fa-chart-column" title="No current term" />
      </div>
    );
  }
  if (!subjects.length) {
    return (
      <div className="app-page ofc-page tch-page perf-page">
        <header className="tch-hero">
          <p className="tch-hero-kicker">
            <i className="fa-solid fa-chart-column" aria-hidden="true" />
            {term.label}
          </p>
          <h1>Performance</h1>
          <p className="tch-hero-lede">Your assigned subjects appear here.</p>
        </header>
        <Empty icon="fa-chart-column" title="No subject assigned">
          Ask the academics office to assign your subjects.
        </Empty>
      </div>
    );
  }

  const posts: PerfPost[] = subjects.map((post) => ({
    key: postKey(post.classCode, post.stream, post.subjectId),
    subjectName: post.subjectName,
    label: post.label,
  }));
  const selected = subjects.find((post) => postKey(post.classCode, post.stream, post.subjectId) === query.post) || subjects[0];
  const selectedKey = postKey(selected.classCode, selected.stream, selected.subjectId);
  const nursery = classSection(selected.classCode) === "nursery";
  const kindFilter = ASSESSMENT_KINDS.some((entry) => entry.value === query.kind) ? String(query.kind) : "";

  const [pupils, allPapers, bandsQuery] = await Promise.all([
    loadRoll(supabase, user.id).then((roll) =>
      roll.filter((pupil) => pupil.class_code === selected.classCode && streamOf(pupil.stream) === selected.stream),
    ),
    fetchAll<PaperRow>((from, to) =>
      supabase
        .from("assessments")
        .select("id, name, kind, max_score, weight, held_on, status")
        .eq("term_id", term.id)
        .eq("class_code", selected.classCode)
        .eq("stream", selected.stream)
        .eq("subject_id", selected.subjectId)
        .order("held_on", { ascending: true })
        .order("id")
        .range(from, to),
    ),
    supabase.from("grade_bands").select("*").eq("section", nursery ? "nursery" : "primary").order("sort_order"),
  ]);

  if (bandsQuery.error) {
    return <AcademicsGate title="Performance" state={{ notice: "schema", message: bandsQuery.error.message }} />;
  }

  const kindOptions: PerfKindOption[] = ASSESSMENT_KINDS.map((entry) => ({
    value: entry.value,
    label: entry.label,
    count: allPapers.filter((paper) => paper.kind === entry.value).length,
  })).filter((entry) => entry.count > 0);

  const papers = kindFilter ? allPapers.filter((paper) => paper.kind === kindFilter) : allPapers;
  const bands = ((bandsQuery.data || []) as Record<string, unknown>[]).map(mapBand);
  const scores = papers.length
    ? await fetchAll<ScoreRow>((from, to) =>
        supabase
          .from("assessment_scores")
          .select("assessment_id, student_id, score, missed")
          .in(
            "assessment_id",
            papers.map((paper) => paper.id),
          )
          .order("assessment_id")
          .range(from, to),
      )
    : [];
  const saved = new Map(
    scores.map((score) => [`${score.assessment_id}|${score.student_id}`, { score: num(score.score), missed: Boolean(score.missed) }]),
  );

  const built = pupils.map((pupil) => {
    const marks = papers.map((paper) => {
      const max = num(paper.max_score) ?? 100;
      const weight = num(paper.weight) ?? 0;
      const mark = saved.get(`${paper.id}|${pupil.id}`);
      if (!mark || (!mark.missed && mark.score === null)) {
        return { text: "", tone: "blank" as const, score: null as number | null, missed: false, max, weight, percent: null as number | null };
      }
      if (mark.missed) {
        return { text: "Abs", tone: "missed" as const, score: null, missed: true, max, weight, percent: null };
      }
      const score = mark.score ?? 0;
      const percent = max > 0 ? (score / max) * 100 : null;
      return {
        text: nursery ? bandLabel(bands, score) : markText(score),
        tone: toneFor(percent),
        score,
        missed: false,
        max,
        weight,
        percent,
      };
    });
    const percent = weightedPercent(marks);
    const gaps = marks.filter((mark) => mark.tone === "blank").length;
    const missed = marks.filter((mark) => mark.missed).length;
    const grade = gradeFor(bands, nursery ? "nursery" : "primary", percent)?.label ?? null;
    return {
      pupil,
      marks,
      percent,
      gaps,
      missed,
      grade,
      watch: gaps > 0 || (percent !== null && percent < 50),
    };
  });

  const places = ranks(built.flatMap((row) => (row.percent === null ? [] : [{ id: row.pupil.id, value: row.percent }])));
  const deskPupils: PerfPupil[] = built.map((row) => ({
    id: row.pupil.id,
    name: row.pupil.full_name,
    number: row.pupil.student_number || "",
    photoPath: row.pupil.photo_path,
    percent: row.percent,
    grade: row.grade,
    place: places.get(row.pupil.id) ?? null,
    gaps: row.gaps,
    missed: row.missed,
    watch: row.watch,
    marks: row.marks.map(({ text, tone, percent }): PerfMark => ({ text, tone, percent })),
  }));

  const deskPapers: PerfPaper[] = papers.map((paper, index) => {
    const percents = built.flatMap((row) => {
      const mark = row.marks[index];
      if (!mark || mark.missed || mark.score === null || mark.max <= 0) return [];
      return [(mark.score / mark.max) * 100];
    });
    return {
      id: paper.id,
      name: paper.name,
      kind: paper.kind,
      kindLabel: kindLabel(paper.kind),
      weight: num(paper.weight) ?? 0,
      maxScore: num(paper.max_score) ?? 100,
      heldOn: shortDay(paper.held_on),
      status: paperStatus(paper.status),
      href: `${TEACHER_BASE}/assessments/${paper.id}`,
      average: percents.length ? Math.round((percents.reduce((sum, value) => sum + value, 0) / percents.length) * 10) / 10 : null,
      entered: built.filter((row) => row.marks[index]?.tone !== "blank").length,
      blank: built.filter((row) => row.marks[index]?.tone === "blank").length,
    };
  });

  const scored = deskPupils.filter((pupil) => pupil.percent !== null);
  const average = scored.length
    ? Math.round((scored.reduce((sum, pupil) => sum + (pupil.percent || 0), 0) / scored.length) * 10) / 10
    : null;
  const median = medianOf(scored.map((pupil) => pupil.percent as number));
  const watchCount = deskPupils.filter((pupil) => pupil.watch).length;
  const openPapers = deskPapers.filter((paper) => paper.status === "open").length;
  const bandSpread: PerfBand[] = bands.map((band) => ({
    label: band.label,
    count: deskPupils.filter((pupil) => pupil.grade === band.label).length,
  }));
  const selectedPupilId = query.pupil && deskPupils.some((pupil) => pupil.id === query.pupil) ? query.pupil : null;

  return (
    <div className="app-page ofc-page tch-page perf-page">
      <header className="tch-hero">
        <p className="tch-hero-kicker">
          <i className="fa-solid fa-chart-column" aria-hidden="true" />
          Performance · {term.label}
        </p>
        <h1>{selected.subjectName}</h1>
        <p className="tch-hero-lede">
          {selected.label}
          {kindFilter ? ` · ${kindLabel(kindFilter)}` : ""}
          {" · "}
          {nf(pupils.length)} pupils · {nf(deskPapers.length)} papers
        </p>
        <div className="tch-hero-actions">
          <Link className="tch-hero-btn is-primary" href={`${TEACHER_BASE}/assessments`}>
            <i className="fa-solid fa-pen-to-square" aria-hidden="true" />
            Markbooks
          </Link>
        </div>
      </header>

      {!allPapers.length ? (
        <Empty icon="fa-file-lines" title="No papers yet">
          <Link href={`${TEACHER_BASE}/assessments`}>Open assessments</Link>
        </Empty>
      ) : !pupils.length ? (
        <Empty icon="fa-users" title="No pupils on the roll" />
      ) : (
        <>
          <section className="perf-strip" aria-label="Snapshot">
            <div>
              <span className="perf-strip-icon" aria-hidden="true">
                <i className="fa-solid fa-chart-line" />
              </span>
              <div>
                <span>Average</span>
                <strong>{average === null ? "—" : `${average}%`}</strong>
                <small>Weighted class mean</small>
              </div>
            </div>
            <div>
              <span className="perf-strip-icon" aria-hidden="true">
                <i className="fa-solid fa-chart-simple" />
              </span>
              <div>
                <span>Median</span>
                <strong>{median === null ? "—" : `${median}%`}</strong>
                <small>Middle pupil</small>
              </div>
            </div>
            <div className={watchCount ? "is-warn" : "is-ok"}>
              <span className="perf-strip-icon" aria-hidden="true">
                <i className={`fa-solid ${watchCount ? "fa-triangle-exclamation" : "fa-heart-circle-check"}`} />
              </span>
              <div>
                <span>Watch</span>
                <strong>{nf(watchCount)}</strong>
                <small>{watchCount ? "Gaps or below 50%" : "None flagged"}</small>
              </div>
            </div>
            <div className={openPapers ? "is-warn" : "is-ok"}>
              <span className="perf-strip-icon" aria-hidden="true">
                <i className={`fa-solid ${openPapers ? "fa-folder-open" : "fa-lock"}`} />
              </span>
              <div>
                <span>Open papers</span>
                <strong>{nf(openPapers)}</strong>
                <small>{openPapers ? "Still taking marks" : "All locked or submitted"}</small>
              </div>
            </div>
          </section>

          <Suspense fallback={<div className="perf-loading">Loading the class sheet…</div>}>
            <PerformanceDesk
              posts={posts}
              selectedPost={selectedKey}
              kinds={kindOptions}
              selectedKind={kindFilter}
              papers={deskPapers}
              pupils={deskPupils}
              bands={bandSpread}
              selectedPupilId={selectedPupilId}
              nursery={nursery}
              assessmentsHref={`${TEACHER_BASE}/assessments`}
            />
          </Suspense>
        </>
      )}
    </div>
  );
}
