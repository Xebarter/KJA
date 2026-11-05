"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MultiKindPaymentForm } from "@/components/accounts/MultiKindPaymentForm";
import type { PupilHit } from "@/app/accounts/(desk)/payments/actions";
import { ACCOUNTS_BASE } from "@/lib/accounts-format";

type Mode = "pupil" | "family";

function recordHref(base: string, current: URLSearchParams, extra: Record<string, string> = {}) {
  const params = new URLSearchParams(current.toString());
  params.set("record", "1");
  for (const [key, value] of Object.entries(extra)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  const query = params.toString();
  return query ? `${base}?${query}` : `${base}?record=1`;
}

function clearRecordHref(base: string, current: URLSearchParams) {
  const params = new URLSearchParams(current.toString());
  params.delete("record");
  params.delete("student");
  params.delete("family");
  params.delete("term");
  params.delete("kind");
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/** Hero button that opens the on-page payment recorder. */
export function PaymentsRecordButton({
  className = "aov-btn is-primary",
  label = "Record payment",
}: {
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (
    <button
      type="button"
      className={className}
      onClick={() => router.push(recordHref(pathname || `${ACCOUNTS_BASE}/payments`, searchParams), { scroll: false })}
    >
      <i className="fa-solid fa-plus" aria-hidden="true" /> {label}
    </button>
  );
}

/** Inline recorder on the Payments page. Opened with ?record=1 (and optional student/family/term). */
export function PaymentsRecordPanel({
  terms,
  termId,
  pupil = null,
  familyId = "",
  mode = "pupil",
  initialKind = "",
}: {
  terms: { id: string; label: string }[];
  termId: string;
  pupil?: PupilHit | null;
  familyId?: string;
  mode?: Mode;
  initialKind?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const open = searchParams.get("record") === "1" || Boolean(pupil) || Boolean(familyId);
  const [mounted, setMounted] = useState(false);
  const kind = initialKind || searchParams.get("kind") || "";

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  const close = useCallback(() => {
    router.push(clearRecordHref(pathname || `${ACCOUNTS_BASE}/payments`, searchParams), { scroll: false });
  }, [pathname, router, searchParams]);

  if (!open && !mounted) return null;
  if (!open) return null;

  return (
    <section className="pay-record-panel admin-card is-open" aria-label="Record a payment">
      <header className="pay-record-head">
        <div className="pay-record-copy">
          <p className="pay-record-kicker">
            <i className="fa-solid fa-pen-to-square" aria-hidden="true" /> New receipt
          </p>
          <h2>Record a payment</h2>
          <p>Choose the type, fill in the details, and save. Every receipt lands in the register below.</p>
        </div>
        <button type="button" className="aov-btn pay-record-close" onClick={close}>
          <i className="fa-solid fa-xmark" aria-hidden="true" /> Close
        </button>
      </header>
      {terms.length || kind !== "fees" ? (
        <MultiKindPaymentForm
          key={`${pupil?.student_id || "none"}-${familyId || "none"}-${mode}-${termId}-${kind}`}
          terms={terms}
          termId={termId}
          pupil={pupil}
          familyId={familyId}
          mode={mode}
          initialKind={kind}
          onDone={close}
        />
      ) : (
        <div className="acc-banner is-warn">
          <i className="fa-solid fa-calendar-plus" aria-hidden="true" />
          <p>Add a term in Fee setup before recording school-fee payments.</p>
        </div>
      )}
    </section>
  );
}
