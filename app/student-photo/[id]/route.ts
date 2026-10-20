import { NextResponse } from "next/server";
import { STUDENT_PHOTO_BUCKET } from "@/lib/student-photos";
import { isUuid } from "@/lib/students";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const DAY = 60 * 60 * 24;
const cached = new Map<string, { bytes: Uint8Array; type: string }>();

function notFound() {
  return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
}

/** Private passport photo. Staff and the child's parents may load it; everyone else gets 404. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const supabase = await createClient();
  if (!supabase) return notFound();
  // Prefer local JWT verification so each avatar doesn't wait on a Supabase Auth round trip.
  const { data: claims } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return notFound();
  }

  const { data: student } = await supabase.from("students").select("photo_path").eq("id", id).maybeSingle();
  const path = typeof student?.photo_path === "string" ? student.photo_path : "";
  if (!path) return notFound();

  const etag = `"${path.replace(/"/g, "")}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": `private, max-age=${DAY}` } });
  }

  let photo = cached.get(path);
  if (!photo) {
    const storage = serviceClient() ?? supabase;
    const { data, error } = await storage.storage.from(STUDENT_PHOTO_BUCKET).download(path);
    if (error || !data) return notFound();
    photo = { bytes: new Uint8Array(await data.arrayBuffer()), type: data.type || "image/jpeg" };
    cached.set(path, photo);
  }

  return new NextResponse(Buffer.from(photo.bytes), {
    headers: {
      "Content-Type": photo.type,
      "Cache-Control": `private, max-age=${DAY}`,
      ETag: etag,
    },
  });
}
