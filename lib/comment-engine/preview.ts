import { classLabel } from "@/lib/academics";
import { buildNurseryDevProfile } from "./nursery-analyse";
import { generateCommentsForReport } from "./generate";
import type { CommentConfig, GeneratedUnit, ReportInput } from "./types";
import { validateConfiguration } from "./config";

const BAND_LABEL: Record<string, string> = {
  excellent: "Excellent",
  very_good: "Very good",
  good: "Good",
  fair: "Fair",
  needs_improvement: "Needs improvement",
  weak: "Weak",
  incomplete: "Incomplete",
};

/** Fixed learner used on the comments desk so staff can see the bank in action. */
export const SAMPLE_REPORT: ReportInput = {
  reportId: "preview",
  studentId: "preview",
  firstName: "Amina",
  classCode: "P4",
  stream: "A",
  termId: "preview",
  subjects: [
    { subjectId: "1", subjectName: "Mathematics", score: 88, maxScore: 100, percent: 88, status: "assessed", sortOrder: 1 },
    { subjectId: "2", subjectName: "English", score: 74, maxScore: 100, percent: 74, status: "assessed", sortOrder: 2 },
    { subjectId: "3", subjectName: "Science", score: 61, maxScore: 100, percent: 61, status: "assessed", sortOrder: 3 },
  ],
  activities: [
    {
      slot: 1,
      activityName: "Music",
      level: "Excellent",
      score: 92,
      maxScore: 100,
      skills: [{ label: "rhythm", acquired: true }],
    },
    {
      slot: 2,
      activityName: "Sports",
      level: "Good",
      score: 78,
      maxScore: 100,
      skills: [{ label: "teamwork", acquired: true }],
    },
    { slot: 3, activityName: null, level: null },
    { slot: 4, activityName: null, level: null },
  ],
};

/** Nursery sample with mixed progress codes for the Comments desk Nursery mode. */
export const SAMPLE_NURSERY_REPORT: ReportInput = {
  reportId: "preview-nursery",
  studentId: "preview-nursery",
  firstName: "Amina",
  sex: "F",
  classCode: "Baby",
  stream: "A",
  termId: "preview",
  nursery: true,
  subjects: [],
  activities: [
    { slot: 1, activityName: null, level: null },
    { slot: 2, activityName: null, level: null },
    { slot: 3, activityName: null, level: null },
    { slot: 4, activityName: null, level: null },
  ],
  skillLines: [
    { skill_id: "1", domain_id: "d1", domain_name: "Language Skills", skill_description: "Listens to short stories and answers questions", progress_code: "M", progress_label: "Strong mastery", domain_sort: 1, skill_sort: 1 },
    { skill_id: "2", domain_id: "d1", domain_name: "Language Skills", skill_description: "Likes to look at picture books", progress_code: "S", progress_label: "Satisfactory Progress", domain_sort: 1, skill_sort: 2 },
    { skill_id: "3", domain_id: "d2", domain_name: "Maths Skills", skill_description: "Counts by rote to 10", progress_code: "M", progress_label: "Strong mastery", domain_sort: 2, skill_sort: 1 },
    { skill_id: "4", domain_id: "d2", domain_name: "Maths Skills", skill_description: "Recognizes numbers up to 5", progress_code: "D", progress_label: "Developing", domain_sort: 2, skill_sort: 2 },
    { skill_id: "5", domain_id: "d3", domain_name: "Personal & Social Development", skill_description: "Gets along with other children", progress_code: "M", progress_label: "Strong mastery", domain_sort: 3, skill_sort: 1 },
    { skill_id: "6", domain_id: "d3", domain_name: "Personal & Social Development", skill_description: "Likes teachers", progress_code: "M", progress_label: "Strong mastery", domain_sort: 3, skill_sort: 2 },
    { skill_id: "7", domain_id: "d3", domain_name: "Personal & Social Development", skill_description: "Shares with others", progress_code: "NP", progress_label: "Needs more practice", domain_sort: 3, skill_sort: 3 },
    { skill_id: "8", domain_id: "d4", domain_name: "Physical and Motor Skills", skill_description: "Hops on spot", progress_code: "P", progress_label: "Progressing", domain_sort: 4, skill_sort: 1 },
    { skill_id: "9", domain_id: "d5", domain_name: "Music", skill_description: "Recalls songs, chants and rhymes with ease", progress_code: "M", progress_label: "Strong mastery", domain_sort: 5, skill_sort: 1 },
    { skill_id: "10", domain_id: "d5", domain_name: "Music", skill_description: "Likes singing", progress_code: "S", progress_label: "Satisfactory Progress", domain_sort: 5, skill_sort: 2 },
  ],
};

export type CommentPreviewLine = {
  label: string | null;
  text: string;
  tone: "ok" | "watch" | "bad";
};

export type CommentPreview = {
  learner: string;
  klass: string;
  academic: string;
  cocurricular: string;
  marks: string;
  warnings: number;
  sections: {
    id: string;
    title: string;
    lines: CommentPreviewLine[];
  }[];
};

function bandLabel(code: string | null) {
  if (!code) return "Not set";
  return BAND_LABEL[code] || code.replace(/_/g, " ");
}

