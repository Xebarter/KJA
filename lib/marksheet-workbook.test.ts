import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildMarksheetWorkbook } from "@/lib/marksheet-workbook";

describe("marksheet workbook", () => {
  it("lays out a class register in the arranged order", async () => {
    const bytes = await buildMarksheetWorkbook({
      term: "Term 3 2026",
      name: "Pre PLE",
      kindLabel: "Class test",
      classLabel: "P7 JR",
      heldLabel: "18 Oct 2026",
      preparedOn: "26 October 2026",
      sortLabel: "Best performed to worst",
      nursery: false,
      subjects: [{ name: "Mathematics", maxScore: 100, average: 80 }],
      pupils: [
        { number: "12", name: "Amina", marks: [{ value: 90, tone: "high", percent: 90 }], average: 90, position: 1 },
        { number: "4", name: "Ben", marks: [{ value: "Abs", tone: "missed", percent: null }], average: null, position: null },
      ],
      classAverage: 90,
      logo: null,
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.name).toBe("P7 JR");
    expect(sheet.getCell(3, 2).value).toBe("Pre PLE");
    expect(sheet.getCell(5, 2).value).toContain("Best performed to worst");
    expect(sheet.getCell(8, 3).value).toBe("Amina");
    expect(sheet.getCell(8, 4).value).toBe(90);
    expect(sheet.getCell(8, 6).value).toBe(1);
    expect(sheet.getCell(9, 3).value).toBe("Ben");
    expect(sheet.getCell(9, 4).value).toBe("Abs");
    expect(sheet.getCell(10, 3).value).toBe("Class average");
    expect(sheet.views[0]?.state).toBe("frozen");
    expect(sheet.pageSetup.orientation).toBe("landscape");
    expect(String(sheet.headerFooter.oddFooter)).toContain("Confidential");
  });
});
