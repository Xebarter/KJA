import type { SupabaseClient } from "@supabase/supabase-js";

export type SystemLogSource =
  | "accounts"
  | "admissions"
  | "academics"
  | "applications"
  | "jobs"
  | "store"
  | "library"
  | "clubs"
  | "cms"
  | "team"
  | "portal"
  | "system";

export type SystemLogSeverity = "info" | "notice" | "sensitive";

export type SystemLogEntry = {
  source: SystemLogSource;
  kind: string;
  body: string;
  severity?: SystemLogSeverity;
  entityType?: string | null;
  entityId?: string | null;
  studentId?: string | null;
  meta?: Record<string, unknown>;
};

/** True when the admin Logs migration has not been applied yet. */
export function missingSystemLogsSchema(message: string | null | undefined) {
  return Boolean(message && /system_logs|purge_system_logs|does not exist|schema cache/i.test(message));
}

function severityFor(source: SystemLogSource, kind: string, explicit?: SystemLogSeverity): SystemLogSeverity {
  if (explicit) return explicit;
  if (source === "team") return "sensitive";
  if (kind === "void" || kind === "grant" || kind === "remove" || kind === "password" || kind === "refund") return "sensitive";
  if (kind === "status" || kind === "assign" || kind === "enrol" || kind === "promotion" || kind === "discount") return "notice";
  return "info";
}

/** Appends one school-wide log row. Failures are ignored so the real change still sticks. */
export async function logSystem(supabase: SupabaseClient, actorId: string | null, entry: SystemLogEntry) {
  try {
    const body = entry.body.trim().slice(0, 2000);
    if (!body) return;
    await supabase.from("system_logs").insert({
      actor_id: actorId,
      source: entry.source,
      kind: entry.kind.slice(0, 40) || "note",
      severity: severityFor(entry.source, entry.kind, entry.severity),
      body,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      student_id: entry.studentId ?? null,
      meta: entry.meta ?? {},
    });
  } catch {
    // Best-effort: never block the mutation that already saved (including missing schema).
  }
}

export async function logStore(
  supabase: SupabaseClient,
  actorId: string,
  entry: Omit<SystemLogEntry, "source"> & { kind: string; body: string },
) {
  await logSystem(supabase, actorId, { ...entry, source: "store" });
}

export async function logLibrary(
  supabase: SupabaseClient,
  actorId: string,
  entry: Omit<SystemLogEntry, "source"> & { kind: string; body: string },
) {
  await logSystem(supabase, actorId, { ...entry, source: "library" });
}

export async function logClubs(
  supabase: SupabaseClient,
  actorId: string,
  entry: Omit<SystemLogEntry, "source"> & { kind: string; body: string },
) {
  await logSystem(supabase, actorId, { ...entry, source: "clubs" });
}

export async function logCms(
  supabase: SupabaseClient,
  actorId: string,
  entry: Omit<SystemLogEntry, "source"> & { kind: string; body: string },
) {
  await logSystem(supabase, actorId, { ...entry, source: "cms" });
}

export async function logTeam(
  supabase: SupabaseClient,
  actorId: string,
  entry: Omit<SystemLogEntry, "source"> & { kind: string; body: string },
) {
  await logSystem(supabase, actorId, { ...entry, source: "team", severity: entry.severity ?? "sensitive" });
}

export async function logPortal(
  supabase: SupabaseClient,
  actorId: string | null,
  entry: Omit<SystemLogEntry, "source"> & { kind: string; body: string },
) {
  await logSystem(supabase, actorId, { ...entry, source: "portal" });
}

async function mirrorRows(
  supabase: SupabaseClient,
  source: "applications" | "jobs",
  entityType: string,
  rows: { actor_id: string; kind: string; body: string; application_id: string }[],
) {
  if (!rows.length) return;
  try {
    await supabase.from("system_logs").insert(
      rows.map((row) => ({
        actor_id: row.actor_id,
        source,
        kind: row.kind.slice(0, 40) || "note",
        severity: severityFor(source, row.kind),
        body: row.body.trim().slice(0, 2000),
        entity_type: entityType,
        entity_id: row.application_id,
        meta: {},
      })),
    );
  } catch {
    // Best-effort.
  }
}

/** Mirrors application_activity rows into the school-wide trail (one call per batch). */
export async function mirrorApplicationLogs(
  supabase: SupabaseClient,
  rows: { actor_id: string; kind: string; body: string; application_id: string }[],
) {
  await mirrorRows(supabase, "applications", "application", rows);
}

/** Mirrors job_application_activity rows into the school-wide trail. */
export async function mirrorJobLogs(
  supabase: SupabaseClient,
  rows: { actor_id: string; kind: string; body: string; application_id: string }[],
) {
  await mirrorRows(supabase, "jobs", "job_application", rows);
}
