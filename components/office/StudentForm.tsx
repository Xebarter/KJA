"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createStudent, updateStudent, type FamilyMatch } from "@/app/admissions_office/(office)/students/actions";
import { Feedback, useOfficeAction } from "@/components/office/client";
import { FamilyPicker } from "@/components/office/FamilyPicker";
import { CAMPUS_OPTIONS } from "@/lib/applications";
import { HOUSES, OFFICE, SCHOOL_CLASSES, STREAMS, type Student } from "@/lib/students";

export type StudentFormValues = Partial<Omit<Student, "import_notes">>;

export type GuardianPrefill = { father_name?: string; father_phone?: string; father_email?: string; mother_name?: string; mother_phone?: string; mother_email?: string; guardian_name?: string; guardian_phone?: string; guardian_email?: string };

function Field({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`ofc-field${wide ? " is-wide" : ""}`}>
      <span>{label}{hint ? <em>{hint}</em> : null}</span>
      {children}
    </label>
  );
}

function GuardianBlock({ prefix, title, prefill }: { prefix: "father" | "mother" | "guardian"; title: string; prefill: GuardianPrefill }) {
  const value = (key: string) => (prefill as Record<string, string | undefined>)[`${prefix}_${key}`] ?? "";
  return (
    <fieldset className="ofc-guardian">
      <legend>{title}</legend>
      <div className="ofc-fields">
        <Field label="Full name"><input name={`${prefix}_name`} defaultValue={value("name")} autoComplete="off" /></Field>
        <Field label="Phone" hint="e.g. 0772 123 456"><input name={`${prefix}_phone`} type="tel" defaultValue={value("phone")} autoComplete="off" /></Field>
        <Field label="Email"><input name={`${prefix}_email`} type="email" defaultValue={value("email")} autoComplete="off" /></Field>
        <Field label="Occupation"><input name={`${prefix}_occupation`} defaultValue={value("occupation")} /></Field>
      </div>
    </fieldset>
  );
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
  const { result, pending, run } = useOfficeAction();
  const [familyMode, setFamilyMode] = useState<"existing" | "new">(initialFamily ? "existing" : "new");
  const [family, setFamily] = useState<FamilyMatch | null>(initialFamily);
  const [staffChild, setStaffChild] = useState(Boolean(initial.staff_child));
  const [showGuardian, setShowGuardian] = useState(Boolean(guardians.guardian_name));
  const streamOptions = [...new Set([...STREAMS, ...streams])].sort();
  const text = (key: keyof StudentFormValues) => (initial[key] ?? "") as string;

  return (
    <form
      className="ofc-form"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        if (mode === "new") {
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
      {mode === "edit" ? (
        <>
          <input type="hidden" name="id" value={initial.id} />
          <input type="hidden" name="updated_at" value={initial.updated_at} />
        </>
      ) : null}
      {applicationId ? <input type="hidden" name="application_id" value={applicationId} /> : null}

      <section className="ofc-fieldset">
        <header>
          <h2><i className="fa-solid fa-child" aria-hidden="true" /> The child</h2>
          <p>Names as they appear on the birth certificate or passport.</p>
        </header>
        <div className="ofc-fields">
          <Field label="Surname"><input name="surname" defaultValue={text("surname")} required autoComplete="off" /></Field>
          <Field label="Given names"><input name="given_names" defaultValue={text("given_names")} required autoComplete="off" /></Field>
          <Field label="Preferred name" hint="What the child is called"><input name="preferred_name" defaultValue={text("preferred_name")} /></Field>
          <Field label="Formal name" hint="For certificates"><input name="formal_name" defaultValue={text("formal_name")} /></Field>
          <div className="ofc-field">
            <span>Sex</span>
            <div className="ofc-segmented" role="radiogroup" aria-label="Sex">
              <label><input type="radio" name="sex" value="M" defaultChecked={initial.sex === "M"} /> <span>Boy</span></label>
              <label><input type="radio" name="sex" value="F" defaultChecked={initial.sex === "F"} /> <span>Girl</span></label>
            </div>
          </div>
          <Field label="Date of birth"><input name="date_of_birth" type="date" defaultValue={text("date_of_birth")} /></Field>
          <Field label="Nationality"><input name="nationality" defaultValue={text("nationality") || (mode === "new" ? "Ugandan" : "")} /></Field>
          <Field label="Religion"><input name="religion" defaultValue={text("religion")} list="ofc-religions" /></Field>
          <Field label="Home language"><input name="home_language" defaultValue={text("home_language")} /></Field>
          <Field label="Passport or ID number"><input name="passport_or_id" defaultValue={text("passport_or_id")} /></Field>
        </div>
        <datalist id="ofc-religions">
          {["Catholic", "Anglican", "Muslim", "Born Again", "Seventh-day Adventist", "Orthodox", "Hindu", "Other"].map((option) => <option key={option} value={option} />)}
        </datalist>
      </section>

      <section className="ofc-fieldset">
        <header>
          <h2><i className="fa-solid fa-chalkboard-user" aria-hidden="true" /> Class and placement</h2>
          <p>Where the child will sit in school.</p>
        </header>
        <div className="ofc-fields">
          <Field label="Class">
            <select name="class_code" defaultValue={text("class_code")} required={mode === "new"}>
              <option value="">Choose a class</option>
              {SCHOOL_CLASSES.map((entry) => <option key={entry.code} value={entry.code}>{entry.code} · {entry.name}</option>)}
            </select>
          </Field>
          <Field label="Stream">
            <input name="stream" defaultValue={text("stream")} list="ofc-streams" maxLength={20} />
          </Field>
          <Field label="House">
            <select name="house" defaultValue={text("house")}>
              <option value="">Not yet assigned</option>
              {HOUSES.map((house) => <option key={house} value={house}>{house}</option>)}
            </select>
          </Field>
          <Field label="Campus">
            <select name="campus" defaultValue={text("campus")}>
              <option value="">Not recorded</option>
              {[...new Set([...CAMPUS_OPTIONS, ...(initial.campus ? [initial.campus] : [])])].map((campus) => <option key={campus} value={campus}>{campus}</option>)}
            </select>
          </Field>
          <Field label="Tutor group"><input name="tutor_group" defaultValue={text("tutor_group")} /></Field>
          <Field label="Enrolment date"><input name="enrolled_on" type="date" defaultValue={text("enrolled_on")} /></Field>
          <Field label="Student number" hint={mode === "new" ? "Leave blank for the next free number" : undefined}>
            <input name="student_number" defaultValue={text("student_number")} placeholder={mode === "new" && nextNumber ? `Next: ${nextNumber}` : ""} required={mode === "edit"} maxLength={20} />
          </Field>
          <Field label="Previous school"><input name="transferred_from" defaultValue={text("transferred_from")} /></Field>
          <Field label="PLE index number" hint="P7 only"><input name="exam_index_number" defaultValue={text("exam_index_number")} /></Field>
        </div>
        <datalist id="ofc-streams">{streamOptions.map((stream) => <option key={stream} value={stream} />)}</datalist>
      </section>

      {mode === "new" ? (
        <section className="ofc-fieldset">
          <header>
            <h2><i className="fa-solid fa-people-roof" aria-hidden="true" /> Family</h2>
            <p>Siblings share one family record, so parents&apos; details are kept in one place.</p>
          </header>
          <div className="ofc-segmented is-large" role="radiogroup" aria-label="Family">
            <label>
              <input type="radio" name="family_choice" checked={familyMode === "existing"} onChange={() => setFamilyMode("existing")} />
              <span><i className="fa-solid fa-magnifying-glass" aria-hidden="true" /> Sibling of a current pupil</span>
            </label>
            <label>
              <input type="radio" name="family_choice" checked={familyMode === "new"} onChange={() => setFamilyMode("new")} />
              <span><i className="fa-solid fa-house-medical-flag" aria-hidden="true" /> New family</span>
            </label>
          </div>
          {familyMode === "existing" ? (
            <FamilyPicker value={family} onChange={setFamily} autoFocus={!initialFamily} />
          ) : (
            <>
              <div className="ofc-fields">
                <Field label="Mailing name" hint="e.g. Mr & Mrs Okello"><input name="mailing_name" /></Field>
                <Field label="Home area" hint="e.g. Muyenga"><input name="home_area" /></Field>
                <Field label="Home address" wide><input name="home_address" /></Field>
                <Field label="Country"><input name="country" defaultValue="Uganda" /></Field>
              </div>
              <GuardianBlock prefix="father" title="Father" prefill={guardians} />
              <GuardianBlock prefix="mother" title="Mother" prefill={guardians} />
              {showGuardian ? (
                <GuardianBlock prefix="guardian" title="Guardian" prefill={guardians} />
              ) : (
                <button type="button" className="app-link-btn" onClick={() => setShowGuardian(true)}>
                  <i className="fa-solid fa-plus" aria-hidden="true" /> Add a guardian
                </button>
              )}
              <p className="app-muted ofc-tiny">Phone numbers are saved in +256 format. More contacts can be added on the family page afterwards.</p>
            </>
          )}
        </section>
      ) : null}

      <section className="ofc-fieldset">
        <header>
          <h2><i className="fa-solid fa-notes-medical" aria-hidden="true" /> Health and staff</h2>
          <p>Shared with class teachers and the school nurse.</p>
        </header>
        <div className="ofc-fields">
          <Field label="Medical notes" hint="Allergies, conditions, medication" wide>
            <textarea name="medical_notes" rows={3} defaultValue={text("medical_notes")} />
          </Field>
          <div className="ofc-field">
            <span>May the nurse give Panadol?</span>
            <div className="ofc-segmented" role="radiogroup" aria-label="Panadol consent">
              <label><input type="radio" name="panadol_allowed" value="yes" defaultChecked={initial.panadol_allowed === true} /> <span>Yes</span></label>
              <label><input type="radio" name="panadol_allowed" value="no" defaultChecked={initial.panadol_allowed === false} /> <span>No</span></label>
              <label><input type="radio" name="panadol_allowed" value="" defaultChecked={initial.panadol_allowed === null || initial.panadol_allowed === undefined} /> <span>Not asked</span></label>
            </div>
          </div>
          <div className="ofc-field">
            <span>Staff child</span>
            <label className="ofc-check">
              <input type="checkbox" name="staff_child" checked={staffChild} onChange={(event) => setStaffChild(event.target.checked)} />
              A parent works at KJA
            </label>
          </div>
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
      </section>

      <footer className="ofc-form-foot">
        <Feedback result={result} />
        <div>
          <Link className="admin-btn admin-btn-ghost" href={mode === "edit" ? `${OFFICE}/students/${initial.id}` : `${OFFICE}/students`}>Cancel</Link>
          <button type="submit" className="admin-btn" disabled={pending}>
            <i className={`fa-solid ${mode === "new" ? "fa-user-plus" : "fa-floppy-disk"}`} aria-hidden="true" />{" "}
            {pending ? "Saving…" : mode === "new" ? "Enrol student" : "Save changes"}
          </button>
        </div>
      </footer>
    </form>
  );
}
