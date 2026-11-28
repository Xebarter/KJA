import { describe, expect, it } from "vitest";
import { buildPerformanceProfile } from "./analyse";
import { defaultCommentConfig } from "./defaults";
import { generateCommentsForReport } from "./generate";
import {
  applyGrokToGenerationResult,
  buildLearnerPromptPayload,
  generateGrokCommentsBatch,
  GROK_ENGINE_VERSION,
  parseGrokBatchResponse,
  sanitizeGrokComment,
} from "./grok";
import type { ReportInput } from "./types";

function samplePrimaryInput(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    reportId: "rep-primary-1",
    studentId: "stu-1",
    firstName: "Amina",
    sex: "F",
    classCode: "P5",
    stream: "A",
    termId: "term-1",
    conduct: "Excellent",
    clubs: ["Chess", "Debate"],
    subjects: [
      { subjectId: "sub-1", subjectName: "Mathematics", score: 88, maxScore: 100, percent: 88, status: "assessed", sortOrder: 1 },
      { subjectId: "sub-2", subjectName: "English", score: 82, maxScore: 100, percent: 82, status: "assessed", sortOrder: 2 },
      { subjectId: "sub-3", subjectName: "Science", score: 54, maxScore: 100, percent: 54, status: "assessed", sortOrder: 3 },
    ],
    activities: [],
    ...overrides,
  };
}

