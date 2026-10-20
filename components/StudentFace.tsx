"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { initials } from "@/lib/applications";
import { studentPhotoUrl } from "@/lib/student-photos";

const photoStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  borderRadius: "inherit",
};

/** A pupil's photo, or their initials if there isn't one.
 *  Initials paint immediately; the photo loads in the background and covers them when ready. */
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
  const [ready, setReady] = useState(false);
  const src = studentPhotoUrl(id, photoPath);
  const loading = Boolean(src) && !failed;

  return (
    <span
      className={className}
      aria-hidden="true"
      style={loading ? { position: "relative" } : undefined}
    >
      {fallback ?? initials(name)}
      {loading ? (
        <img
          src={src!}
          alt=""
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          onLoad={() => setReady(true)}
          onError={() => setFailed(true)}
          style={{ ...photoStyle, opacity: ready ? 1 : 0 }}
        />
      ) : null}
    </span>
  );
}
