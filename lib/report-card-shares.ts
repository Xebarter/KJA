export type ReportSetSelection =
  | { sets: { key: string; share: number; sort: number }[] }
  | { error: string };

export function reportSetsFromForm(formData: FormData): ReportSetSelection {
  const keys = formData.getAll("set").map((value) => String(value || "").trim()).filter(Boolean);
  if (!keys.length) return { error: "Choose at least one assessment to include." };

  const sets: { key: string; share: number; sort: number }[] = [];
  for (const [sort, key] of keys.entries()) {
    const raw = String(formData.get(`share:${key}`) ?? "").trim();
    const share = raw ? Number(raw) : null;
    if (share === null || !Number.isFinite(share) || share < 0 || share > 100) {
      return { error: "Enter a percentage from 0 to 100 for each chosen assessment." };
    }
    sets.push({ key, share, sort });
  }
  const total = Math.round(sets.reduce((sum, set) => sum + set.share, 0) * 10) / 10;
  if (Math.abs(total - 100) > 0.05) {
    return { error: `The shares must add up to 100%. They currently add up to ${total}%.` };
  }
  return { sets };
}
