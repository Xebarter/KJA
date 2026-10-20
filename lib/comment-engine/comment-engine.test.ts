import { describe, expect, it } from "vitest";
import { buildPerformanceProfile } from "./analyse";
import { classifyPercentage, DEFAULT_SETTINGS } from "./bands";
import { defaultCommentConfig } from "./defaults";
import { generateCommentsForReport } from "./generate";
import { buildSamplePreview } from "./preview";
import { learnerFirstName } from "./names";
import type { ReportInput } from "./types";
import { containsFirstName, countSentences, countWords, validateComment } from "./validate";

function sampleInput(over: Partial<ReportInput> = {}): ReportInput {
  return {
    reportId: "r1",
    studentId: "s1",
    firstName: "Amina",
    classCode: "P4",
    stream: "A",
    termId: "t1",
    subjects: [
      { subjectId: "math", subjectName: "Mathematics", score: 85, maxScore: 100, percent: 85, status: "assessed", sortOrder: 1 },
      { subjectId: "eng", subjectName: "English", score: 78, maxScore: 100, percent: 78, status: "assessed", sortOrder: 2 },
      { subjectId: "sci", subjectName: "Science", score: 42, maxScore: 100, percent: 42, status: "assessed", sortOrder: 3 },
    ],
    activities: [
      { slot: 1, activityName: "Music", level: "Excellent", score: 88, maxScore: 100, skills: [
        { label: "rhythm", acquired: true },
        { label: "ensemble", acquired: true },
        { label: "notation", acquired: false },
      ] },
      { slot: 2, activityName: "Sports", level: "Good", score: 72, maxScore: 100, skills: [
        { label: "teamwork", acquired: true },
      ] },
      { slot: 3, activityName: null, level: null },
      { slot: 4, activityName: null, level: null },
    ],
    ...over,
  };
}

describe("learnerFirstName", () => {
  it("uses the middle name from Surname Given Names", () => {
    expect(learnerFirstName({ full_name: "Nakato Amina Grace", preferred_name: "Ami" })).toBe("Grace");
  });
  it("uses the middle name from given_names", () => {
    expect(learnerFirstName({ given_names: "Amina Grace" })).toBe("Grace");
  });
  it("falls back to the only given name when there is no middle name", () => {
    expect(learnerFirstName({ full_name: "Nakato Amina" })).toBe("Amina");
  });
});

describe("validators", () => {
  it("counts words and sentences", () => {
    expect(countWords("Very good")).toBe(2);
    expect(countWords("Evidence remains incomplete so further careful review of this report is required.")).toBe(12);
    expect(countSentences("One. Two. Three.")).toBe(3);
  });
  it("requires first name in co-curricular comments", () => {
    const ok = validateComment("Amina shows good involvement in co-curricular activities this term.", {
      minWords: 8,
      maxWords: 12,
      exactSentences: 1,
      requireFirstName: true,
      firstName: "Amina",
    });
    expect(ok.ok).toBe(true);
    expect(containsFirstName(ok.ok ? "Amina shows good involvement in co-curricular activities this term." : "", "Amina")).toBe(true);
    const bad = validateComment("Shows good involvement in co-curricular activities this term.", {
      minWords: 8,
      maxWords: 12,
      exactSentences: 1,
      requireFirstName: true,
      firstName: "Amina",
    });
    expect(bad.ok).toBe(false);
  });
});

describe("bands", () => {
  it("classifies boundaries without treating missing as zero", () => {
    expect(classifyPercentage(80, DEFAULT_SETTINGS.academic_bands)).toBe("excellent");
    expect(classifyPercentage(79.9, DEFAULT_SETTINGS.academic_bands)).toBe("very_good");
    expect(classifyPercentage(null, DEFAULT_SETTINGS.academic_bands)).toBeNull();
  });
});

