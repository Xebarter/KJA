// Builds the supabase/0010_student_register/ scripts from the school system export (students.csv).
// Usage: node scripts/import-students.mjs [path/to/students.csv]
// Re-run with a fresh export at any time: ids are derived from student numbers, so the SQL upserts instead of duplicating.

import { createHash } from "crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";

const SOURCE = process.argv[2] ?? "students.csv";
const OUTPUT_DIR = "supabase/0010_student_register";
/** The Supabase SQL editor struggles with large scripts, so each part stays below this. */
const PART_BYTES = 90 * 1024;
const ROWS_PER_INSERT = 100;
const AS_OF = new Date();

// ---------- CSV ----------

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const [header, ...body] = parseCsv(readFileSync(SOURCE, "latin1"));
const col = (name) => {
  const index = header.indexOf(name);
  if (index < 0) throw new Error(`Column "${name}" is missing from ${SOURCE}`);
  return index;
};
const C = {
  name: col("Student Surname"), preferred: col("Preferred Name"), formal: col("Formal Name"), number: col("Student Number"),
  grade: col("Grade"), stream: col("Stream"), house: col("House"), tutor: col("Tutor Group"), religion: col("Student Religion"),
  sex: col("Sex"), dob: col("Date of Birth"), nationality: col("Student Nationality"), language: col("1st language at Home"),
  started: col("Started at school"), transferredFrom: col("Transferred From"), graduated: col("Graduation Date"),
  transferredTo: col("Transferred To"), graduationReason: col("Graduation Reason"), indexNumber: col("Index Number"),
  med1: col("Medical Details Line1"), med2: col("Medical Details Line2"), med3: col("Medical Details Line3"),
  panadol: col("Panadol allowed"), passport: col("Passport no./ID"), mailingName: col("Parent Mailing Title"),
  street: col("Mailing Street"), town: col("Mailing Town"), country: col("State/Country"), homeAddress: col("Home Address"),
  fatherName: col("Fathers Name"), fatherNationality: col("Fathers Nationality"), fatherOccupation: col("Fathers Occupation"),
  fatherEmployer: col("Fathers Employer"), motherName: col("Mothers Name"), motherNationality: col("Mothers Nationality"),
  motherOccupation: col("Mothers Occupation"), motherEmployer: col("Mothers Employer"),
  contacts: header.map((h, i) => (/^Phone\/Email \d+$/.test(h) ? i : -1)).filter((i) => i >= 0),
};
const rows = body.filter((r) => r.length === header.length && r[C.number].trim());

// ---------- Cleaning helpers ----------

const squash = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const blank = (v) => {
  const s = squash(v);
  return !s || /^\/\s*\/$/.test(s) || /^(n\/?a|n\/l|nil|nill|none|null|no|-|0)$/i.test(s) ? "" : s;
};
const titleWord = (w) =>
  w.split(/([-'])/).map((p) => (/^[a-z]/.test(p) || (p.length > 3 && p === p.toUpperCase()) ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p)).join("");
/** Fixes ALL CAPS / all lower words but leaves deliberate casing such as "McDonald" or "KJA". */
const tidyName = (v) => squash(v).replace(/\s*-\s*/g, "-").split(" ").filter(Boolean).map(titleWord).join(" ");
const tidyPlace = (v) => tidyName(blank(v).replace(/\s*\/\s*/g, " / ").replace(/\s*,\s*/g, ", "));

function usDate(v) {
  const m = squash(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m.map(Number);
  const date = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (date.getUTCMonth() !== mm - 1 || date.getUTCDate() !== dd) return null;
  return date.toISOString().slice(0, 10);
}
const yearsBetween = (from, to) => (to.getTime() - new Date(from).getTime()) / (365.25 * 86400000);

const TITLE_NAMES = {
  mr: "Mr", mrs: "Mrs", ms: "Ms", mz: "Ms", miss: "Miss", dr: "Dr", pr: "Pastor", pastor: "Pastor", prof: "Prof", eng: "Eng",
  engr: "Eng", hon: "Hon", rev: "Rev", fr: "Fr", sr: "Sr", capt: "Capt", maj: "Maj", col: "Col", gen: "Gen", lt: "Lt",
  sheikh: "Sheikh", hajji: "Hajji", haji: "Hajji", hajjat: "Hajjat", bishop: "Bishop", amb: "Amb", justice: "Justice", madam: "Madam",
};
const TITLES = new RegExp(`^(${Object.keys(TITLE_NAMES).join("|")})\\.?(\\s+|$)`, "i");
function splitTitle(v) {
  let rest = squash(v).replace(/\.(?=\S)/g, ". ");
  const titles = [];
  let m;
  while ((m = rest.match(TITLES))) {
    titles.push(TITLE_NAMES[m[1].toLowerCase()]);
    rest = rest.slice(m[0].length);
  }
  return { title: titles.join(" ") || null, name: tidyName(rest) };
}
const nameTokens = (v) => new Set(splitTitle(v).name.toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 2));
function editDistance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = prev[j];
      prev[j] = next;
    }
  }
  return prev[b.length];
}
/** Tolerates typos such as "Okell"/"Okello" or "Barlon"/"Barlow". */
const closeWord = (s, t) =>
  s === t || (Math.min(s.length, t.length) >= 4 && (s.startsWith(t) || t.startsWith(s))) || editDistance(s, t) <= (Math.min(s.length, t.length) >= 6 ? 2 : 1);
