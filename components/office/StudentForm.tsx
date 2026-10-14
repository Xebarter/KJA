"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createStudent, updateStudent, type FamilyMatch } from "@/app/admissions_office/(office)/students/actions";
import { Feedback, useOfficeAction } from "@/components/office/client";
import { FamilyPicker } from "@/components/office/FamilyPicker";
import { CAMPUS_OPTIONS } from "@/lib/applications";
import { CLASS_AGE, HOUSES, OFFICE, SCHOOL_CLASSES, STREAMS, studentAge, type Student } from "@/lib/students";

export type StudentFormValues = Partial<Omit<Student, "import_notes">>;

export type GuardianPrefill = { father_name?: string; father_phone?: string; father_email?: string; mother_name?: string; mother_phone?: string; mother_email?: string; guardian_name?: string; guardian_phone?: string; guardian_email?: string };

type Parent = "father" | "mother" | "guardian";
const PARENTS: Parent[] = ["father", "mother", "guardian"];

const HOUSE_TONES: Record<string, string> = { Bongo: "#e07a2c", Eland: "#2f6fd6", Kudu: "#1f9d55", Oryx: "#d1394a" };

/** What the form currently holds, read from the inputs so the summary and checklist stay live. */
type Snapshot = {
  surname: string;
  given: string;
  preferred: string;
  sex: string;
  dob: string;
  classCode: string;
  stream: string;
  house: string;
  campus: string;
  number: string;
  medical: string;
  panadol: string;
  parents: { name: string; phone: string }[];
};

function snapshotFrom(read: (key: string) => string): Snapshot {
  return {
    surname: read("surname"),
    given: read("given_names"),
    preferred: read("preferred_name"),
    sex: read("sex"),
    dob: read("date_of_birth"),
    classCode: read("class_code"),
    stream: read("stream").toUpperCase(),
    house: read("house"),
    campus: read("campus"),
    number: read("student_number"),
    medical: read("medical_notes"),
    panadol: read("panadol_allowed"),
    parents: PARENTS.map((prefix) => ({ name: read(`${prefix}_name`), phone: read(`${prefix}_phone`) })),
  };
}

function Field({ label, hint, wide, required, children }: { label: string; hint?: React.ReactNode; wide?: boolean; required?: boolean; children: React.ReactNode }) {
  return (
    <label className={`ofc-field${wide ? " is-wide" : ""}`}>
      <span>
        <b>{label}{required ? <i className="enr-req" aria-hidden="true">*</i> : null}</b>
        {hint ? <em>{hint}</em> : null}
      </span>
      {children}
    </label>
  );
}

function Choice({ label, required, hint, children }: { label: string; required?: boolean; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="ofc-field">
      <span>
        <b>{label}{required ? <i className="enr-req" aria-hidden="true">*</i> : null}</b>
        {hint ? <em>{hint}</em> : null}
      </span>
      {children}
    </div>
  );
}

