import Link from "next/link";
import { notFound } from "next/navigation";
import { saveIntervention } from "@/app/academics_office/(desk)/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import { StudentFace } from "@/components/StudentFace";
import {
  PupilDesk,
  type AttendanceDay,
  type AttendancePicture,
  type ContactView,
  type PaperMark,
  type ReportLine,
  type ReportView,
} from "@/components/academics/PupilDesk";
import { AcademicsGate } from "@/components/academics/ui";
import {
  ACADEMICS_BASE,
  ATTENDANCE_STATUSES,
  INTERVENTION_REASONS,
  classLabel,
  kampalaToday,
  kindLabel,
  mapTerm,
  num,
  openAcademics,
  reasonLabel,
  streamOf,
  streamQuery,
  type AttendanceStatus,
} from "@/lib/academics";
import { OFFICE, isUuid, splitName, studentAge } from "@/lib/students";

export const metadata = { title: "Pupil" };

const RICH = "id, full_name, surname, given_names, preferred_name, student_number, class_code, stream, campus, status, sex, date_of_birth, age, house, family_id, father_name, father_phone, mother_name, mother_phone, home_area, photo_path";
const PLAIN = "id, full_name, student_number, class_code, stream, campus, status";

type Directory = {
  id: string;
  full_name: string;
  surname?: string | null;
  given_names?: string | null;
  student_number: string;
  class_code: string | null;
  stream: string | null;
  campus: string | null;
  status: string;
  sex?: string | null;
  date_of_birth?: string | null;
  age?: number | null;
  house?: string | null;
  preferred_name?: string | null;
  family_id?: string | null;
  father_name?: string | null;
  father_phone?: string | null;
  mother_name?: string | null;
  mother_phone?: string | null;
  home_area?: string | null;
  photo_path?: string | null;
};

const ATTENDANCE = new Set<string>(ATTENDANCE_STATUSES.map((entry) => entry.value));