const sharedWords = (a, b) => {
  const y = [...nameTokens(b)];
  return [...nameTokens(a)].filter((s) => y.some((t) => closeWord(s, t))).length;
};
const sameName = (a, b) => {
  const x = nameTokens(a).size, y = nameTokens(b).size;
  return x > 0 && y > 0 && sharedWords(a, b) >= Math.min(2, x, y);
};
/** A full name that has nothing in common with the parent's, e.g. another family's details pasted in. */
const someoneElse = (contactName, parentName) => nameTokens(contactName).size >= 2 && sharedWords(contactName, parentName) === 0;

const RELIGIONS = [
  [/cath|castholic|roman/i, "Catholic"],
  [/anglican|aglican|^c\.?\s*o\.?\s*u\.?$|church of uganda/i, "Anglican"],
  [/protestant|prostestant/i, "Protestant"],
  [/born\s*-?\s*again|^ba\b/i, "Born Again"],
  [/pent/i, "Pentecostal"],
  [/^sda$|adventist/i, "Seventh-day Adventist"],
  [/jeho|joho/i, "Jehovah's Witness"],
  [/orthodox/i, "Orthodox"],
  [/musl|moslem|islam/i, "Muslim"],
  [/christ/i, "Christian"],
];
function religion(v) {
  const s = blank(v);
  if (!s) return { value: null };
  for (const [re, value] of RELIGIONS) if (re.test(s)) return { value };
  return { value: null, issue: `Religion "${s}" wasn't recognised` };
}

const NATIONS = {
  ugandan: "Ugandan", uganda: "Ugandan", ugandab: "Ugandan", ugandfan: "Ugandan", uagndan: "Ugandan", ugamdan: "Ugandan",
  uandan: "Ugandan", ugadan: "Ugandan", uhgandan: "Ugandan", ugandaan: "Ugandan", american: "American", usa: "American",
  kenyan: "Kenyan", sudanese: "Sudanese", "south sudanese": "South Sudanese", british: "British", indian: "Indian",
  ghanain: "Ghanaian", ghanaian: "Ghanaian", "sierra leonean": "Sierra Leonean", swedish: "Swedish", italian: "Italian",
  rwandan: "Rwandan", tanzanian: "Tanzanian", congolese: "Congolese", burundian: "Burundian", nigerian: "Nigerian",
};
function nationality(v) {
  const s = blank(v);
  if (!s) return { value: null };
  const parts = s.split(/\s*[\/&,]\s*/).map((p) => NATIONS[p.toLowerCase()]);
  if (parts.every(Boolean)) return { value: [...new Set(parts)].join(", ") };
  return { value: null, issue: `Nationality "${s}" wasn't recognised` };
}

