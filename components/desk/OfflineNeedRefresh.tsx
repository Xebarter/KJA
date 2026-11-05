"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** Reloads the current desk route after reconnecting. */
export function OfflineNeedRefresh() {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      className="kja-offline-cut-refresh"
      disabled={pending}
      onClick={() => start(() => router.refresh())}
    >
      <i className={`fa-solid ${pending ? "fa-spinner fa-spin" : "fa-arrows-rotate"}`} aria-hidden="true" />
      {pending ? "Refreshing" : "Refresh"}
    </button>
  );
}
