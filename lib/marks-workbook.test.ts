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
    const classSheets = workbook.worksheets.filter((sheet) => sheet.name !== "Cover" && sheet.name !== "_KJA");
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
});