const OCCUPATIONS = { "b/m": "Businessman", "b/w": "Businesswoman", "business man": "Businessman", businessman: "Businessman", "bussiness man": "Businessman", "business woman": "Businesswoman", businesswoman: "Businesswoman", "i.t": "IT", hr: "HR" };
const occupation = (v) => {
  const s = blank(v);
  return s ? OCCUPATIONS[s.toLowerCase()] ?? tidyName(s) : null;
};
const employer = (v) => {
  const s = blank(v);
  if (!s) return null;
  return /^self(\s*employed)?$/i.test(s) ? "Self-employed" : squash(s);
};

// ---------- Classes, houses, staff markers ----------

// [code, name, section, order, typical age]. RC is the old system's reception group, the same age as Baby Class.
const CLASSES = [
  ["RC", "Reception Class", "nursery", 1, 3],
  ["C2", "Baby Class", "nursery", 2, 3],
  ["C3", "Middle Class", "nursery", 3, 4],
  ["C4", "Top Class", "nursery", 4, 5],
  ["P1", "Primary One", "primary", 5, 6],
  ["P2", "Primary Two", "primary", 6, 7],
  ["P3", "Primary Three", "primary", 7, 8],
  ["P4", "Primary Four", "primary", 8, 9],
  ["P5", "Primary Five", "primary", 9, 10],
  ["P6", "Primary Six", "primary", 10, 11],
  ["P7", "Primary Seven", "primary", 11, 12],
];
const classCode = (v) => {
  const s = squash(v).toUpperCase();
  return /^[1-7]$/.test(s) ? `P${s}` : CLASSES.some(([code]) => code === s) ? s : null;
};

const STAFF_MARK = /\s*\(\s*(sta?f?f?|nt)\s*\)?\s*$/i;
function staffMarker(...values) {
  for (const v of values) {
    const m = squash(v).match(STAFF_MARK);
    if (m) return /^nt$/i.test(m[1]) ? "non-teaching staff" : "staff";
  }
  return null;
}
const stripStaff = (v) => squash(v).replace(STAFF_MARK, "");

// ---------- Contacts ----------

const PHONE_RE = /\+?\d[\d-]{6,}\d(?:\s\d{3,}(?:\s\d{3,})?)?/g;
const EMAIL_RE = /[^\s@]+@[^\s@]+/;

function normalizePhone(raw) {
  const d = raw.replace(/[^\d+]/g, "");
  if (/^\+\d{11,13}$/.test(d)) return { value: d, ok: true };
  if (/^256\d{9}$/.test(d)) return { value: `+${d}`, ok: true };
  if (/^0\d{9}$/.test(d)) return { value: `+256${d.slice(1)}`, ok: true };
  if (/^[37]\d{8}$/.test(d)) return { value: `+256${d}`, ok: true };
  return { value: d, ok: false };
}

const RELATIONS = [
  ["grandparent", /\b(grand\s*(ma|pa|mother|father|parent|mama|papa|mum|dad)s?|grandma|grandpa|gra\s*(ma|pa)|jj?aj?ja)\b/],
  ["father", /\b(father|fathee|fther|dad|daddy|papa)\b/],
  ["mother", /\b(mother|motehr|mothe|mum|mom|mummy|mama|mamma)\b/],
  ["aunt", /\b(aunt|auntie|aunty|antie|anti|senga)\b/],
  ["uncle", /\b(uncle|kojja)\b/],
  ["sibling", /\b(sister|brother|sis|bro)\b/],
  ["guardian", /\b(guardian|guradian|gaurdian|guadian)\b/],
  ["driver", /\bdriver\b/],
  ["friend", /\bfriends?\b/],
  ["helper", /\b(maid|nanny|house\s*help|housemaid|helper)\b/],
  ["teacher", /\b(tr\.?|teacher)\b/],
  ["household", /\b(home|land\s*line|landline)\b/],
];
const NOISE =
  /\b(mobile|mobie|mob|cell|phone|tel|no|number|contact|work|office|home|land\s*line|landline|land|current|available|whatsapp|email|e-mail|always|alwalys|call|when|wen|late|to|of|for|the|god|granf)\b\.?/gi;
const REL_WORDS = new RegExp(RELATIONS.map(([, re]) => re.source).join("|"), "gi");

