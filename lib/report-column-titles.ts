/**
 * Short column titles for the assessment sets on a primary report card.
 * Long sitting names ("End of term examinations") are turned into compact
 * codes ("EOT") so many columns fit on one A4 page. The full name stays
 * available for tooltips and the key printed under the table.
 */

export type ColumnTitle = {
  key: string;
  /** Compact header text, upper case. */
  short: string;
  /** Original label, trimmed. */
  full: string;
  /** True when `short` differs from the full label and needs a key entry. */
  abbreviated: boolean;
};

const FILLER = new Set([
  "a", "an", "and", "the", "of", "for", "in", "on", "to",
  "exam", "exams", "examination", "examinations",
  "assessment", "assessments", "paper", "papers", "set", "sets", "sitting", "sittings",
]);

const MAX_SHORT = 6;

function trailingNumber(label: string): string {
  return label.match(/(\d+)\s*$/)?.[1] ?? "";
}

/** One compact code for one label (no uniqueness handling). */
export function shortSetTitle(label: string): string {
  const text = label.trim().replace(/\s+/g, " ");
  if (!text) return "";
  const lower = text.toLowerCase();
  const n = trailingNumber(lower);

  if (/\b(beginning|opener|bot)\b|\bb\.o\.t\b/.test(lower)) return `BOT${n}`;
  if (/\bmid[\s-]*(term|year|sem\w*)?\b/.test(lower)) return `MID${n}`;
  if (/\b(eot|end[\s-]*(of[\s-]*)?(term|year)|endterm|end)\b/.test(lower)) return `EOT${n}`;
  if (/\b(class\s+test|test|quiz|ca)\b/.test(lower)) return n ? `T${n}` : "TEST";

  const words = lower.split(/[^a-z0-9]+/).filter(Boolean);
  const meaningful = words.filter((word) => !FILLER.has(word));
  if (!meaningful.length) return text.slice(0, MAX_SHORT).toUpperCase();

  if (meaningful.length === 1) {
    const word = meaningful[0];
    // Long single words read as an abbreviation: "Projects" becomes "PROJ.".
    return (word.length > MAX_SHORT ? `${word.slice(0, 4)}.` : word).toUpperCase();
  }
  // Several words: initials of the words, numbers kept whole.
  const code = meaningful
    .map((word) => (/^\d+$/.test(word) ? word : word[0]))
    .join("")
    .toUpperCase();
  return code.slice(0, MAX_SHORT);
}

/** Titles for every set on a card, with duplicates made unique (MID1, MID2, ...). */
export function planColumnTitles(sets: { key: string; label: string; report_header?: string | null }[]): ColumnTitle[] {
  const shorts = sets.map((set) => {
    const custom = set.report_header?.trim().replace(/\s+/g, " ");
    return custom ? custom : shortSetTitle(set.label);
  });
  const totals = new Map<string, number>();
  for (const short of shorts) {
    const norm = short.toLowerCase();
    totals.set(norm, (totals.get(norm) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  return sets.map((set, index) => {
    let short = shorts[index];
    const norm = short.toLowerCase();
    if ((totals.get(norm) ?? 0) > 1) {
      const count = (seen.get(norm) ?? 0) + 1;
      seen.set(norm, count);
      short = `${short}${count}`;
    }
    const full = set.label.trim().replace(/\s+/g, " ");
    return {
      key: set.key,
      short,
      full,
      abbreviated: short.toLowerCase() !== full.toLowerCase(),
    };
  });
}

/** Width plan: assessment columns narrow as their number grows. */
export function setColumnRem(count: number): number {
  if (count <= 4) return 3.4;
  if (count <= 6) return 2.9;
  return 2.5;
}
