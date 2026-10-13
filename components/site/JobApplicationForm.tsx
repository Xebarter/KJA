"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { submitJobApplication } from "@/lib/job-application-actions";
import {
  CV_ACCEPT,
  CV_TYPES,
  EXPERIENCE_LEVELS,
  MAX_FILE_BYTES,
  MAX_SUPPORTING,
  QUALIFICATIONS,
  SUPPORTING_ACCEPT,
  SUPPORTING_TYPES,
  fileIcon,
  fileSize,
  fileType,
} from "@/lib/job-applications";

export type ApplyRole = { id: string; title: string; closes: string };

type Status = "idle" | "sending" | "sent" | "failed";
type Errors = Record<string, string>;

const MIN_LETTER = 50;
const MAX_LETTER = 5000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s()-]{7,20}$/;

function checkFile(file: File, allowed: string[]) {
  if (!allowed.includes(fileType(file.name, file.type))) {
    return allowed.length > CV_TYPES.length ? "Use a PDF, Word document, JPG or PNG." : "Use a PDF or Word document.";
  }
  if (file.size > MAX_FILE_BYTES) return `${file.name} is larger than 5 MB.`;
  return "";
}

function FileChip({ file, onRemove, label }: { file: File; onRemove: () => void; label: string }) {
  return (
    <li className="kja-ja-file">
      <i className={`fas ${fileIcon(fileType(file.name, file.type))}`} aria-hidden="true" />
      <span>
        <strong>{file.name}</strong>
        <small>{label} · {fileSize(file.size)}</small>
      </span>
      <button type="button" onClick={onRemove} aria-label={`Remove ${file.name}`}>
        <i className="fas fa-xmark" aria-hidden="true" />
      </button>
    </li>
  );
}

