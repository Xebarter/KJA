import { requireOffice } from "@/lib/office";
import { loadReportRows, tally } from "@/lib/office-reports";
import { HOUSES, SCHOOL_CLASSES, className, csvResponse, studentStatusInfo } from "@/lib/students";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireOffice();
  if ("error" in auth) return new Response(auth.error, { status: 403 });
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "classes";
  const year = Number.parseInt(url.searchParams.get("year") || "", 10) || new Date().getFullYear();
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  let rows;
  try {
    rows = await loadReportRows(auth.supabase);
  } catch (error) {
    return new Response((error as Error).message, { status: 500 });
  }
  const active = rows.filter((row) => row.status === "active");

  if (type === "leavers") {
    const leavers = rows.filter((row) => row.status !== "active" && row.left_on && row.left_on >= start && row.left_on <= end);
    return csvResponse(`leavers-${year}`, ["Student number", "Name", "Sex", "Class", "Stream", "Status", "Left on", "Reason", "Enrolled on", "Family code"],
      leavers.map((row) => [row.student_number, row.full_name, row.sex, row.class_code, row.stream, studentStatusInfo(row.status).label, row.left_on, row.left_reason, row.enrolled_on, row.family_code]));
  }
  if (type === "joiners") {
    const joined = rows.filter((row) => row.enrolled_on && row.enrolled_on >= start && row.enrolled_on <= end);
    return csvResponse(`joiners-${year}`, ["Student number", "Name", "Sex", "Date of birth", "Class", "Stream", "Enrolled on", "Status", "Family code"],
      joined.map((row) => [row.student_number, row.full_name, row.sex, row.date_of_birth, row.class_code, row.stream, row.enrolled_on, studentStatusInfo(row.status).label, row.family_code]));
  }
  if (type === "religion") {
    return csvResponse("religion", ["Religion", "Pupils"], tally(active, (row) => row.religion));
  }
  return csvResponse("class-summary", ["Class code", "Class", "Boys", "Girls", "Not recorded", "Total", ...HOUSES, "No house"],
    [
      ...SCHOOL_CLASSES.map((entry) => {
        const pupils = active.filter((row) => row.class_code === entry.code);
        return [
          entry.code, className(entry.code),
          pupils.filter((row) => row.sex === "M").length,
          pupils.filter((row) => row.sex === "F").length,
          pupils.filter((row) => row.sex !== "M" && row.sex !== "F").length,
          pupils.length,
          ...HOUSES.map((house) => pupils.filter((row) => row.house === house).length),
          pupils.filter((row) => !row.house).length,
        ];
      }),
      ["", "Total", active.filter((row) => row.sex === "M").length, active.filter((row) => row.sex === "F").length,
        active.filter((row) => row.sex !== "M" && row.sex !== "F").length, active.length,
        ...HOUSES.map((house) => active.filter((row) => row.house === house).length), active.filter((row) => !row.house).length],
    ]);
}
