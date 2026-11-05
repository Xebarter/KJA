"use client";

import { useState } from "react";
import { DeskForm } from "@/components/academics/Form";
import { deleteScheme, saveScheme, saveSchemeFile, updateScheme } from "@/app/academics_office/(desk)/actions";
import { ACADEMICS_BASE } from "@/lib/academics";

type Choice = { value: string; label: string };
type Staff = { id: string; full_name: string };

export function NewSchemeForm({
  termId,
  choices,
  staff,
  office,
}: {
  termId: string;
  choices: Choice[];
  staff: Staff[];
  office: boolean;
}) {
  const [fileName, setFileName] = useState("");
  return (
    <DeskForm action={saveScheme} className="sch-form" status="Starting scheme">
      <input type="hidden" name="term_id" value={termId} />
      <label className="ofc-field">
        <span>Class and subject</span>
        <select name="class_subject" required defaultValue="">
          <option value="" disabled>Choose</option>
          {choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
        </select>
      </label>
      {office ? (
        <label className="ofc-field">
          <span>Teacher</span>
          <select name="staff_id" required defaultValue="">
            <option value="" disabled>Choose</option>
            {staff.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}
          </select>
        </label>
      ) : null}
      <label className="ofc-field">
        <span>Title</span>
        <input name="title" required placeholder="e.g. English, Term 1" maxLength={160} />
      </label>
      <label className={`ofc-field sch-file${fileName ? " has-file" : ""}`}>
        <span>Scheme file <em>Optional · PDF or Word · max 15 MB</em></span>
        <span className="sch-file-box">
          <i className={`fa-solid ${fileName ? "fa-file-circle-check" : "fa-cloud-arrow-up"}`} aria-hidden="true" />
          <span>{fileName || "Choose a PDF or Word file"}</span>
          <input
            type="file"
            name="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
          />
        </span>
      </label>
      <button className="sch-commit" type="submit">
        <i className="fa-solid fa-plus" aria-hidden="true" /> Start scheme
      </button>
    </DeskForm>
  );
}

export function EditSchemeForm({
  schemeId,
  title,
  staffId,
  staff,
  office,
}: {
  schemeId: string;
  title: string;
  staffId: string | null;
  staff: Staff[];
  office: boolean;
}) {
  return (
    <DeskForm action={updateScheme} className="sch-form" status="Saving scheme">
      <input type="hidden" name="scheme_id" value={schemeId} />
      <label className="ofc-field">
        <span>Title</span>
        <input name="title" required defaultValue={title} maxLength={160} />
      </label>
      {office ? (
        <label className="ofc-field">
          <span>Teacher</span>
          <select name="staff_id" required defaultValue={staffId || ""}>
            <option value="" disabled>Choose</option>
            {staff.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}
          </select>
        </label>
      ) : null}
      <button className="sch-commit" type="submit">Save changes</button>
    </DeskForm>
  );
}

export function SchemeFilePanel({
  schemeId,
  fileName,
  editable,
}: {
  schemeId: string;
  fileName: string | null;
  editable: boolean;
}) {
  const [picked, setPicked] = useState("");
  return (
    <section className="sch-card sch-file-card" aria-label="Scheme file">
      <header className="sch-card-head">
        <div className="sch-card-title">
          <span className="sch-card-icon" aria-hidden="true"><i className="fa-solid fa-file-lines" /></span>
          <div>
            <h2>Attached plan</h2>
            <p>Upload the full scheme as a PDF or Word document. You can still add weekly lessons below.</p>
          </div>
        </div>
      </header>
      <div className="sch-file-body">
        {fileName ? (
          <div className="sch-file-current">
            <i className="fa-solid fa-paperclip" aria-hidden="true" />
            <div>
              <strong>{fileName}</strong>
              <small>Ready to download</small>
            </div>
            <a className="sch-ghost-btn" href={`${ACADEMICS_BASE}/schemes/${schemeId}/file`}>
              <i className="fa-solid fa-download" aria-hidden="true" /> Download
            </a>
          </div>
        ) : (
          <p className="sch-quiet sch-file-empty">No file attached yet.</p>
        )}
        {editable ? (
          <div className="sch-file-actions">
            <DeskForm action={saveSchemeFile} className="sch-form is-inline" status="Uploading file">
              <input type="hidden" name="scheme_id" value={schemeId} />
              <label className={`ofc-field sch-file${picked ? " has-file" : ""}`}>
                <span>{fileName ? "Replace file" : "Upload file"} <em>PDF or Word · max 15 MB</em></span>
                <span className="sch-file-box">
                  <i className={`fa-solid ${picked ? "fa-file-circle-check" : "fa-cloud-arrow-up"}`} aria-hidden="true" />
                  <span>{picked || "Choose a PDF or Word file"}</span>
                  <input
                    type="file"
                    name="file"
                    required
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(event) => setPicked(event.target.files?.[0]?.name ?? "")}
                  />
                </span>
              </label>
              <button className="sch-commit" type="submit" disabled={!picked}>
                <i className="fa-solid fa-upload" aria-hidden="true" /> {fileName ? "Replace" : "Upload"}
              </button>
            </DeskForm>
            {fileName ? (
              <DeskForm action={saveSchemeFile} className="sch-form is-inline" status="Removing file">
                <input type="hidden" name="scheme_id" value={schemeId} />
                <button className="sch-ghost-btn is-danger" type="submit" name="intent" value="remove">
                  <i className="fa-solid fa-trash" aria-hidden="true" /> Remove file
                </button>
              </DeskForm>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function DeleteSchemeButton({ schemeId, title }: { schemeId: string; title: string }) {
  return (
    <DeskForm
      action={deleteScheme}
      className="sch-form is-inline"
      status="Deleting scheme"
    >
      <input type="hidden" name="scheme_id" value={schemeId} />
      <button
        className="sch-ghost-btn is-danger"
        type="submit"
        onClick={(event) => {
          if (!window.confirm(`Delete “${title}”? This cannot be undone.`)) event.preventDefault();
        }}
      >
        <i className="fa-solid fa-trash" aria-hidden="true" /> Delete scheme
      </button>
    </DeskForm>
  );
}
