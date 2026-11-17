"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importStudentsWorkbook } from "@/app/admissions_office/(office)/students/actions";
import { ProcessStatus } from "@/components/ProcessStatus";
import type { StudentsImportPreview } from "@/lib/students-import";

export function StudentsImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<StudentsImportPreview | null>(null);
  const [workbookName, setWorkbookName] = useState("");
  const [photosName, setPhotosName] = useState("");
  const [phase, setPhase] = useState<"idle" | "preview" | "commit">("idle");
  const [closeWhenDone, setCloseWhenDone] = useState(false);

  if (!open) return null;

  const hasFiles = Boolean(workbookName || photosName);
  const close = () => {
    setError(null);
    setPreview(null);
    setWorkbookName("");
    setPhotosName("");
    setPhase("idle");
    setCloseWhenDone(false);
    onClose();
  };

  const run = (intent: "preview" | "commit") => {
    const form = formRef.current;
    if (!form || !hasFiles) return;
    // Build FormData by hand so empty file inputs are not posted (they can break multipart parsing).
    const data = new FormData();
    data.set("intent", intent);
    const workbookInput = form.elements.namedItem("file");
    const photosInput = form.elements.namedItem("photos");
    if (workbookInput instanceof HTMLInputElement && workbookInput.files?.[0]) {
      data.set("file", workbookInput.files[0]);
    }
    if (photosInput instanceof HTMLInputElement && photosInput.files?.[0]) {
      data.set("photos", photosInput.files[0]);
    }
    if (!data.has("file") && !data.has("photos")) return;

    setError(null);
    setCloseWhenDone(false);
    setPhase(intent);
    start(async () => {
      try {
        const result = await importStudentsWorkbook(data);
        if (result.error) {
          setError(result.error);
          if (result.preview) setPreview(result.preview);
          setPhase("idle");
          return;
        }
        if (result.preview) setPreview(result.preview);
        if (intent === "commit") {
          router.refresh();
          setCloseWhenDone(true);
          setPhase("idle");
          return;
        }
        setPhase("idle");
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Upload failed.";
        setError(
          /unexpected end of form|body.*exceeded|failed to parse/i.test(message)
            ? "That upload was too large or incomplete. Try a smaller zip, or upload the Excel and photos separately."
            : message,
        );
        setPhase("idle");
      }
    });
  };

  const canApply = Boolean(preview && !preview.issues.length && !pending && hasFiles);
  const statusLabel =
    phase === "commit" || closeWhenDone
      ? "Saving changes"
      : workbookName
        ? "Reading workbook"
        : "Reading photos";

  return (
    <div className="ofc-sheet-overlay" role="presentation" onClick={close}>
      <div
        className="ofc-sheet-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="students-import-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="ofc-sheet-head">
          <div className="ofc-sheet-brand" aria-hidden="true">
            <i className="fa-solid fa-file-import" />
          </div>
          <div className="ofc-sheet-copy">
            <h2 id="students-import-title">Upload Changes</h2>
            <p>Upload an Excel workbook, a photos zip named by student number, or both.</p>
          </div>
          <button type="button" className="ofc-sheet-close" aria-label="Close" onClick={close}>
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </header>

        <form ref={formRef} className="ofc-sheet-form" onSubmit={(event) => event.preventDefault()}>
          <div className="ofc-sheet-drops">
            <label className={`ofc-sheet-drop${workbookName ? " is-filled" : ""}`}>
              <span className="ofc-sheet-drop-ico" aria-hidden="true">
                <i className="fa-solid fa-file-excel" />
              </span>
              <span className="ofc-sheet-drop-body">
                <strong>Excel workbook</strong>
                <small>{workbookName || ".xlsx from Download for edit"}</small>
              </span>
              <span className="ofc-sheet-drop-btn">{workbookName ? "Change" : "Choose"}</span>
              <input
                name="file"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => {
                  setWorkbookName(event.target.files?.[0]?.name || "");
                  setPreview(null);
                  setError(null);
                }}
              />
            </label>

            <label className={`ofc-sheet-drop${photosName ? " is-filled" : ""}`}>
              <span className="ofc-sheet-drop-ico" aria-hidden="true">
                <i className="fa-solid fa-images" />
              </span>
              <span className="ofc-sheet-drop-body">
                <strong>Photos zip</strong>
                <small>{photosName || "KJ-2024-001.jpg inside the zip"}</small>
              </span>
              <span className="ofc-sheet-drop-btn">{photosName ? "Change" : "Choose"}</span>
              <input
                name="photos"
                type="file"
                accept=".zip,application/zip"
                onChange={(event) => {
                  setPhotosName(event.target.files?.[0]?.name || "");
                  setPreview(null);
                  setError(null);
                }}
              />
            </label>
          </div>

          {error ? <p className="ofc-sheet-banner is-error" role="alert">{error}</p> : null}

          {preview ? (
            <section className="ofc-sheet-preview" aria-label="Preview">
              <div className="ofc-sheet-stats">
                <div>
                  <strong>{preview.ready}</strong>
                  <span>Ready</span>
                </div>
                <div>
                  <strong>{preview.updates}</strong>
                  <span>Updates</span>
                </div>
                <div>
                  <strong>{preview.creates}</strong>
                  <span>Creates</span>
                </div>
                <div>
                  <strong>{preview.photos}</strong>
                  <span>Photos</span>
                </div>
              </div>

              {preview.issues.length ? (
                <div className="ofc-sheet-note is-error">
                  <header><i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> Fix these rows</header>
                  <ul>
                    {preview.issues.slice(0, 8).map((issue) => (
                      <li key={`${issue.row}-${issue.message}`}>
                        <em>Row {issue.row}</em> {issue.pupil} — {issue.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {preview.warnings.length ? (
                <div className="ofc-sheet-note is-warn">
                  <header><i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> Notes</header>
                  <ul>
                    {preview.warnings.slice(0, 6).map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                </div>
              ) : null}

              {preview.sample.length && !preview.issues.length ? (
                <div className="ofc-sheet-note">
                  <header><i className="fa-solid fa-list-check" aria-hidden="true" /> Sample changes</header>
                  <ul className="ofc-sheet-sample">
                    {preview.sample.map((row) => (
                      <li key={`${row.row}-${row.name}`}>
                        <span className={`ofc-sheet-pill is-${row.action}`}>{row.action}</span>
                        <span>
                          {row.name}
                          {row.number ? <small>{row.number}</small> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : (
            <p className="ofc-sheet-hint">
              Preview first, then apply. Blank cells on existing pupils leave those fields unchanged.
              A photos zip alone updates photos for matching student numbers.
            </p>
          )}

          <div className="ofc-sheet-actions">
            <button type="button" className="ofc-sheet-btn is-ghost" onClick={close}>Cancel</button>
            <button
              type="button"
              className="ofc-sheet-btn is-navy"
              disabled={pending || !hasFiles}
              onClick={() => run("preview")}
            >
              {pending && phase === "preview" ? "Checking…" : "Preview"}
            </button>
            <button
              type="button"
              className="ofc-sheet-btn is-gold"
              disabled={!canApply}
              onClick={() => run("commit")}
            >
              {pending && phase === "commit" ? "Saving…" : "Apply changes"}
            </button>
          </div>
        </form>
        <ProcessStatus
          active={pending}
          label={statusLabel}
          onComplete={closeWhenDone ? close : undefined}
        />
      </div>
    </div>
  );
}
