export const STUDENT_PHOTO_BUCKET = "student-photos";

/**
 * Stable app URL for a pupil's photo.
 * Pass photo_path so a replacement busts the cache.
 * Pass null or "" only when you know there is no photo (skips the request).
 * Omit photoPath to try loading by id — the page stays fast and the image fills in later.
 */
export function studentPhotoUrl(id: string, photoPath?: string | null) {
  if (!id || photoPath === null || photoPath === "") return null;
  return photoPath ? `/student-photo/${id}?v=${encodeURIComponent(photoPath)}` : `/student-photo/${id}`;
}
