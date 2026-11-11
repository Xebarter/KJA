import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { marksheetSubjectGroups } from "@/lib/marksheet-groups";
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
    expect(sheet.getCell(8, 3).font?.name).toBe("Bookman Old Style");
    expect(sheet.getCell(8, 4).value).toBe(90);
    expect(sheet.getCell(8, 6).value).toBe(1);
    expect(sheet.getCell(9, 3).value).toBe("Ben");
    expect(sheet.getCell(9, 4).value).toBe("Abs");
    expect(sheet.getCell(10, 3).value).toBe("Class average");
    expect(sheet.views[0]?.state).toBe("frozen");
    expect(sheet.pageSetup.orientation).toBe("landscape");
    expect(String(sheet.headerFooter.oddFooter)).toContain("Confidential");
  });

  it("places the public header logo and keeps Bookman Old Style", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const logo = await readFile(join(process.cwd(), "public", "images", "kja-logo.png"));
    const bytes = await buildMarksheetWorkbook({
      term: "Term 3 2026",
      name: "Pre PLE",
      kindLabel: "Class test",
      classLabel: "P7 JR",
      heldLabel: "18 Oct 2026",
      preparedOn: "26 October 2026",
      sortLabel: "Roll order",
      nursery: false,
      subjects: [{ name: "Mathematics", maxScore: 100, average: 90 }],
      pupils: [{ number: "12", name: "Amina", marks: [{ value: 90, tone: "high", percent: 90 }], average: 90, position: 1 }],
      classAverage: 90,
      logo,
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.getImages().length).toBe(1);
    expect(sheet.getCell(2, 2).value).not.toBe("KAMPALA JUNIOR ACADEMY");
    expect(sheet.getCell(3, 3).value).toBe("Pre PLE");
    expect(sheet.getCell(3, 3).font?.name).toBe("Bookman Old Style");
  });

  it("spans thin assessment headers without repeating titles in subject cells", async () => {
    const groups = marksheetSubjectGroups([
      { name: "Mathematics", maxScore: 100, average: 80, groupKey: "a", groupLabel: "Mid Term · 12 Oct 2026" },
      { name: "English", maxScore: 100, average: 70, groupKey: "a", groupLabel: "Mid Term · 12 Oct 2026" },
      { name: "Mathematics", maxScore: 100, average: 75, groupKey: "b", groupLabel: "End of Term · 20 Nov 2026" },
    ]);
    expect(groups).toEqual([
      { key: "a", label: "Mid Term · 12 Oct 2026", start: 0, count: 2, paletteIndex: 0 },
      { key: "b", label: "End of Term · 20 Nov 2026", start: 2, count: 1, paletteIndex: 1 },
    ]);

    const bytes = await buildMarksheetWorkbook({
      term: "Term 3 2026",
      name: "Mid Term · End of Term",
      kindLabel: "Combined",
      classLabel: "P7 JR",
      heldLabel: "2 assessments",
      preparedOn: "26 October 2026",
      sortLabel: "Roll order",
      combined: true,
      nursery: false,
      subjects: [
        { name: "Mathematics", maxScore: 100, average: 90, groupKey: "a", groupLabel: "Mid Term · 12 Oct 2026" },
        { name: "English", maxScore: 100, average: 80, groupKey: "a", groupLabel: "Mid Term · 12 Oct 2026" },
        { name: "Mathematics", maxScore: 100, average: 85, groupKey: "b", groupLabel: "End of Term · 20 Nov 2026" },
      ],
      pupils: [
        {
          number: "12",
          name: "Amina",
          marks: [
            { value: 90, tone: "high", percent: 90 },
            { value: 80, tone: "mid", percent: 80 },
            { value: 85, tone: "high", percent: 85 },
          ],
          average: 85,
          position: 1,
        },
      ],
      classAverage: 85,
      logo: null,
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.getCell(7, 4).value).toBe("Mid Term · 12 Oct 2026");
    expect(sheet.getCell(7, 6).value).toBe("End of Term · 20 Nov 2026");
    expect(String(sheet.getCell(8, 4).value)).toContain("Mathematics");
    expect(String(sheet.getCell(8, 4).value)).not.toContain(" · ");
    expect(String(sheet.getCell(8, 5).value)).toContain("English");
    expect(sheet.getCell(9, 3).value).toBe("Amina");
  });
});