function parseContact(text, family) {
  const entry = squash(text);
  if (!entry) return { contacts: [] };
  const emailMatch = entry.match(EMAIL_RE);
  const numbers = emailMatch ? [] : entry.match(PHONE_RE) ?? [];
  let label = entry;
  if (emailMatch) label = label.replace(emailMatch[0], " ");
  for (const n of numbers) label = label.replace(n, " ");
  label = squash(label.replace(/[:;,]+$/, ""));

  if (!emailMatch && !numbers.length) return { contacts: [], unparsed: /[a-z]{2}/i.test(entry) ? entry : undefined };

  const lower = label.toLowerCase();
  let relationship = RELATIONS.find(([, re]) => re.test(lower))?.[0] ?? null;
  const person = squash(label.replace(REL_WORDS, " ").replace(NOISE, " ").replace(/[()]/g, " "));
  if (!relationship && person) {
    if (family.father && sameName(person, family.father)) relationship = "father";
    else if (family.mother && sameName(person, family.mother)) relationship = "mother";
  }
  const name = person && person.length > 1 ? tidyName(person) : null;

  if (emailMatch) {
    const value = emailMatch[0].replace(/[.,;]+$/, "").toLowerCase();
    return { contacts: [{ kind: "email", value, ok: /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value), relationship: relationship ?? "other", name, label: entry, phoneType: null }] };
  }
  const work = /\b(work|office|off)\b/i.test(label);
  return {
    contacts: numbers.map((raw) => {
      const phone = normalizePhone(raw);
      const landline = /^\+256[34]/.test(phone.value);
      return {
        kind: "phone",
        value: phone.value,
        ok: phone.ok,
        relationship: relationship ?? "other",
        name,
        label: entry,
        phoneType: work ? "work" : relationship === "household" || landline ? "landline" : "mobile",
      };
    }),
  };
}

// ---------- Families (siblings share one) ----------
// Same parents' names, or the same father and mother phones when at least one parent's name also agrees
// (the old system has copy-paste errors where one family's phones were pasted onto another's record).

const parent = {};
const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
const union = (a, b) => { parent[find(a)] = find(b); };
const nameKey = (v) => [...nameTokens(v)].sort().join(" ");

const byPhones = new Map();
for (const r of rows) {
  const id = r[C.number].trim();
  parent[id] ??= id;
  const father = nameKey(r[C.fatherName]), mother = nameKey(r[C.motherName]);
  if (father && mother) {
    const key = `names:${father}|${mother}`;
    parent[key] ??= key;
    union(id, key);
  }
  const first = (rel) =>
    C.contacts.flatMap((i) => parseContact(r[i], {}).contacts).find((c) => c.kind === "phone" && c.ok && c.relationship === rel)?.value;
  const fatherPhone = first("father"), motherPhone = first("mother");
  if (fatherPhone && motherPhone) {
    const key = `${fatherPhone}|${motherPhone}`;
    if (!byPhones.has(key)) byPhones.set(key, []);
    byPhones.get(key).push(r);
  }
}
for (const group of byPhones.values()) {
  for (const a of group) {
    for (const b of group) {
      if (a === b) continue;
      if (sameName(a[C.fatherName], b[C.fatherName]) || sameName(a[C.motherName], b[C.motherName])) union(a[C.number].trim(), b[C.number].trim());
    }
  }
}
const families = new Map();
for (const r of rows) {
  const root = find(r[C.number].trim());
  if (!families.has(root)) families.set(root, []);
  families.get(root).push(r);
}

// ---------- Build records ----------

