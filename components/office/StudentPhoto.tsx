"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { setStudentPhoto } from "@/app/admissions_office/(office)/students/actions";
import { initials } from "@/lib/applications";

const EDGE = 480;

/** Crops the middle square of a photo and shrinks it to a small WebP, well under the upload limit. */
async function squarePhoto(file: File) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(EDGE, side);
  canvas.getContext("2d")?.drawImage(
    bitmap,
    (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side,
    0, 0, canvas.width, canvas.height,
  );
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  if (!blob) throw new Error("This browser couldn't read that photo.");
  return new File([blob], "photo.webp", { type: blob.type || "image/webp" });
}

/** The student's photo, or their initials, as a button that uploads a new photo. */
export function StudentPhoto({ id, name, url, sex, size = "sm" }: {
  id: string;
  name: string;
  url: string | null;
  sex: string | null;
  size?: "sm" | "lg";
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [, startRefresh] = useTransition();

  // Keep showing the local preview until the server's link to the new photo arrives.
  useEffect(() => {
    if (!preview || !url) return;
    URL.revokeObjectURL(preview);
    setPreview(null);
  }, [url]);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      window.alert("Choose a photo (JPG, PNG or WebP).");
      return;
    }
    setSaving(true);
    let local: string | null = null;
    try {
      const photo = await squarePhoto(file);
      local = URL.createObjectURL(photo);
      setPreview(local);
      const data = new FormData();
      data.set("id", id);
      data.set("photo", photo);
      const outcome = await setStudentPhoto(data);
      if (outcome.error) throw new Error(outcome.error);
      startRefresh(() => router.refresh());
    } catch (problem) {
      if (local) URL.revokeObjectURL(local);
      setPreview(null);
      window.alert(problem instanceof Error ? problem.message : "The photo could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const shown = preview ?? url;
  const tone = sex === "M" ? "boy" : sex === "F" ? "girl" : "none";
  const label = shown ? `Change ${name}'s photo` : `Add a photo of ${name}`;

  return (
    <span className="ofc-photo-wrap">
      <button
        type="button"
        className={`ofc-photo is-${size} is-${tone}${shown ? " has-photo" : ""}${saving ? " is-saving" : ""}`}
        onClick={() => input.current?.click()}
        disabled={saving}
        title={label}
        aria-label={label}
      >
        {shown ? <img src={shown} alt="" /> : <span className="ofc-photo-initials">{initials(name)}</span>}
        <span className="ofc-photo-badge" aria-hidden="true">
          <i className={saving ? "fa-solid fa-spinner fa-spin" : "fa-solid fa-camera"} />
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/*"
        hidden
        tabIndex={-1}
        onChange={(event) => {
          void choose(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </span>
  );
}
