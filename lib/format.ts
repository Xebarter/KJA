export function formatDate(value?: string | null) {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString("en-UG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatTimeRange(start?: string | null, end?: string | null) {
  if (start && end) return `${start} - ${end}`;
  return start || end || "";
}