const uuid = (key) => {
  const h = createHash("sha1").update(`kja-register:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const byNumber = (a, b) => Number(a[C.number]) - Number(b[C.number]);
const mostCommon = (values) => {
  const counts = new Map();
  for (const v of values.filter(Boolean)) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

const familyRecords = [], guardianRecords = [], contactRecords = [], studentRecords = [];
const stats = { issues: 0, unparsed: 0, checkContacts: 0, staff: 0 };

for (const members of families.values()) {
  members.sort(byNumber);
  const code = `F${members[0][C.number].trim()}`;
  const familyId = uuid(`family:${code}`);
  const pick = (index, clean = blank) => mostCommon(members.map((r) => clean(r[index])));
  const fatherRaw = pick(C.fatherName, squash), motherRaw = pick(C.motherName, squash);
  const mailingRaw = pick(C.mailingName, squash);
  const notes = [];

  const seen = new Map();
  let position = 0;
  for (const r of members) {
    for (const i of C.contacts) {
      const parsed = parseContact(r[i], { father: fatherRaw, mother: motherRaw });
      const unparsed = parsed.unparsed && `Contact in the old system with no usable number or email: "${parsed.unparsed}"`;
      if (unparsed && !notes.includes(unparsed)) {
        notes.push(unparsed);
        stats.unparsed++;
      }
      for (const c of parsed.contacts) {
        const key = `${c.kind}:${c.value}`;
        if (seen.has(key)) continue;
        seen.set(key, { ...c, position: ++position });
      }
    }
  }
  const contacts = [...seen.values()];

  for (const [relationship, nameIdx, natIdx, occIdx, empIdx] of [
    ["father", C.fatherName, C.fatherNationality, C.fatherOccupation, C.fatherEmployer],
    ["mother", C.motherName, C.motherNationality, C.motherOccupation, C.motherEmployer],
  ]) {
    const raw = relationship === "father" ? fatherRaw : motherRaw;
    if (!blank(raw)) continue;
    const { title, name } = splitTitle(raw);
    if (!name) continue;
    const labelledOther = contacts.filter((c) => c.relationship === relationship && c.name && someoneElse(c.name, raw));
    for (const c of labelledOther) {
      const note = `The ${relationship}'s contact "${c.label}" names someone other than ${name}; it wasn't set as their ${c.kind}.`;
      if (!notes.includes(note)) notes.push(note);
    }
    const own = contacts.filter((c) => c.relationship === relationship && c.ok && !labelledOther.includes(c));
    const phones = own.filter((c) => c.kind === "phone" && c.phoneType !== "work");
    const nat = nationality(pick(natIdx));
    const guardianNotes = [];
    if (nat.issue) guardianNotes.push(nat.issue.replace("Nationality", "Nationality field said"));
    guardianRecords.push({
      id: uuid(`guardian:${code}:${relationship}`),
      family_id: familyId,
      relationship,
      title,
      full_name: name,
      nationality: nat.value,
      occupation: occupation(pick(occIdx)),
      employer: employer(pick(empIdx)),
      phone: phones[0]?.value ?? null,
      phone_alt: phones[1]?.value ?? null,
      work_phone: own.find((c) => c.kind === "phone" && c.phoneType === "work")?.value ?? null,
      email: own.find((c) => c.kind === "email")?.value ?? null,
      is_primary: Boolean(mailingRaw && sameName(mailingRaw, raw)),
      notes: guardianNotes.join("\n") || null,
    });
  }

  const country = mostCommon(members.map((r) => (/^u/i.test(blank(r[C.country])) ? "Uganda" : tidyPlace(r[C.country]))));
  familyRecords.push({
    id: familyId,
    family_code: code,
    mailing_name: mailingRaw ? squash(mailingRaw) : null,
    home_area: pick(C.town, tidyPlace),
    street: pick(C.street, tidyPlace),
    home_address: pick(C.homeAddress, tidyPlace),
    country: country || null,
    notes: notes.length ? notes.join("\n") : null,
  });

  for (const c of contacts) {
    if (!c.ok) stats.checkContacts++;
    contactRecords.push({
      id: uuid(`contact:${code}:${c.kind}:${c.value}`),
      family_id: familyId,
      kind: c.kind,
      value: c.value,
      relationship: c.relationship,
      name: c.name,
      phone_type: c.phoneType,
      label: c.label,
      needs_check: !c.ok,
      position: c.position,
    });
  }

  for (const r of members) {
    const issues = [];
    const number = r[C.number].trim();
    const staff = staffMarker(r[C.name], r[C.preferred], r[C.formal]);
    if (staff) stats.staff++;
    const register = tidyName(stripStaff(r[C.name]));
    const preferred = tidyName(stripStaff(blank(r[C.preferred])));
    const formal = tidyName(stripStaff(blank(r[C.formal])));
    const [surname, ...given] = register.split(" ");
    const fullName = [...new Set([register, preferred, formal].filter(Boolean).join(" ").split(" "))].join(" ");

    let dob = usDate(r[C.dob]);
    if (!dob && blank(r[C.dob])) issues.push(`Date of birth "${squash(r[C.dob])}" couldn't be read`);
    if (dob) {
      const age = yearsBetween(dob, AS_OF);
      if (age < 1 || age > 18) {
        issues.push(`Date of birth in the old system looks wrong (${squash(r[C.dob])}, MM/DD/YYYY), so it wasn't imported`);
        dob = null;
      }
    } else if (!blank(r[C.dob])) issues.push("No date of birth in the old system");
    const enrolled = usDate(r[C.started]);
    if (dob && enrolled && enrolled < dob) issues.push("Start date is earlier than the date of birth");
    const code2 = classCode(r[C.grade]);
    if (!code2) issues.push(`Class "${squash(r[C.grade])}" wasn't recognised`);
    const typical = CLASSES.find(([code]) => code === code2)?.[4];
    if (dob && typical !== undefined && Math.abs(Math.floor(yearsBetween(dob, AS_OF)) - typical) > 2) {
      issues.push(`Age ${Math.floor(yearsBetween(dob, AS_OF))} is unusual for this class; check the date of birth (${squash(r[C.dob])} in the old system)`);
    }
    const rel = religion(r[C.religion]);
    if (rel.issue) issues.push(rel.issue);
    const nat = nationality(r[C.nationality]);
    if (nat.issue) issues.push(nat.issue);

    const medical = [C.med1, C.med2, C.med3].map((i) => blank(r[i])).filter(Boolean)
      .map((line) => (/^yes$/i.test(line) ? "Medical condition reported (no details recorded)" : line));
    const house = blank(r[C.house]);
    const tutor = blank(r[C.tutor]);
    const graduated = usDate(r[C.graduated]);
    const transferredTo = blank(r[C.transferredTo]);
    if (issues.length) stats.issues++;

    studentRecords.push({
      id: uuid(`student:${number}`),
      student_number: number,
      family_id: familyId,
      full_name: fullName,
      surname,
      given_names: given.join(" ") || null,
      preferred_name: preferred || null,
      formal_name: formal || null,
      sex: /^[MF]$/i.test(squash(r[C.sex])) ? squash(r[C.sex]).toUpperCase() : null,
      date_of_birth: dob,
      class_code: code2,
      stream: blank(r[C.stream]).toUpperCase() || null,
      house: house ? titleWord(house.toLowerCase()) : null,
      tutor_group: tutor || null,
      religion: rel.value,
      nationality: nat.value,
      home_language: blank(r[C.language]) || null,
      enrolled_on: enrolled,
      status: graduated ? "graduated" : transferredTo ? "transferred" : "active",
      left_on: graduated,
      transferred_from: blank(r[C.transferredFrom]) || null,
      transferred_to: transferredTo || null,
      exam_index_number: blank(r[C.indexNumber]) || null,
      passport_or_id: blank(r[C.passport]) || null,
      staff_child: Boolean(staff),
      staff_category: staff,
      medical_notes: medical.length ? medical.join("\n") : null,
      panadol_allowed: /^y/i.test(squash(r[C.panadol])) ? true : /^n/i.test(squash(r[C.panadol])) ? false : null,
      import_notes: issues,
    });
  }
}

