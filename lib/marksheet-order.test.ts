import { describe, expect, it } from "vitest";
import { arrangeMarksheet, marksheetWorkbookFilename, parseMarksheetSort, type MarksheetOrderRow } from "@/lib/marksheet-order";

function row(patch: Partial<MarksheetOrderRow> & Pick<MarksheetOrderRow, "id" | "name">): MarksheetOrderRow {
  return {
    number: "",
    roll: 0,
    average: null,
    gaps: 0,
    percents: {},
    ...patch,
  };
}

describe("marksheet order", () => {
  const maths = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const rows = [
    row({ id: "c", name: "Cara", number: "10", roll: 2, average: 40, gaps: 1, percents: { [maths]: 40 } }),
    row({ id: "a", name: "Amina", number: "2", roll: 0, average: 90, gaps: 0, percents: { [maths]: 70 } }),
    row({ id: "b", name: "Ben", number: "", roll: 1, average: null, gaps: 2, percents: { [maths]: null } }),
    row({ id: "d", name: "Amina", number: "3", roll: 3, average: 90, gaps: 0, percents: { [maths]: 95 } }),
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

  it("puts the most gaps first and empty student numbers last", () => {
    expect(arrangeMarksheet(rows, "gaps").map((pupil) => pupil.id)).toEqual(["b", "c", "a", "d"]);
    expect(arrangeMarksheet(rows, "number").map((pupil) => pupil.id)).toEqual(["a", "d", "c", "b"]);
  });

  it("rejects a subject sort that is not on this sheet", () => {
    expect(parseMarksheetSort(`subject-high:${maths}`, new Set([maths]))).toBe(`subject-high:${maths}`);
    expect(parseMarksheetSort("subject-high:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", new Set([maths]))).toBe("roll");
    expect(parseMarksheetSort("best", new Set())).toBe("best");
  });

  it("names the workbook from the class, paper, date and sort", () => {
    expect(marksheetWorkbookFilename({
      classLabel: "P7 JR",
      name: "Pre PLE",
      held: "2026-10-18",
      sort: "best",
    })).toBe("P7-JR-Pre-PLE-2026-10-18-best-to-worst.xlsx");
  });
});
