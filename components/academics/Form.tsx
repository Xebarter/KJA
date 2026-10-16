"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Outcome = { error?: string; ok?: string; href?: string };

export function DeskForm({
  action,
  children,
  className = "ofc-form",
}: {
  action: (formData: FormData) => Promise<Outcome>;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Outcome | null>(null);

  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        if (submitter instanceof HTMLButtonElement && submitter.name) data.set(submitter.name, submitter.value);
        startTransition(async () => {
          const outcome: Outcome = await action(data).catch(() => ({ error: "Something went wrong. Try again." }));
          if (outcome.href) {
            router.push(outcome.href);
            router.refresh();
            return;
          }
          setResult(outcome);
          if (outcome.ok) router.refresh();
        });
      }}
    >
      <fieldset disabled={pending}>
        {children}
      </fieldset>
      {result?.error ? <p className="acd-feedback is-error" role="alert"><i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {result.error}</p> : null}
      {result?.ok ? <p className="acd-feedback" role="status"><i className="fa-solid fa-circle-check" aria-hidden="true" /> {result.ok}</p> : null}
    </form>
  );
}

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button className="admin-btn admin-btn-ghost" type="button" onClick={() => window.print()}>{label}</button>
  );
}