// ---------- SQL ----------

const q = (v) => {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.length ? `array[${v.map(q).join(", ")}]::text[]` : "'{}'::text[]";
  return `'${String(v).replace(/'/g, "''")}'`;
};
/** One upsert statement per ROWS_PER_INSERT records, so parts can be cut between statements. */
function upserts(table, records, conflict = "id") {
  if (!records.length) return [];
  const cols = Object.keys(records[0]);
  const updates = cols.filter((c) => c !== conflict).map((c) => `${c} = excluded.${c}`).join(", ");
  const statements = [];
  for (let i = 0; i < records.length; i += ROWS_PER_INSERT) {
    const values = records.slice(i, i + ROWS_PER_INSERT).map((r) => `  (${cols.map((c) => q(r[c])).join(", ")})`).join(",\n");
    statements.push({ table, sql: `insert into public.${table} (${cols.join(", ")}) values\n${values}\non conflict (${conflict}) do update set ${updates};` });
  }
  return statements;
}

const schema = readFileSync(new URL("./student-register-schema.sql", import.meta.url), "utf8").trim();
const classes = `insert into public.school_classes (code, name, section, sort_order) values
${CLASSES.map(([code, name, section, order]) => `  (${q(code)}, ${q(name)}, ${q(section)}, ${order})`).join(",\n")}
on conflict (code) do update set name = excluded.name, section = excluded.section, sort_order = excluded.sort_order;`;

