"use server";

import { revalidatePath } from "next/cache";
import { classLabel, classSection, num, streamOf } from "@/lib/academics";
import { prepareClassReports } from "@/lib/academics-reports";
import { DEFAULT_CAMPUS, isCampusId } from "@/lib/campuses";
import { OFFICE_BASE, requireOffice, refreshOffice } from "@/lib/office";
import { isClassCode } from "@/lib/students";
import { serviceClient } from "@/lib/supabase/service";

type Result = { error?: string; ok?: string; href?: string };

function text(formData: FormData, key: string, max = 200) {
  return String(formData.get(key) || "")
    .trim()
    .slice(0, max);
}

function reportGroup(formData: FormData) {
  const termId = text(formData, "term_id", 40);
  const classCode = text(formData, "class_code", 10);
  const stream = streamOf(text(formData, "stream", 8));
  const campusText = text(formData, "campus", 40);
  return { termId, classCode, stream, campus: isCampusId(campusText) ? campusText : DEFAULT_CAMPUS, campusText };
}

function reportSetsFrom(formData: FormData) {
  const keys = formData.getAll("set").map((value) => String(value || "").trim()).filter(Boolean);
  if (!keys.length) return { error: "Choose at least one assessment to include." } as const;
  const sets: { key: string; share: number }[] = [];
  for (const key of keys) {
    const share = num(String(formData.get(`share:${key}`) || ""));
    if (share === null || share <= 0) return { error: "Enter a percentage above 0 for each chosen assessment." } as const;
    sets.push({ key, share });
  }
  const total = Math.round(sets.reduce((sum, set) => sum + set.share, 0) * 10) / 10;
  if (Math.abs(total - 100) > 0.05) {
    return { error: `The shares must add up to 100%. They currently add up to ${total}%.` } as const;
  }
  return { sets } as const;
}

function streamHref(classCode: string, stream: string, campus: string) {
  const params = new URLSearchParams({ class: classCode, stream: stream || "-", campus });
  return `${OFFICE_BASE}/report-cards?${params.toString()}`;
}

async function gateNurseryStream(formData: FormData) {
  const auth = await requireOffice("report-cards");
  if ("error" in auth) return { error: auth.error } as const;
  const { termId, classCode, stream, campus, campusText } = reportGroup(formData);
  if (campusText && !isCampusId(campusText)) return { error: "Choose a valid campus." } as const;
  if (auth.campuses.length && !auth.campuses.includes(campus)) {
    return { error: "That campus is outside your office scope." } as const;
  }
  if (!termId || !classCode || !isClassCode(classCode)) return { error: "Choose a term and a nursery class." } as const;
  if (classSection(classCode) !== "nursery") {
    return { error: "Admissions can only generate nursery developmental report cards here." } as const;
  }
  const db = serviceClient() ?? auth.supabase;
  return { auth, classCode, stream, termId, campus, db } as const;
}

/** Prepare draft nursery report cards from a locked developmental sitting. Does not post/publish. */
export async function prepareAdmissionsNurseryReports(formData: FormData): Promise<Result> {
  const gated = await gateNurseryStream(formData);
  if ("error" in gated) return { error: gated.error };
  const { classCode, stream, termId, campus, db } = gated;
  const chosen = reportSetsFrom(formData);
  if ("error" in chosen) return { error: chosen.error };
  const reportTitle = text(formData, "report_title", 80);
  const href = streamHref(classCode, stream, campus);
  try {
    const result = await prepareClassReports(db, { termId, classCode, stream, campus, sets: chosen.sets, reportTitle });
    refreshOffice(`${OFFICE_BASE}/report-cards`, href);
    revalidatePath(`${OFFICE_BASE}/report-cards`);
    if (!result.prepared) {
      return { ok: "No draft cards were updated. Approved and published cards stay as they are.", href };
    }
    const warning = "warning" in result ? result.warning : undefined;
    return {
      ok: `Prepared ${result.prepared} nursery report ${result.prepared === 1 ? "card" : "cards"} for ${classLabel(classCode, stream, campus)}.${warning ? ` ${warning}` : ""} Posting for parents stays with the academics office.`.trim(),
      href,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Nursery report cards could not be prepared." };
  }
}