function lineTone(status: GeneratedUnit["status"]): CommentPreviewLine["tone"] {
  if (status === "failed") return "bad";
  if (status === "needs_review") return "watch";
  return "ok";
}

function lineFrom(unit: GeneratedUnit, label: string | null): CommentPreviewLine {
  const problem = unit.validation.errors.find((error) => error !== "Not generated.") || unit.explanation;
  return {
    label,
    text: unit.text || problem || "No comment produced.",
    tone: unit.text ? lineTone(unit.status) : "bad",
  };
}

export function buildSamplePreview(config: CommentConfig): CommentPreview {
  const result = generateCommentsForReport(SAMPLE_REPORT, config);
  const names = new Map(SAMPLE_REPORT.subjects.map((subject) => [subject.subjectId, subject.subjectName]));
  const subjects = result.units
    .filter((unit) => unit.commentType === "subject_teacher" && (unit.text || unit.status === "failed"))
    .map((unit) => lineFrom(unit, names.get(unit.subjectId || "") || "Subject"));
  const take = (type: GeneratedUnit["commentType"]) =>
    result.units.find((unit) => unit.commentType === type && !unit.activitySlot);
  const sections: CommentPreview["sections"] = [
    { id: "subject_teacher", title: "Subjects", lines: subjects },
  ];
  const activityNames = new Map(
    SAMPLE_REPORT.activities
      .filter((activity) => activity.activityName)
      .map((activity) => [activity.slot, activity.activityName!]),
  );
  const activityLines = result.units
    .filter((unit) => unit.commentType === "cocurricular" && unit.activitySlot && (unit.text || unit.status === "failed"))
    .map((unit) => lineFrom(unit, activityNames.get(unit.activitySlot!) || `Activity ${unit.activitySlot}`));
  const coco = take("cocurricular");
  const klass = take("class_teacher");
  const head = take("headteacher");
  if (activityLines.length) sections.push({ id: "cocurricular", title: "Co-curricular activities", lines: activityLines });
  else if (coco) sections.push({ id: "cocurricular", title: "Co-curricular", lines: [lineFrom(coco, null)] });
  if (klass) sections.push({ id: "class_teacher", title: "Class teacher", lines: [lineFrom(klass, null)] });
  if (head) sections.push({ id: "headteacher", title: "Headteacher", lines: [lineFrom(head, null)] });

  const marks = [
    ...SAMPLE_REPORT.subjects.map((subject) => `${subject.subjectName} ${subject.percent}`),
    ...SAMPLE_REPORT.activities
      .filter((activity) => activity.activityName)
      .map((activity) => `${activity.activityName} ${activity.score ?? activity.level}`),
  ].join(" · ");

  return {
    learner: SAMPLE_REPORT.firstName,
    klass: classLabel(SAMPLE_REPORT.classCode, SAMPLE_REPORT.stream),
    academic: bandLabel(result.profile.academicBand),
    cocurricular: bandLabel(result.profile.cocurricularBand),
    marks,
    warnings: validateConfiguration(config).length,
    sections,
  };
}

/** Nursery Comments-desk preview from progress-code skill lines. */
export function buildNurserySamplePreview(config: CommentConfig): CommentPreview {
  const result = generateCommentsForReport(SAMPLE_NURSERY_REPORT, config);
  const klass = result.units.find((unit) => unit.commentType === "class_teacher");
  const profile = buildNurseryDevProfile(SAMPLE_NURSERY_REPORT.skillLines || []);
  const marks = (SAMPLE_NURSERY_REPORT.skillLines || [])
    .filter((row) => row.progress_code && row.progress_code !== "NA" && row.progress_code !== "NT")
    .map((row) => `${row.progress_code}:${row.skill_description.replace(/^Can\s+/i, "").slice(0, 28)}`)
    .slice(0, 6)
    .join(" · ");

  return {
    learner: SAMPLE_NURSERY_REPORT.firstName,
    klass: classLabel(SAMPLE_NURSERY_REPORT.classCode, SAMPLE_NURSERY_REPORT.stream),
    academic: phraseTone(profile.tone),
    cocurricular: `${profile.ratedSkills} skills coded`,
    marks: marks || "No progress codes on the sample",
    warnings: profile.tone === "incomplete" ? 1 : 0,
    sections: [
      {
        id: "class_teacher",
        title: "Class teacher",
        lines: [klass ? lineFrom(klass, null) : { label: null, text: "No nursery comment produced.", tone: "bad" }],
      },
    ],
  };
}

function phraseTone(tone: string) {
  if (tone === "mastery") return "Strong mastery";
  if (tone === "solid") return "Solid progress";
  if (tone === "growing") return "Growing";
  if (tone === "support") return "Needs support";
  if (tone === "incomplete") return "Incomplete";
  return "Mixed progress";
}

export function previewPlainText(sample: CommentPreview) {
  return [
    `${sample.learner}, ${sample.klass}`,
    `Academic ${sample.academic} · Co-curricular ${sample.cocurricular}`,
    sample.marks,
    ...sample.sections.flatMap((section) => section.lines.map((line) => `${section.title}: ${line.label ? `${line.label}: ` : ""}${line.text}`)),
  ].join("\n");
}
