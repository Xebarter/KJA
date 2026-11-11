import type { SheetActivity, SheetCard } from "@/components/academics/ReportSheet";
import {
  classLabel,
  classSection,
  gradeBandSection,
  gradeBandSectionsToLoad,
  num,
  scaleBands,
  type ReportSet,
} from "@/lib/academics";
import { cardSets, loadReportParts, loadReportSkillLines, loadSubjectInitials, parseProgressLegend } from "@/lib/academics-reports";
import {
  activeAwards,
  formatPoints,
  mapPointAward,
  schemaMissing,
  tallyAwards,
  type PointAward,
} from "@/lib/points";
import { loadReportClosing } from "@/lib/report-closing";
import { STUDENT_PHOTO_BUCKET } from "@/lib/student-photos";
import { isCocurricularSubject } from "@/lib/subject-kind";
import type { SupabaseClient } from "@supabase/supabase-js";

export type { OnlineReportTab } from "@/lib/online-report-tabs";
export { ONLINE_REPORT_TABS, parseOnlineReportTab } from "@/lib/online-report-tabs";

export type OnlineProgressSet = { key: string; label: string; share: number; average: number | null; count: number };
export type OnlineProgressSubject = {
  subjectId: string;
  name: string;
  total: number | null;
  parts: { key: string; label: string; score: number | null }[];
};

export type OnlineTermRow = {
  id: string;
  label: string;
  year: number;
  term: number;
  overallScore: number | null;
  overallGrade: string | null;
  overallAggregate: number | null;
  current: boolean;
};

export type OnlinePointsBundle = {
  total: number;
  given: number;
  taken: number;
  count: number;
  reasons: { label: string; points: number; count: number }[];
  awards: { id: string; points: number; label: string; reason: string; teacher: string; at: string }[];
  missing: boolean;
};

export type OnlineOtherSubject = {
  id: string;
  name: string;
  percent: number | null;
  level: string | null;
  sittings: { label: string; percent: number | null }[];
};

export type OnlineLibraryBook = {
  id: string;
  title: string;
  authors: string;
  issuedOn: string;
  dueOn: string;
  returnedOn: string | null;
};

export type OnlineAttendanceDay = { attended_on: string; status: "present" | "late" | "absent" | "excused" };

export type OnlineAttendanceBundle = {
  present: number;
  late: number;
  absent: number;
  excused: number;
  total: number;
  percent: number;
  daysPresent: number | null;
  daysOpened: number | null;
  recent: OnlineAttendanceDay[];
  byMonth: { key: string; label: string; present: number; marked: number }[];
};

export type OnlineClub = {
  id: string;
  title: string;
  campus: string | null;
  meeting: string | null;
  paid: boolean;
};

export type OnlineReportBundle = {
  id: string;
  nursery: boolean;
  pupilName: string;
  studentNumber: string | null;
  termLabel: string;
  classLabel: string;
  sheet: SheetCard;
  portraitSrc: string | null;
  progress: { sets: OnlineProgressSet[]; subjects: OnlineProgressSubject[] };
  terms: OnlineTermRow[];
  points: OnlinePointsBundle;
  other: OnlineOtherSubject[];
  library: OnlineLibraryBook[];
  attendance: OnlineAttendanceBundle;
  clubs: OnlineClub[];
};

type FeeTerm = {
  label?: string | null;
  year?: number | null;
  term?: number | null;
  starts_on?: string | null;
  ends_on?: string | null;
};

function asTerm(value: FeeTerm | FeeTerm[] | null | undefined): FeeTerm | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function termWindow(term: FeeTerm | null, year: number | null, termNo: number | null) {
  if (term?.starts_on && term?.ends_on) {
    return { start: term.starts_on.slice(0, 10), end: term.ends_on.slice(0, 10) };
  }
  if (year && termNo) {
    const startMonth = termNo === 1 ? "01" : termNo === 2 ? "05" : "09";
    const endMonth = termNo === 1 ? "04" : termNo === 2 ? "08" : "12";
    return { start: `${year}-${startMonth}-01`, end: `${year}-${endMonth}-31` };
  }
  return null;
}

