import { requireOffice } from "@/lib/office";
import { className, csvResponse, fetchAll, isUuid, parseStudentFilters, studentsQuery, type DirectoryRow } from "@/lib/students";

export const dynamic = "force-dynamic";

const HEADER = [
  "Student number", "Surname", "Given names", "Full name", "Preferred name", "Sex", "Date of birth", "Age",
  "Class code", "Class", "Stream", "House", "Campus", "Status", "Enrolled on", "Left on", "Leaving reason",
  "Family code", "Mailing name", "Home area",
  "Father", "Father phone", "Father email", "Mother", "Mother phone", "Mother email",
  "Religion", "Nationality", "Staff child", "Staff category", "Medical notes", "Panadol allowed",
];

export async function GET(request: Request) {
  const auth = await requireOffice();
  if ("error" in auth) return new Response(auth.error, { status: 403 });
  const url = new URL(request.url);
  const filters = parseStudentFilters(Object.fromEntries(url.searchParams));
  const ids = (url.searchParams.get("ids") || "").split(",").filter(isUuid).slice(0, 1000);

  let rows: DirectoryRow[];
  try {
    rows = await fetchAll<DirectoryRow>((from, to) => {
      const query = ids.length
        ? studentsQuery(auth.supabase, { ...filters, status: "all", q: "" }, "*").in("id", ids)
        : studentsQuery(auth.supabase, filters, "*");
      return query.range(from, to);
    }, 20000);
  } catch (error) {
    return new Response((error as Error).message, { status: 500 });
  }

  return csvResponse(
    ids.length ? "students-selected" : filters.class ? `students-${filters.class}` : "students",
    HEADER,
    rows.map((row) => [
      row.student_number, row.surname, row.given_names, row.full_name, row.preferred_name, row.sex, row.date_of_birth, row.age,
      row.class_code, row.class_code ? className(row.class_code) : "", row.stream, row.house, row.campus, row.status, row.enrolled_on, row.left_on, row.left_reason,
      row.family_code, row.mailing_name, row.home_area,
      row.father_name, row.father_phone, row.father_email, row.mother_name, row.mother_phone, row.mother_email,
      row.religion, row.nationality, row.staff_child ? "Yes" : "No", row.staff_category, row.medical_notes,
      row.panadol_allowed === null ? "" : row.panadol_allowed ? "Yes" : "No",
    ]),
  );
}
