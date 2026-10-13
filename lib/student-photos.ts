import type { SupabaseClient } from "@supabase/supabase-js";

export const STUDENT_PHOTO_BUCKET = "student-photos";

/** Signed links for private student photos, keyed by storage path. One request for the whole page. */
export async function signStudentPhotos(supabase: SupabaseClient, paths: (string | null | undefined)[]) {
  const wanted = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  const urls = new Map<string, string>();
  if (!wanted.length) return urls;
  const { data } = await supabase.storage.from(STUDENT_PHOTO_BUCKET).createSignedUrls(wanted, 60 * 60);
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl);
  }
  return urls;
}
