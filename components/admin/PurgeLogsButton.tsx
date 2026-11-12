"use client";
import { askConfirm } from "@/components/AppConfirm";

import { useState, useTransition } from "react";
import { purgeOldLogs } from "@/app/admin/(panel)/logs/actions";

export function PurgeLogsButton({ className = "admin-btn admin-btn-ghost" }: { className?: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <span className="adm-logs-purge">
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={async () => {
          if (!(await askConfirm("Remove log entries older than one year? This cannot be undone."))) return;
          setMessage(null);
          start(async () => {
            const result = await purgeOldLogs();
            setMessage(result.error || result.ok || null);
          });
        }}
      >
        <i className="fa-solid fa-broom" aria-hidden="true" />
        {pending ? "Purging…" : "Purge older than 1 year"}
      </button>
      {message ? <small className="adm-logs-purge-msg">{message}</small> : null}
    </span>
  );
}
