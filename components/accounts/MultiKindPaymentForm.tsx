"use client";

import { useState } from "react";
import { AdmissionPaymentForm } from "@/components/accounts/AdmissionPaymentForm";
import { ClubPaymentForm } from "@/components/accounts/ClubPaymentForm";
import { OtherPaymentForm } from "@/components/accounts/OtherPaymentForm";
import { PaymentForm } from "@/components/accounts/PaymentForm";
import { PlePaymentForm } from "@/components/accounts/PlePaymentForm";
import { TourPaymentForm } from "@/components/accounts/TourPaymentForm";
import type { PupilHit } from "@/app/accounts/(desk)/payments/actions";

export type RecordKind = "fees" | "club" | "admission" | "ple" | "tour" | "other";

const KINDS: { value: RecordKind; label: string; icon: string; hint: string }[] = [
  { value: "fees", label: "School fees", icon: "fa-graduation-cap", hint: "Term fees for a pupil or family" },
  { value: "club", label: "Club", icon: "fa-puzzle-piece", hint: "Consented club fee this term" },
  { value: "admission", label: "Admission", icon: "fa-file-signature", hint: "Fee paid at the desk" },
  { value: "ple", label: "PLE", icon: "fa-pen-to-square", hint: "Registration payment" },
  { value: "tour", label: "Tour", icon: "fa-bus", hint: "Trip contribution" },
  { value: "other", label: "Other", icon: "fa-receipt", hint: "Any other school payment" },
];

function parseKind(raw: string | null | undefined): RecordKind {
  if (raw && KINDS.some((entry) => entry.value === raw)) return raw as RecordKind;
  return "fees";
}

export function MultiKindPaymentForm({
  terms,
  termId,
  pupil: initialPupil = null,
  familyId = "",
  mode = "pupil",
  initialKind = "fees",
  onDone,
}: {
  terms: { id: string; label: string }[];
  termId: string;
  pupil?: PupilHit | null;
  familyId?: string;
  mode?: "pupil" | "family";
  initialKind?: string;
  onDone?: () => void;
}) {
  const [kind, setKind] = useState<RecordKind>(parseKind(initialKind));

  return (
    <div className="pay-kind-wrap">
      <KindPicker kind={kind} onChange={setKind} />

      {kind === "fees" ? (
        <PaymentForm
          terms={terms}
          termId={termId}
          pupil={initialPupil}
          familyId={familyId}
          mode={mode}
          onDone={onDone}
        />
      ) : null}

      {kind === "club" ? (
        <ClubPaymentForm
          pupil={initialPupil}
          lockPupil={Boolean(initialPupil)}
          onDone={onDone}
        />
      ) : null}

      {kind === "admission" ? <AdmissionPaymentForm onDone={onDone} /> : null}

      {kind === "ple" ? (
        <PlePaymentForm
          pupil={initialPupil}
          lockPupil={Boolean(initialPupil)}
          termId={termId}
          onDone={onDone}
        />
      ) : null}

      {kind === "tour" ? (
        <TourPaymentForm
          pupil={initialPupil}
          lockPupil={Boolean(initialPupil)}
          termId={termId}
          onDone={onDone}
        />
      ) : null}

      {kind === "other" ? (
        <OtherPaymentForm
          pupil={initialPupil}
          lockPupil={Boolean(initialPupil)}
          termId={termId}
          onDone={onDone}
        />
      ) : null}
    </div>
  );
}

function KindPicker({ kind, onChange }: { kind: RecordKind; onChange: (kind: RecordKind) => void }) {
  return (
    <fieldset className="pay-kind-picker">
      <legend>What was paid?</legend>
      <div className="pay-kind-grid" role="radiogroup" aria-label="Payment type">
        {KINDS.map((entry) => (
          <label key={entry.value} className={`pay-kind-card is-${entry.value}${kind === entry.value ? " is-on" : ""}`}>
            <input
              type="radio"
              name="record_kind"
              value={entry.value}
              checked={kind === entry.value}
              onChange={() => onChange(entry.value)}
            />
            <span>
              <i className={`fa-solid ${entry.icon}`} aria-hidden="true" />
              <strong>{entry.label}</strong>
              <small>{entry.hint}</small>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
