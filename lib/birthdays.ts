/** Date helpers for the birthdays page. Dates are built from their parts so server and browser agree. */

export const BIRTHDAY_RANGES = [7, 14, 30, 60, 90, 365] as const;
export type BirthdayRange = (typeof BIRTHDAY_RANGES)[number];

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

const DAY_MS = 86_400_000;

export function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Year, month and day of a stored date of birth, or null when it is missing or not a real date. */
export function dobParts(dob: string | null | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob ?? "");
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > new Date(2000, month, 0).getDate()) return null;
  return { year, month, day };
}

/** The day a birthday is kept in a given year: 29 February moves to the 28th outside leap years. */
export function birthdayIn(year: number, month: number, day: number) {
  return month === 2 && day === 29 && !isLeapYear(year) ? new Date(year, 1, 28) : new Date(year, month - 1, day);
}

export function fromIso(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function daysBetween(from: Date, to: Date) {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

export function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function ordinal(value: number) {
  const tens = value % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[value % 10] ?? "th";
  return `${value}${suffix}`;
}

/** Weekend birthdays are celebrated in class on the Friday before (Saturday) or the Monday after (Sunday). */
export function classDay(date: Date) {
  const weekday = date.getDay();
  if (weekday === 6) return addDays(date, -1);
  if (weekday === 0) return addDays(date, 1);
  return null;
}

export function longDate(date: Date) {
  return date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

export function shortDate(date: Date) {
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
