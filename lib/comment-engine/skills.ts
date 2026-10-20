import type { ActivitySkill } from "./types";

/** Parse teacher-entered skill lines / comma lists into clean short labels. */
export function parseSkillLabels(raw: string | null | undefined, limit = 8): string[] {
  if (!raw?.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n,;|/]+/)) {
    const label = part.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length >= limit) break;
  }
  return out;
}

export function mergeActivitySkills(taught: string[], acquired: string[]): ActivitySkill[] {
  const acquiredSet = new Set(acquired.map((label) => label.toLowerCase()));
  const labels = [...taught];
  for (const label of acquired) {
    if (!labels.some((row) => row.toLowerCase() === label.toLowerCase())) labels.push(label);
  }
  return labels.map((label) => ({ label, acquired: acquiredSet.has(label.toLowerCase()) }));
}

export function skillsFromJson(raw: unknown): ActivitySkill[] {
  if (!Array.isArray(raw)) return [];
  const out: ActivitySkill[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const label = typeof (row as { label?: unknown }).label === "string"
      ? (row as { label: string }).label.trim().replace(/\s+/g, " ").slice(0, 40)
      : "";
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, acquired: Boolean((row as { acquired?: unknown }).acquired) });
  }
  return out.slice(0, 8);
}

/** Join up to `max` short skill names for an 8–12 word sentence. */
export function joinSkillNames(names: string[], max = 2): string {
  const clean = names.map((name) => name.trim()).filter(Boolean).slice(0, max);
  if (!clean.length) return "";
  if (clean.length === 1) return clean[0];
  return `${clean[0]} and ${clean[1]}`;
}