describe("Grok AI comment engine", () => {
  it("builds a structured prompt payload with academics, discipline, and clubs", () => {
    const config = defaultCommentConfig();
    const input = samplePrimaryInput();
    const profile = buildPerformanceProfile(input, config.settings);
    const payload = buildLearnerPromptPayload({ input, profile });

    expect(payload.reportId).toBe("rep-primary-1");
    expect(payload.firstName).toBe("Amina");
    expect(payload.pronouns).toBe("she/her");
    expect(payload.conduct).toBe("Excellent");
    expect(payload.clubs).toEqual(["Chess", "Debate"]);
    expect("strongestSubjects" in payload && payload.strongestSubjects).toContain("Mathematics");
    expect("focusSubjects" in payload && payload.focusSubjects).toContain("Science");
  });

  it("builds a nursery prompt payload with developmental domains, conduct, and clubs", () => {
    const config = defaultCommentConfig();
    const input: ReportInput = {
      reportId: "rep-nursery-1",
      studentId: "stu-2",
      firstName: "Liam",
      sex: "M",
      classCode: "C3",
      stream: "",
      termId: "term-1",
      conduct: "Good",
      clubs: ["Music"],
      nursery: true,
      subjects: [],
      activities: [],
      skillLines: [
        {
          skill_id: "sk-1",
          domain_id: "dom-1",
          domain_name: "Literacy",
          skill_description: "Identifies letter sounds",
          progress_code: "E",
          progress_label: "Exceeding",
        },
        {
          skill_id: "sk-2",
          domain_id: "dom-2",
          domain_name: "Numeracy",
          skill_description: "Counts up to twenty",
          progress_code: "D",
          progress_label: "Developing",
        },
      ],
    };
    const profile = buildPerformanceProfile({ ...input, subjects: [], activities: [] }, config.settings);
    const payload = buildLearnerPromptPayload({ input, profile });

    expect(payload.section).toBe("Nursery");
    expect(payload.pronouns).toBe("he/him");
    expect(payload.conduct).toBe("Good");
    expect(payload.clubs).toEqual(["Music"]);
    expect("developmentalProgress" in payload && payload.developmentalProgress).toHaveLength(2);
  });

  it("sanitizes and parses strict JSON batch responses", () => {
    const raw = JSON.stringify({
      comments: [
        {
          reportId: "rep-primary-1",
          classTeacher: "\"Amina worked very hard this term, especially in Mathematics and English. She is polite and well-behaved in class, and she also enjoyed taking part in Chess and Debate clubs\"",
          principal: "Well done Amina on a strong term. Keep up this great spirit next term",
        },
      ],
    });
    const map = parseGrokBatchResponse(raw);
    const pair = map.get("rep-primary-1");
    expect(pair?.classTeacher).toMatch(/^Amina worked very hard/);
    expect(pair?.classTeacher).toMatch(/\.$/);
    expect(pair?.principal).toBe("Well done Amina on a strong term. Keep up this great spirit next term.");
  });

  it("rejects overly short or runaway comments during sanitization", () => {
    expect(sanitizeGrokComment("Good.", { minWords: 10, maxWords: 75, maxChars: 420 })).toBeNull();
    expect(sanitizeGrokComment("word ".repeat(90), { minWords: 10, maxWords: 75, maxChars: 420 })).toBeNull();
  });

  it("falls back cleanly when API key is missing or fetch fails", async () => {
    const config = defaultCommentConfig();
    const input = samplePrimaryInput();
    const profile = buildPerformanceProfile(input, config.settings);

    const noKey = await generateGrokCommentsBatch([{ input, profile }], { apiKey: null });
    expect(noKey.size).toBe(0);

    const failingFetch: typeof fetch = async () => new Response("rate limited", { status: 429 });
    const failed = await generateGrokCommentsBatch([{ input, profile }], { apiKey: "test-key", fetchImpl: failingFetch });
    expect(failed.size).toBe(0);
  });

  it("merges Grok comments into a deterministic result while keeping subject remarks", async () => {
    const config = defaultCommentConfig();
    const input = samplePrimaryInput();
    const base = generateCommentsForReport(input, config);

    const mockFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  comments: [
                    {
                      reportId: input.reportId,
                      classTeacher: "Amina did well in Mathematics and English this term, though Science needs more practice. She showed excellent discipline and also enjoyed Chess and Debate clubs.",
                      principal: "Well done Amina for a promising term. Keep working steadily next term.",
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const grokMap = await generateGrokCommentsBatch([{ input, profile: base.profile }], {
      apiKey: "test-key",
      fetchImpl: mockFetch,
    });
    const merged = applyGrokToGenerationResult(base, grokMap.get(input.reportId));

    expect(merged.engineVersion).toBe(GROK_ENGINE_VERSION);
    expect(merged.units.find((u) => u.commentType === "class_teacher")?.text).toContain("Chess and Debate");
    expect(merged.units.find((u) => u.commentType === "headteacher")?.text).toContain("Well done Amina");
    // Deterministic 2-word subject comments stay intact
    expect(merged.units.filter((u) => u.commentType === "subject_teacher")).toHaveLength(3);
  });

  it("adds the next-class promotion to the payload only on Term 3", () => {
    const config = defaultCommentConfig();
    const termTwo = samplePrimaryInput();
    const termThree = samplePrimaryInput({
      termNumber: 3,
      promotion: { fromClass: "P5", fromClassName: "Primary Five", toClass: "P6", toClassName: "Primary Six", graduating: false },
    });

    const profileTwo = buildPerformanceProfile(termTwo, config.settings);
    const payloadTwo = buildLearnerPromptPayload({ input: termTwo, profile: profileTwo });
    expect("promotion" in payloadTwo ? payloadTwo.promotion : undefined).toBeUndefined();

    const profileThree = buildPerformanceProfile(termThree, config.settings);
    const payloadThree = buildLearnerPromptPayload({ input: termThree, profile: profileThree });
    expect("promotion" in payloadThree && payloadThree.promotion).toEqual({
      fromClass: "Primary Five",
      toClass: "P6",
      toClassName: "Primary Six",
      graduating: false,
    });
  });

  it("passes the graduating flag for Primary Seven on Term 3", () => {
    const config = defaultCommentConfig();
    const input = samplePrimaryInput({
      classCode: "P7",
      termNumber: 3,
      promotion: { fromClass: "P7", fromClassName: "Primary Seven", toClass: null, toClassName: null, graduating: true },
    });
    const profile = buildPerformanceProfile(input, config.settings);
    const payload = buildLearnerPromptPayload({ input, profile });
    expect("promotion" in payload && payload.promotion).toMatchObject({ graduating: true, fromClass: "Primary Seven" });
  });
});