function Drop({
  id,
  accept,
  multiple,
  title,
  hint,
  invalid,
  describedBy,
  onFiles,
}: {
  id: string;
  accept: string;
  multiple?: boolean;
  title: string;
  hint: string;
  invalid?: boolean;
  describedBy?: string;
  onFiles: (files: File[]) => void;
}) {
  const [over, setOver] = useState(false);
  const drop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setOver(false);
    onFiles(Array.from(event.dataTransfer.files));
  };
  return (
    <label
      htmlFor={id}
      className={`kja-ja-drop${over ? " is-over" : ""}${invalid ? " is-invalid" : ""}`}
      onDragOver={(event) => { event.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
    >
      <input
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <span className="kja-ja-drop-icon" aria-hidden="true"><i className="fas fa-cloud-arrow-up" /></span>
      <span className="kja-ja-drop-text">
        <strong>{title}</strong>
        <small>{hint}</small>
      </span>
      <span className="kja-ja-drop-btn" aria-hidden="true">Browse</span>
    </label>
  );
}

export function JobApplicationForm({
  roles,
  selected,
  campuses,
  phoneNumber,
  emailAddress,
}: {
  roles: ApplyRole[];
  selected: string;
  campuses: string[];
  phoneNumber: string;
  emailAddress: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [role, setRole] = useState(selected);
  const [cv, setCv] = useState<File | null>(null);
  const [extras, setExtras] = useState<File[]>([]);
  const [letter, setLetter] = useState("");
  const [started, setStarted] = useState(0);
  const [today, setToday] = useState("");
  const [sent, setSent] = useState<{ name: string; email: string; role: string; reference: string } | null>(null);

  useEffect(() => {
    setStarted(Date.now());
    setToday(new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10));
  }, []);
  useEffect(() => {
    if (status === "sent") successRef.current?.focus();
  }, [status]);

  const roleLabel = roles.find((item) => item.id === role)?.title ?? "General application";
  const clearError = (name: string) => setErrors((current) => {
    if (!current[name]) return current;
    const next = { ...current };
    delete next[name];
    return next;
  });

  const addCv = (files: File[]) => {
    const file = files[0];
    if (!file) return;
    const problem = checkFile(file, CV_TYPES);
    if (problem) {
      setErrors((current) => ({ ...current, cv: problem }));
      return;
    }
    clearError("cv");
    setCv(file);
  };

  const addExtras = (files: File[]) => {
    const problem = files.map((file) => checkFile(file, SUPPORTING_TYPES)).find(Boolean);
    const good = files.filter((file) => !checkFile(file, SUPPORTING_TYPES));
    const room = MAX_SUPPORTING - extras.length;
    if (good.length > room) {
      setErrors((current) => ({ ...current, documents: `You can attach up to ${MAX_SUPPORTING} supporting documents.` }));
    } else if (problem) {
      setErrors((current) => ({ ...current, documents: problem }));
    } else {
      clearError("documents");
    }
    if (good.length && room > 0) setExtras((current) => [...current, ...good.slice(0, room)]);
  };

  const validate = (form: HTMLFormElement) => {
    const value = (name: string) => String((form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? "").trim();
    const found: Errors = {};
    if (value("full_name").length < 3) found.full_name = "Please enter your full name.";
    if (!EMAIL.test(value("email"))) found.email = value("email") ? "Please enter a valid email address." : "Please enter your email address.";
    if (!PHONE.test(value("phone"))) found.phone = value("phone") ? "Please enter a valid phone number." : "Please enter your phone number.";
    if (!value("qualification")) found.qualification = "Please choose your highest qualification.";
    if (!value("experience")) found.experience = "Please choose your years of experience.";
    if (!cv) found.cv = "Please attach your CV.";
    if (letter.trim().length < MIN_LETTER) found.cover_letter = `Please write at least ${MIN_LETTER} characters.`;
    if (!(form.elements.namedItem("consent") as HTMLInputElement | null)?.checked) found.consent = "Please confirm the declaration.";
    return found;
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const found = validate(form);
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      const target = first === "cv" ? form.querySelector<HTMLElement>("#ja-cv") : (form.elements.namedItem(first) as HTMLElement | null);
      target?.focus();
      return;
    }
    const data = new FormData(form);
    data.set("cover_letter", letter);
    data.set("elapsed", String(started ? Date.now() - started : ""));
    data.delete("documents");
    if (cv) data.set("cv", cv);
    extras.forEach((file) => data.append("documents", file));

    setStatus("sending");
    setMessage("");
    try {
      const result = await submitJobApplication(data);
      if (result.error) {
        setStatus("failed");
        setMessage(result.error);
        setUnavailable(Boolean(result.unavailable));
        return;
      }
      setSent({
        name: String(data.get("full_name") || "").trim().split(/\s+/)[0],
        email: String(data.get("email") || ""),
        role: roleLabel,
        reference: result.reference ?? "",
      });
      setStatus("sent");
    } catch {
      setStatus("failed");
      setMessage("We couldn't send your application. Your files may be too large, or the connection dropped. Please try again.");
    }
  };

  if (status === "sent" && sent) {
    return (
      <div className="kja-ct-success" role="status" tabIndex={-1} ref={successRef}>
        <span className="kja-ct-success-icon" aria-hidden="true"><i className="fas fa-check" /></span>
        <h3>{sent.name ? `Thank you, ${sent.name}!` : "Thank you!"}</h3>
        <p>Your application has reached our recruitment team. We review every application and will contact you at <strong>{sent.email}</strong> about next steps.</p>
        <dl className="kja-ct-summary">
          <div><dt>Role</dt><dd>{sent.role}</dd></div>
          {sent.reference ? <div><dt>Reference</dt><dd>{sent.reference}</dd></div> : null}
          <div><dt>Documents</dt><dd>{1 + extras.length} attached</dd></div>
        </dl>
        <Link href="/vacancies#roles" className="kja-ct-link-btn"><i className="fas fa-briefcase" aria-hidden="true" /> See other vacancies</Link>
      </div>
    );
  }

  const sending = status === "sending";
  const control = (name: string) => ({
    name,
    id: `ja-${name}`,
    "aria-invalid": Boolean(errors[name]) || undefined,
    "aria-describedby": errors[name] ? `ja-${name}-error` : undefined,
    onInput: () => clearError(name),
  });
  const error = (name: string) =>
    errors[name] ? (
      <p className="kja-ct-error" id={`ja-${name}-error`}><i className="fas fa-circle-exclamation" aria-hidden="true" /> {errors[name]}</p>
    ) : null;
  const field = (name: string, wide = false) => `kja-ct-field${errors[name] ? " is-invalid" : ""}${wide ? " is-wide" : ""}`;
  const letterLength = letter.trim().length;

  return (
    <form ref={formRef} className="kja-ct-form kja-ja-form" noValidate onSubmit={onSubmit} aria-label="Job application form" aria-busy={sending || undefined}>
      {/* Spam trap: must stay unrendered and free of autofill-friendly names, or browsers fill it and the application is discarded. */}
      <div className="kja-ja-trap" aria-hidden="true">
        <label htmlFor="ja-hp">Leave this empty</label>
        <input
          id="ja-hp"
          name="ja_hp"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          data-1p-ignore=""
          data-lpignore="true"
          data-bwignore=""
          data-form-type="other"
        />
      </div>

      <fieldset className="kja-ct-step">
        <legend><span>1</span> The role</legend>
        <div className="kja-ct-grid">
          <div className="kja-ct-field">
            <label htmlFor="ja-vacancy_id">Position<span aria-hidden="true">*</span></label>
            <select id="ja-vacancy_id" name="vacancy_id" value={role} onChange={(event) => setRole(event.target.value)}>
              {roles.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              <option value="">General application (any suitable role)</option>
            </select>
            <p className="kja-ct-hint">
              {role ? roles.find((item) => item.id === role)?.closes || "Open until filled" : "We'll keep your details on file for future openings."}
            </p>
          </div>
          <div className="kja-ct-field">
            <label htmlFor="ja-campus">Preferred campus<small>Optional</small></label>
            <select id="ja-campus" name="campus" defaultValue="">
              <option value="">Any campus</option>
              {campuses.map((campus) => <option key={campus} value={campus}>{campus}</option>)}
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset className="kja-ct-step">
        <legend><span>2</span> About you</legend>
        <div className="kja-ct-grid">
          <div className={field("full_name")}>
            <label htmlFor="ja-full_name">Full name<span aria-hidden="true">*</span></label>
            <input type="text" autoComplete="name" maxLength={120} {...control("full_name")} />
            {error("full_name")}
          </div>
          <div className="kja-ct-field">
            <label htmlFor="ja-location">Where you live<small>Optional</small></label>
            <input id="ja-location" name="location" type="text" maxLength={120} placeholder="e.g. Ntinda, Kampala" />
          </div>
          <div className={field("email")}>
            <label htmlFor="ja-email">Email address<span aria-hidden="true">*</span></label>
            <input type="email" autoComplete="email" maxLength={160} {...control("email")} />
            {error("email")}
          </div>
          <div className={field("phone")}>
            <label htmlFor="ja-phone">Phone number<span aria-hidden="true">*</span></label>
            <input type="tel" autoComplete="tel" maxLength={40} placeholder="+256" {...control("phone")} />
            {error("phone")}
          </div>
        </div>
      </fieldset>

      <fieldset className="kja-ct-step">
        <legend><span>3</span> Qualifications &amp; experience</legend>
        <div className="kja-ct-grid">
          <div className={field("qualification")}>
            <label htmlFor="ja-qualification">Highest qualification<span aria-hidden="true">*</span></label>
            <select defaultValue="" {...control("qualification")} onChange={() => clearError("qualification")}>
              <option value="" disabled>Choose one</option>
              {QUALIFICATIONS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            {error("qualification")}
          </div>
          <div className={field("experience")}>
            <label htmlFor="ja-experience">Relevant experience<span aria-hidden="true">*</span></label>
            <select defaultValue="" {...control("experience")} onChange={() => clearError("experience")}>
              <option value="" disabled>Choose one</option>
              {EXPERIENCE_LEVELS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            {error("experience")}
          </div>
          <div className="kja-ct-field">
            <label htmlFor="ja-current_position">Current or most recent role<small>Optional</small></label>
            <input id="ja-current_position" name="current_position" type="text" maxLength={160} placeholder="e.g. P.3 class teacher, Greenhill Primary" />
          </div>
          <div className="kja-ct-field">
            <label htmlFor="ja-available_from">Available to start<small>Optional</small></label>
            <input id="ja-available_from" name="available_from" type="date" min={today || undefined} />
          </div>
        </div>
      </fieldset>

      <fieldset className="kja-ct-step">
        <legend><span>4</span> Documents</legend>
        <div className="kja-ja-docs">
          <div className={`kja-ct-field is-wide${errors.cv ? " is-invalid" : ""}`}>
            <span className="kja-ct-label">Your CV<span aria-hidden="true">*</span></span>
            {cv ? (
              <ul className="kja-ja-files">
                <FileChip file={cv} label="CV" onRemove={() => setCv(null)} />
              </ul>
            ) : (
              <Drop id="ja-cv" accept={CV_ACCEPT} title="Upload your CV" hint="PDF or Word, up to 5 MB" invalid={Boolean(errors.cv)} describedBy={errors.cv ? "ja-cv-error" : undefined} onFiles={addCv} />
            )}
            {error("cv")}
          </div>
          <div className={`kja-ct-field is-wide${errors.documents ? " is-invalid" : ""}`}>
            <span className="kja-ct-label">Certificates &amp; supporting documents<small>Optional</small></span>
            {extras.length ? (
              <ul className="kja-ja-files">
                {extras.map((file, index) => (
                  <FileChip key={`${file.name}-${index}`} file={file} label="Supporting" onRemove={() => setExtras((current) => current.filter((_, at) => at !== index))} />
                ))}
              </ul>
            ) : null}
            {extras.length < MAX_SUPPORTING ? (
              <Drop
                id="ja-documents"
                accept={SUPPORTING_ACCEPT}
                multiple
                title={extras.length ? "Add another document" : "Add certificates or a cover letter"}
                hint={`Up to ${MAX_SUPPORTING - extras.length} more · PDF, Word, JPG or PNG, 5 MB each`}
                invalid={Boolean(errors.documents)}
                onFiles={addExtras}
              />
            ) : null}
            {error("documents")}
          </div>
        </div>
      </fieldset>

      <fieldset className="kja-ct-step">
        <legend><span>5</span> Why you?</legend>
        <div className={field("cover_letter", true)}>
          <label htmlFor="ja-cover_letter">
            Tell us why you&apos;d be a great fit<span aria-hidden="true">*</span>
            <small className={`kja-ja-count${letterLength && letterLength < MIN_LETTER ? " is-short" : ""}`} aria-live="polite">
              {letterLength < MIN_LETTER ? `${MIN_LETTER - letterLength} more characters needed` : `${letterLength.toLocaleString("en-GB")} characters`}
            </small>
          </label>
          <textarea
            rows={7}
            maxLength={MAX_LETTER}
            value={letter}
            onChange={(event) => setLetter(event.target.value)}
            placeholder="Your teaching experience, the classes or subjects you love, and what draws you to Kampala Junior Academy."
            {...control("cover_letter")}
          />
          {error("cover_letter")}
        </div>
      </fieldset>

      <div className={`kja-ja-consent${errors.consent ? " is-invalid" : ""}`}>
        <label>
          <input type="checkbox" {...control("consent")} onChange={() => clearError("consent")} />
          <span>
            I confirm that the information I&apos;ve given is accurate, and I agree that Kampala Junior Academy may store my application and documents for recruitment.
            {" "}<Link href="/privacy-policy" target="_blank">Privacy policy</Link>
          </span>
        </label>
        {error("consent")}
      </div>

      {status === "failed" ? (
        <div className="kja-ct-alert" role="alert">
          <i className="fas fa-triangle-exclamation" aria-hidden="true" />
          <span>
            {message}{" "}
            {unavailable ? (
              <>Please email your CV to <a href={`mailto:${emailAddress}?subject=${encodeURIComponent(`Application: ${roleLabel}`)}`}>{emailAddress}</a> instead.</>
            ) : (
              <>If it keeps happening, call <a href={`tel:${phoneNumber.replace(/[^\d+]/g, "")}`}>{phoneNumber}</a> or email <a href={`mailto:${emailAddress}`}>{emailAddress}</a>.</>
            )}
          </span>
        </div>
      ) : null}

      <div className="kja-ct-actions">
        <p className="kja-ct-privacy">
          <i className="fas fa-lock" aria-hidden="true" />
          <span>Your documents are stored privately and only seen by our recruitment team.</span>
        </p>
        <button type="submit" className="kja-ct-submit" disabled={sending} aria-busy={sending || undefined}>
          {sending ? <span className="kja-ct-spinner" aria-hidden="true" /> : null}
          {sending ? "Uploading your application…" : "Submit application"}
          {sending ? null : <i className="fas fa-paper-plane" aria-hidden="true" />}
        </button>
      </div>
    </form>
  );
}