describe("analysis", () => {
  it("names strengths only above threshold and weaknesses only at support", () => {
    const profile = buildPerformanceProfile(sampleInput(), DEFAULT_SETTINGS);
    expect(profile.strongestSubjects.map((row) => row.subjectName)).toContain("Mathematics");
    expect(profile.weakestSubjects.map((row) => row.subjectName)).toContain("Science");
    expect(profile.cocurricularComplete).toBe(true);
    expect(profile.academicBand).toBeTruthy();
  });
  it("does not invent co-curricular weakness when empty", () => {
    const profile = buildPerformanceProfile(
      sampleInput({ activities: [1, 2, 3, 4].map((slot) => ({ slot, activityName: null, level: null })) }),
      DEFAULT_SETTINGS,
    );
    expect(profile.cocurricularComplete).toBe(false);
    expect(profile.cocurricularBand).toBeNull();
  });

  it("prefers numeric marks and tracks term skills", () => {
    const profile = buildPerformanceProfile(sampleInput(), DEFAULT_SETTINGS);
    expect(profile.hasAcquiredSkills).toBe(true);
    expect(profile.acquiredSkills).toEqual(expect.arrayContaining(["rhythm", "ensemble", "teamwork"]));
    expect(profile.hasSkillGaps).toBe(true);
    expect(profile.skillFocus).toContain("notation");
    expect(profile.assessedActivities[0]?.percent).toBe(88);
  });
});

