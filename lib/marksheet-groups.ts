export type MarksheetSubjectColumn = {
  name: string;
  maxScore: number;
  average: number | null;
  /** Multi-assessment combined: stable sitting key. */
  groupKey?: string;
  /** Multi-assessment combined: thin spanning header label. */
  groupLabel?: string;
};

export type MarksheetSubjectGroup = {
  key: string;
  label: string;
  start: number;
  count: number;
  paletteIndex: number;
};

/** Soft washes for assessment column groups (sky / mint / amber / violet / coral). */
export const MARKSHEET_GROUP_PALETTE = [
  { header: "FF2F6FED", headerSoft: "FFD7E6FB", body: "FFF3F7FD", bodyAlt: "FFE8F0FA", ink: "FF1E4FBF" },
  { header: "FF127238", headerSoft: "FFD8F0E0", body: "FFF3FAF5", bodyAlt: "FFE6F4EA", ink: "FF0E5C2C" },
  { header: "FF8A5A12", headerSoft: "FFF5E6C8", body: "FFFBF6EC", bodyAlt: "FFF5EDD9", ink: "FF6E470E" },
  { header: "FF6B4FA3", headerSoft: "FFE8E0F5", body: "FFF7F4FC", bodyAlt: "FFEFE8F8", ink: "FF523B86" },
  { header: "FF9A3040", headerSoft: "FFF5DCE1", body: "FFFDF4F5", bodyAlt: "FFF8E8EB", ink: "FF7A2432" },
] as const;

export function marksheetSubjectGroups<T extends { groupKey?: string; groupLabel?: string }>(
  subjects: readonly T[],
): MarksheetSubjectGroup[] {
  const groups: MarksheetSubjectGroup[] = [];
  let paletteCursor = 0;
  const paletteByKey = new Map<string, number>();
  for (let index = 0; index < subjects.length; index += 1) {
    const key = subjects[index].groupKey;
    const label = subjects[index].groupLabel;
    if (!key || !label) continue;
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.count += 1;
      continue;
    }
    let paletteIndex = paletteByKey.get(key);
    if (paletteIndex === undefined) {
      paletteIndex = paletteCursor % MARKSHEET_GROUP_PALETTE.length;
      paletteByKey.set(key, paletteIndex);
      paletteCursor += 1;
    }
    groups.push({ key, label, start: index, count: 1, paletteIndex });
  }
  return groups;
}
