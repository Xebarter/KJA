import { requireAcademics } from "@/lib/academics-access";
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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAcademics();
  if ("error" in auth) return new Response(auth.error, { status: 401 });
  const url = new URL(request.url);
  const dsbaId = (url.searchParams.get("dsba") || "").trim();

  if (dsbaId) {
    if (!isUuid(dsbaId)) return new Response("Choose a developmental assessment.", { status: 400 });
    const campus = (url.searchParams.get("campus") || "").trim();
    const loaded = await loadDsbaMarksheetExportBundle({
      supabase: auth.supabase,
      userId: auth.user.id,
      assessmentId: dsbaId,
      domainFilter: url.searchParams.get("domain"),
      campuses: campus ? [campus] : auth.office ? auth.campuses : undefined,
    });
    if ("error" in loaded) return new Response(loaded.error, { status: loaded.status });
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

  const format = parseMarksheetExportFormat(url.searchParams.get("format"));
  const loaded = await loadMarksheetExportPayload({
    supabase: auth.supabase,
    userId: auth.user.id,
    query,
    sortRaw: url.searchParams.get("sort"),
    campuses: auth.office ? auth.campuses : undefined,
    campusFilter: url.searchParams.get("campus") || undefined,
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