describe("generateCommentsForReport", () => {
  const config = defaultCommentConfig();

  it("assigns a unique two-word teacher's comment for every mark from 1 to 100", () => {
    const seen = new Set<string>();
    for (let mark = 1; mark <= 100; mark++) {
      const result = generateCommentsForReport(
        sampleInput({
          subjects: [
            {
              subjectId: "math",
              subjectName: "Mathematics",
              score: mark,
              maxScore: 100,
              percent: mark,
              status: "assessed",
              sortOrder: 1,
            },
          ],
          activities: [1, 2, 3, 4].map((slot) => ({ slot, activityName: null, level: null })),
        }),
        config,
      );
      const subject = result.units.find((unit) => unit.commentType === "subject_teacher" && unit.text);
      expect(subject?.text).toBeTruthy();
      expect(countWords(subject!.text!)).toBe(2);
      expect(subject!.explanation).toContain(`score_${mark}`);
      seen.add(subject!.text!);
    }
    expect(seen.size).toBe(100);
  });

  it("gives different teacher's comments when two subjects share the same total", () => {
    const result = generateCommentsForReport(
      sampleInput({
        subjects: [
          { subjectId: "math", subjectName: "Mathematics", score: 85, maxScore: 100, percent: 85, status: "assessed", sortOrder: 1 },
          { subjectId: "eng", subjectName: "English", score: 85, maxScore: 100, percent: 85, status: "assessed", sortOrder: 2 },
          { subjectId: "sci", subjectName: "Science", score: 85, maxScore: 100, percent: 85, status: "assessed", sortOrder: 3 },
        ],
        activities: [1, 2, 3, 4].map((slot) => ({ slot, activityName: null, level: null })),
      }),
      config,
    );
    const subjects = result.units.filter((unit) => unit.commentType === "subject_teacher" && unit.text);
    expect(subjects).toHaveLength(3);
    const texts = subjects.map((unit) => unit.text!);
    expect(new Set(texts).size).toBe(3);
    for (const text of texts) expect(countWords(text)).toBe(2);
    expect(subjects[0].explanation).toContain("score_85");
    expect(subjects[1].explanation).toMatch(/avoided duplicate/);
    expect(subjects[2].explanation).toMatch(/avoided duplicate/);
  });

  it("produces two-word subject comments and first-name co-curricular", () => {
    const result = generateCommentsForReport(sampleInput(), config);
    const subjects = result.units.filter((unit) => unit.commentType === "subject_teacher" && unit.text);
    expect(subjects.length).toBe(3);
    for (const unit of subjects) {
      expect(countWords(unit.text!)).toBe(2);
      expect(unit.validation.ok).toBe(true);
    }
    const coco = result.units.find((unit) => unit.commentType === "cocurricular" && !unit.activitySlot);
    expect(coco?.text).toBeTruthy();
    expect(containsFirstName(coco!.text!, "Amina")).toBe(true);
    expect(coco!.validation.ok).toBe(true);
    const activityUnits = result.units.filter((unit) => unit.commentType === "cocurricular" && unit.activitySlot);
    expect(activityUnits.length).toBe(2);
    for (const unit of activityUnits) {
      expect(unit.text).toBeTruthy();
      expect(containsFirstName(unit.text!, "Amina")).toBe(true);
    }
  });

  it("produces exactly three class-teacher sentences and twelve headteacher words", () => {
    const result = generateCommentsForReport(sampleInput(), config);
    const classUnit = result.units.find((unit) => unit.commentType === "class_teacher");
    const head = result.units.find((unit) => unit.commentType === "headteacher");
    expect(classUnit?.validation.ok).toBe(true);
    expect(countSentences(classUnit!.text!)).toBe(3);
    expect(head?.validation.ok).toBe(true);
    expect(countWords(head!.text!)).toBe(12);
  });

  it("is deterministic for the same input", () => {
    const a = generateCommentsForReport(sampleInput(), config);
    const b = generateCommentsForReport(sampleInput(), config);
    expect(a.units.map((unit) => unit.text)).toEqual(b.units.map((unit) => unit.text));
  });

  it("never selects strong-both when co-curricular is missing", () => {
    const result = generateCommentsForReport(
      sampleInput({
        subjects: [
          { subjectId: "math", subjectName: "Mathematics", score: 90, maxScore: 100, percent: 90, status: "assessed", sortOrder: 1 },
          { subjectId: "eng", subjectName: "English", score: 88, maxScore: 100, percent: 88, status: "assessed", sortOrder: 2 },
        ],
        activities: [1, 2, 3, 4].map((slot) => ({ slot, activityName: null, level: null })),
      }),
      config,
    );
    const head = result.units.find((unit) => unit.commentType === "headteacher");
    expect(head?.text).toBeTruthy();
    expect(head?.text?.toLowerCase()).not.toContain("deserves our warm congratulations");
  });

  it("curates co-curricular comments from the mark, activity, and skills", () => {
    const result = generateCommentsForReport(sampleInput(), config);
    const coco = result.units.find((unit) => unit.commentType === "cocurricular" && !unit.activitySlot);
    expect(coco?.validation.ok).toBe(true);
    expect(containsFirstName(coco!.text!, "Amina")).toBe(true);
    expect(coco?.text?.toLowerCase()).toMatch(/music|rhythm|ensemble|co-curricular/);
    expect(coco?.explanation).toMatch(/mark and term skills|composed/i);

    const music = result.units.find((unit) => unit.activitySlot === 1);
    expect(music?.validation.ok).toBe(true);
    expect(containsFirstName(music!.text!, "Amina")).toBe(true);
    expect(music?.text?.toLowerCase()).toContain("music");
    expect(music?.text?.toLowerCase()).toMatch(/rhythm|ensemble/);
    expect(music?.explanation).toMatch(/composed|mark and skills/i);

    const sports = result.units.find((unit) => unit.activitySlot === 2);
    expect(sports?.text?.toLowerCase()).toContain("sports");
    expect(sports?.text).not.toEqual(music?.text);
  });

  it("names skill gaps when the mark is weak", () => {
    const result = generateCommentsForReport(
      sampleInput({
        activities: [
          {
            slot: 1,
            activityName: "Music",
            level: "Needs support",
            score: 35,
            maxScore: 100,
            skills: [
              { label: "rhythm", acquired: false },
              { label: "notation", acquired: false },
            ],
          },
          { slot: 2, activityName: null, level: null },
          { slot: 3, activityName: null, level: null },
          { slot: 4, activityName: null, level: null },
        ],
      }),
      config,
    );
    const music = result.units.find((unit) => unit.activitySlot === 1);
    expect(music?.text).toBeTruthy();
    expect(music?.text?.toLowerCase()).toContain("music");
    expect(music?.text?.toLowerCase()).toMatch(/rhythm|notation/);
  });
});

describe("desk sample", () => {
  it("shows a complete comment for the sample learner", () => {
    const sample = buildSamplePreview(defaultCommentConfig());
    expect(sample.learner).toBe("Amina");
    expect(sample.klass).toContain("Primary Four");
    expect(sample.sections.map((section) => section.id)).toEqual(["subject_teacher", "cocurricular", "class_teacher", "headteacher"]);
    const failed = sample.sections.flatMap((section) => section.lines.filter((line) => line.tone === "bad").map((line) => `${section.id}: ${line.text}`));
    expect(failed).toEqual([]);
  });
});
