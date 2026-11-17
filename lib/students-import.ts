import type { SupabaseClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import { EMAIL } from "@/lib/office-forms";
import { STUDENT_PHOTO_BUCKET } from "@/lib/student-photos";
import {
  isClassCode,
  isStudentStatus,
  normalizePhone,
  phoneIsValid,
  todayIso,
  type StudentStatus,
} from "@/lib/students";
import {
  StudentsBookError,
  isClear,
  parseStudentsWorkbook,
  parseYesNo,
  type StudentsBookIssue,
  type StudentsBookRow,
} from "@/lib/students-workbook";

const PHOTO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export type StudentsImportPreview = {
  creates: number;
  updates: number;
  photos: number;
  skipped: number;
  ready: number;
  issues: StudentsBookIssue[];
  warnings: string[];
  sample: { row: number; name: string; action: "create" | "update"; number: string | null }[];
};

export type StudentsImportResult = {
  error?: string;
  ok?: string;
  preview?: StudentsImportPreview;
};

type Planned =
  | { kind: "create"; row: StudentsBookRow & { sheetRow: number }; name: string }
  | { kind: "update"; row: StudentsBookRow & { sheetRow: number }; name: string; id: string };

function blankable(value: string | null | undefined) {
  if (value === null || value === undefined || value === "") return undefined;
  if (isClear(value)) return null;
  return value;
}

function applyPatch(target: Record<string, unknown>, key: string, value: unknown) {
  if (value === undefined) return;
  target[key] = value;
}

async function uniqueFamilyCode(supabase: SupabaseClient, studentNumber: string) {
  const base = `F${studentNumber}`;
  const { data } = await supabase.from("families").select("family_code").like("family_code", `${base}%`);
  const taken = new Set((data || []).map((row) => row.family_code as string));
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 100; suffix += 1) if (!taken.has(`${base}-${suffix}`)) return `${base}-${suffix}`;
  return `${base}-${Date.now()}`;
}

export async function readPhotoZip(file: File | null) {
  const photos = new Map<string, { bytes: Uint8Array; contentType: string; filename: string }>();
  const warnings: string[] = [];
  if (!file || !file.size) return { photos, warnings };
  if (!/zip/i.test(file.type) && !/\.zip$/i.test(file.name)) {
    warnings.push("Photo companion must be a .zip file.");
    return { photos, warnings };
  }
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entries = Object.values(zip.files);
    for (const entry of entries) {
      if (entry.dir) continue;
      const base = entry.name.split(/[/\\]/).pop() || "";
      const match = base.match(/^(.+)\.(jpe?g|png|webp)$/i);
      if (!match) continue;
      const number = match[1].trim();
      const ext = match[2].toLowerCase();
      const contentType = PHOTO_MIME[ext];
      if (!contentType || !number) continue;
      const bytes = new Uint8Array(await entry.async("uint8array"));
      if (!bytes.byteLength) {
        warnings.push(`${base} is empty.`);
        continue;
      }
      if (bytes.byteLength > 1024 * 1024) {
        warnings.push(`${base} is larger than 1 MB and was skipped.`);
        continue;
      }
      photos.set(number.toLowerCase(), { bytes, contentType, filename: base });
    }
    if (!photos.size) warnings.push("No JPG/PNG/WebP photos named by student number were found in the zip.");
  } catch {
    warnings.push("The photos zip could not be read.");
  }
  return { photos, warnings };
}

