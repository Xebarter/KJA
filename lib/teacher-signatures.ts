import { existsSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isCampusId, operationalCampus } from "@/lib/campuses";
import { streamOf } from "@/lib/academics";
import { bandForClassCode } from "@/lib/subject-bands";
import { TEACHER_PHOTO_BUCKET } from "@/lib/teacher-photos";

/** Reuses teacher-photos; paths are `{staffId}/sig-{timestamp}.{ext}`. */
export const TEACHER_SIGNATURE_BUCKET = TEACHER_PHOTO_BUCKET;

export const PRINCIPAL_SIGNATURE_SRC = "/signatures/principal.png";

function campusHeadSignatureSrc(section: string, campus?: string | null) {
  const campusId = campus?.trim();
  if (!campusId || !isCampusId(campusId)) return null;
  const file = `${section}-${campusId.toLowerCase()}.png`;
  return existsSync(path.join(process.cwd(), "public", "signatures", file)) ? `/signatures/${file}` : null;
}

export function nurseryHeadSignatureSrc(campus?: string | null) {
  return campusHeadSignatureSrc("head-of-nursery", campus);
}

/** Head of section image for a primary class (P1–P3 lower, P4–P7 upper). */
export function primaryHeadSignatureSrc(classCode: string | null | undefined, campus?: string | null) {
  const section = bandForClassCode(classCode) === "lower" ? "head-of-lower-primary" : "head-of-upper-primary";
  return campusHeadSignatureSrc(section, campus);
}

const SIGNATURE_TYPES: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/**
 * Stable app URL for a teacher's report signature.
 * Pass signature_path so a replacement busts the cache.
 */
export function teacherSignatureUrl(id: string, signaturePath?: string | null) {
  if (!id || signaturePath === null || signaturePath === "") return null;
  return signaturePath
    ? `/teacher-signature/${id}?v=${encodeURIComponent(signaturePath)}`
    : `/teacher-signature/${id}`;
}

export function signatureExtension(mime: string) {
  return SIGNATURE_TYPES[mime] || null;
}

export function isSignatureFile(file: File) {
  return Boolean(SIGNATURE_TYPES[file.type]) && file.size > 0 && file.size <= 1024 * 1024;
}

export async function signatureDataUri(
  supabase: SupabaseClient,
  signaturePath: string | null | undefined,
): Promise<string | null> {
  if (!signaturePath) return null;
  const file = await supabase.storage.from(TEACHER_SIGNATURE_BUCKET).download(signaturePath);
  if (!file.data) return null;
  const bytes = Buffer.from(await file.data.arrayBuffer());
  const type = file.data.type || "image/png";
  return `data:${type};base64,${bytes.toString("base64")}`;
}

type LeadKey = {
  termId: string;
  classCode: string;
  stream: string;
  campus?: string | null;
};

type LeadSignature = {
  staffId: string;
  signaturePath: string;
};

function leadMapKey(termId: string, classCode: string, stream: string, campus?: string | null) {
  return `${termId}|${classCode}|${streamOf(stream)}|${operationalCampus(campus)}`;
}

/** Load lead class-teacher signature paths keyed by term|class|stream|campus. */
export async function loadLeadSignatureIndex(
  supabase: SupabaseClient,
  keys: LeadKey[],
): Promise<Map<string, LeadSignature>> {
  const out = new Map<string, LeadSignature>();
  const unique = new Map<string, LeadKey>();
  for (const key of keys) {
    if (!key.termId || !key.classCode) continue;
    const campus = operationalCampus(key.campus);
    const stream = streamOf(key.stream);
    unique.set(leadMapKey(key.termId, key.classCode, stream, campus), {
      termId: key.termId,
      classCode: key.classCode,
      stream,
      campus,
    });
  }
  if (!unique.size) return out;

  const termIds = [...new Set([...unique.values()].map((k) => k.termId))];
  const primary = await supabase
    .from("class_teachers")
    .select("term_id, class_code, stream, campus, staff_id, teaching_staff(signature_path)")
    .in("term_id", termIds)
    .eq("role", "lead");
  if (primary.error) {
    // Column missing until 0092 is applied — fail soft.
    if (/signature_path|schema cache|does not exist|42703/i.test(primary.error.message)) return out;
    return out;
  }
  const data = primary.data || [];

  for (const row of data) {
    const staff = row.teaching_staff as { signature_path?: string | null } | { signature_path?: string | null }[] | null;
    const staffRow = Array.isArray(staff) ? staff[0] : staff;
    const path = typeof staffRow?.signature_path === "string" ? staffRow.signature_path.trim() : "";
    const staffId = typeof row.staff_id === "string" ? row.staff_id : "";
    if (!path || !staffId) continue;
    const key = leadMapKey(
      String(row.term_id),
      String(row.class_code),
      String(row.stream || ""),
      String(row.campus || ""),
    );
    if (!unique.has(key)) continue;
    out.set(key, { staffId, signaturePath: path });
  }
  return out;
}

export function leadSignatureFromIndex(
  index: Map<string, LeadSignature>,
  key: LeadKey,
): LeadSignature | null {
  if (!key.termId || !key.classCode) return null;
  return index.get(leadMapKey(key.termId, key.classCode, key.stream, key.campus ?? null)) || null;
}

/** App URL for screen views (authenticated desks). */
export function leadSignatureAppUrl(lead: LeadSignature | null): string | null {
  if (!lead) return null;
  return teacherSignatureUrl(lead.staffId, lead.signaturePath);
}

/** Resolve the lead class teacher signature for one stream (app URL or data URI). */
export async function resolveClassTeacherSignatureSrc(
  supabase: SupabaseClient,
  opts: {
    termId: string;
    classCode: string | null | undefined;
    stream?: string | null;
    campus?: string | null;
    asDataUri?: boolean;
  },
): Promise<string | null> {
  if (!opts.termId || !opts.classCode) return null;
  const index = await loadLeadSignatureIndex(supabase, [
    {
      termId: opts.termId,
      classCode: opts.classCode,
      stream: opts.stream || "",
      campus: opts.campus,
    },
  ]);
  const lead = leadSignatureFromIndex(index, {
    termId: opts.termId,
    classCode: opts.classCode,
    stream: opts.stream || "",
    campus: opts.campus,
  });
  if (!lead) return null;
  if (opts.asDataUri) return signatureDataUri(supabase, lead.signaturePath);
  return leadSignatureAppUrl(lead);
}
