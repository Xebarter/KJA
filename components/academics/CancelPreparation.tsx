"use client";

import { useState } from "react";
import { DeskForm } from "@/components/academics/Form";
import { classSection } from "@/lib/academics";

type Save = (formData: FormData) => Promise<{ error?: string; ok?: string; href?: string }>;

export function CancelPreparation({
  action,
  termId,
  classCode,
  stream,
  count,
}: {
  action: Save;
  termId: string;
  classCode: string;
  stream: string;
  count: number;
}) {
  const [confirming, setConfirming] = useState(false);
  if (!count) return null;
  const label = `${count} draft report ${count === 1 ? "card" : "cards"}`;
  const nursery = classSection(classCode) === "nursery";

  return (
    <DeskForm action={action} className="rpt-cancel">
      <input type="hidden" name="term_id" value={termId} />
      <input type="hidden" name="class_code" value={classCode} />
      <input type="hidden" name="stream" value={stream} />
      {confirming ? (
        <div className="rpt-cancel-ask" role="group" aria-label="Cancel preparation">
          <p>
            {nursery
              ? `Remove ${label}? Class teacher comments already saved for learners are kept.`
              : `Remove ${label}? Comments on them are removed too.`}
          </p>
          <button type="button" onClick={() => setConfirming(false)}>Keep</button>
          <button type="submit">Cancel preparation</button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)}>Cancel preparation</button>
      )}
    </DeskForm>
  );
}
