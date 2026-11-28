import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { behaviorRatingForConduct, conductForBehaviorRating } from "@/lib/academics";
import { buildMarksWorkbook, parseMarksWorkbook } from "@/lib/marks-workbook";

describe("marks workbook behavior ratings", () => {
  it("maps the behavior codes to term report-card conduct labels", () => {
    expect(conductForBehaviorRating("d")).toBe("Needs Help");
    expect(behaviorRatingForConduct("Needs support")).toBe("D");
    expect(conductForBehaviorRating("X")).toBeNull();
  });

  it("keeps same-named class streams on different campuses separate", async () => {
    const bytes = await buildMarksWorkbook({
      termId: "9f1fbeca-f021-4eb6-84ae-a04c2d59482a",
      term: "Term 1 2026",
      name: "Beginning of Term",
      kind: "bot",
      kindLabel: "Beginning of term",
      heldOn: "12 Feb 2026",
      heldOnIso: "2026-02-12",
      preparedOn: "15 February 2026",
      papers: ["Bunga", "Makindye"].map((campus, index) => ({
        id: index === 0
          ? "77c511e8-92a3-4d4e-9dcf-8bf93d548a3b"
          : "e54a9bf5-44bc-48e8-8b2a-37d101957d4a",
        campus,
        classCode: "P1",
        className: "Primary 1",
        stream: "A",
        label: "Primary 1 A",
        order: 1,
        section: "primary" as const,
        subject: "Mathematics",
        maxScore: 100,
        sort: 1,
      })),
      pupils: [
        {
          id: "bd88992b-21a6-46ce-a277-ab5d210ab834",
          number: "1",
          name: "Amina",
          classCode: "P1",
          stream: "A",
          campus: "Bunga",
        },
        {
          id: "6eed8efc-7272-4c62-a6f2-8d0f2a462bb4",
          number: "2",
          name: "Ben",
          classCode: "P1",
          stream: "A",
          campus: "Makindye",
        },
      ],
      scores: [],
      bands: [],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    const classSheets = workbook.worksheets.filter((sheet) => sheet.name !== "_KJA");
    expect(workbook.getWorksheet("Cover")).toBeUndefined();
    expect(classSheets).toHaveLength(2);
    expect(classSheets.map((sheet) => sheet.getCell(9, 4).value)).toEqual(["Amina", "Ben"]);
  });

  it("writes editable A-D ratings and reads ratings and CLEAR by pupil", async () => {
    const bytes = await buildMarksWorkbook({
      termId: "9f1fbeca-f021-4eb6-84ae-a04c2d59482a",
      term: "Term 1 2026",
      name: "Beginning of Term",
      kind: "bot",
      kindLabel: "Beginning of term",
      heldOn: "12 Feb 2026",
      heldOnIso: "2026-02-12",
      preparedOn: "15 February 2026",
      papers: [{
        id: "77c511e8-92a3-4d4e-9dcf-8bf93d548a3b",
        classCode: "P1",
        className: "Primary 1",
        stream: "A",
        label: "Primary 1 A",
        order: 1,
        section: "primary",
        subject: "Mathematics",
        maxScore: 100,
        sort: 1,
      }],
      pupils: [
        {
          id: "bd88992b-21a6-46ce-a277-ab5d210ab834",
          number: "1",
          name: "Amina",
          classCode: "P1",
          stream: "A",
          behavior: "B",
        },
        {
          id: "6eed8efc-7272-4c62-a6f2-8d0f2a462bb4",
          number: "2",
          name: "Ben",
          classCode: "P1",
          stream: "A",
        },
      ],
      scores: [],
      bands: [],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet("Primary 1 A");
    expect(sheet?.getCell(8, 6).value).toBe("Behavior (A-D)");
    expect(sheet?.getCell(9, 6).value).toBe("B");
    expect(sheet?.getCell(9, 6).dataValidation?.formulae).toEqual(['"A,B,C,D,CLEAR"']);
    sheet!.getCell(9, 6).value = "D";
    sheet!.getCell(10, 6).value = "CLEAR";

    const parsed = await parseMarksWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));
    expect(parsed.behaviors.map((row) => [row.studentId, row.raw])).toEqual([
      ["bd88992b-21a6-46ce-a277-ab5d210ab834", "D"],
      ["6eed8efc-7272-4c62-a6f2-8d0f2a462bb4", "CLEAR"],
    ]);
  });

  it("reads an Other subject comment and CLEAR, and ignores a blank cell", async () => {
    const music = "c2d2e046-aedf-4fc6-820e-d917e25f8f90";
    const paperId = "77c511e8-92a3-4d4e-9dcf-8bf93d548a3b";
    const amina = "bd88992b-21a6-46ce-a277-ab5d210ab834";
    const ben = "6eed8efc-7272-4c62-a6f2-8d0f2a462bb4";
    const cara = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
    const bytes = await buildMarksWorkbook({
      termId: "9f1fbeca-f021-4eb6-84ae-a04c2d59482a",
      term: "Term 1 2026",
      name: "Beginning of Term",
      kind: "bot",
      kindLabel: "Beginning of term",
      heldOn: "12 Feb 2026",
      heldOnIso: "2026-02-12",
      preparedOn: "15 February 2026",
      papers: [{
        id: paperId,
        classCode: "P1",
        className: "Primary 1",
        stream: "A",
        label: "Primary 1 A",
        order: 1,
        section: "primary",
        subject: "Music",
        subjectId: music,
        commentSlot: 1,
        maxScore: 100,
        sort: 1,
        skills: ["Rhythm"],
      }],
      pupils: [
        { id: amina, number: "1", name: "Amina", classCode: "P1", stream: "A" },
        { id: ben, number: "2", name: "Ben", classCode: "P1", stream: "A" },
        { id: cara, number: "3", name: "Cara", classCode: "P1", stream: "A" },
      ],
      scores: [],
      bands: [],
      activityComments: [{ studentId: amina, slot: 1, comment: "Keeps a steady beat." }],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet("Primary 1 A");
    expect(sheet?.getCell(8, 6).value).toBe("Music · Acquired · Rhythm");
    expect(sheet?.getCell(8, 7).value).toBe("Music · Comment");
    expect(sheet?.getCell(9, 7).value).toBe("Keeps a steady beat.");
    sheet!.getCell(9, 7).value = "Amina sings with confidence.";
    sheet!.getCell(10, 7).value = "CLEAR";

    const parsed = await parseMarksWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));
    expect(parsed.comments.map((row) => [row.studentId, row.slot, row.subjectId, row.raw])).toEqual([
      [amina, 1, music, "Amina sings with confidence."],
      [ben, 1, music, "CLEAR"],
    ]);
    expect(parsed.comments.some((row) => row.studentId === cara)).toBe(false);
    expect(parsed.issueCount).toBe(0);
  });

  it("writes editable comma-separated clubs and reads clubs and CLEAR by pupil", async () => {
    const amina = "bd88992b-21a6-46ce-a277-ab5d210ab834";
    const ben = "6eed8efc-7272-4c62-a6f2-8d0f2a462bb4";
    const bytes = await buildMarksWorkbook({
      termId: "9f1fbeca-f021-4eb6-84ae-a04c2d59482a",
      term: "Term 1 2026",
      name: "Midterm",
      kind: "midterm",
      kindLabel: "Midterm",
      heldOn: "12 Mar 2026",
      heldOnIso: "2026-03-12",
      preparedOn: "15 March 2026",
      papers: [{
        id: "77c511e8-92a3-4d4e-9dcf-8bf93d548a3b",
        classCode: "P4",
        className: "Primary 4",
        stream: "A",
        label: "Primary 4 A",
        order: 4,
        section: "primary",
        subject: "English",
        maxScore: 100,
        sort: 1,
      }],
      pupils: [
        { id: amina, number: "1", name: "Amina", classCode: "P4", stream: "A", behavior: "A", clubs: "Chess,  debate, chess" },
        { id: ben, number: "2", name: "Ben", classCode: "P4", stream: "A" },
      ],
      scores: [],
      bands: [],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet("Primary 4 A");
    expect(sheet?.getCell(8, 6).value).toBe("Behavior (A-D)");
    expect(sheet?.getCell(8, 7).value).toBe("Clubs (comma-separated)");
    expect(sheet?.getCell(9, 7).value).toBe("Chess, debate");
    sheet!.getCell(9, 7).value = "Chess, Swimming, Debate";
    sheet!.getCell(10, 7).value = "CLEAR";

    const parsed = await parseMarksWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));
    expect(parsed.clubs.map((row) => [row.studentId, row.raw])).toEqual([
      [amina, "Chess, Swimming, Debate"],
      [ben, "CLEAR"],
    ]);
    expect(parsed.issueCount).toBe(0);
  });
});
