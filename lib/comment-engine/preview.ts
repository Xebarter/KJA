import { classLabel } from "@/lib/academics";
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

export function previewPlainText(sample: CommentPreview) {
  return [
    `${sample.learner}, ${sample.klass}`,
    `Academic ${sample.academic} · Co-curricular ${sample.cocurricular}`,
    sample.marks,
    ...sample.sections.flatMap((section) => section.lines.map((line) => `${section.title}: ${line.label ? `${line.label} — ` : ""}${line.text}`)),
  ].join("\n");
}
