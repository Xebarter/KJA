import { splitName } from "@/lib/students";

function givenParts(input: {
  full_name?: string | null;
  given_names?: string | null;
}): string[] {
  const given = input.given_names?.trim();
  if (given) return given.split(/\s+/).filter(Boolean);

  const full = input.full_name?.trim() || "";
  if (!full) return [];
  const { given: fromFull } = splitName(full);
  return fromFull.split(/\s+/).filter(Boolean);
}

/**
 * Name used in report comments: the child’s middle name (second given name).
 * Falls back to the only given name when there is no middle name. Never the surname.
 * Preferred / known-as names are not used in comments.
 */
export function learnerFirstName(input: {
  full_name?: string | null;
  preferred_name?: string | null;
  given_names?: string | null;
}): string {
  const parts = givenParts(input);
  if (parts.length >= 2) return parts[1];
  return parts[0] || "";
}