function percentOf(score: number | null | undefined, max: number | null | undefined) {
  if (score == null || Number.isNaN(score)) return null;
  const ceiling = max && max > 0 ? max : 100;
  return Math.round((Number(score) / ceiling) * 1000) / 10;
}

async function reportPortraitSrc(supabase: SupabaseClient, photoPath: string | null | undefined): Promise<string | null> {
  if (!photoPath) return null;
  const file = await supabase.storage.from(STUDENT_PHOTO_BUCKET).download(photoPath);
  if (!file.data) return null;
  const bytes = Buffer.from(await file.data.arrayBuffer());
  const type = file.data.type || "image/jpeg";
  return `data:${type};base64,${bytes.toString("base64")}`;
}

function buildProgress(sheet: SheetCard, sets: ReportSet[]) {
  const subjects: OnlineProgressSubject[] = sheet.lines.map((line) => ({
    subjectId: line.subject_id,
    name: line.subject_name,
    total: line.score,
    parts: (line.parts || []).map((part) => ({ key: part.key, label: part.label, score: part.score })),
  }));

  const progressSets: OnlineProgressSet[] = sets.map((set) => {
    const scores = subjects
      .map((subject) => subject.parts.find((part) => part.key === set.key)?.score)
      .filter((score): score is number => score != null && !Number.isNaN(score));
    const average = scores.length ? Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 10) / 10 : null;
    return { key: set.key, label: set.label, share: set.share, average, count: scores.length };
  });

  return { sets: progressSets, subjects };
}