export default async function PupilPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Pupil" state={opened} />;
  const { supabase, office } = opened.auth;

  let { data: pupil, error } = await supabase.from("student_directory").select(RICH).eq("id", id).maybeSingle();
  if (error) {
    const fallback = await supabase.from("student_directory").select(PLAIN).eq("id", id).maybeSingle();
    pupil = fallback.data;
    error = fallback.error;
  }
  if (error) return <AcademicsGate title="Pupil" state={{ notice: "schema", message: error.message }} />;
  if (!pupil) notFound();
  const row = pupil as Directory;

  const termQuery = await supabase.from("fee_terms").select("id, year, term, label, starts_on, ends_on, is_current").eq("is_current", true).maybeSingle();
  const term = termQuery.data ? mapTerm(termQuery.data as Record<string, unknown>) : null;
  const stream = streamOf(row.stream);

  const [attendance, card, scores, interventions, teacher, formal] = await Promise.all([
    term
      ? supabase.from("attendance").select("attended_on, status, note").eq("student_id", id).eq("term_id", term.id).order("attended_on", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    term
      ? supabase.from("report_cards").select("id, status, overall_score, overall_position, conduct, class_teacher_name, class_teacher_comment, head_comment, days_present, days_opened").eq("student_id", id).eq("term_id", term.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("assessment_scores").select("score, missed, assessments!inner(id, name, kind, held_on, max_score, term_id, subjects(name))").eq("student_id", id),
    term
      ? supabase.from("learner_interventions").select("id, reason, note, follow_up_on, status").eq("student_id", id).eq("term_id", term.id).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    term && row.class_code
      ? supabase.from("class_teachers").select("teaching_staff(full_name)").eq("term_id", term.id).eq("class_code", row.class_code).eq("stream", stream).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("students").select("formal_name").eq("id", id).maybeSingle(),
  ]);
  const schemaError = [attendance.error, card.error, scores.error, interventions.error].find((item) => item && /does not exist|schema cache/i.test(item.message));
  if (schemaError) return <AcademicsGate title="Pupil" state={{ notice: "schema", message: schemaError.message }} />;

  let lines: ReportLine[] = [];
  if (card.data?.id) {
    const lineQuery = await supabase.from("report_lines").select("subject_name, score, grade, position, teacher_comment").eq("report_card_id", card.data.id);
    if (lineQuery.error && /does not exist|schema cache/i.test(lineQuery.error.message)) {
      return <AcademicsGate title="Pupil" state={{ notice: "schema", message: lineQuery.error.message }} />;
    }
    lines = ((lineQuery.data || []) as Record<string, unknown>[]).map((line) => ({
      subject: String(line.subject_name || "Subject"),
      score: num(line.score),
      grade: line.grade ? String(line.grade) : null,
      position: num(line.position),
      comment: line.teacher_comment ? String(line.teacher_comment) : null,
    })).sort((a, b) => a.subject.localeCompare(b.subject));
  }

  const days: AttendanceDay[] = [];
  const counts = { present: 0, late: 0, absent: 0, excused: 0 };
  for (const mark of attendance.data || []) {
    const status = String(mark.status);
    if (!ATTENDANCE.has(status)) continue;
    const key = status as AttendanceStatus;
    counts[key] += 1;
    if (days.length < 12) days.push({ date: String(mark.attended_on), status: key, note: mark.note ? String(mark.note) : null });
  }
  const picture: AttendancePicture = { ...counts, days };

  const marks: PaperMark[] = [];
  for (const score of scores.data || []) {
    const paper = one(score.assessments) as { id?: string; name?: string; kind?: string; held_on?: string | null; max_score?: unknown; term_id?: string; subjects?: { name?: string } | { name?: string }[] | null } | null;
    if (!paper) continue;
    if (term && paper.term_id && paper.term_id !== term.id) continue;
    const subject = one(paper.subjects);
    marks.push({
      key: `${paper.id || marks.length}-${score.score ?? "x"}`,
      subject: subject?.name || "Subject",
      paper: paper.name || "Paper",
      kind: paper.kind || "test",
      kindLabel: paper.kind ? kindLabel(paper.kind) : "Paper",
      score: num(score.score),
      max: num(paper.max_score) || 100,
      missed: Boolean(score.missed),
      held: paper.held_on || null,
    });
  }

  const staff = teacher.data ? one((teacher.data as { teaching_staff?: { full_name?: string } | { full_name?: string }[] | null }).teaching_staff) : null;
  const sex = row.sex === "M" || row.sex === "F" ? row.sex : null;
  const age = typeof row.age === "number" ? row.age : studentAge(row.date_of_birth);
  const contacts: ContactView[] = [
    row.father_name ? { role: "Father", name: row.father_name, phone: row.father_phone || null } : null,
    row.mother_name ? { role: "Mother", name: row.mother_name, phone: row.mother_phone || null } : null,
  ].filter((person): person is ContactView => Boolean(person));

  const report: ReportView | null = card.data ? {
    id: card.data.id,
    href: `${ACADEMICS_BASE}/reports/${card.data.id}`,
    status: String(card.data.status),
    score: num(card.data.overall_score),
    position: num(card.data.overall_position),
    conduct: card.data.conduct ? String(card.data.conduct) : null,
    teacher: card.data.class_teacher_name ? String(card.data.class_teacher_name) : null,
    comment: card.data.class_teacher_comment ? String(card.data.class_teacher_comment) : null,
    head: card.data.head_comment ? String(card.data.head_comment) : null,
    daysPresent: num(card.data.days_present),
    daysOpened: num(card.data.days_opened),
    lines,
  } : null;

  const formalName = formal.data && !formal.error ? String((formal.data as { formal_name?: string | null }).formal_name || "") : "";
  const storedSurname = row.surname?.trim() || "";
  const storedGiven = row.given_names?.trim() || "";
  const parts = storedSurname || storedGiven ? { surname: storedSurname, given: storedGiven } : splitName(row.full_name);
  const names = [
    parts.surname ? { label: "Surname", value: parts.surname } : null,
    parts.given ? { label: "Given names", value: parts.given } : null,
    row.preferred_name?.trim() ? { label: "Known as", value: row.preferred_name.trim() } : null,
    formalName.trim() && formalName.trim() !== row.full_name ? { label: "Formal name", value: formalName.trim() } : null,
  ].filter((part): part is { label: string; value: string } => Boolean(part));
  const facts = [row.campus, row.house, age != null ? `${age} years` : ""].filter(Boolean);

  return (
    <div className="app-page ofc-page pup-page">
      <PageHeader
        kicker="Pupil"
        icon="fa-user-graduate"
        title={row.full_name}
        description={
          <>
            {names.length ? (
              <span className="pup-names">
                {names.map((part) => (
                  <span key={part.label}><em>{part.label}</em><strong>{part.value}</strong></span>
                ))}
              </span>
            ) : null}
            <span>{row.student_number} · {classLabel(row.class_code, row.stream)}{term ? <> · <strong>{term.label}</strong></> : null}</span>
          </>
        }
        actions={
          <>
            {row.class_code ? <Link className="admin-hero-btn" href={`${ACADEMICS_BASE}/classes/${row.class_code}?stream=${streamQuery(stream)}`}><i className="fa-solid fa-chalkboard" aria-hidden="true" /> Class</Link> : null}
            {row.class_code ? <Link className="admin-hero-btn" href={`${ACADEMICS_BASE}/attendance?date=${kampalaToday()}&class=${row.class_code}&stream=${streamQuery(stream)}`}><i className="fa-solid fa-clipboard-user" aria-hidden="true" /> Register</Link> : null}
            {report ? <Link className="admin-hero-btn is-primary" href={report.href}><i className="fa-solid fa-file-lines" aria-hidden="true" /> Report card</Link> : null}
          </>
        }
      >
        <div className="pup-portrait">
          <StudentFace id={row.id} name={row.full_name} photoPath={row.photo_path} className={`pup-face${sex === "F" ? " is-girl" : sex === "M" ? " is-boy" : ""}`} />
          <div>
            <span>Class teacher</span>
            <strong>{staff?.full_name || "Not assigned"}</strong>
            <small>{[...facts, row.status !== "active" ? row.status : ""].filter(Boolean).join(" · ") || "Active this term"}</small>
          </div>
        </div>
      </PageHeader>
      <PupilDesk
        pupil={{
          id: row.id,
          admissionsHref: office ? `${OFFICE}/students/${row.id}` : null,
        }}
        term={term?.label ?? null}
        attendance={picture}
        marks={marks}
        report={report}
        interventions={(interventions.data || []).map((item) => ({
          id: String(item.id),
          reason: reasonLabel(String(item.reason)),
          note: String(item.note),
          followUp: item.follow_up_on ? String(item.follow_up_on) : null,
          status: String(item.status),
        }))}
        contacts={contacts}
        home={row.home_area || null}
        office={office}
        termId={term?.id ?? null}
        reasons={INTERVENTION_REASONS.map((reason) => ({ value: reason.value, label: reason.label }))}
        save={saveIntervention}
      />
    </div>
  );
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
