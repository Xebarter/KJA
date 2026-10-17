type Query = PromiseLike<{ data: unknown; error: { message: string } | null }>;

function rowsOf(data: unknown) {
  return Array.isArray(data) ? data.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object") : [];
}

function readNumber(row: Record<string, unknown> | undefined, prefer: "sum" | "count") {
  if (!row) return 0;
  for (const key of prefer === "count" ? ["count", "sum"] : ["sum", "count"]) {
    if (row[key] != null && row[key] !== "") return Number(row[key]);
  }
  return 0;
}

export async function aggRows(query: Query) {
  const { data, error } = await query;
  if (error) return null;
  return rowsOf(data);
}

export function num(row: Record<string, unknown> | undefined, prefer: "sum" | "count") {
  return readNumber(row, prefer);
}

/** One total from `select("column.sum()")`. Null means the aggregate was rejected, so the caller can fall back. */
export async function sumOf(query: Query): Promise<number | null> {
  const { data, error } = await query;
  if (error) return null;
  const rows = rowsOf(data);
  if (!rows.length) return 0;
  return rows.reduce((total, row) => total + readNumber(row, "sum"), 0);
}

function groupLabel(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    const record = Array.isArray(value) ? value[0] : value;
    if (record && typeof record === "object" && "class_code" in record) return String((record as { class_code: unknown }).class_code ?? "");
  }
  return String(value);
}

/** Totals grouped by one column, from `select("column, amount.sum()")`. */
export async function groupOf(query: Query, key: string, prefer: "sum" | "count" = "sum"): Promise<Map<string, number> | null> {
  const { data, error } = await query;
  if (error) return null;
  const map = new Map<string, number>();
  for (const row of rowsOf(data)) {
    const label = groupLabel(row[key] ?? (key === "class_code" ? row.students : undefined));
    map.set(label, (map.get(label) ?? 0) + readNumber(row, prefer));
  }
  return map;
}
