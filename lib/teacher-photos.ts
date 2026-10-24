export const TEACHER_PHOTO_BUCKET = "teacher-photos";

/**
 * Stable app URL for a teacher's profile photo.
 * Pass photo_path so a replacement busts the cache.
 * Pass null or "" only when you know there is no photo (skips the request).
 */
export function teacherPhotoUrl(id: string, photoPath?: string | null) {
  if (!id || photoPath === null || photoPath === "") return null;
  return photoPath ? `/teacher-photo/${id}?v=${encodeURIComponent(photoPath)}` : `/teacher-photo/${id}`;
}