function summarizeAttendance(
  days: OnlineAttendanceDay[],
  daysPresent: number | null,
  daysOpened: number | null,
): OnlineAttendanceBundle {
  const present = days.filter((d) => d.status === "present").length;
  const late = days.filter((d) => d.status === "late").length;
  const absent = days.filter((d) => d.status === "absent").length;
  const excused = days.filter((d) => d.status === "excused").length;
  const total = days.length;
  const percent = total ? Math.round(((present + late) / total) * 100) : 0;

  const months = new Map<string, { key: string; label: string; present: number; marked: number }>();
  for (const day of days) {
    const key = day.attended_on.slice(0, 7);
    const label = new Date(`${key}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
    const row = months.get(key) || { key, label, present: 0, marked: 0 };
    row.marked += 1;
    if (day.status === "present" || day.status === "late") row.present += 1;
    months.set(key, row);
  }

  return {
    present,
    late,
    absent,
    excused,
    total,
    percent,
    daysPresent,
    daysOpened,
    recent: [...days].sort((a, b) => b.attended_on.localeCompare(a.attended_on)).slice(0, 21),
    byMonth: [...months.values()].sort((a, b) => a.key.localeCompare(b.key)),
  };
}

function reasonBreakdown(awards: PointAward[]) {
  const map = new Map<string, { label: string; points: number; count: number }>();
  for (const award of activeAwards(awards)) {
    const key = award.reasonLabel || "Other";
    const row = map.get(key) || { label: key, points: 0, count: 0 };
    row.points += award.points;
    row.count += 1;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => Math.abs(b.points) - Math.abs(a.points) || b.count - a.count);
}

/** Supabase builders are PromiseLike (no .catch); wrap so optional packs cannot fail the whole page. */
async function softQuery<T>(query: PromiseLike<T> | Promise<T>, message: string): Promise<T> {
  try {
    return await query;
  } catch {
    return {
      data: null,
      error: { message },
      count: null,
      status: 500,
      statusText: message,
    } as T;
  }
}

/** Public QR report payload — service role, UUID is the access key. */
export async function loadOnlineReportBundle(supabase: SupabaseClient, id: string): Promise<OnlineReportBundle | null> {
  const { data: card } = await supabase
    .from("report_cards")
    .select("*, fee_terms(label, year, term, starts_on, ends_on)")
    .eq("id", id)
    .maybeSingle();
  if (!card) return null;

  const nursery = classSection(card.class_code) === "nursery";
  const markSection = gradeBandSection(card.class_code);
  const termMeta = asTerm(card.fee_terms as FeeTerm | FeeTerm[] | null);
  const termLabel = termMeta?.label || "Term";
  const termId = String(card.term_id);
  const studentId = String(card.student_id);
  const window = termWindow(termMeta, num(termMeta?.year), num(termMeta?.term));

  const [
    { data: pupil },
    { data: lines },
    parts,
    skillLinesByCard,
    initials,
    bands,
    { data: activityRows },
    historyPack,
    pointsPack,
    attendancePack,
    libraryPack,
    clubsPack,
    otherSittings,
  ] = await Promise.all([
    supabase.from("students").select("full_name, student_number, photo_path, campus, date_of_birth").eq("id", studentId).maybeSingle(),
    supabase.from("report_lines").select("*").eq("report_card_id", id),
    loadReportParts(supabase, [id]),
    loadReportSkillLines(supabase, [id]),
    card.class_code
      ? loadSubjectInitials(supabase, { termId, classCode: card.class_code, stream: card.stream || "" })
      : Promise.resolve(new Map<string, string>()),
    supabase
      .from("grade_bands")
      .select("label, min_score, max_score, sort_order, section")
      .in("section", gradeBandSectionsToLoad(card.class_code))
      .order("sort_order"),
    supabase
      .from("report_card_activities")
      .select("slot, activity_name, level, comment, score, max_score, subject_id")
      .eq("report_card_id", id)
      .order("slot"),
    softQuery(
      supabase
        .from("report_cards")
        .select("id, overall_score, overall_grade, overall_aggregate, status, fee_terms(label, year, term)")
        .eq("student_id", studentId)
        .or(`status.eq.published,id.eq.${id}`)
        .order("id"),
      "history unavailable",
    ),
    softQuery(
      supabase
        .from("point_awards")
        .select("id, student_id, term_id, staff_id, teacher_name, points, reason_id, reason_label, created_at, voided_at")
        .eq("student_id", studentId)
        .eq("term_id", termId)
        .is("voided_at", null)
        .order("created_at", { ascending: false }),
      "point_awards unavailable",
    ),
    softQuery(
      supabase
        .from("attendance")
        .select("attended_on, status")
        .eq("student_id", studentId)
        .eq("term_id", termId)
        .order("attended_on", { ascending: false }),
      "attendance unavailable",
    ),
    window
      ? softQuery(
          supabase
            .from("library_loans")
            .select("id, issued_at, due_at, returned_at, library_items(library_titles(title, authors))")
            .eq("student_id", studentId)
            .gte("issued_at", `${window.start}T00:00:00`)
            .lte("issued_at", `${window.end}T23:59:59`)
            .order("issued_at", { ascending: false }),
          "library unavailable",
        )
      : Promise.resolve({ data: [] as never[], error: null }),
    (async () => {
      try {
        const consents = await supabase
          .from("club_consents")
          .select("id, club_id, consented_at")
          .eq("student_id", studentId)
          .is("withdrawn_at", null)
          .order("consented_at", { ascending: false });
        const clubIds = (consents.data || []).map((row) => String(row.club_id));
        const [clubs, payments] = await Promise.all([
          clubIds.length
            ? supabase.from("clubs").select("id, title, campus, meeting").in("id", clubIds)
            : Promise.resolve({ data: [] as { id: string; title: string; campus: string | null; meeting: string | null }[], error: null }),
          supabase.from("club_payments").select("club_id").eq("student_id", studentId).eq("term_id", termId).is("voided_at", null),
        ]);
        return {
          consents: consents.data || [],
          clubs: clubs.data || [],
          payments: payments.data || [],
          error: consents.error || clubs.error || payments.error,
        };
      } catch {
        return { consents: [], clubs: [], payments: [], error: { message: "clubs unavailable" } };
      }
    })(),
    softQuery(
      supabase
        .from("assessment_scores")
        .select("score, missed, assessments!inner(id, name, kind, max_score, term_id, subject_id, subjects(id, name, kind))")
        .eq("student_id", studentId)
        .eq("assessments.term_id", termId),
      "other subjects unavailable",
    ),
  ]);

  if (!pupil) return null;

  const activities: SheetActivity[] = [1, 2, 3, 4].map((slot) => {
    const row = (activityRows || []).find((item) => Number(item.slot) === slot) as
      | {
          activity_name?: string | null;
          level?: string | null;
          comment?: string | null;
          score?: number | null;
          max_score?: number | null;
        }
      | undefined;
    return {
      slot,
      activity_name: row?.activity_name ? String(row.activity_name) : null,
      level: row?.level ? String(row.level) : null,
      comment: row?.comment ? String(row.comment) : null,
      score: num(row?.score),
      max_score: num(row?.max_score),
    };
  });

  const sheet: SheetCard = {
    id,
    pupil_name: pupil.full_name,
    student_number: pupil.student_number,
    term_label: termLabel,
    term_year: num(termMeta?.year),
    report_title: (card as { report_title?: string | null }).report_title ?? null,
    class_code: card.class_code,
    stream: card.stream || "",
    class_teacher_name: card.class_teacher_name,
    class_teacher_comment: card.class_teacher_comment,
    head_comment: card.head_comment,
    cocurricular_comment: (card as { cocurricular_comment?: string | null }).cocurricular_comment ?? null,
    conduct: card.conduct,
    days_present: num(card.days_present),
    days_opened: num(card.days_opened),
    overall_score: num(card.overall_score),
    overall_aggregate: num((card as { overall_aggregate?: number | null }).overall_aggregate),
    overall_grade: (card as { overall_grade?: string | null }).overall_grade ?? null,
    overall_position: num(card.overall_position),
    status: card.status,
    student_id: studentId,
    photo_path: pupil.photo_path || null,
    date_of_birth: (pupil as { date_of_birth?: string | null }).date_of_birth || null,
    activities,
    lines: (lines || [])
      .map((line) => ({
        subject_id: String(line.subject_id),
        subject_name: String(line.subject_name),
        score: num(line.score),
        grade: (line.grade as string | null) ?? null,
        position: num(line.position),
        teacher_comment: (line.teacher_comment as string | null) ?? null,
        teacher_initials: initials.get(String(line.subject_id)) || null,
        parts: parts.get(`${id}:${line.subject_id}`) ?? [],
      }))
      .sort((a, b) => a.subject_name.localeCompare(b.subject_name)),
    skillLines: skillLinesByCard.get(id) || [],
    progressLegend: parseProgressLegend((card as { progress_legend?: unknown }).progress_legend),
    scale: scaleBands(markSection, card.grade_rules, bands.error ? null : bands.data),
  };

  const closing = await loadReportClosing(supabase, {
    termId,
    classCode: card.class_code,
    campus: pupil.campus,
  });
  sheet.fees = closing.fees;
  sheet.next_starts_on = closing.nextStartsOn;
  sheet.next_ends_on = closing.nextEndsOn;
  if (sheet.term_year == null && closing.termYear != null) sheet.term_year = closing.termYear;
  sheet.sets = cardSets(id, sheet.lines, parts);

  const place = classLabel(card.class_code, card.stream || "");

  const terms: OnlineTermRow[] = (historyPack.data || [])
    .map((row) => {
      const fee = asTerm(row.fee_terms as FeeTerm | FeeTerm[] | null);
      return {
        id: String(row.id),
        label: fee?.label || "Term",
        year: Number(fee?.year || 0),
        term: Number(fee?.term || 0),
        overallScore: num(row.overall_score),
        overallGrade: (row.overall_grade as string | null) ?? null,
        overallAggregate: num(row.overall_aggregate),
        current: String(row.id) === id,
      };
    })
    .sort((a, b) => a.year - b.year || a.term - b.term);

  const awards = ((pointsPack.data || []) as {
    id: string;
    student_id: string;
    term_id: string;
    staff_id: string | null;
    teacher_name: string;
    points: number;
    reason_id: string | null;
    reason_label: string;
    created_at: string;
    voided_at: string | null;
  }[]).map(mapPointAward);
  const pointsMissing = schemaMissing(pointsPack.error?.message);
  const tally = tallyAwards(awards);
  const points: OnlinePointsBundle = {
    ...tally,
    reasons: reasonBreakdown(awards),
    awards: activeAwards(awards).map((award) => ({
      id: award.id,
      points: award.points,
      label: formatPoints(award.points),
      reason: award.reasonLabel,
      teacher: award.teacherName,
      at: award.createdAt,
    })),
    missing: pointsMissing,
  };

  const attendanceDays: OnlineAttendanceDay[] = (attendancePack.data || [])
    .map((row) => ({
      attended_on: String(row.attended_on),
      status: row.status as OnlineAttendanceDay["status"],
    }))
    .filter((row) => ["present", "late", "absent", "excused"].includes(row.status));

  const library: OnlineLibraryBook[] = ((libraryPack.data || []) as {
    id: string;
    issued_at: string;
    due_at: string;
    returned_at: string | null;
    library_items?:
      | { library_titles?: { title?: string; authors?: string } | { title?: string; authors?: string }[] | null }
      | { library_titles?: { title?: string; authors?: string } | { title?: string; authors?: string }[] | null }[]
      | null;
  }[]).map((loan) => {
    const item = Array.isArray(loan.library_items) ? loan.library_items[0] : loan.library_items;
    const titleRow = item?.library_titles;
    const title = Array.isArray(titleRow) ? titleRow[0] : titleRow;
    return {
      id: loan.id,
      title: title?.title || "Library book",
      authors: title?.authors || "",
      issuedOn: String(loan.issued_at).slice(0, 10),
      dueOn: String(loan.due_at).slice(0, 10),
      returnedOn: loan.returned_at ? String(loan.returned_at).slice(0, 10) : null,
    };
  });

  const paidClubs = new Set((clubsPack.payments || []).map((row) => String(row.club_id)));
  const clubById = new Map((clubsPack.clubs || []).map((row) => [String(row.id), row]));
  const clubs: OnlineClub[] = (clubsPack.consents || [])
    .map((consent) => {
      const club = clubById.get(String(consent.club_id));
      if (!club) return null;
      return {
        id: String(consent.id),
        title: club.title,
        campus: club.campus,
        meeting: club.meeting,
        paid: paidClubs.has(String(club.id)),
      };
    })
    .filter((row): row is OnlineClub => Boolean(row));

  const otherMap = new Map<string, OnlineOtherSubject>();
  for (const activity of activities) {
    if (!activity.activity_name) continue;
    const percent = percentOf(activity.score ?? null, activity.max_score ?? 100);
    otherMap.set(`activity:${activity.slot}`, {
      id: `activity:${activity.slot}`,
      name: activity.activity_name,
      percent,
      level: activity.level,
      sittings: [],
    });
  }

  for (const row of otherSittings.data || []) {
    const assessment = row.assessments as
      | {
          name?: string;
          kind?: string;
          max_score?: number | null;
          subjects?: { id?: string; name?: string; kind?: string } | { id?: string; name?: string; kind?: string }[] | null;
        }
      | {
          name?: string;
          kind?: string;
          max_score?: number | null;
          subjects?: { id?: string; name?: string; kind?: string } | { id?: string; name?: string; kind?: string }[] | null;
        }[]
      | null;
    const paper = Array.isArray(assessment) ? assessment[0] : assessment;
    const subjectRow = paper?.subjects;
    const subject = Array.isArray(subjectRow) ? subjectRow[0] : subjectRow;
    if (!subject || !isCocurricularSubject(subject.kind)) continue;
    if ((row as { missed?: boolean }).missed) continue;
    const subjectId = String(subject.id || paper?.name || "other");
    const entry =
      otherMap.get(subjectId) ||
      ({
        id: subjectId,
        name: String(subject.name || "Other subject"),
        percent: null,
        level: null,
        sittings: [],
      } satisfies OnlineOtherSubject);
    const pct = percentOf(num((row as { score?: number | null }).score), num(paper?.max_score) ?? 100);
    entry.sittings.push({ label: String(paper?.name || "Assessment"), percent: pct });
    if (entry.percent == null && pct != null) entry.percent = pct;
    else if (entry.percent != null && pct != null) {
      const values = [...entry.sittings.map((s) => s.percent).filter((v): v is number => v != null)];
      entry.percent = values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : entry.percent;
    }
    otherMap.set(subjectId, entry);
  }

  const portraitSrc = await reportPortraitSrc(supabase, pupil.photo_path);

  return {
    id,
    nursery,
    pupilName: pupil.full_name,
    studentNumber: pupil.student_number,
    termLabel,
    classLabel: place,
    sheet,
    portraitSrc,
    progress: buildProgress(sheet, sheet.sets ?? []),
    terms,
    points,
    other: [...otherMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    library,
    attendance: summarizeAttendance(attendanceDays, sheet.days_present, sheet.days_opened),
    clubs,
  };
}
