import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { MarksheetDesk, type MarksheetMark, type MarksheetPupil, type MarksheetStatus, type MarksheetSubject } from "@/components/academics/MarksheetDesk";
import { AcademicsGate, Empty } from "@/components/academics/ui";
import { ACADEMICS_BASE, ASSESSMENT_KINDS, bandMidpoint, classLabel, classSection, kindLabel, loadCurrentTerm, mapBand, num, ranks, streamFromQuery, streamOf, weightedPercent, type BandRow } from "@/lib/academics";
import { openAcademics } from "@/lib/academics-access";
import { loadRoll } from "@/lib/academics-roll";
import { fetchAll, isClassCode } from "@/lib/students";

export const metadata = { title: "Marksheet" };

type PaperRow = {
  id: string;
  subject_id: string;
  name: string;
  kind: string;
  max_score: number | string;
  weight: number | string;
  held_on: string | null;
  status: string | null;
  subjects: { name?: string; sort_order?: number | string } | { name?: string; sort_order?: number | string }[] | null;
};

type ScoreRow = { assessment_id: string; student_id: string; score: number | string | null; missed: boolean };

const nf = (value: number) => value.toLocaleString("en-GB");

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

function sheetStatus(status: string | null): MarksheetStatus {
  if (status === "approved" || status === "submitted") return status;
  return "open";
}

function markText(score: number) {
  return score.toLocaleString("en-GB", { maximumFractionDigits: 1 });
}

function bandLabel(bands: BandRow[], score: number) {
  return bands.find((band) => Math.abs(bandMidpoint(band) - score) < 0.2)?.label
    || bands.find((band) => score >= band.min_score && score <= band.max_score)?.label
    || markText(score);
}

function BackLink() {
  return <Link href={`${ACADEMICS_BASE}/assessments`}>All papers</Link>;
}

