import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { readBookmanFontFiles } from "@/lib/marksheet-fonts";
import { buildMarksheetPdf } from "@/lib/marksheet-pdf";

describe("marksheet pdf", () => {
  it("builds a landscape register with the arranged pupils", async () => {
    const bytes = await buildMarksheetPdf({
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
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    const page = pdf.getPage(0);
    const { width, height } = page.getSize();
    expect(width).toBeGreaterThan(height);
    expect(pdf.getTitle()).toContain("Pre PLE");
  });

  it("embeds the public header logo and Bookman when available", async () => {
    const logo = await readFile(join(process.cwd(), "public", "images", "kja-logo.png"));
    const bytes = await buildMarksheetPdf({
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
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    const bookman = await readBookmanFontFiles();
    expect(bookman).not.toBeNull();
    expect(bytes.byteLength).toBeGreaterThan(logo.byteLength);
  });

  it("builds a combined register with assessment groups", async () => {
    const bytes = await buildMarksheetPdf({
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
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toContain("Mid Term");
  });
});
