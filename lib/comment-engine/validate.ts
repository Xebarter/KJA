/** Shared word/sentence validators — server is source of truth. */

export function normalizeForCount(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/** Tokens split on whitespace; punctuation attached to words counts with the word. */
export function countWords(text: string): number {
  const normalized = normalizeForCount(text);
  if (!normalized) return 0;
  return normalized.split(" ").filter(Boolean).length;
}

/**
 * Sentence segmentation for school-report English.
 * Handles common abbreviations and decimal numbers without treating them as ends.
 */
export function splitSentences(text: string): string[] {
  const normalized = normalizeForCount(text);
  if (!normalized) return [];
  const protectedText = normalized
    .replace(/\b(Mr|Mrs|Ms|Dr|St|Prof|Jr|Sr)\./gi, "$1·")
    .replace(/(\d)\.(\d)/g, "$1·$2");
  const parts = protectedText
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.replace(/·/g, ".").trim())
    .filter(Boolean);
  return parts;
}

export function countSentences(text: string): number {
  return splitSentences(text).length;
}

export function hasUnresolvedPlaceholders(text: string): boolean {
  return /\{[a-z_]+\}/i.test(text);
}

export function containsFirstName(text: string, firstName: string): boolean {
  const needle = firstName.trim();
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

export type CommentConstraints = {
  exactWords?: number | null;
  minWords?: number | null;
  maxWords?: number | null;
  exactSentences?: number | null;
  requireFirstName?: boolean;
  firstName?: string;
  allowEmpty?: boolean;
};

export type ValidationResult = {
  ok: boolean;
  words: number;
  sentences: number;
  errors: string[];
};

export function validateComment(text: string | null | undefined, constraints: CommentConstraints): ValidationResult {
  const errors: string[] = [];
  const value = text ?? "";
  const words = countWords(value);
  const sentences = countSentences(value);

  if (!constraints.allowEmpty && !normalizeForCount(value)) {
    errors.push("Comment is empty.");
  }
  if (hasUnresolvedPlaceholders(value)) {
    errors.push("Unresolved placeholders remain.");
  }
  if (constraints.exactWords != null && words !== constraints.exactWords) {
    errors.push(`Expected exactly ${constraints.exactWords} words, found ${words}.`);
  }
  if (constraints.minWords != null && words < constraints.minWords) {
    errors.push(`Expected at least ${constraints.minWords} words, found ${words}.`);
  }
  if (constraints.maxWords != null && words > constraints.maxWords) {
    errors.push(`Expected at most ${constraints.maxWords} words, found ${words}.`);
  }
  if (constraints.exactSentences != null && sentences !== constraints.exactSentences) {
    errors.push(`Expected exactly ${constraints.exactSentences} sentences, found ${sentences}.`);
  }
  if (constraints.requireFirstName) {
    if (!constraints.firstName?.trim()) {
      errors.push("Learner middle name is missing.");
    } else if (!containsFirstName(value, constraints.firstName)) {
      errors.push("Co-curricular comment must mention the learner's middle name.");
    }
  }

  const uniqueSentences = splitSentences(value).map((s) => s.toLowerCase());
  if (uniqueSentences.length > 1 && new Set(uniqueSentences).size !== uniqueSentences.length) {
    errors.push("Duplicate sentences are not allowed.");
  }

  return { ok: errors.length === 0, words, sentences, errors };
}
