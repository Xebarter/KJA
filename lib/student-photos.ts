export const STUDENT_PHOTO_BUCKET = "student-photos";

/** Stable app URL for a pupil's photo. Pass photo_path so a replacement busts the cache. */
export function studentPhotoUrl(id: string, photoPath?: string | null) {
  if (!id || photoPath === null || photoPath === "") return null;
  return photoPath ? `/student-photo/${id}?v=${encodeURIComponent(photoPath)}` : `/student-photo/${id}`;
}
