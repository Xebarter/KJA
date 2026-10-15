// Uploads passport photos from student_images into the private student-photos bucket.
// Files are named by student number (0020.jpg). Postgres only stores the storage path.
// Usage: node scripts/import-student-photos.mjs [path/to/student_images/images]

import { createClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SOURCE = resolve(process.argv[2] ?? join(ROOT, "student_images", "images"));
const BUCKET = "student-photos";
const PAGE = 1000;
const WORKERS = 2;
const RETRIES = 5;

function loadEnv() {
  const files = [".env.local", ".env"];
  let loaded = false;
  for (const name of files) {
    let text = "";
    try {
      text = readFileSync(join(ROOT, name), "utf8");
    } catch {
      continue;
    }
    loaded = true;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const cut = line.indexOf("=");
      if (cut < 1) continue;
      const key = line.slice(0, cut).replace(/^export\s+/, "");
      if (process.env[key]) continue;
      let value = line.slice(cut + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
  if (!loaded) throw new Error("Add your Supabase keys to .env.local first.");
}

function digits(value) {
  return /^\d+$/.test(value) ? String(Number(value)) : "";
}

async function allStudents(supabase) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("students")
      .select("id, student_number, photo_path")
      .order("student_number")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function pool(items, size, work) {
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await work(item);
    }
  });
  await Promise.all(workers);
}

function busy(message) {
  return /too many connections|rate limit|timeout|fetch failed|503|429/i.test(message);
}

async function retry(label, work) {
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    const { error } = await work();
    if (!error) return null;
    if (attempt === RETRIES || !busy(error.message)) return error;
    await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
  }
  return new Error(label);
}

loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.");

const files = readdirSync(SOURCE, { withFileTypes: true }).filter((entry) => entry.isFile());
const photos = [];
const skipped = { html: 0, thumbs: 0, camera: 0, path: 0, other: 0 };
for (const entry of files) {
  const name = entry.name;
  const base = name.replace(/\.[^.]+$/, "");
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  if (ext === ".htm" || ext === ".html") skipped.html += 1;
  else if (name === "Thumbs.db" || ext === ".db") skipped.thumbs += 1;
  else if (ext === ".path") skipped.path += 1;
  else if (ext === ".jpg" && /^\d+$/.test(base)) photos.push({ file: name, number: base, numeric: digits(base) });
  else if (ext === ".jpg") skipped.camera += 1;
  else skipped.other += 1;
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const students = await allStudents(supabase);
const byNumber = new Map();
const byNumeric = new Map();
for (const student of students) {
  byNumber.set(student.student_number, student);
  const numeric = digits(student.student_number);
  if (numeric && !byNumeric.has(numeric)) byNumeric.set(numeric, student);
}

const unmatched = [];
const jobs = [];
for (const photo of photos) {
  const student = byNumber.get(photo.number) ?? byNumeric.get(photo.numeric);
  if (!student) {
    unmatched.push(photo.number);
    continue;
  }
  const path = `${student.id}.jpg`;
  if (student.photo_path === path) jobs.push({ ...photo, student, path, skip: true });
  else jobs.push({ ...photo, student, path, skip: false });
}

let uploaded = 0;
let already = 0;
let failed = 0;
await pool(jobs, WORKERS, async (job) => {
  if (job.skip) {
    already += 1;
    return;
  }
  const body = readFileSync(join(SOURCE, job.file));
  const uploadError = await retry(job.file, () =>
    supabase.storage.from(BUCKET).upload(job.path, body, {
      contentType: "image/jpeg",
      upsert: true,
      cacheControl: "31536000",
    }),
  );
  if (uploadError) {
    failed += 1;
    console.error("Upload failed", job.file, uploadError.message);
    return;
  }
  const error = await retry(job.file, () => supabase.from("students").update({ photo_path: job.path }).eq("id", job.student.id));
  if (error) {
    failed += 1;
    console.error("Could not save path for", job.file, error.message);
    return;
  }
  uploaded += 1;
});

console.log(`Photos in folder: ${photos.length}`);
console.log(`Uploaded: ${uploaded}`);
console.log(`Already current: ${already}`);
console.log(`No matching student: ${unmatched.length}${unmatched.length ? ` (${unmatched.slice(0, 12).join(", ")}${unmatched.length > 12 ? ", …" : ""})` : ""}`);
if (failed) console.log(`Failed: ${failed}`);
console.log(
  `Skipped: ${skipped.html} timetables, ${skipped.camera} camera dumps, ${skipped.path} .path notes, ${skipped.thumbs} thumbs, ${skipped.other} other`,
);
