import Link from "next/link";
import { CLUBS_BASE } from "@/lib/clubs-nav";

export function clubsNotReady(
  title: string,
  kind: "config" | "auth" | "schema",
  message?: string,
) {
  const copy =
    kind === "config"
      ? "Supabase is not connected yet."
      : kind === "auth"
        ? message || "Sign in to open the clubs desk."
        : message || "The clubs tables need a database update.";
  return (
    <div className="app-page ofc-page clb-page">
      <div className="admin-card app-notice">
        <i className={`fa-solid ${kind === "auth" ? "fa-lock" : "fa-database"}`} aria-hidden="true" />
        <div>
          <h2>{title}</h2>
          <p>{copy}</p>
          {kind === "auth" ? (
            <p>
              <Link href="/admin/login">Sign in</Link>
            </p>
          ) : null}
          {kind === "schema" ? (
            <p>
              <Link href={CLUBS_BASE}>Back to overview</Link>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
