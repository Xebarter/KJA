import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildNurseryDsbaWorkbook } from "@/lib/nursery-dsba-workbook";

describe("nursery developmental workbook campus separation", () => {
  it("keeps same-class pupils on their selected campus sheet", async () => {
    const bytes = await buildNurseryDsbaWorkbook({
      termId: "9f1fbeca-f021-4eb6-84ae-a04c2d59482a",
      term: "Term 1 2026",
      name: "Beginning of Term",
      kind: "bot",
      kindLabel: "Beginning of term",
      heldOn: "12 Feb 2026",
      heldOnIso: "2026-02-12",
      preparedOn: "15 February 2026",
      papers: ["Bunga", "Kitante"].map((campus, index) => ({
        id: index === 0
          ? "77c511e8-92a3-4d4e-9dcf-8bf93d548a3b"
          : "e54a9bf5-44bc-48e8-8b2a-37d101957d4a",
        campus,
        classCode: "N1",
        className: "Nursery 1",
        stream: "A",
        label: `Nursery 1 A · ${campus}`,
        order: 1,
        skills: [{
          id: "c2d2e046-aedf-4fc6-820e-d917e25f8f90",
          domainId: "domain",
          domainName: "Language",
          domainSort: 1,
          description: "Uses language",
          sort: 1,
        }],
      })),
      pupils: [
        { id: "bd88992b-21a6-46ce-a277-ab5d210ab834", number: "1", name: "Bunga pupil", classCode: "N1", stream: "A", campus: "Bunga" },
        { id: "6eed8efc-7272-4c62-a6f2-8d0f2a462bb4", number: "2", name: "Kitante pupil", classCode: "N1", stream: "A", campus: "Kitante" },
      ],
      ratings: [],
      progressCodes: [{
        id: "f4081cdb-b17d-4c2b-b2dc-38474c34bc19",
        scale_id: "56b63370-c845-4700-a3bb-79c2fb44cf79",
        code: "A",
        label: "Achieved",
        sort_order: 1,
      }],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    const classSheets = workbook.worksheets.filter((sheet) => sheet.name !== "Cover" && sheet.name !== "_KJA");

    expect(classSheets).toHaveLength(2);
    expect(classSheets.map((sheet) => sheet.getCell(10, 4).value)).toEqual(["Bunga pupil", "Kitante pupil"]);
    expect(classSheets.every((sheet) => String(sheet.getCell(11, 4).value).startsWith("Tip:"))).toBe(true);
  });
});