function Chips({ name, label, options, initial }: {
  name: string;
  label: string;
  options: { value: string; label: React.ReactNode; tone?: string; icon?: string }[];
  initial: string;
}) {
  return (
    <div className="enr-chips" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <label key={option.value || "none"}>
          <input type="radio" name={name} value={option.value} defaultChecked={initial === option.value} />
          <span>
            {option.tone ? <i className="enr-dot" style={{ background: option.tone }} aria-hidden="true" /> : null}
            {option.icon ? <i className={`fa-solid ${option.icon}`} aria-hidden="true" /> : null}
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
}

function More({ open, label, children }: { open: boolean; label: string; children: React.ReactNode }) {
  return (
    <details className="enr-more" open={open}>
      <summary>
        <i className="fa-solid fa-chevron-right" aria-hidden="true" /> {label}
      </summary>
      <div className="ofc-fields">{children}</div>
    </details>
  );
}

type Status = "done" | "todo" | "optional";

function Section({ id, n, title, sub, status, children }: {
  id: string;
  n: number;
  title: string;
  sub: string;
  status?: Status;
  children: React.ReactNode;
}) {
  return (
    <section className={`ofc-fieldset enr-section${status ? ` is-${status}` : ""}`} id={id} aria-labelledby={`${id}-title`}>
      <header className="enr-head">
        <span className="enr-step" aria-hidden="true">
          {status === "done" ? <i className="fa-solid fa-check" /> : n}
        </span>
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          <p>{sub}</p>
        </div>
        {status ? (
          <span className={`enr-status is-${status}`}>
            {status === "done" ? "Complete" : status === "todo" ? "Required" : "Optional"}
          </span>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function ParentCard({ prefix, title, prefill, onRemove }: { prefix: Parent; title: string; prefill: GuardianPrefill; onRemove?: () => void }) {
  const value = (key: string) => (prefill as Record<string, string | undefined>)[`${prefix}_${key}`] ?? "";
  const icon = prefix === "father" ? "fa-person" : prefix === "mother" ? "fa-person-dress" : "fa-user-shield";
  return (
    <fieldset className="enr-parent">
      <legend>
        <span className="enr-parent-icon" aria-hidden="true"><i className={`fa-solid ${icon}`} /></span>
        {title}
        {onRemove ? (
          <button type="button" className="enr-parent-remove" onClick={onRemove} aria-label={`Remove the ${title.toLowerCase()}`}>
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        ) : null}
      </legend>
      <Field label="Full name"><input name={`${prefix}_name`} defaultValue={value("name")} autoComplete="off" /></Field>
      <Field label="Phone" hint="e.g. 0772 123 456"><input name={`${prefix}_phone`} type="tel" inputMode="tel" defaultValue={value("phone")} autoComplete="off" /></Field>
      <Field label="Email"><input name={`${prefix}_email`} type="email" defaultValue={value("email")} autoComplete="off" /></Field>
      <Field label="Occupation"><input name={`${prefix}_occupation`} defaultValue={value("occupation")} /></Field>
    </fieldset>
  );
}

function initialsOf(snap: Snapshot) {
  const letters = [snap.given.trim()[0], snap.surname.trim()[0]].filter(Boolean).join("");
  return letters.toUpperCase();
}

function ageLabel(dob: string) {
  const age = studentAge(dob);
  if (age === null) return "";
  return age === 0 ? "Under 1 year old" : `${age} year${age === 1 ? "" : "s"} old`;
}

export function StudentForm({
  mode,
  initial,
  applicationId,
  family: initialFamily = null,
  guardians = {},
  streams = [],
  nextNumber,
}: {
  mode: "new" | "edit";
  initial: StudentFormValues;
  applicationId?: string;
  family?: FamilyMatch | null;
  guardians?: GuardianPrefill;
  streams?: string[];
  nextNumber?: string | null;
}) {
  const router = useRouter();
  const isNew = mode === "new";
  const { result, setResult, pending, run } = useOfficeAction();
  const formRef = useRef<HTMLFormElement>(null);
  const streamRef = useRef<HTMLInputElement>(null);
  const [familyMode, setFamilyMode] = useState<"existing" | "new">(initialFamily ? "existing" : "new");
  const [family, setFamily] = useState<FamilyMatch | null>(initialFamily);
  const [staffChild, setStaffChild] = useState(Boolean(initial.staff_child));
  const [showGuardian, setShowGuardian] = useState(Boolean(guardians.guardian_name));
  const [checked, setChecked] = useState(false);
  const [active, setActive] = useState("enrol-child");
  const streamOptions = [...new Set([...STREAMS, ...streams])].sort();
  const text = (key: keyof StudentFormValues) => (initial[key] ?? "") as string;

  const [snap, setSnap] = useState<Snapshot>(() =>
    snapshotFrom((key) => {
      if (key === "panadol_allowed") return initial.panadol_allowed === true ? "yes" : initial.panadol_allowed === false ? "no" : "";
      if (key.includes("_") && PARENTS.some((prefix) => key.startsWith(`${prefix}_`))) return (guardians as Record<string, string | undefined>)[key] ?? "";
      return String((initial as Record<string, unknown>)[key] ?? "");
    }),
  );

  const read = useCallback(() => {
    if (!formRef.current) return;
    const data = new FormData(formRef.current);
    setSnap(snapshotFrom((key) => String(data.get(key) ?? "").trim()));
  }, []);

  useEffect(() => {
    read();
  }, [read, familyMode, showGuardian, staffChild]);

  const sections = [
    { id: "enrol-child", title: "The child" },
    { id: "enrol-class", title: "Class and placement" },
    ...(isNew ? [{ id: "enrol-family", title: "Family" }] : []),
    { id: "enrol-health", title: "Health and staff" },
  ];

  useEffect(() => {
    if (!isNew) return;
    const targets = ["enrol-child", "enrol-class", "enrol-family", "enrol-health"]
      .map((id) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -55% 0px" },
    );
    targets.forEach((target) => observer.observe(target));
    const surname = document.querySelector<HTMLInputElement>("#enrol-child input[name=surname]");
    if (surname && !surname.value && window.matchMedia("(min-width: 1101px)").matches) surname.focus({ preventScroll: true });
    return () => observer.disconnect();
  }, [isNew]);

  const parentReady = snap.parents.some((parent) => parent.name && parent.phone);
  const childDone = Boolean(snap.surname && snap.given);
  const classDone = Boolean(snap.classCode);
  const familyDone = familyMode === "existing" ? Boolean(family) : parentReady;
  const healthTouched = Boolean(snap.medical || snap.panadol);

  const status: Record<string, Status> = {
    "enrol-child": childDone ? "done" : "todo",
    "enrol-class": classDone ? "done" : "todo",
    "enrol-family": familyDone ? "done" : "todo",
    "enrol-health": healthTouched ? "done" : "optional",
  };

  const problems = [
    !snap.surname || !snap.given ? { id: "enrol-child", text: "Enter the surname and given names" } : null,
    !classDone ? { id: "enrol-class", text: "Choose a class" } : null,
    isNew && !familyDone
      ? { id: "enrol-family", text: familyMode === "existing" ? "Choose the family" : "Add a parent or guardian with a phone number" }
      : null,
  ].filter(Boolean) as { id: string; text: string }[];
  const required = isNew ? 3 : 2;
  const doneCount = required - problems.length;

  const age = studentAge(snap.dob, new Date(new Date().getFullYear(), 0, 1));
  const fits = (code: string) => age !== null && code in CLASS_AGE && Math.abs(age - CLASS_AGE[code]) < 1;
  const classEntry = SCHOOL_CLASSES.find((entry) => entry.code === snap.classCode);
  const outOfAge = classEntry && age !== null && Math.abs(age - CLASS_AGE[classEntry.code]) >= 2;

  const goTo = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    const field = target.querySelector<HTMLElement>("input:not([type=hidden]):not([type=radio]), select, textarea, input[type=radio]");
    window.setTimeout(() => field?.focus({ preventScroll: true }), 450);
  };

  const pickStream = (value: string) => {
    if (!streamRef.current) return;
    streamRef.current.value = value;
    read();
  };

  const nursery = SCHOOL_CLASSES.filter((entry) => entry.section === "nursery");
  const primary = SCHOOL_CLASSES.filter((entry) => entry.section === "primary");
  const classTile = (entry: (typeof SCHOOL_CLASSES)[number]) => (
    <label key={entry.code} className={`enr-class${fits(entry.code) ? " is-fit" : ""}`}>
      <input type="radio" name="class_code" value={entry.code} defaultChecked={text("class_code") === entry.code} required={isNew} />
      <span>
        <strong>{entry.code}</strong>
        <small>{entry.name}</small>
        <em>Age {CLASS_AGE[entry.code]}–{CLASS_AGE[entry.code] + 1}</em>
        {fits(entry.code) ? <b className="enr-fit"><span className="visually-hidden">Fits the child&apos;s age</span></b> : null}
      </span>
    </label>
  );

  const campuses = [...new Set([...CAMPUS_OPTIONS, ...(initial.campus ? [initial.campus] : [])])];
  const n = (id: string) => sections.findIndex((section) => section.id === id) + 1;

  const form = (
    <form
      ref={formRef}
      className={`ofc-form enr-form${isNew ? " is-new" : ""}${checked && problems.length ? " is-checked" : ""}`}
      noValidate={isNew}
      onInput={read}
      onChange={read}
      onSubmit={(event) => {
        event.preventDefault();
        if (isNew && problems.length) {
          setChecked(true);
          setResult(null);
          goTo(problems[0].id);
          return;
        }
        const data = new FormData(event.currentTarget);
        if (isNew) {
          data.set("family_mode", familyMode);
          if (familyMode === "existing") data.set("family_id", family?.id ?? "");
          run(() => createStudent(data), (outcome) => {
            if (outcome.id) router.push(`${OFFICE}/students/${outcome.id}?enrolled=1`);
          });
        } else {
          run(() => updateStudent(data));
        }
      }}
    >
      {!isNew ? (
        <>
          <input type="hidden" name="id" value={initial.id} />
          <input type="hidden" name="updated_at" value={initial.updated_at} />
        </>
      ) : null}
      {applicationId ? <input type="hidden" name="application_id" value={applicationId} /> : null}

      <Section id="enrol-child" n={n("enrol-child")} title="The child" sub="Names as they appear on the birth certificate or passport." status={isNew ? status["enrol-child"] : undefined}>
        <div className="ofc-fields enr-cols-2">
          <Field label="Surname" required><input name="surname" defaultValue={text("surname")} required autoComplete="off" /></Field>
          <Field label="Given names" required><input name="given_names" defaultValue={text("given_names")} required autoComplete="off" /></Field>
          <Field label="Preferred name" hint="What the child is called"><input name="preferred_name" defaultValue={text("preferred_name")} /></Field>
          <Choice label="Sex">
            <Chips
              name="sex"
              label="Sex"
              initial={text("sex")}
              options={[
                { value: "M", label: "Boy", icon: "fa-child" },
                { value: "F", label: "Girl", icon: "fa-child-dress" },
              ]}
            />
          </Choice>
          <Field label="Date of birth" hint={snap.dob ? <span className="enr-age">{ageLabel(snap.dob)}</span> : undefined}>
            <input name="date_of_birth" type="date" defaultValue={text("date_of_birth")} max={new Date().toISOString().slice(0, 10)} />
          </Field>
          <Field label="Nationality"><input name="nationality" defaultValue={text("nationality") || (isNew ? "Ugandan" : "")} /></Field>
        </div>
        <More open={!isNew || Boolean(text("religion") || text("home_language") || text("passport_or_id") || text("formal_name"))} label="More details: religion, language, ID, formal name">
          <Field label="Religion"><input name="religion" defaultValue={text("religion")} list="ofc-religions" /></Field>
          <Field label="Home language"><input name="home_language" defaultValue={text("home_language")} /></Field>
          <Field label="Passport or ID number"><input name="passport_or_id" defaultValue={text("passport_or_id")} /></Field>
          <Field label="Formal name" hint="For certificates"><input name="formal_name" defaultValue={text("formal_name")} /></Field>
        </More>
        <datalist id="ofc-religions">
          {["Catholic", "Anglican", "Muslim", "Born Again", "Seventh-day Adventist", "Orthodox", "Hindu", "Other"].map((option) => <option key={option} value={option} />)}
        </datalist>
      </Section>

      <Section id="enrol-class" n={n("enrol-class")} title="Class and placement" sub="Where the child will sit in school." status={isNew ? status["enrol-class"] : undefined}>
        <Choice
          label="Class"
          required={isNew}
          hint={age !== null ? <span className="enr-age">Classes that fit a {age}-year-old are marked</span> : "Add the date of birth to see which classes fit"}
        >
          <div className="enr-classes" role="radiogroup" aria-label="Class">
            <p className="enr-classes-label">Nursery</p>
            <div className="enr-class-grid is-nursery">{nursery.map(classTile)}</div>
            <p className="enr-classes-label">Primary</p>
            <div className="enr-class-grid">{primary.map(classTile)}</div>
          </div>
          {outOfAge ? (
            <p className="enr-warn" role="status">
              <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> Pupils in {classEntry.name} are usually {CLASS_AGE[classEntry.code]}–{CLASS_AGE[classEntry.code] + 1}. Check the date of birth.
            </p>
          ) : null}
        </Choice>

        <div className="ofc-fields enr-cols-2 enr-gap-top">
          <Choice label="Stream" hint="Pick one or type a new stream">
            <div className="enr-stream">
              <div className="enr-chips is-small">
                {streamOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={snap.stream === option ? "is-on" : ""}
                    aria-pressed={snap.stream === option}
                    onClick={() => pickStream(snap.stream === option ? "" : option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <input ref={streamRef} name="stream" defaultValue={text("stream")} list="ofc-streams" maxLength={20} placeholder="No stream" aria-label="Stream" />
            </div>
          </Choice>
          <Choice label="House">
            <Chips
              name="house"
              label="House"
              initial={text("house")}
              options={[{ value: "", label: "Not yet" }, ...HOUSES.map((house) => ({ value: house, label: house, tone: HOUSE_TONES[house] }))]}
            />
          </Choice>
          <Choice label="Campus">
            <Chips name="campus" label="Campus" initial={text("campus")} options={[{ value: "", label: "Not recorded" }, ...campuses.map((campus) => ({ value: campus, label: campus }))]} />
          </Choice>
          <div className="ofc-fields enr-pair">
            <Field label="Enrolment date"><input name="enrolled_on" type="date" defaultValue={text("enrolled_on")} /></Field>
            <Field label="Student number" hint={isNew ? "Optional" : undefined}>
              <input
                name="student_number"
                defaultValue={text("student_number")}
                placeholder={isNew && nextNumber ? `Next: ${nextNumber}` : ""}
                required={!isNew}
                maxLength={20}
              />
            </Field>
          </div>
        </div>
        <More open={!isNew || Boolean(text("tutor_group") || text("transferred_from") || text("exam_index_number"))} label="More details: tutor group, previous school, PLE index">
          <Field label="Tutor group"><input name="tutor_group" defaultValue={text("tutor_group")} /></Field>
          <Field label="Previous school"><input name="transferred_from" defaultValue={text("transferred_from")} /></Field>
          <Field label="PLE index number" hint="P7 only"><input name="exam_index_number" defaultValue={text("exam_index_number")} /></Field>
        </More>
        <datalist id="ofc-streams">{streamOptions.map((stream) => <option key={stream} value={stream} />)}</datalist>
      </Section>

      {isNew ? (
        <Section id="enrol-family" n={n("enrol-family")} title="Family" sub="Siblings share one family record, so parents' details are kept in one place." status={status["enrol-family"]}>
          <div className="enr-family-choice" role="radiogroup" aria-label="Family">
            <label>
              <input type="radio" name="family_choice" checked={familyMode === "new"} onChange={() => setFamilyMode("new")} />
              <span>
                <i className="fa-solid fa-house-chimney-user" aria-hidden="true" />
                <strong>New family</strong>
                <small>The parents aren&apos;t on the register yet</small>
              </span>
            </label>
            <label>
              <input type="radio" name="family_choice" checked={familyMode === "existing"} onChange={() => setFamilyMode("existing")} />
              <span>
                <i className="fa-solid fa-people-roof" aria-hidden="true" />
                <strong>Sibling of a current pupil</strong>
                <small>Link to a family already on the register</small>
              </span>
            </label>
          </div>

          {familyMode === "existing" ? (
            <FamilyPicker value={family} onChange={setFamily} autoFocus={!initialFamily} />
          ) : (
            <>
              <p className="enr-sub">Parents</p>
              <div className="enr-parents">
                <ParentCard prefix="father" title="Father" prefill={guardians} />
                <ParentCard prefix="mother" title="Mother" prefill={guardians} />
                {showGuardian ? (
                  <ParentCard prefix="guardian" title="Guardian" prefill={guardians} onRemove={() => setShowGuardian(false)} />
                ) : (
                  <button type="button" className="enr-add-parent" onClick={() => setShowGuardian(true)}>
                    <i className="fa-solid fa-plus" aria-hidden="true" />
                    <strong>Add a guardian</strong>
                    <small>If someone other than the parents looks after the child</small>
                  </button>
                )}
              </div>
              <p className={`enr-check${parentReady ? " is-ok" : ""}`}>
                <i className={`fa-solid ${parentReady ? "fa-circle-check" : "fa-circle-info"}`} aria-hidden="true" />
                {parentReady ? "Parent contact added" : "Add at least one parent or guardian with a phone number"}
                <span>Phone numbers are saved in +256 format.</span>
              </p>

              <p className="enr-sub">Home</p>
              <div className="ofc-fields enr-cols-2">
                <Field label="Mailing name" hint="e.g. Mr & Mrs Okello"><input name="mailing_name" /></Field>
                <Field label="Home area" hint="e.g. Muyenga"><input name="home_area" /></Field>
                <Field label="Home address"><input name="home_address" /></Field>
                <Field label="Country"><input name="country" defaultValue="Uganda" /></Field>
              </div>
            </>
          )}
        </Section>
      ) : null}

      <Section id="enrol-health" n={n("enrol-health")} title="Health and staff" sub="Shared with class teachers and the school nurse." status={isNew ? status["enrol-health"] : undefined}>
        <div className="ofc-fields">
          <Field label="Medical notes" hint="Allergies, conditions, medication" wide>
            <textarea name="medical_notes" rows={3} defaultValue={text("medical_notes")} placeholder="Leave blank if there's nothing the school needs to know" />
          </Field>
          <Choice label="May the nurse give Panadol?">
            <Chips
              name="panadol_allowed"
              label="Panadol consent"
              initial={initial.panadol_allowed === true ? "yes" : initial.panadol_allowed === false ? "no" : ""}
              options={[
                { value: "yes", label: "Yes", icon: "fa-check" },
                { value: "no", label: "No", icon: "fa-ban" },
                { value: "", label: "Not asked" },
              ]}
            />
          </Choice>
          <Choice label="Staff child">
            <label className="enr-switch">
              <input type="checkbox" name="staff_child" checked={staffChild} onChange={(event) => setStaffChild(event.target.checked)} />
              <span aria-hidden="true" />
              A parent works at KJA
            </label>
          </Choice>
          {staffChild ? (
            <Field label="Staff category">
              <select name="staff_category" defaultValue={text("staff_category")}>
                <option value="">Not recorded</option>
                {[...new Set(["Teaching staff", "Support staff", "Administration", "Management", "Director", ...(initial.staff_category ? [initial.staff_category] : [])])].map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>
      </Section>

      <footer className="ofc-form-foot enr-foot">
        {checked && problems.length ? (
          <div className="enr-problems" role="alert">
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
            <span>
              Before enrolling:{" "}
              {problems.map((problem, index) => (
                <span key={problem.id}>
                  {index ? " · " : ""}
                  <button type="button" onClick={() => goTo(problem.id)}>{problem.text}</button>
                </span>
              ))}
            </span>
          </div>
        ) : result ? (
          <Feedback result={result} />
        ) : isNew ? (
          <div className="enr-progress" aria-live="polite">
            <span className="enr-progress-bar" aria-hidden="true"><span style={{ width: `${(doneCount / required) * 100}%` }} /></span>
            <span>{problems.length ? `${doneCount} of ${required} required steps done` : "Ready to enrol"}</span>
          </div>
        ) : null}
        <div>
          <Link className="admin-btn admin-btn-ghost" href={isNew ? `${OFFICE}/students` : `${OFFICE}/students/${initial.id}`}>Cancel</Link>
          <button type="submit" className="admin-btn" disabled={pending}>
            <i className={`fa-solid ${pending ? "fa-spinner fa-spin" : isNew ? "fa-user-plus" : "fa-floppy-disk"}`} aria-hidden="true" />{" "}
            {pending ? "Saving…" : isNew ? "Enrol student" : "Save changes"}
          </button>
        </div>
      </footer>
    </form>
  );

  if (!isNew) return form;

  const fullName = [snap.surname, snap.given].filter(Boolean).join(" ");
  const tone = snap.sex === "M" ? " is-boy" : snap.sex === "F" ? " is-girl" : "";
  const familyLabel = familyMode === "existing"
    ? family ? family.name : "Choose the family"
    : snap.parents.filter((parent) => parent.name).map((parent) => parent.name).join(" & ") || "New family";

  return (
    <div className="enr-layout">
      <div className="enr-main">{form}</div>
      <aside className="enr-side" aria-label="Enrolment summary">
        <div className="enr-card">
          <div className="enr-card-top">
            <span className={`enr-avatar${tone}`} aria-hidden="true">
              {initialsOf(snap) || <i className="fa-solid fa-user" />}
            </span>
            <div>
              <strong className={fullName ? "" : "is-empty"}>{fullName || "New pupil"}</strong>
              <small>{snap.preferred ? `Known as ${snap.preferred}` : snap.sex === "M" ? "Boy" : snap.sex === "F" ? "Girl" : "Details appear as you type"}</small>
            </div>
          </div>
          <dl className="enr-facts">
            <div>
              <dt>Class</dt>
              <dd>{classEntry ? `${classEntry.name}${snap.stream ? ` · ${snap.stream}` : ""}` : <span>Not chosen</span>}</dd>
            </div>
            <div>
              <dt>Age</dt>
              <dd>{snap.dob ? ageLabel(snap.dob) : <span>No date of birth</span>}</dd>
            </div>
            <div>
              <dt>House</dt>
              <dd>
                {snap.house ? <><i className="enr-dot" style={{ background: HOUSE_TONES[snap.house] }} aria-hidden="true" /> {snap.house}</> : <span>Not yet</span>}
              </dd>
            </div>
            <div>
              <dt>Family</dt>
              <dd>{familyLabel}</dd>
            </div>
            <div>
              <dt>Student no.</dt>
              <dd>{snap.number || (nextNumber ? <>{nextNumber} <span>(next free)</span></> : <span>Next free number</span>)}</dd>
            </div>
          </dl>
        </div>

        <nav className="enr-steps" aria-label="Form sections">
          {sections.map((section, index) => {
            const state = status[section.id];
            return (
              <a
                key={section.id}
                href={`#${section.id}`}
                className={`is-${state}${active === section.id ? " is-active" : ""}`}
                aria-current={active === section.id ? "step" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  goTo(section.id);
                }}
              >
                <span className="enr-step-dot" aria-hidden="true">{state === "done" ? <i className="fa-solid fa-check" /> : index + 1}</span>
                <span>
                  <strong>{section.title}</strong>
                  <small>{state === "done" ? "Complete" : state === "todo" ? "Required" : "Optional"}</small>
                </span>
              </a>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}
