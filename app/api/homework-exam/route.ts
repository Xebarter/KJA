import { NextResponse } from "next/server";
import { contentDisposition } from "@/lib/download-headers";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DAY = 60 * 60 * 24;

function bad(status = 404) {
  return new NextResponse(null, { status, headers: { "Cache-Control": "private, no-store" } });
}

/** Authenticated inline PDF for homework. */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim() || "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return bad();

  const supabase = await createClient();
  if (!supabase) return bad();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return bad(401);

  const { data: row, error } = await supabase
    .from("homework_assignments")
    .select("id, title, exam_pdf_path, published_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !row?.exam_pdf_path) return bad();

  const { data: allowed, error: allowError } = await supabase.rpc("can_read_class_resource_file", {
    object_name: row.exam_pdf_path,
  });
  if (allowError || !allowed) return bad(403);

  const storage = serviceClient() ?? supabase;
  const { data, error: downloadError } = await storage.storage.from("class-resources").download(row.exam_pdf_path);
  if (downloadError || !data) return bad();

  const bytes = Buffer.from(await data.arrayBuffer());
  const filename = `${String(row.title || "homework").replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ").trim().slice(0, 80) || "homework"}.pdf`;
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": `private, max-age=${DAY}`,
      "Content-Disposition": contentDisposition(filename, "inline"),
      "Content-Length": String(bytes.byteLength),
    },
  });
}
