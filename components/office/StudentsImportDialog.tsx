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
  const [ok, setOk] = useState<string | null>(null);
  const [preview, setPreview] = useState<StudentsImportPreview | null>(null);
  const [workbookName, setWorkbookName] = useState("");
  const [photosName, setPhotosName] = useState("");

  if (!open) return null;

  const close = () => {
    setError(null);
    setOk(null);
    setPreview(null);
    setWorkbookName("");
    setPhotosName("");
    onClose();
  };

  const run = (intent: "preview" | "commit") => {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    data.set("intent", intent);
    setError(null);
    setOk(null);
    start(async () => {
      const result = await importStudentsWorkbook(data);
      if (result.error) {
        setError(result.error);
        if (result.preview) setPreview(result.preview);
        return;
      }
      if (result.preview) setPreview(result.preview);
      if (intent === "commit") {
        setOk(result.ok || "Saved.");
        router.refresh();
      }
    });
  };

  const canApply = Boolean(preview && !preview.issues.length && !pending);

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
            <h2 id="students-import-title">Upload student workbook</h2>
            <p>Bring in an Excel register, then optionally a zip of photos named by student number.</p>
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
                required
                onChange={(event) => {
                  setWorkbookName(event.target.files?.[0]?.name || "");
                  setPreview(null);
                  setOk(null);
                  setError(null);
                }}
              />
            </label>

            <label className={`ofc-sheet-drop is-optional${photosName ? " is-filled" : ""}`}>
              <span className="ofc-sheet-drop-ico" aria-hidden="true">
                <i className="fa-solid fa-images" />
              </span>
              <span className="ofc-sheet-drop-body">
                <strong>Photos zip</strong>
                <small>{photosName || "Optional · KJ-2024-001.jpg inside the zip"}</small>
              </span>
              <span className="ofc-sheet-drop-btn">{photosName ? "Change" : "Add"}</span>
              <input
                name="photos"
                type="file"
                accept=".zip,application/zip"
                onChange={(event) => {
                  setPhotosName(event.target.files?.[0]?.name || "");
                  setPreview(null);
                  setOk(null);
                }}
              />
            </label>
          </div>

          {error ? <p className="ofc-sheet-banner is-error" role="alert">{error}</p> : null}
          {ok ? <p className="ofc-sheet-banner is-ok" role="status">{ok}</p> : null}

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
              Preview first to confirm creates and updates, then apply. Blank cells on existing pupils leave those fields unchanged.
            </p>
          )}

          <div className="ofc-sheet-actions">
            <button type="button" className="admin-btn admin-btn-ghost" onClick={close}>Cancel</button>
            <button type="button" className="admin-btn" disabled={pending || !workbookName} onClick={() => run("preview")}>
              {pending && !preview ? "Checking…" : "Preview"}
            </button>
            <button type="button" className="admin-btn admin-btn-gold" disabled={!canApply} onClick={() => run("commit")}>
              {pending && preview ? "Saving…" : "Apply changes"}
            </button>
          </div>
        </form>
        <ProcessStatus active={pending} label={preview ? "Saving students" : "Reading workbook"} />
      </div>
    </div>
  );
}
