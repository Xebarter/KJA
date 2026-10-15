"use client";

import { useState, type ReactNode } from "react";
import { initials } from "@/lib/applications";
import { studentPhotoUrl } from "@/lib/student-photos";

/** A pupil's photo, or their initials if there isn't one. */
export function StudentFace({
  id,
  name,
  photoPath,
  className,
  fallback,
}: {
  id: string;
  name: string;
  photoPath?: string | null;
  className?: string;
  fallback?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const src = studentPhotoUrl(id, photoPath);
  const shown = src && !failed;
  return (
    <span className={className} aria-hidden="true">
      {shown ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} /> : fallback ?? initials(name)}
    </span>
  );
}
