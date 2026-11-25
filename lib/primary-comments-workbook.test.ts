import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildPrimaryCommentsWorkbook, parsePrimaryCommentsWorkbook } from "./primary-comments-workbook";

const ids = {
  term: "11111111-1111-4111-8111-111111111111",
  subject: "22222222-2222-4222-8222-222222222222",
  pupil: "33333333-3333-4333-8333-333333333333",
  report: "44444444-4444-4444-8444-444444444444",
  publishedPupil: "55555555-5555-4555-8555-555555555555",
  publishedReport: "66666666-6666-4666-8666-666666666666",
};

describe("primary comments workbook", () => {
  it("parses class teacher and Other Subjects edits while ignoring published rows", async () => {
    const bytes = await buildPrimaryCommentsWorkbook({
      termId: ids.term,
      term: "Term 1",
      classCode: "P1",
      className: "Primary 1",
      stream: "A",
      campus: "main",
      preparedOn: "1 Jan 2025",
      subjects: [{ slot: 1, subjectId: ids.subject, name: "Physical Education" }],
      pupils: [
        {
          id: ids.pupil,
          reportId: ids.report,
          number: "P001",
          name: "Learner One",
          status: "draft",
          classComment: "Old comment",
          activityComments: { 1: "Old activity comment" },
        },
        {
          id: ids.publishedPupil,
          reportId: ids.publishedReport,
          number: "P002",
          name: "Learner Two",
          status: "published",
          classComment: "",
          activityComments: {},
        },
      ],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as never);
    const sheet = workbook.getWorksheet("P1 A");
    if (!sheet) throw new Error("Class sheet missing.");
    sheet.getCell(9, 6).value = "CLEAR";
    sheet.getCell(9, 7).value = "Excellent progress";
    sheet.getCell(10, 6).value = "Should remain locked";

    const edited = Buffer.from(await workbook.xlsx.writeBuffer());
    const parsed = await parsePrimaryCommentsWorkbook(edited);

    expect(parsed.campus).toBe("main");
    expect(parsed.pupils).toHaveLength(2);
    expect(parsed.issues).toEqual([]);
    expect(parsed.entries).toEqual([
      {
        studentId: ids.pupil,
        reportId: ids.report,
        pupil: "Learner One",
        sheet: "P1 A",
        classComment: null,
        activities: [
          {
            slot: 1,
            subjectId: ids.subject,
            name: "Physical Education",
            comment: "Excellent progress",
          },
        ],
      },
    ]);
  });
});