export default async function MarksheetPage({ searchParams }: { searchParams: Promise<{ name?: string; kind?: string; held?: string; class?: string; stream?: string }> }) {
  const query = await searchParams;
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Marksheet" state={opened} />;
  const { supabase, office, user } = opened.auth;
  const name = (query.name || "").trim().slice(0, 200);
  const kind = (query.kind || "").trim();
  const held = (query.held || "").trim();
  const classCode = (query.class || "").trim();
  const stream = streamFromQuery(query.stream);
  const valid = name.length >= 2 && ASSESSMENT_KINDS.some((entry) => entry.value === kind) && isClassCode(classCode) && stream !== null && (!held || /^\d{4}-\d{2}-\d{2}$/.test(held));
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
  if (!valid || stream === null) {
    return (
      <div className="app-page ofc-page asm-page msh-page">
        <PageHeader kicker="Assessment" icon="fa-table-cells" title="Marksheet" description={<>{term.label}. Open an assessment, then choose a class.</>} />
        <Empty title="Choose a class marksheet"><BackLink /></Empty>
      </div>
    );
  }

  const nursery = classSection(classCode) === "nursery";
  let papersRequest = supabase
    .from("assessments")
    .select("id, subject_id, name, kind, max_score, weight, held_on, status, subjects(name, sort_order)")
    .eq("term_id", term.id)
    .eq("name", name)
    .eq("kind", kind)
    .eq("class_code", classCode)
    .eq("stream", stream);
  papersRequest = held ? papersRequest.eq("held_on", held) : papersRequest.is("held_on", null);
  const [papersQuery, roll, bandsQuery] = await Promise.all([
    papersRequest,
    loadRoll(supabase, user.id),
    nursery ? supabase.from("grade_bands").select("*").eq("section", "nursery").order("sort_order") : Promise.resolve({ data: [], error: null }),
  ]);
  if (papersQuery.error) return <AcademicsGate title="Marksheet" state={{ notice: "schema", message: papersQuery.error.message }} />;
  if (bandsQuery.error) return <AcademicsGate title="Marksheet" state={{ notice: "schema", message: bandsQuery.error.message }} />;
  const papers = ((papersQuery.data || []) as PaperRow[]).sort((a, b) => {
    const left = subjectOf(a.subjects);
    const right = subjectOf(b.subjects);
    return left.sort - right.sort || left.name.localeCompare(right.name);
  });
  const label = classLabel(classCode, stream);
  if (!papers.length) {
    return (
      <div className="app-page ofc-page asm-page msh-page">
        <PageHeader kicker="Assessment" icon="fa-table-cells" title={label} description={<>{term.label}. This assessment is not on the list for this class.</>} actions={<Link className="admin-hero-btn" href={`${ACADEMICS_BASE}/assessments`}>All papers</Link>} />
        <Empty title="This marksheet is not on the list"><BackLink /></Empty>
      </div>
    );
  }

  const roster = roll.filter((pupil) => pupil.class_code === classCode && streamOf(pupil.stream) === stream);
  const scores = await fetchAll<ScoreRow>((from, to) =>
    supabase.from("assessment_scores").select("assessment_id, student_id, score, missed").in("assessment_id", papers.map((paper) => paper.id)).order("assessment_id").range(from, to),
  );
  const saved = new Map(scores.map((score) => [`${score.assessment_id}|${score.student_id}`, { score: num(score.score), missed: Boolean(score.missed) }]));
  const bands = ((bandsQuery.data || []) as Record<string, unknown>[]).map(mapBand);
  const built = roster.map((pupil) => {
    const marks = papers.map((paper) => {
      const max = num(paper.max_score) ?? 100;
      const weight = num(paper.weight) ?? 0;
      const mark = saved.get(`${paper.id}|${pupil.id}`);
      if (!mark || (!mark.missed && mark.score === null)) {
        return { text: "", tone: "blank" as const, score: null as number | null, missed: false, max, weight };
      }
      if (mark.missed) return { text: "Abs", tone: "missed" as const, score: null, missed: true, max, weight };
      const score = mark.score ?? 0;
      const percent = max > 0 ? (score / max) * 100 : null;
      const tone: MarksheetMark["tone"] = percent === null ? "mid" : percent >= 80 ? "high" : percent < 50 ? "low" : "mid";
      return { text: nursery ? bandLabel(bands, score) : markText(score), tone, score, missed: false, max, weight };
    });
    return {
      pupil,
      marks,
      average: weightedPercent(marks),
      gaps: marks.filter((mark) => mark.tone === "blank").length,
    };
  });
  const positions = ranks(built.flatMap((row) => row.average === null ? [] : [{ id: row.pupil.id, value: row.average }]));
  const pupils: MarksheetPupil[] = built.map((row) => ({
    id: row.pupil.id,
    name: row.pupil.full_name,
    number: row.pupil.student_number || "",
    photoPath: row.pupil.photo_path,
    href: `${ACADEMICS_BASE}/students/${row.pupil.id}`,
    average: row.average,
    position: positions.get(row.pupil.id) ?? null,
    gaps: row.gaps,
    marks: row.marks.map(({ text, tone }) => ({ text, tone })),
  }));
  const subjects: MarksheetSubject[] = papers.map((paper, index) => {
    const percents = built.flatMap((row) => {
      const mark = row.marks[index];
      if (!mark || mark.missed || mark.score === null || mark.max <= 0) return [];
      return [(mark.score / mark.max) * 100];
    });
    return {
      id: paper.id,
      name: subjectOf(paper.subjects).name,
      href: `${ACADEMICS_BASE}/assessments/${paper.id}`,
      status: sheetStatus(paper.status),
      entered: built.filter((row) => row.marks[index]?.tone !== "blank").length,
      blank: built.filter((row) => row.marks[index]?.tone === "blank").length,
      average: percents.length ? Math.round((percents.reduce((sum, value) => sum + value, 0) / percents.length) * 10) / 10 : null,
    };
  });
  const entered = built.reduce((sum, row) => sum + row.marks.filter((mark) => mark.tone !== "blank").length, 0);
  const places = roster.length * papers.length;
  const waiting = subjects.filter((subject) => subject.status !== "approved" && (subject.status === "submitted" || subject.entered > 0)).length;
  const approved = subjects.filter((subject) => subject.status === "approved").length;
  const ready = subjects.filter((subject) => subject.status !== "approved" && subject.blank === 0).length;
  const scored = pupils.filter((pupil) => pupil.average !== null);
  const classAverage = scored.length ? Math.round((scored.reduce((sum, pupil) => sum + (pupil.average || 0), 0) / scored.length) * 10) / 10 : null;
  const sample = papers[0];

  return (
    <div className="app-page ofc-page asm-page msh-page">
      <PageHeader
        kicker="Assessment"
        icon="fa-table-cells"
        title={label}
        description={<>{sample?.name} · {kindLabel(String(sample?.kind))} · {shortDay(sample?.held_on || null)} · {term.label}</>}
        actions={<Link className="admin-hero-btn" href={`${ACADEMICS_BASE}/assessments`}><i className="fa-solid fa-arrow-left" aria-hidden="true" /> All papers</Link>}
      />
      {roster.length ? (
        <>
          <section className="asm-strip" aria-label="This marksheet">
            <div>
              <span className="asm-stat-icon" aria-hidden="true"><i className="fa-solid fa-user-group" /></span>
              <span className="asm-stat-copy"><span>On roll</span><strong>{nf(roster.length)}</strong><small>{nf(subjects.length)} {subjects.length === 1 ? "subject" : "subjects"}</small></span>
            </div>
            <div className={entered < places ? "is-warn" : "is-ok"}>
              <span className="asm-stat-icon" aria-hidden="true"><i className="fa-solid fa-list-check" /></span>
              <span className="asm-stat-copy"><span>Marks in</span><strong>{nf(entered)}</strong><small>{places ? `Of ${nf(places)} places` : "No places yet"}</small></span>
            </div>
            <div className={ready || (waiting && approved !== subjects.length) ? "is-warn" : approved === subjects.length ? "is-ok" : ""}>
              <span className="asm-stat-icon" aria-hidden="true"><i className="fa-solid fa-inbox" /></span>
              <span className="asm-stat-copy"><span>To approve</span><strong>{nf(ready)}</strong><small>{waiting ? `${nf(waiting)} handed in` : approved === subjects.length ? "All locked" : "Nothing ready"}</small></span>
            </div>
            <div className={subjects.length && approved === subjects.length ? "is-ok" : ""}>
              <span className="asm-stat-icon" aria-hidden="true"><i className="fa-solid fa-lock" /></span>
              <span className="asm-stat-copy"><span>Locked</span><strong>{nf(approved)}</strong><small>{classAverage === null ? "No average yet" : `${classAverage.toLocaleString("en-GB", { maximumFractionDigits: 1 })}% class average`}</small></span>
            </div>
          </section>
          <MarksheetDesk
            subjects={subjects}
            pupils={pupils}
            office={office}
            nursery={nursery}
            identity={{ termId: term.id, name, kind, heldOn: held, classCode, stream }}
          />
        </>
      ) : <Empty title="No pupils in this class" />}
    </div>
  );
}
