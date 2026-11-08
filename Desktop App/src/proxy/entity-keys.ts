/** Stable synthetic id for composite-key rows kept in the local entity store. */
export function compositeRowId(parts: (string | null | undefined)[]) {
  return parts.map((part) => String(part ?? "")).join("::");
}

/** Tables whose PostgREST PK is composite — local cache uses a synthetic `id`, upstream body must not. */
export function isSyntheticIdTable(table: string) {
  return table === "club_attendance";
}

/** Local entity id for a REST row (real `id` or known composite key). */
export function localEntityId(table: string, row: Record<string, unknown>): string | null {
  if (row.id != null && row.id !== "") return String(row.id);
  if (table === "attendance" && row.student_id != null && row.attended_on != null) {
    return compositeRowId([String(row.student_id), String(row.attended_on)]);
  }
  if (table === "assessment_scores" && row.assessment_id != null && row.student_id != null) {
    return compositeRowId([String(row.assessment_id), String(row.student_id)]);
  }
  if (table === "club_attendance" && row.session_id != null && row.student_id != null) {
    return compositeRowId([String(row.session_id), String(row.student_id)]);
  }
  return null;
}

/** Stamp composite ids before ensureIds so upserts do not get random UUIDs. */
export function assignCompositeIds(table: string, body: unknown): unknown {
  const stamp = (row: Record<string, unknown>) => {
    if (row.id != null && row.id !== "") return row;
    const id = localEntityId(table, row);
    if (!id) return row;
    return { ...row, id };
  };
  if (Array.isArray(body)) {
    return body.map((item) => (item && typeof item === "object" && !Array.isArray(item) ? stamp(item as Record<string, unknown>) : item));
  }
  if (body && typeof body === "object") return stamp(body as Record<string, unknown>);
  return body;
}

/** Drop synthetic-only ids before queueing upstream (club_attendance has no id column). */
export function stripSyntheticIds(table: string, body: unknown): unknown {
  if (!isSyntheticIdTable(table)) return body;
  const strip = (row: Record<string, unknown>) => {
    const { id: _id, ...rest } = row;
    return rest;
  };
  if (Array.isArray(body)) {
    return body.map((item) => (item && typeof item === "object" && !Array.isArray(item) ? strip(item as Record<string, unknown>) : item));
  }
  if (body && typeof body === "object") return strip(body as Record<string, unknown>);
  return body;
}
