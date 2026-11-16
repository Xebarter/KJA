import { contentDisposition } from "@/lib/download-headers";
import { requireOffice } from "@/lib/office";
import { buildStudentsWorkbook, studentsWorkbookFileName } from "@/lib/students-workbook";
import { fetchAll, isUuid, parseStudentFilters, studentsQuery, type DirectoryRow } from "@/lib/students";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Download an editable Excel workbook prefilled with selected (or filtered) students. */
export async function GET(request: Request) {
  const auth = await requireOffice("students");
  if ("error" in auth) return new Response(auth.error, { status: 403 });
  const url = new URL(request.url);
  const filters = parseStudentFilters(Object.fromEntries(url.searchParams));
  const ids = (url.searchParams.get("ids") || "").split(",").filter(isUuid).slice(0, 1000);
  const campusScope = { campuses: auth.campuses };

  let rows: Array<DirectoryRow & { photo_path?: string | null }>;
  try {
    rows = await fetchAll((from, to) => {
      const query = ids.length
        ? studentsQuery(auth.supabase, { ...filters, status: "all", q: "" }, "*", campusScope).in("id", ids)
        : studentsQuery(auth.supabase, filters, "*", campusScope);
      return query.range(from, to);
    }, 5000);
  } catch (error) {
    return new Response((error as Error).message, { status: 500 });
  }

  const bytes = await buildStudentsWorkbook({
    rows,
    mode: "edit",
    title: ids.length ? "Edit selected students" : "Edit student register",
  });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": contentDisposition(studentsWorkbookFileName("edit", ids.length ? "selected" : filters.class || "register")),
      "Cache-Control": "no-store",
    },
  });
}
