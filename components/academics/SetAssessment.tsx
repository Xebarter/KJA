"use client";

import { useState } from "react";
import { setAssessments } from "@/app/academics_office/(desk)/actions";
import { DeskForm } from "@/components/academics/Form";

export type AssessmentKindOption = { value: string; label: string; weight: number; name: string };

export type AssessmentClassOption = {
  value: string;
  label: string;
  section: "nursery" | "primary";
  subjects: number;
  streams: number;
};

function countLabel(count: number, one: string, many: string) {
  return `${count.toLocaleString("en-GB")} ${count === 1 ? one : many}`;
}

export function SetAssessment({ termId, classes, kinds }: { termId: string; classes: AssessmentClassOption[]; kinds: AssessmentKindOption[] }) {
  const opening = kinds.find((entry) => entry.value === "endterm") ?? kinds[0];
  const [mode, setMode] = useState<"all" | "one">("all");
  const [classValue, setClassValue] = useState("");
  const [kind, setKind] = useState(opening?.value ?? "endterm");
  const [name, setName] = useState(opening?.name ?? "");
  const [nameEdited, setNameEdited] = useState(false);
  const [weight, setWeight] = useState(String(opening?.weight ?? 1));
  const [weightEdited, setWeightEdited] = useState(false);

  const chosen = mode === "all" ? classes : classes.filter((entry) => entry.value === classValue);
  const papers = chosen.reduce((sum, entry) => sum + entry.subjects * entry.streams, 0);
  const ready = papers > 0;
  const picked = chosen[0];
  const streamNote = picked && picked.streams > 1 ? `, across ${countLabel(picked.streams, "stream", "streams")}` : "";

  let summary = "No classes are on the roll.";
  if (classes.length && mode === "one" && !classValue) summary = "Choose a class.";
  else if (classes.length && !papers) summary = "No subjects apply to the chosen classes.";
  else if (ready && mode === "one") summary = `${countLabel(papers, "markbook", "markbooks")} for ${picked?.label}${streamNote}.`;
  else if (ready) summary = `${countLabel(papers, "markbook", "markbooks")} across ${countLabel(chosen.length, "class", "classes")}.`;

  function chooseKind(next: string) {
    const picked = kinds.find((entry) => entry.value === next);
    setKind(next);
    if (!nameEdited) setName(picked?.name ?? "");
    if (!weightEdited) setWeight(String(picked?.weight ?? 1));
  }

  return (
    <DeskForm action={setAssessments} className="asm-form">
      <input type="hidden" name="term_id" value={termId} />
      <input type="hidden" name="scope" value={mode} />
      <div className="asm-scope" role="group" aria-label="Which classes">
        <button type="button" aria-pressed={mode === "all"} onClick={() => setMode("all")}>All classes</button>
        <button type="button" aria-pressed={mode === "one"} onClick={() => setMode("one")}>One class</button>
      </div>
      {mode === "one" ? (
        <label className="ofc-field">
          <span>Class</span>
          <select name="class_code" required value={classValue} onChange={(event) => setClassValue(event.target.value)}>
            <option value="" disabled>Choose</option>
            {(["nursery", "primary"] as const).map((section) => {
              const rows = classes.filter((entry) => entry.section === section);
              if (!rows.length) return null;
              return (
                <optgroup key={section} label={section === "nursery" ? "Nursery" : "Primary"}>
                  {rows.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
                </optgroup>
              );
            })}
          </select>
        </label>
      ) : null}
      <label className="ofc-field">
        <span>Kind</span>
        <select name="kind" value={kind} onChange={(event) => chooseKind(event.target.value)}>
          {kinds.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
        </select>
      </label>
      <label className="ofc-field">
        <span>Name</span>
        <input
          name="name"
          required
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setNameEdited(true);
          }}
        />
      </label>
      <div className="asm-pair">
        <label className="ofc-field">
          <span>Out of</span>
          <input name="max_score" type="number" min="1" step="0.5" defaultValue="100" />
        </label>
        <label className="ofc-field">
          <span>Share of the total (%)</span>
          <input
            name="weight"
            type="number"
            min="1"
            max="100"
            step="1"
            value={weight}
            onChange={(event) => {
              setWeight(event.target.value);
              setWeightEdited(true);
            }}
          />
        </label>
      </div>
      <label className="ofc-field">
        <span>Date</span>
        <input name="held_on" type="date" />
      </label>
      <p className="asm-note">{summary}{ready ? " Nursery classes are marked out of 100. Subjects that do not apply to a class are left out. The share is how much of the subject total this set is worth. One set is the whole total. A midterm at 30 and an end of term at 70 both appear on the report card." : ""}</p>
      <button className="asm-commit" type="submit" disabled={!ready}>Set assessments</button>
    </DeskForm>
  );
}
