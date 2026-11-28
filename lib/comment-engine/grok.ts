import type {
  GeneratedUnit,
  GenerationResult,
  LearnerPromotion,
  NurserySkillLineInput,
  PerformanceProfile,
  ReportInput,
} from "./types";
import { countSentences, countWords } from "./validate";

export const GROK_ENGINE_VERSION = "grok-1.0";

const DEFAULT_GROK_URL = "https://api.x.ai/v1/chat/completions";
const DEFAULT_GROK_MODEL = "grok-3-mini";
const BATCH_SIZE = 6;
const CONCURRENCY = 3;
const REQUEST_TIMEOUT_MS = 25_000;

export type GrokCommentPair = {
  classTeacher: string | null;
  principal: string | null;
};

export type GrokLearnerRequest = {
  input: ReportInput;
  profile: PerformanceProfile;
};

export function grokApiKey(): string | null {
  const key = (process.env.XAI_API_KEY || process.env.GROK_API_KEY || "").trim();
  return key || null;
}

export function grokModel(): string {
  return (process.env.XAI_MODEL || DEFAULT_GROK_MODEL).trim() || DEFAULT_GROK_MODEL;
}

function grokEndpoint(): string {
  return (process.env.XAI_API_URL || DEFAULT_GROK_URL).trim() || DEFAULT_GROK_URL;
}

function pronounsFor(sex: string | null | undefined): string {
  const code = (sex || "").trim().toUpperCase();
  if (code === "F" || code === "FEMALE" || code === "GIRL") return "she/her";
  if (code === "M" || code === "MALE" || code === "BOY") return "he/him";
  return "use first name (gender not specified, do not guess he or she)";
}

function summarizeNurserySkills(skillLines: NurserySkillLineInput[]) {
  const byDomain = new Map<string, { strong: string[]; developing: string[]; other: string[] }>();
  for (const row of skillLines) {
    const domain = (row.domain_name || "Learning").trim();
    const desc = (row.skill_description || "").trim();
    const rating = (row.progress_label || row.progress_code || "").trim();
    if (!desc || !rating) continue;
    const bucket = byDomain.get(domain) || { strong: [], developing: [], other: [] };
    const lower = rating.toLowerCase();
    if (/exceed|master|outstand|very good|secure|consisten|independen|a\b|e\b|s\b/i.test(lower)) {
      bucket.strong.push(`${desc} (${rating})`);
    } else if (/begin|emerg|develop|support|help|need|d\b|b\b/i.test(lower)) {
      bucket.developing.push(`${desc} (${rating})`);
    } else {
      bucket.other.push(`${desc} (${rating})`);
    }
    byDomain.set(domain, bucket);
  }
  return [...byDomain.entries()].slice(0, 6).map(([domain, bucket]) => ({
    domain,
    strong: bucket.strong.slice(0, 3),
    developing: bucket.developing.slice(0, 2),
    other: bucket.strong.length || bucket.developing.length ? [] : bucket.other.slice(0, 2),
  }));
}

/** Term 3 next-class info for the prompt. Omitted (undefined) on Terms 1 and 2. */
function promotionPayload(promotion: LearnerPromotion | null | undefined) {
  if (!promotion) return undefined;
  return {
    fromClass: promotion.fromClassName || promotion.fromClass,
    toClass: promotion.toClass,
    toClassName: promotion.toClassName,
    graduating: promotion.graduating,
  };
}

export function buildLearnerPromptPayload(item: GrokLearnerRequest) {
  const { input, profile } = item;
  const clubs = (input.clubs || []).map((c) => c.trim()).filter(Boolean).slice(0, 8);
  const conduct = input.conduct?.trim() || null;
  const promotion = promotionPayload(input.promotion);

  if (input.nursery) {
    return {
      reportId: input.reportId,
      firstName: input.firstName.trim(),
      pronouns: pronounsFor(input.sex),
      section: "Nursery",
      classCode: input.classCode,
      conduct,
      clubs,
      developmentalProgress: summarizeNurserySkills(input.skillLines || []),
      promotion,
    };
  }

  return {
    reportId: input.reportId,
    firstName: input.firstName.trim(),
    pronouns: pronounsFor(input.sex),
    section: "Primary",
    classCode: input.classCode,
    overallPercent: profile.overallPercent == null ? null : Math.round(profile.overallPercent),
    academicBand: profile.academicBand,
    subjects: input.subjects
      .filter((s) => s.status === "assessed" && s.percent != null)
      .map((s) => ({
        name: s.subjectName,
        percent: Math.round(s.percent!),
      })),
    strongestSubjects: profile.strongestSubjects.map((s) => s.subjectName),
    focusSubjects: profile.weakestSubjects.map((s) => s.subjectName),
    cocurricularActivities: profile.assessedActivities.map((a) => a.activityName),
    conduct,
    clubs,
    promotion,
  };
}

