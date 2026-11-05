import { NextResponse } from "next/server";
import { openAcademics } from "@/lib/academics-access";
import { isUuid } from "@/lib/students";
import { serviceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

function bad(status = 404) {
  return new NextResponse(null, { status, headers: { "Cache-Control": "private, no-store" } });
}

/** Authenticated download for a scheme of work PDF / Word file. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return bad();

  const opened = await openAcademics();
  if ("notice" in opened) return bad(401);
  const { supabase, office, staffId } = opened.auth;

  const { data: scheme, error } = await supabase
    .from("schemes")
    .select("id, staff_id, file_path, file_name, file_mime")
    .eq("id", id)
    .maybeSingle();
  if (error || !scheme?.file_path) return bad();
  if (!office && scheme.staff_id !== staffId) return bad(403);

  const storage = serviceClient() ?? supabase;
  const { data, error: downloadError } = await storage.storage.from("schemes").download(scheme.file_path);
  if (downloadError || !data) return bad();

  const type = scheme.file_mime || data.type || "application/octet-stream";
  const name = (scheme.file_name || scheme.file_path.split("/").pop() || "scheme").replace(/"/g, "");
  const bytes = new Uint8Array(await data.arrayBuffer());
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
