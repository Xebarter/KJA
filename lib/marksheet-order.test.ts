import { describe, expect, it } from "vitest";
import {
  arrangeMarksheet,
  marksheetDisplayAverage,
  marksheetVisibleSubjects,
  marksheetWorkbookFilename,
  parseMarksheetSort,
  type MarksheetOrderRow,
} from "@/lib/marksheet-order";

function row(patch: Partial<MarksheetOrderRow> & Pick<MarksheetOrderRow, "id" | "name">): MarksheetOrderRow {
  return {
    number: "",
    roll: 0,
    average: null,
    academicAverage: null,
    otherAverage: null,
    gaps: 0,
    percents: {},
    ...patch,
  };
}

describe("marksheet order", () => {
  const maths = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const rows = [
    row({ id: "c", name: "Cara", number: "10", roll: 2, average: 40, academicAverage: 35, otherAverage: 80, gaps: 1, percents: { [maths]: 40 } }),
    row({ id: "a", name: "Amina", number: "2", roll: 0, average: 90, academicAverage: 88, otherAverage: 60, gaps: 0, percents: { [maths]: 70 } }),
    row({ id: "b", name: "Ben", number: "", roll: 1, average: null, academicAverage: null, otherAverage: null, gaps: 2, percents: { [maths]: null } }),
    row({ id: "d", name: "Amina", number: "3", roll: 3, average: 90, academicAverage: 92, otherAverage: 50, gaps: 0, percents: { [maths]: 95 } }),
  ];

  it("keeps roll order", () => {
    expect(arrangeMarksheet(rows, "roll").map((pupil) => pupil.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("ranks best performed first and leaves unscored pupils last", () => {
    expect(arrangeMarksheet(rows, "best").map((pupil) => pupil.id)).toEqual(["a", "d", "c", "b"]);
  });

  it("ranks worst performed first and still leaves unscored pupils last", () => {
    expect(arrangeMarksheet(rows, "worst").map((pupil) => pupil.id)).toEqual(["c", "a", "d", "b"]);
  });

  it("sorts a subject from highest, with blanks last", () => {
    expect(arrangeMarksheet(rows, `subject-high:${maths}`).map((pupil) => pupil.id)).toEqual(["d", "a", "c", "b"]);
  });

  it("sorts by academic and other subject averages", () => {
    expect(arrangeMarksheet(rows, "academic-high").map((pupil) => pupil.id)).toEqual(["d", "a", "c", "b"]);
    expect(arrangeMarksheet(rows, "other-high").map((pupil) => pupil.id)).toEqual(["c", "a", "d", "b"]);
    expect(arrangeMarksheet(rows, "other-low").map((pupil) => pupil.id)).toEqual(["d", "a", "c", "b"]);
  });

  it("puts the most gaps first and empty student numbers last", () => {
    expect(arrangeMarksheet(rows, "gaps").map((pupil) => pupil.id)).toEqual(["b", "c", "a", "d"]);
    expect(arrangeMarksheet(rows, "number").map((pupil) => pupil.id)).toEqual(["a", "d", "c", "b"]);
  });

  it("rejects a subject sort that is not on this sheet", () => {
    expect(parseMarksheetSort(`subject-high:${maths}`, new Set([maths]))).toBe(`subject-high:${maths}`);
    expect(parseMarksheetSort("subject-high:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", new Set([maths]))).toBe("roll");
    expect(parseMarksheetSort("best", new Set())).toBe("best");
    expect(parseMarksheetSort("academic-high", new Set())).toBe("academic-high");
    expect(parseMarksheetSort("other-low", new Set())).toBe("other-low");
  });

  it("names the workbook from the class, paper, date and sort", () => {
    expect(marksheetWorkbookFilename({
      classLabel: "P7 JR",
      name: "Pre PLE",
      held: "2026-10-18",
      sort: "best",
    })).toBe("P7-JR-Pre-PLE-2026-10-18-best-to-worst.xlsx");
  });

  it("filters marksheet columns to the chosen subject arrange", () => {
    const sheet = [
      { id: maths, name: "Maths", kind: "core" as const },
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "English", kind: "core" as const },
      { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Music", kind: "cocurricular" as const },
    ];
    expect(marksheetVisibleSubjects(sheet, "roll").map((subject) => subject.name)).toEqual(["Maths", "English", "Music"]);
    expect(marksheetVisibleSubjects(sheet, "academic-high").map((subject) => subject.name)).toEqual(["Maths", "English"]);
    expect(marksheetVisibleSubjects(sheet, "other-low").map((subject) => subject.name)).toEqual(["Music"]);
    expect(marksheetVisibleSubjects(sheet, `subject-high:${maths}`).map((subject) => subject.name)).toEqual(["Maths"]);
  });

  it("keeps every sitting column when arranging by catalogue subject", () => {
    const catalogueMaths = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const midPaper = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const endPaper = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const sheet = [
      { id: midPaper, subjectId: catalogueMaths, name: "Maths", kind: "core" as const },
      { id: endPaper, subjectId: catalogueMaths, name: "Maths", kind: "core" as const },
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", subjectId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "English", kind: "core" as const },
    ];
    expect(marksheetVisibleSubjects(sheet, `subject-high:${catalogueMaths}`).map((subject) => subject.id)).toEqual([
      midPaper,
      endPaper,
    ]);
    expect(marksheetVisibleSubjects(sheet, `subject-high:${midPaper}`).map((subject) => subject.id)).toEqual([midPaper]);
  });

  it("picks the display average for the active subject filter", () => {
    const pupil = rows[0];
    expect(marksheetDisplayAverage(pupil, "best")).toBe(40);
    expect(marksheetDisplayAverage(pupil, "academic-high")).toBe(35);
    expect(marksheetDisplayAverage(pupil, "other-high")).toBe(80);
    expect(marksheetDisplayAverage(pupil, `subject-high:${maths}`)).toBe(40);
  });
});