const SYSTEM_PROMPT = `You write end-of-term school report card comments for Kampala Junior Academy (Primary and Nursery).

Write in warm, natural, simple everyday English that parents can easily read and appreciate.
Avoid robotic phrasing, clichés, stiff jargon, exclamation marks, or repeating the same opening across different learners in the batch.
Always use the learner's exact firstName and match their pronouns accurately. Never guess gender if not specified.

For EACH learner in the input JSON array, produce two fields:
1. "classTeacher" (Class Teacher's comment):
   - 2 to 3 short, natural sentences (about 25 to 45 words total, up to 55 when "promotion" is provided) so it fits cleanly in a 3-line report box.
   - Cover academic performance first (for Primary: overall progress, naturally naming 1-2 strong subjects and 1-2 subjects to work on if any; for Nursery: developmental progress across domains and a gentle next step).
   - Include discipline/conduct naturally ONLY if "conduct" is provided (not null). If conduct is "Needs Help" or "Fair", stay kind, constructive, and encouraging. Never invent conduct if null.
   - Include a light, natural mention of the learner's club involvement ONLY if "clubs" is non-empty (e.g. participating in Chess and Debate clubs). Never invent clubs if empty.
   - Next class (ONLY if "promotion" is provided, which happens in Term 3): include ONE natural sentence near the end.
     - If "promotion.graduating" is false, say the learner is promoted to "promotion.toClassName" next year and wish them all the best (e.g. "She is promoted to Primary Four for next year, and we wish her all the best.").
     - If "promotion.graduating" is true, congratulate them on completing "promotion.fromClass" and wish them well in their next school.
     - Promotion is not final until the new year, so write "is promoted" or "will move up", never "was promoted".
     - Never mention promotion when "promotion" is missing. Never invent a class name.
2. "principal" (Principal's comment):
   - 1 to 2 short, warm, encouraging sentences (about 10 to 22 words total) so it fits cleanly in a 2-line report box.
   - Give a concise, supportive head-of-school remark reflecting the learner's overall term and encouraging them for next term.
   - Do not repeat the Class Teacher's sentences or wording.

Return STRICT JSON matching this exact shape and nothing else:
{
  "comments": [
    {
      "reportId": "<exact reportId from input>",
      "classTeacher": "<comment>",
      "principal": "<comment>"
    }
  ]
}`;

export function sanitizeGrokComment(
  raw: unknown,
  limits: { minWords: number; maxWords: number; maxChars: number },
): string | null {
  if (typeof raw !== "string") return null;
  let text = raw
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();
  if (!text) return null;
  if (!/[.!?]$/.test(text)) text = `${text}.`;
  const words = countWords(text);
  if (words < limits.minWords || words > limits.maxWords) return null;
  if (text.length > limits.maxChars) return null;
  return text;
}

export function parseGrokBatchResponse(content: string): Map<string, GrokCommentPair> {
  const out = new Map<string, GrokCommentPair>();
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return out;
  }

  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { comments?: unknown }).comments)
      ? (parsed as { comments: unknown[] }).comments
      : [];

  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const reportId = typeof record.reportId === "string" ? record.reportId.trim() : "";
    if (!reportId) continue;
    const classTeacher = sanitizeGrokComment(record.classTeacher, {
      minWords: 10,
      maxWords: 75,
      maxChars: 420,
    });
    const principal = sanitizeGrokComment(record.principal, {
      minWords: 5,
      maxWords: 40,
      maxChars: 220,
    });
    if (classTeacher || principal) {
      out.set(reportId, { classTeacher, principal });
    }
  }
  return out;
}

async function callGrokBatch(
  items: GrokLearnerRequest[],
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, GrokCommentPair>> {
  const payloads = items.map(buildLearnerPromptPayload);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchImpl(grokEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: grokModel(),
        temperature: 0.65,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({ learners: payloads }),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(`[comment-engine/grok] API ${response.status}: ${detail.slice(0, 200)}`);
      return new Map();
    }

    const body = (await response.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) return new Map();
    return parseGrokBatchResponse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[comment-engine/grok] request failed: ${message}`);
    return new Map();
  } finally {
    clearTimeout(timer);
  }
}

/** Generate natural Class Teacher & Principal comments via xAI/Grok in small batches. */
export async function generateGrokCommentsBatch(
  items: GrokLearnerRequest[],
  options: { fetchImpl?: typeof fetch; apiKey?: string | null } = {},
): Promise<Map<string, GrokCommentPair>> {
  const result = new Map<string, GrokCommentPair>();
  const key = options.apiKey !== undefined ? options.apiKey : grokApiKey();
  if (!key || !items.length) return result;

  const batches: GrokLearnerRequest[][] = [];
  for (let index = 0; index < items.length; index += BATCH_SIZE) {
    batches.push(items.slice(index, index + BATCH_SIZE));
  }

  let cursor = 0;
  const workerCount = Math.min(CONCURRENCY, batches.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < batches.length) {
        const batch = batches[cursor++];
        if (!batch) break;
        const partial = await callGrokBatch(batch, key, options.fetchImpl);
        for (const [id, pair] of partial) result.set(id, pair);
      }
    }),
  );

  return result;
}

function makeGrokUnit(commentType: "class_teacher" | "headteacher", text: string): GeneratedUnit {
  return {
    commentType,
    subjectId: null,
    activitySlot: null,
    text,
    status: "draft",
    ruleIds: [],
    templateIds: [],
    explanation: `Generated with Grok AI (${grokModel()}).`,
    validation: {
      ok: true,
      words: countWords(text),
      sentences: countSentences(text),
      errors: [],
    },
  };
}

/** Merge Grok-generated Class Teacher and Principal comments into a deterministic GenerationResult. */
export function applyGrokToGenerationResult(
  base: GenerationResult,
  grok: GrokCommentPair | undefined,
): GenerationResult {
  if (!grok || (!grok.classTeacher && !grok.principal)) return base;

  const units = [...base.units];

  if (grok.classTeacher) {
    const nextUnit = makeGrokUnit("class_teacher", grok.classTeacher);
    const idx = units.findIndex((u) => u.commentType === "class_teacher");
    if (idx >= 0) units[idx] = nextUnit;
    else units.push(nextUnit);
  }

  if (grok.principal) {
    const nextUnit = makeGrokUnit("headteacher", grok.principal);
    const idx = units.findIndex((u) => u.commentType === "headteacher");
    if (idx >= 0) units[idx] = nextUnit;
    else units.push(nextUnit);
  }

  return {
    ...base,
    units,
    engineVersion: GROK_ENGINE_VERSION,
  };
}
