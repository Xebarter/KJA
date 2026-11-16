import { contentDisposition } from "@/lib/download-headers";
import { requireOffice } from "@/lib/office";
import { buildStudentsPdf, loadStudentExportPhotos, studentsPdfFileName } from "@/lib/students-pdf";
import { buildStudentsWorkbook, studentsWorkbookFileName } from "@/lib/students-workbook";
import { className, csvResponse, fetchAll, isUuid, parseStudentFilters, studentsQuery, type DirectoryRow } from "@/lib/students";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADER = [
  "Student number", "Surname", "Given names", "Full name", "Preferred name", "Sex", "Date of birth", "Age",
  "Class code", "Class", "Stream", "House", "Campus", "Status", "Enrolled on", "Left on", "Leaving reason",
  "Family code", "Mailing name", "Home area",
  "Father", "Father phone", "Father email", "Mother", "Mother phone", "Mother email",
  "Religion", "Nationality", "Staff child", "Staff category", "Medical notes", "Panadol allowed",
];

const SELECT = "*";

async function loadRows(auth: Awaited<ReturnType<typeof requireOffice>> & object, request: Request) {
  if ("error" in auth) return { error: auth.error } as const;
  const url = new URL(request.url);
  const filters = parseStudentFilters(Object.fromEntries(url.searchParams));
  const ids = (url.searchParams.get("ids") || "").split(",").filter(isUuid).slice(0, 1000);
  const campusScope = { campuses: auth.campuses };

  try {
    const rows = await fetchAll<DirectoryRow & { photo_path?: string | null }>((from, to) => {
      const query = ids.length
        ? studentsQuery(auth.supabase, { ...filters, status: "all", q: "" }, SELECT, campusScope).in("id", ids)
        : studentsQuery(auth.supabase, filters, SELECT, campusScope);
      return query.range(from, to);
    }, 20000);
    return {
      rows,
      ids,
      filters,
      label: ids.length ? "selected" : filters.class ? filters.class : "register",
    } as const;
  } catch (error) {
    return { error: (error as Error).message } as const;
  }
}

export async function GET(request: Request) {
  const auth = await requireOffice();
  if ("error" in auth) return new Response(auth.error, { status: 403 });
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") || "csv").toLowerCase();
  const loaded = await loadRows(auth, request);
  if ("error" in loaded) return new Response(loaded.error, { status: 500 });
  const { rows, ids, filters, label } = loaded;

  if (format === "xlsx" || format === "excel") {
    const bytes = await buildStudentsWorkbook({
      rows,
      mode: "export",
      title: ids.length ? "Selected students" : "Student register",
    });
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": contentDisposition(studentsWorkbookFileName("export", label)),
        "Cache-Control": "no-store",
      },
    });
  }

  if (format === "pdf") {
    const photos = await loadStudentExportPhotos(auth.supabase, rows);
    const bytes = await buildStudentsPdf({
      title: ids.length ? "Selected students" : "Student register",
      subtitle: [
        filters.class ? className(filters.class) : null,
        filters.stream ? `Stream ${filters.stream}` : null,
        `${rows.length} pupil${rows.length === 1 ? "" : "s"}`,
      ].filter(Boolean).join(" · "),
      rows,
      photos,
    });
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition(studentsPdfFileName(label)),
        "Cache-Control": "no-store",
      },
    });
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