function planRows(
  parsed: Awaited<ReturnType<typeof parseStudentsWorkbook>>,
  existingById: Map<string, { id: string; student_number: string; family_id: string | null; full_name: string }>,
  existingByNumber: Map<string, { id: string; student_number: string; family_id: string | null; full_name: string }>,
) {
  const issues = [...parsed.issues];
  const planned: Planned[] = [];
  for (const row of parsed.rows) {
    const name = [row.surname, row.given_names].filter(Boolean).join(" ") || row.student_number || `Row ${row.sheetRow}`;
    if (row.student_id) {
      const current = existingById.get(row.student_id);
      if (!current) {
        issues.push({ row: row.sheetRow, pupil: name, message: "That student ID is not on the register." });
        continue;
      }
      planned.push({ kind: "update", row, name, id: current.id });
      continue;
    }
    if (row.student_number) {
      const hit = existingByNumber.get(row.student_number.toLowerCase());
      if (hit) {
        planned.push({ kind: "update", row, name, id: hit.id });
        continue;
      }
    }
    planned.push({ kind: "create", row, name });
  }
  return { planned, issues };
}

export async function importStudentsWorkbook(input: {
  supabase: SupabaseClient;
  actorId: string;
  file: File | null;
  photosFile: File | null;
  intent: "preview" | "commit";
  log: (ids: string[], kind: string, body: string) => Promise<void>;
}): Promise<StudentsImportResult> {
  type Existing = { id: string; student_number: string; family_id: string | null; full_name: string };
  const existingById = new Map<string, Existing>();
  const existingByNumber = new Map<string, Existing>();
  let planned: Planned[] = [];
  let issues: StudentsBookIssue[] = [];

  if (input.file) {
    let parsed;
    try {
      parsed = await parseStudentsWorkbook(await input.file.arrayBuffer());
    } catch (error) {
      const message = error instanceof StudentsBookError ? error.message : "That Excel file could not be read.";
      return { error: message };
    }

    const ids = [...new Set(parsed.rows.map((row) => row.student_id).filter(Boolean))] as string[];
    const numbers = [...new Set(parsed.rows.map((row) => row.student_number).filter(Boolean))] as string[];

    if (ids.length) {
      const { data } = await input.supabase.from("students").select("id, student_number, family_id, full_name").in("id", ids);
      for (const row of data || []) existingById.set(row.id, row);
    }
    if (numbers.length) {
      const { data } = await input.supabase.from("students").select("id, student_number, family_id, full_name").in("student_number", numbers);
      for (const row of data || []) {
        existingByNumber.set(String(row.student_number).toLowerCase(), row);
        if (!existingById.has(row.id)) existingById.set(row.id, row);
      }
    }

    ({ planned, issues } = planRows(parsed, existingById, existingByNumber));
  }

  const { photos, warnings } = await readPhotoZip(input.photosFile);

  // Photos-only (or extras not on the sheet): resolve pupils by zip student numbers.
  const unresolvedPhotos = [...photos.entries()].filter(([key]) => !existingByNumber.has(key));
  if (unresolvedPhotos.length) {
    const lookupNumbers = unresolvedPhotos.map(([, photo]) =>
      photo.filename.replace(/\.(jpe?g|png|webp)$/i, ""),
    );
    const { data } = await input.supabase
      .from("students")
      .select("id, student_number, family_id, full_name")
      .in("student_number", lookupNumbers);
    for (const row of data || []) {
      existingByNumber.set(String(row.student_number).toLowerCase(), row);
      if (!existingById.has(row.id)) existingById.set(row.id, row);
    }
  }

  const creates = planned.filter((item) => item.kind === "create");
  const updates = planned.filter((item) => item.kind === "update");
  const photoMatches = [...photos.keys()].filter((key) =>
    planned.some((item) => (item.row.student_number || "").toLowerCase() === key)
    || existingByNumber.has(key),
  ).length;

  const preview: StudentsImportPreview = {
    creates: creates.length,
    updates: updates.length,
    photos: photoMatches,
    skipped: Math.max(0, photos.size - photoMatches),
    ready: planned.length,
    issues,
    warnings,
    sample: planned.slice(0, 12).map((item) => ({
      row: item.row.sheetRow,
      name: item.name,
      action: item.kind,
      number: item.row.student_number,
    })),
  };

  if (input.intent !== "commit") return { preview };
  if (issues.length) return { error: "Fix the workbook issues before saving.", preview };
  if (!planned.length && !photoMatches) {
    return { error: "Nothing to save. Add pupils in Excel or a photos zip named by student number.", preview };
  }

  const touched: string[] = [];
  for (const item of planned) {
    if (item.kind === "create") {
      const id = await createFromRow(input.supabase, item.row);
      if ("error" in id) return { error: `Row ${item.row.sheetRow} (${item.name}): ${id.error}`, preview };
      touched.push(id.id);
      existingByNumber.set((item.row.student_number || id.number).toLowerCase(), {
        id: id.id,
        student_number: id.number,
        family_id: id.familyId,
        full_name: item.name,
      });
      await input.log([id.id], "enrol", `Enrolled from Excel workbook as student ${id.number}`);
    } else {
      const result = await updateFromRow(input.supabase, item.id, item.row);
      if (result.error) return { error: `Row ${item.row.sheetRow} (${item.name}): ${result.error}`, preview };
      if (result.changed) {
        touched.push(item.id);
        await input.log([item.id], "edit", "Updated from Excel workbook");
      }
      if (item.row.student_number) {
        existingByNumber.set(item.row.student_number.toLowerCase(), {
          id: item.id,
          student_number: item.row.student_number,
          family_id: existingById.get(item.id)?.family_id ?? null,
          full_name: item.name,
        });
      }
    }
  }

  let photosSaved = 0;
  for (const [number, photo] of photos) {
    const student = existingByNumber.get(number);
    if (!student) {
      warnings.push(`No pupil matched photo ${photo.filename}.`);
      continue;
    }
    const saved = await savePhoto(input.supabase, student.id, photo.bytes, photo.contentType);
    if (saved.error) {
      warnings.push(`${photo.filename}: ${saved.error}`);
      continue;
    }
    photosSaved += 1;
    if (!touched.includes(student.id)) touched.push(student.id);
    await input.log([student.id], "edit", "Updated photo from photos zip");
  }

  const bits = [
    updates.length ? `${updates.length} updated` : null,
    creates.length ? `${creates.length} created` : null,
    photosSaved ? `${photosSaved} photo${photosSaved === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  return {
    ok: bits.length ? `Saved ${bits.join(", ")}.` : "No changes to save.",
    preview: { ...preview, photos: photosSaved, warnings },
  };
}

async function createFromRow(supabase: SupabaseClient, row: StudentsBookRow & { sheetRow: number }) {
  const surname = row.surname?.trim() || "";
  const given = row.given_names?.trim() || "";
  if (!surname || !given) return { error: "Surname and given names are required." };
  if (!row.class_code || !isClassCode(row.class_code)) return { error: "Choose a valid class code." };
  const sex = row.sex === "M" || row.sex === "F" ? row.sex : null;
  const staff = parseYesNo(row.staff_child);
  const panadol = parseYesNo(row.panadol_allowed);

  let studentNumber = row.student_number?.trim() || "";
  if (!studentNumber) {
    const { data, error } = await supabase.rpc("next_student_number");
    if (error) return { error: `Couldn't pick a student number: ${error.message}` };
    studentNumber = String(data);
  }
  const { data: clash } = await supabase.from("students").select("full_name").eq("student_number", studentNumber).maybeSingle();
  if (clash) return { error: `Student number ${studentNumber} already belongs to ${clash.full_name}.` };

  const guardians = [
    row.father_name ? { relationship: "father" as const, full_name: row.father_name, phone: row.father_phone ? normalizePhone(row.father_phone) : null, email: row.father_email?.toLowerCase() || null } : null,
    row.mother_name ? { relationship: "mother" as const, full_name: row.mother_name, phone: row.mother_phone ? normalizePhone(row.mother_phone) : null, email: row.mother_email?.toLowerCase() || null } : null,
  ].filter(Boolean) as { relationship: "father" | "mother"; full_name: string; phone: string | null; email: string | null }[];

  if (!guardians.length) return { error: "Add at least one parent (Father or Mother) for a new pupil." };
  for (const guardian of guardians) {
    if (guardian.phone && !phoneIsValid(guardian.phone)) return { error: `Check the ${guardian.relationship}'s phone number.` };
    if (guardian.email && !EMAIL.test(guardian.email)) return { error: `Check the ${guardian.relationship}'s email address.` };
  }
  if (!guardians.some((guardian) => guardian.phone)) return { error: "Add a phone number for at least one parent." };

  const code = row.family_code?.trim() || (await uniqueFamilyCode(supabase, studentNumber));
  const { data: family, error: familyError } = await supabase
    .from("families")
    .insert({
      family_code: code,
      mailing_name: row.mailing_name || guardians.map((guardian) => guardian.full_name).join(" & "),
      home_area: row.home_area,
      country: "Uganda",
    })
    .select("id")
    .single();
  if (familyError) return { error: `Family could not be saved: ${familyError.message}` };

  const { error: guardianError } = await supabase.from("guardians").insert(
    guardians.map((guardian, index) => ({ ...guardian, family_id: family.id, is_primary: index === 0, occupation: null })),
  );
  if (guardianError) return { error: `Parents could not be saved: ${guardianError.message}` };

  const status: StudentStatus = row.status && isStudentStatus(row.status) ? row.status : "active";
  const { data: student, error } = await supabase
    .from("students")
    .insert({
      surname,
      given_names: given,
      full_name: `${surname} ${given}`.trim(),
      preferred_name: blankable(row.preferred_name) ?? null,
      sex,
      date_of_birth: blankable(row.date_of_birth) ?? null,
      class_code: row.class_code,
      stream: blankable(row.stream) ?? null,
      house: blankable(row.house) ?? null,
      campus: blankable(row.campus) ?? null,
      religion: blankable(row.religion) ?? null,
      nationality: blankable(row.nationality) ?? null,
      enrolled_on: blankable(row.enrolled_on) ?? todayIso(),
      status,
      student_number: studentNumber,
      family_id: family.id,
      staff_child: staff === true,
      staff_category: staff === true ? blankable(row.staff_category) ?? null : null,
      medical_notes: blankable(row.medical_notes) ?? null,
      panadol_allowed: panadol === true || panadol === false ? panadol : null,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: student.id, number: studentNumber, familyId: family.id };
}

async function updateFromRow(supabase: SupabaseClient, id: string, row: StudentsBookRow) {
  const { data: current, error: loadError } = await supabase.from("students").select("*").eq("id", id).maybeSingle();
  if (loadError) return { error: loadError.message };
  if (!current) return { error: "This student no longer exists." };

  const patch: Record<string, unknown> = {};
  if (row.surname !== null && row.surname !== undefined && row.surname !== "") patch.surname = isClear(row.surname) ? null : row.surname;
  if (row.given_names !== null && row.given_names !== undefined && row.given_names !== "") patch.given_names = isClear(row.given_names) ? null : row.given_names;
  if (patch.surname !== undefined || patch.given_names !== undefined) {
    const surname = (patch.surname as string | null | undefined) ?? current.surname;
    const given = (patch.given_names as string | null | undefined) ?? current.given_names;
    patch.full_name = [surname, given].filter(Boolean).join(" ");
  }
  applyPatch(patch, "preferred_name", blankable(row.preferred_name));
  if (row.sex) patch.sex = isClear(row.sex) ? null : row.sex === "M" || row.sex === "F" ? row.sex : current.sex;
  applyPatch(patch, "date_of_birth", blankable(row.date_of_birth));
  if (row.class_code) {
    if (isClear(row.class_code)) patch.class_code = null;
    else if (isClassCode(row.class_code)) patch.class_code = row.class_code;
  }
  applyPatch(patch, "stream", blankable(row.stream));
  applyPatch(patch, "house", blankable(row.house));
  applyPatch(patch, "campus", blankable(row.campus));
  if (row.status) {
    if (isClear(row.status)) patch.status = "active";
    else if (isStudentStatus(row.status)) patch.status = row.status;
  }
  applyPatch(patch, "enrolled_on", blankable(row.enrolled_on));
  applyPatch(patch, "religion", blankable(row.religion));
  applyPatch(patch, "nationality", blankable(row.nationality));
  applyPatch(patch, "medical_notes", blankable(row.medical_notes));
  applyPatch(patch, "staff_category", blankable(row.staff_category));
  const staff = parseYesNo(row.staff_child);
  if (staff === true || staff === false) patch.staff_child = staff;
  if (staff === false) patch.staff_category = null;
  const panadol = parseYesNo(row.panadol_allowed);
  if (panadol === true || panadol === false) patch.panadol_allowed = panadol;
  if (panadol === "CLEAR" || (typeof panadol === "string" && isClear(String(panadol)))) patch.panadol_allowed = null;
  if (row.student_number && !isClear(row.student_number) && row.student_number !== current.student_number) {
    const { data: clash } = await supabase.from("students").select("full_name").eq("student_number", row.student_number).neq("id", id).maybeSingle();
    if (clash) return { error: `Student number ${row.student_number} already belongs to ${clash.full_name}.` };
    patch.student_number = row.student_number;
  }

  let changed = false;
  if (Object.keys(patch).length) {
    const { error } = await supabase.from("students").update(patch).eq("id", id);
    if (error) return { error: error.message };
    changed = true;
  }

  if (current.family_id) {
    const familyPatch: Record<string, unknown> = {};
    applyPatch(familyPatch, "mailing_name", blankable(row.mailing_name));
    applyPatch(familyPatch, "home_area", blankable(row.home_area));
    if (row.family_code && !isClear(row.family_code)) familyPatch.family_code = row.family_code;
    if (Object.keys(familyPatch).length) {
      await supabase.from("families").update(familyPatch).eq("id", current.family_id);
      changed = true;
    }
    for (const relationship of ["father", "mother"] as const) {
      const name = relationship === "father" ? row.father_name : row.mother_name;
      const phone = relationship === "father" ? row.father_phone : row.mother_phone;
      const email = relationship === "father" ? row.father_email : row.mother_email;
      if (!name && !phone && !email) continue;
      const { data: guardian } = await supabase
        .from("guardians")
        .select("id")
        .eq("family_id", current.family_id)
        .eq("relationship", relationship)
        .maybeSingle();
      const body = {
        full_name: name && !isClear(name) ? name : undefined,
        phone: phone ? (isClear(phone) ? null : normalizePhone(phone)) : undefined,
        email: email ? (isClear(email) ? null : email.toLowerCase()) : undefined,
      };
      const clean = Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));
      if (!Object.keys(clean).length) continue;
      if (guardian) await supabase.from("guardians").update(clean).eq("id", guardian.id);
      else if (clean.full_name) {
        await supabase.from("guardians").insert({
          family_id: current.family_id,
          relationship,
          full_name: clean.full_name,
          phone: clean.phone ?? null,
          email: clean.email ?? null,
          is_primary: relationship === "father",
        });
      }
      changed = true;
    }
  }

  return { changed };
}

async function savePhoto(supabase: SupabaseClient, id: string, bytes: Uint8Array, contentType: string) {
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const { data: current } = await supabase.from("students").select("photo_path").eq("id", id).maybeSingle();
  const path = `${id}/${Date.now()}.${ext}`;
  const bucket = supabase.storage.from(STUDENT_PHOTO_BUCKET);
  const { error: uploadError } = await bucket.upload(path, bytes, { contentType, upsert: false });
  if (uploadError) return { error: uploadError.message };
  const { error } = await supabase.from("students").update({ photo_path: path }).eq("id", id);
  if (error) {
    await bucket.remove([path]);
    return { error: error.message };
  }
  if (current?.photo_path) await bucket.remove([current.photo_path as string]);
  return { ok: true };
}
