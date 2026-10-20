import type { SupabaseClient } from "@supabase/supabase-js";
import { getContent } from "@/lib/content";
import { composeFees } from "@/lib/info-pages";
import { SCHOOL_CLASSES } from "@/lib/students";
import { serviceClient } from "@/lib/supabase/service";

export type ReportFeeLine = { name: string; amount: number };

type TermRow = { id: string; year: number; term: number; starts_on: string | null };
type ItemRow = { name?: string; kind?: string; sort_order?: number; active?: boolean };
type RateRow = {
  term_id: string;
  campus: string | null;
  amount: number | null;
  fee_items: ItemRow | ItemRow[] | null;
};

/** The term that follows this one. Term 3 is followed by term 1 of the next year. */
export function nextTermSlot(year: number, term: number) {
  return term >= 3 ? { year: year + 1, term: 1 } : { year, term: term + 1 };
}

export function formatReportDate(iso: string | null | undefined) {
  if (!iso) return "";
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatReportMoney(amount: number) {
  return `UGX ${Math.round(amount).toLocaleString("en-US")}`;
}

const empty = {
  nextStartsOn: null as string | null,
  feesFor: (_campus: string | null) => [] as ReportFeeLine[],
};

/**
 * Fees for one class, and the day the following term starts.
 * Next term's rates win. Until those are set, the current term's structure is used.
 * When the register has no rate for the class, the fees published on the website are used.
 * A campus rate wins over the rate that applies to every campus.
 */
export async function loadClassClosing(
  supabase: SupabaseClient,
  input: { termId: string; classCode: string | null },
) {
  if (!input.classCode) return empty;
  const db = serviceClient() ?? supabase;
  const { data: terms, error } = await db.from("fee_terms").select("id, year, term, starts_on");
  if (error || !terms) return empty;
  const current = (terms as TermRow[]).find((term) => term.id === input.termId);
  if (!current) return empty;
  const slot = nextTermSlot(Number(current.year), Number(current.term));
  const next = (terms as TermRow[]).find((term) => Number(term.year) === slot.year && Number(term.term) === slot.term) ?? null;
  const termIds = [input.termId, next?.id].filter((id): id is string => Boolean(id));
  const { data: rates, error: rateError } = await db
    .from("fee_rates")
    .select("term_id, campus, amount, fee_items(name, kind, sort_order, active)")
    .eq("class_code", input.classCode)
    .in("term_id", termIds);
  const rows = rateError ? [] : ((rates || []) as RateRow[]);
  const published = await publishedFees(input.classCode);
  return {
    nextStartsOn: next?.starts_on ? String(next.starts_on).slice(0, 10) : null,
    feesFor(campus: string | null) {
      const upcoming = next ? linesFor(rows.filter((row) => row.term_id === next.id), campus) : [];
      const current = linesFor(rows.filter((row) => row.term_id === input.termId), campus);
      const listed = upcoming.length ? upcoming : current;
      return listed.length ? listed : published(campus);
    },
  };
}

export async function loadReportClosing(
  supabase: SupabaseClient,
  input: { termId: string; classCode: string | null; campus?: string | null },
) {
  const closing = await loadClassClosing(supabase, input);
  return { fees: closing.feesFor(input.campus ?? null), nextStartsOn: closing.nextStartsOn };
}

const NURSERY = SCHOOL_CLASSES.filter((entry) => entry.section === "nursery").map((entry) => entry.code);

/** Which register classes a line on the website fee page covers. */
function classesCovered(label: string): string[] {
  const range = label.match(/P\s*(\d)\s*[–-]\s*P?\s*(\d)/i);
  if (range) {
    const [from, to] = [Number(range[1]), Number(range[2])];
    return SCHOOL_CLASSES.filter((entry) => entry.section === "primary" && Number(entry.code.slice(1)) >= from && Number(entry.code.slice(1)) <= to).map((entry) => entry.code);
  }
  const single = label.match(/\bP\s*(\d)\b/i);
  if (single) return [`P${single[1]}`];
  if (/nursery|pre-?school|kindergarten|daycare/i.test(label)) return [...NURSERY];
  if (/primary/i.test(label)) return SCHOOL_CLASSES.filter((entry) => entry.section === "primary").map((entry) => entry.code);
  return [];
}

async function publishedFees(classCode: string) {
  const byCampus = new Map<string, ReportFeeLine[]>();
  try {
    const fees = composeFees(await getContent());
    for (const campus of fees.campuses) {
      const lines = campus.lines
        .filter((line) => classesCovered(line.label).includes(classCode))
        .map((line) => ({ name: /nursery|primary|daycare|pre-?school|tuition/i.test(line.label) ? "Tuition" : line.label, amount: line.amount }));
      if (lines.length) byCampus.set(campus.name.trim().toLowerCase(), lines);
    }
  } catch {
    return () => [] as ReportFeeLine[];
  }
  return (campus: string | null) => {
    const place = (campus || "").trim().toLowerCase();
    const specific = place ? byCampus.get(place) : undefined;
    if (specific) return specific;
    const lists = [...byCampus.values()];
    if (!lists.length) return [];
    const first = JSON.stringify(lists[0]);
    return lists.every((lines) => JSON.stringify(lines) === first) ? lists[0] : [];
  };
}

function linesFor(rows: RateRow[], campus: string | null): ReportFeeLine[] {
  const place = (campus || "").trim().toLowerCase();
  const chosen = new Map<string, { name: string; amount: number; sort: number; specific: boolean }>();
  for (const row of rows) {
    const item = Array.isArray(row.fee_items) ? row.fee_items[0] : row.fee_items;
    const amount = Number(row.amount);
    if (!item?.name || item.active === false || item.kind === "admission" || !Number.isFinite(amount) || amount <= 0) continue;
    const rowCampus = (row.campus || "").trim().toLowerCase();
    if (rowCampus && rowCampus !== place) continue;
    const specific = Boolean(place) && rowCampus === place;
    const existing = chosen.get(item.name);
    if (existing?.specific && !specific) continue;
    chosen.set(item.name, { name: item.name, amount, sort: Number(item.sort_order) || 0, specific });
  }
  return [...chosen.values()]
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
    .map((line) => ({ name: line.name, amount: line.amount }));
}