// Families must exist before the rows that point at them, so statements stay in this order.
const statements = [
  ...upserts("families", familyRecords),
  ...upserts("guardians", guardianRecords),
  ...upserts("family_contacts", contactRecords),
  ...upserts("students", studentRecords),
];
const parts = [{ name: "schema", body: `${schema}\n\n${classes}` }];
let current = null;
for (const statement of statements) {
  const size = Buffer.byteLength(statement.sql);
  if (!current || current.size + size > PART_BYTES) {
    current = { tables: [], body: "", size: 0 };
    parts.push(current);
  }
  if (!current.tables.includes(statement.table)) current.tables.push(statement.table);
  current.body += (current.body ? "\n\n" : "") + statement.sql;
  current.size += size;
}
for (const part of parts.slice(1)) part.name = part.tables.join("_and_").replace(/_/g, "-");

if (existsSync(OUTPUT_DIR)) {
  for (const file of readdirSync(OUTPUT_DIR)) if (file.endsWith(".sql")) rmSync(`${OUTPUT_DIR}/${file}`);
} else {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}
if (existsSync("supabase/0010_student_register.sql")) rmSync("supabase/0010_student_register.sql");

const stamp = AS_OF.toISOString().slice(0, 10);
const files = parts.map((part, index) => {
  const file = `${String(index + 1).padStart(2, "0")}_${part.name}.sql`;
  const last = index === parts.length - 1;
  const sql = `-- Student register, part ${index + 1} of ${parts.length}. Run the parts in order, each in its own SQL editor tab or run.
-- ${studentRecords.length} students in ${familyRecords.length} families from ${SOURCE.split(/[\\/]/).pop()}, generated by scripts/import-students.mjs on ${stamp}.
-- Do not edit by hand; re-run the script with a fresh export instead. Safe to re-run: rows are updated in place, never duplicated.
${index === 0 ? "-- Run after 0001_schema.sql and 0003_parent_portal.sql.\n" : ""}
begin;

${part.body}

commit;
${last ? `
-- Quick checks once every part has run:
--   select class_name, count(*) from public.student_directory group by 1, class_order order by class_order;
--   select student_number, full_name, import_notes from public.students where cardinality(import_notes) > 0;
--   select * from public.family_contacts where needs_check;
` : ""}`;
  writeFileSync(`${OUTPUT_DIR}/${file}`, sql);
  return { file, kb: Math.round(Buffer.byteLength(sql) / 1024) };
});

console.log(`Wrote ${files.length} parts to ${OUTPUT_DIR}/`);
for (const { file, kb } of files) console.log(`  ${file} (${kb} KB)`);
console.log(`${studentRecords.length} students, ${familyRecords.length} families (${[...families.values()].filter((f) => f.length > 1).length} with siblings), ${guardianRecords.length} parents, ${contactRecords.length} contacts`);
console.log(`${stats.staff} staff children, ${stats.issues} students with import notes, ${stats.checkContacts} contacts to check, ${stats.unparsed} unreadable contact entries`);
if (process.env.REPORT) {
  for (const s of studentRecords.filter((s) => s.import_notes.length)) console.log(" -", s.student_number, s.full_name, "::", s.import_notes.join("; "));
  console.log("relationships", Object.entries(contactRecords.reduce((m, c) => ((m[c.relationship] = (m[c.relationship] || 0) + 1), m), {})));
  console.log("no father/mother phone", guardianRecords.filter((g) => !g.phone).length, "primary", guardianRecords.filter((g) => g.is_primary).length);
  for (const f of familyRecords.filter((f) => f.notes)) console.log(" *", f.family_code, f.mailing_name, "::", f.notes.replace(/\n/g, " | "));
  console.log("biggest families", [...families.values()].sort((a, b) => b.length - a.length).slice(0, 5).map((f) => f.map((r) => r[C.name]).join(", ")));
}
