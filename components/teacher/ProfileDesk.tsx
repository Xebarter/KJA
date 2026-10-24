"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DeskForm } from "@/components/academics/Form";
import { ProcessStatus } from "@/components/ProcessStatus";
import { initials } from "@/lib/applications";
import { teacherPhotoUrl } from "@/lib/teacher-photos";

const EDGE = 480;

async function squarePhoto(file: File) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(EDGE, side);
  canvas.getContext("2d")?.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  if (!blob) throw new Error("This browser couldn't read that photo.");
  return new File([blob], "photo.webp", { type: blob.type || "image/webp" });
}

export function ProfileDesk({
  name,
  email,
  title,
  campus,
  initialsMark,
  photoPath,
  staffId,
  mustResetPassword,
  classes,
  subjects,
  termLabel,
  changePassword,
  setPhoto,
  clearPhoto,
}: {
  name: string;
  email: string;
  title: string | null;
  campus: string | null;
  initialsMark: string | null;
  photoPath: string | null;
  staffId: string;
  mustResetPassword: boolean;
  classes: string[];
  subjects: string[];
  termLabel: string | null;
  changePassword: (formData: FormData) => Promise<{ error?: string; ok?: string }>;
  setPhoto: (formData: FormData) => Promise<{ error?: string; ok?: string }>;
  clearPhoto: () => Promise<{ error?: string; ok?: string }>;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [photoNotice, setPhotoNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pendingClear, startClear] = useTransition();
  const serverUrl = teacherPhotoUrl(staffId, photoPath);
  const shown = preview ?? serverUrl;

  useEffect(() => {
    if (!preview || !serverUrl) return;
    URL.revokeObjectURL(preview);
    setPreview(null);
  }, [serverUrl]);

  async function choose(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoNotice({ tone: "error", text: "Choose a photo (JPG, PNG or WebP)." });
      return;
    }
    setSavingPhoto(true);
    setPhotoNotice(null);
    let local: string | null = null;
    try {
      const photo = await squarePhoto(file);
      local = URL.createObjectURL(photo);
      setPreview(local);
      const data = new FormData();
      data.set("photo", photo);
      const outcome = await setPhoto(data);
      if (outcome.error) throw new Error(outcome.error);
      setPhotoNotice({ tone: "ok", text: outcome.ok || "Photo saved." });
      router.refresh();
    } catch (problem) {
      if (local) URL.revokeObjectURL(local);
      setPreview(null);
      setPhotoNotice({
        tone: "error",
        text: problem instanceof Error ? problem.message : "The photo could not be saved.",
      });
    } finally {
      setSavingPhoto(false);
    }
  }

  function removePhoto() {
    if (savingPhoto || pendingClear) return;
    setPhotoNotice(null);
    startClear(async () => {
      const outcome = await clearPhoto();
      if (outcome.error) {
        setPhotoNotice({ tone: "error", text: outcome.error });
        return;
      }
      setPreview(null);
      setPhotoNotice({ tone: "ok", text: outcome.ok || "Photo removed." });
      router.refresh();
    });
  }

  const busy = savingPhoto || pendingClear;

  return (
    <div className="tch-prf">
      {mustResetPassword ? (
        <p className="tch-prf-banner" role="status">
          <i className="fa-solid fa-key" aria-hidden="true" />
          Choose a new password before you use the rest of the desk. This replaces the temporary password from the office.
        </p>
      ) : null}

      <div className="tch-prf-desk">
        <section className="tch-prf-card tch-prf-identity" aria-label="Your profile">
          <header className="tch-prf-card-head">
            <span className="tch-prf-card-icon" aria-hidden="true">
              <i className="fa-solid fa-id-card" />
            </span>
            <div>
              <h2>Your profile</h2>
              <p>Shown to pupils on My Class and to the academics office on Staff.</p>
            </div>
          </header>

          <div className="tch-prf-identity-body">
            <div className="tch-prf-photo-block">
              <button
                type="button"
                className={`tch-prf-photo${shown ? " has-photo" : ""}${busy ? " is-saving" : ""}`}
                onClick={() => input.current?.click()}
                disabled={busy}
                aria-label={shown ? "Change your photo" : "Upload a photo"}
              >
                {shown ? <img src={shown} alt="" /> : <span>{initials(name)}</span>}
                <em aria-hidden="true">
                  <i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-camera"}`} />
                </em>
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
              <div className="tch-prf-photo-actions">
                <button type="button" className="tch-prf-photo-btn" disabled={busy} onClick={() => input.current?.click()}>
                  <i className="fa-solid fa-upload" aria-hidden="true" />
                  {shown ? "Change photo" : "Upload photo"}
                </button>
                {shown || photoPath ? (
                  <button type="button" className="tch-prf-photo-btn is-quiet" disabled={busy} onClick={removePhoto}>
                    <i className="fa-solid fa-trash" aria-hidden="true" />
                    Remove
                  </button>
                ) : null}
              </div>
              <p className="tch-prf-photo-hint">Square crop · JPG, PNG or WebP · under 1 MB</p>
              {photoNotice ? (
                <p className={`tch-prf-feedback is-${photoNotice.tone}`} role={photoNotice.tone === "error" ? "alert" : "status"}>
                  <i className={`fa-solid ${photoNotice.tone === "ok" ? "fa-circle-check" : "fa-circle-exclamation"}`} aria-hidden="true" />
                  {photoNotice.text}
                </p>
              ) : null}
              <ProcessStatus active={busy} label={savingPhoto ? "Saving photo" : "Removing photo"} />
            </div>

            <div className="tch-prf-meta">
              <h3>{name}</h3>
              <p>{[title, campus].filter(Boolean).join(" · ") || "Teacher"}</p>
              <dl>
                <div>
                  <dt>Email</dt>
                  <dd>{email || "—"}</dd>
                </div>
                {initialsMark ? (
                  <div>
                    <dt>Report initials</dt>
                    <dd>{initialsMark}</dd>
                  </div>
                ) : null}
                {termLabel ? (
                  <div>
                    <dt>Term</dt>
                    <dd>{termLabel}</dd>
                  </div>
                ) : null}
              </dl>
              {(classes.length || subjects.length) ? (
                <div className="tch-prf-tags" aria-label="This term">
                  {classes.map((label) => (
                    <span key={`c-${label}`} className="tch-prf-tag is-class">
                      <i className="fa-solid fa-users" aria-hidden="true" />
                      {label}
                    </span>
                  ))}
                  {subjects.slice(0, 6).map((label) => (
                    <span key={`s-${label}`} className="tch-prf-tag">
                      <i className="fa-solid fa-book-open" aria-hidden="true" />
                      {label}
                    </span>
                  ))}
                  {subjects.length > 6 ? <span className="tch-prf-tag">+{subjects.length - 6} more</span> : null}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="tch-prf-card tch-prf-security" aria-label="Password">
          <header className="tch-prf-card-head">
            <span className="tch-prf-card-icon" aria-hidden="true">
              <i className="fa-solid fa-key" />
            </span>
            <div>
              <h2>{mustResetPassword ? "Set a new password" : "Password"}</h2>
              <p>{mustResetPassword ? "Required before you open the rest of the desk." : "Change the password you use to sign in."}</p>
            </div>
          </header>

          <DeskForm action={changePassword} className="tch-prf-form" status="Updating password">
            <label className="tch-prf-field">
              <span>New password</span>
              <input name="password" type="password" minLength={6} required autoComplete="new-password" placeholder="At least 6 characters" />
            </label>
            <label className="tch-prf-field">
              <span>Confirm password</span>
              <input name="confirm" type="password" minLength={6} required autoComplete="new-password" placeholder="Type it again" />
            </label>
            <button className="tch-prf-save" type="submit">
              <i className="fa-solid fa-shield-halved" aria-hidden="true" />
              {mustResetPassword ? "Save and continue" : "Update password"}
            </button>
          </DeskForm>
        </section>
      </div>
    </div>
  );
}
