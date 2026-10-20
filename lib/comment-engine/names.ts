import { splitName } from "@/lib/students";

/** Preferred name, else first given name from “Surname Given Names”. Never the surname. */
export function learnerFirstName(input: {
  full_name?: string | null;
  preferred_name?: string | null;
  given_names?: string | null;
}): string {
  const preferred = input.preferred_name?.trim();
  if (preferred) return preferred.split(/\s+/)[0] || preferred;

  const given = input.given_names?.trim();
  if (given) return given.split(/\s+/)[0] || given;

  const full = input.full_name?.trim() || "";
  if (!full) return "";
  const { given: fromFull } = splitName(full);
  const first = fromFull.split(/\s+/).filter(Boolean)[0];
  return first || "";
}
