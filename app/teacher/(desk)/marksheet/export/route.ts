import { contentDisposition } from "@/lib/download-headers";
import {
  buildDsbaMarksheetExportBytes,
  loadDsbaMarksheetExportBundle,
  parseDsbaMarksheetExportFormat,
} from "@/lib/dsba-marksheet-export";
import {
  loadMarksheetExportPayload,
  marksheetExportQueryFromUrl,
  parseMarksheetExportFormat,
} from "@/lib/marksheet-export";
import { buildMarksheetPdf } from "@/lib/marksheet-pdf";
import { buildMarksheetWorkbook } from "@/lib/marksheet-workbook";
import { isUuid } from "@/lib/students";
import { leadsClass } from "@/lib/teacher";
import { requireTeacher } from "@/lib/teacher-access";
import { streamOf } from "@/lib/academics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const teacher = await requireTeacher();
  if ("error" in teacher) return new Response(teacher.error, { status: 401 });
  if (!teacher.classes.length) {
    return new Response("The marksheet is for the class you lead this term.", { status: 403 });
  }

  const url = new URL(request.url);
  const dsbaId = (url.searchParams.get("dsba") || "").trim();

  if (dsbaId) {
    if (!isUuid(dsbaId)) return new Response("Choose a developmental assessment.", { status: 400 });
    const campus = (url.searchParams.get("campus") || "").trim();
    const loaded = await loadDsbaMarksheetExportBundle({
      supabase: teacher.supabase,
      userId: teacher.user.id,
      assessmentId: dsbaId,
      domainFilter: url.searchParams.get("domain"),
      campuses: campus
        ? [campus]
        : [...new Set(teacher.classes.map((row) => row.campus))],
    });
    if ("error" in loaded) return new Response(loaded.error, { status: loaded.status });
    if (!leadsClass(teacher.classes, loaded.paper.class_code, streamOf(loaded.paper.stream), campus || loaded.paper.campus)) {
      return new Response("You can only export a marksheet for a class you lead.", { status: 403 });
    }
    const format = parseDsbaMarksheetExportFormat(url.searchParams.get("format"));
    const bytes = await buildDsbaMarksheetExportBytes(loaded, format);
    const filename = `${loaded.filenameBase}.${format === "pdf" ? "pdf" : "xlsx"}`;
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type":
          format === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": contentDisposition(filename),
        "cache-control": "no-store",
      },
    });
  }

  const query = marksheetExportQueryFromUrl(url);
  if (!query) return new Response("Choose a class marksheet.", { status: 400 });
  const campus = (url.searchParams.get("campus") || "").trim();
  if (!leadsClass(teacher.classes, query.classCode, query.stream, campus || undefined)) {
    return new Response("You can only export a marksheet for a class you lead.", { status: 403 });
  }

  const format = parseMarksheetExportFormat(url.searchParams.get("format"));
  const campuses = campus
    ? [campus]
    : [...new Set(teacher.classes.filter((row) => row.classCode === query.classCode).map((row) => row.campus))];
  const loaded = await loadMarksheetExportPayload({
    supabase: teacher.supabase,
    userId: teacher.user.id,
    query,
    sortRaw: url.searchParams.get("sort"),
    campuses,
    campusFilter: campus || undefined,
    term: teacher.term,
  });
  if (!("ok" in loaded)) return new Response(loaded.error, { status: loaded.status });

  const { payload } = loaded;
  const filename = `${payload.filenameBase}.${format === "pdf" ? "pdf" : "xlsx"}`;

  if (format === "pdf") {
    const bytes = await buildMarksheetPdf(payload);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": contentDisposition(filename),
        "cache-control": "no-store",
      },
    });
  }

  const bytes = await buildMarksheetWorkbook(payload);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": contentDisposition(filename),
      "cache-control": "no-store",
    },
  });
}
