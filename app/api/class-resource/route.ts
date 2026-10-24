import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const DAY = 60 * 60 * 24;

function bad(status = 404) {
  return new NextResponse(null, { status, headers: { "Cache-Control": "private, no-store" } });
}

/** Authenticated download/preview for class-resource files (notes inline images, downloads, pictures). */
export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("path")?.trim() || "";
  if (!path || path.includes("..") || path.startsWith("/")) return bad();

  const supabase = await createClient();
  if (!supabase) return bad();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return bad(401);

  const { data: allowed, error: allowError } = await supabase.rpc("can_read_class_resource_file", {
    object_name: path,
  });
  if (allowError || !allowed) return bad(403);

  const storage = serviceClient() ?? supabase;
  const { data, error } = await storage.storage.from("class-resources").download(path);
  if (error || !data) return bad();

  const type = data.type || "application/octet-stream";
  const bytes = new Uint8Array(await data.arrayBuffer());
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": type,
      "Cache-Control": `private, max-age=${DAY}`,
      "Content-Disposition": type.startsWith("image/") ? "inline" : `attachment; filename="${path.split("/").pop() || "file"}"`,
    },
  });
}
