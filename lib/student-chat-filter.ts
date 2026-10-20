/** Soft blocklist for classmate chat. Flag matches; block severe ones. */
const BLOCK = [
  /\b(kill\s+yourself|kys)\b/i,
  /\b(rape|molest)\b/i,
  /\b(nigger|faggot)\b/i,
];

const FLAG = [
  /\b(stupid|idiot|shut\s*up|hate\s+you)\b/i,
  /\b(sex|nude|naked)\b/i,
  /\b(drug|weed|alcohol)\b/i,
  /\b(password|passcode)\b/i,
];

export function filterStudentChat(body: string) {
  const text = body.trim();
  if (!text) return { blocked: true, flagged: false, reason: "empty" as const };
  if (BLOCK.some((pattern) => pattern.test(text))) {
    return { blocked: true, flagged: true, reason: "blocked" as const };
  }
  if (FLAG.some((pattern) => pattern.test(text))) {
    return { blocked: false, flagged: true, reason: "flagged" as const };
  }
  return { blocked: false, flagged: false, reason: "ok" as const };
}
