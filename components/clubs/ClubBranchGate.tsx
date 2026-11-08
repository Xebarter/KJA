"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setActiveClubCampus } from "@/app/clubs/(desk)/actions";

export function ClubBranchGate({ campuses }: { campuses: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  function choose(campus: string) {
    if (pending) return;
    setChosen(campus);
    setError(null);
    startTransition(async () => {
      const result = await setActiveClubCampus(campus);
      if (result.error) {
        setError(result.error);
        setChosen(null);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="clubs-branch-gate" role="dialog" aria-modal="true" aria-labelledby="clubs-branch-gate-title">
      <div className="clubs-branch-gate-panel">
        <p className="clubs-branch-gate-kicker">Clubs desk</p>
        <h1 id="clubs-branch-gate-title">Choose a branch</h1>
        <p className="clubs-branch-gate-copy">
          Work in one campus at a time. Reports and Accounts still let you compare both.
        </p>
        <div className="clubs-branch-gate-choices" role="group" aria-label="Campus">
          {campuses.map((campus) => (
            <button
              key={campus}
              type="button"
              className={chosen === campus ? "is-pending" : undefined}
              disabled={pending}
              onClick={() => choose(campus)}
            >
              <i className="fa-solid fa-school" aria-hidden="true" />
              <strong>{campus}</strong>
              <span>Open desk</span>
            </button>
          ))}
        </div>
        {error ? <p className="clubs-branch-gate-error">{error}</p> : null}
        {pending ? <p className="clubs-branch-gate-status">Opening…</p> : null}
      </div>
    </div>
  );
}
