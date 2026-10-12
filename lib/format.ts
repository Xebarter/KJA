const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function dateParts(value?: string | null) {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

export function formatDate(value?: string | null) {
  const parts = dateParts(value);
  if (!parts) return value || "";
  return new Date(parts.year, parts.month - 1, parts.day).toLocaleDateString("en-UG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatEventDate(value?: string | null) {
  const parts = dateParts(value);
  if (!parts) return value || "";
  return `${MONTHS[parts.month - 1]} ${parts.day}, ${parts.year}`;
}

export function formatBlogDate(value?: string | null) {
  const parts = dateParts(value);
  if (!parts) return value || "";
  return `${parts.day} ${MONTHS[parts.month - 1]}, ${parts.year}`;
}

export function formatTimeRange(start?: string | null, end?: string | null) {
  if (start && end) return `${start} - ${end}`;
  return start || end || "";
}
