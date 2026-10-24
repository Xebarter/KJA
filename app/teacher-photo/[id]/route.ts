import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isUuid } from "@/lib/students";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { TEACHER_PHOTO_BUCKET } from "@/lib/teacher-photos";

export const dynamic = "force-dynamic";

const DAY = 60 * 60 * 24;
const cached = new Map<string, { bytes: Uint8Array; type: string }>();

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, If-None-Match",
  "Access-Control-Max-Age": "86400",
} as const;

function notFound() {
  return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-store", ...cors } });
}

function tokenFromRequest(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    if (token) return token;
  }
  const query = new URL(request.url).searchParams.get("access_token")?.trim();
  return query || null;
}

function clientFromAccessToken(token: string): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function resolvePhotoPath(supabase: SupabaseClient, staffId: string): Promise<string> {
  const rpc = await supabase.rpc("readable_teacher_photo_path", { p_staff: staffId });
  if (!rpc.error && typeof rpc.data === "string" && rpc.data.trim()) return rpc.data.trim();

  // Fallback before 0047 is applied: table select under existing RLS.
  const { data: staff } = await supabase.from("teaching_staff").select("photo_path").eq("id", staffId).maybeSingle();
  return typeof staff?.photo_path === "string" ? staff.photo_path.trim() : "";
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { ...cors } });
}

/** Private teacher portrait for academics staff, the teacher themselves, and their pupils. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const accessToken = tokenFromRequest(request);
  let supabase: SupabaseClient | null = accessToken ? clientFromAccessToken(accessToken) : null;
  if (!supabase) supabase = await createClient();
  if (!supabase) return notFound();

  const { data: userData, error: userError } = accessToken
    ? await supabase.auth.getUser(accessToken)
    : await supabase.auth.getUser();
  if (userError || !userData.user) return notFound();

  const path = await resolvePhotoPath(supabase, id);
  if (!path) return notFound();

  const etag = `"${path.replace(/"/g, "")}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": `private, max-age=${DAY}`, ...cors } });
  }

  let photo = cached.get(path);
  if (!photo) {
    const storage = serviceClient() ?? supabase;
    const { data, error } = await storage.storage.from(TEACHER_PHOTO_BUCKET).download(path);
    if (error || !data) return notFound();
    photo = { bytes: new Uint8Array(await data.arrayBuffer()), type: data.type || "image/jpeg" };
    cached.set(path, photo);
  }

  return new NextResponse(Buffer.from(photo.bytes), {
    headers: {
      "Content-Type": photo.type,
      "Cache-Control": `private, max-age=${DAY}`,
      ETag: etag,
      ...cors,
    },
  });
}
