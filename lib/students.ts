import type { SupabaseClient } from "@supabase/supabase-js";

export const OFFICE = "/admissions_office";

// ---------------------------------------------------------------- types

export type StudentStatus = "active" | "graduated" | "transferred" | "withdrawn" | "left";

export type Student = {
  id: string;
  student_number: string;
  family_id: string | null;
  full_name: string;
  surname: string | null;
  given_names: string | null;
  preferred_name: string | null;
  formal_name: string | null;
  sex: "M" | "F" | null;
  date_of_birth: string | null;
  class_code: string | null;
  stream: string | null;
  house: string | null;
  tutor_group: string | null;
  campus: string | null;
  religion: string | null;
  nationality: string | null;
  home_language: string | null;
  enrolled_on: string | null;
  status: StudentStatus;
  left_on: string | null;
  left_reason: string | null;
  transferred_from: string | null;
  transferred_to: string | null;
  exam_index_number: string | null;
  passport_or_id: string | null;
  staff_child: boolean;
  staff_category: string | null;
  medical_notes: string | null;
  panadol_allowed: boolean | null;
  import_notes: string[];
  admitted_from_application: string | null;
  created_at: string;
  updated_at: string;
};

/** One row of the student_directory view: a student with class, family and parents' main contacts. */
export type DirectoryRow = {
  id: string;
  student_number: string;
  full_name: string;
  surname: string | null;
  given_names: string | null;
  preferred_name: string | null;
  sex: "M" | "F" | null;
  date_of_birth: string | null;
  age: number | null;
  class_code: string | null;
  class_name: string | null;
  section: string | null;
  class_order: number | null;
  stream: string | null;
  house: string | null;
  campus: string | null;
  status: StudentStatus;
  enrolled_on: string | null;
  left_on: string | null;
  left_reason: string | null;
  religion: string | null;
  nationality: string | null;
  staff_child: boolean;
  staff_category: string | null;
  medical_notes: string | null;
  panadol_allowed: boolean | null;
  updated_at: string;
  family_id: string | null;
  family_code: string | null;
  mailing_name: string | null;
  home_area: string | null;
  father_name: string | null;
  father_phone: string | null;
  father_email: string | null;
  mother_name: string | null;
  mother_phone: string | null;
  mother_email: string | null;
  siblings: number;
  needs_review: boolean;
};

export type Family = {
  id: string;
  family_code: string;
  mailing_name: string | null;
  home_area: string | null;
  street: string | null;
  home_address: string | null;
  country: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type GuardianRelationship = "father" | "mother" | "guardian";

export type Guardian = {
  id: string;
  family_id: string;
  relationship: GuardianRelationship;
  title: string | null;
  full_name: string;
  nationality: string | null;
  occupation: string | null;
  employer: string | null;
  phone: string | null;
  phone_alt: string | null;
  work_phone: string | null;
  email: string | null;
  is_primary: boolean;
  user_id: string | null;
  notes: string | null;
};

export type FamilyContact = {
  id: string;
  family_id: string;
  kind: "phone" | "email";
  value: string;
  relationship: string;
  name: string | null;
  phone_type: "mobile" | "work" | "landline" | null;
  label: string | null;
  needs_check: boolean;
  position: number;
};

export type StudentActivity = {
  id: string;
  student_id: string;
  actor_id: string | null;
  kind: "note" | "edit" | "class" | "status" | "enrol" | "promotion" | "review";
  body: string;
  created_at: string;
};

// ---------------------------------------------------------------- constants

export const STUDENT_STATUSES: { value: StudentStatus; label: string; tone: string; icon: string }[] = [
  { value: "active", label: "Active", tone: "done", icon: "fa-circle-check" },
  { value: "graduated", label: "Graduated", tone: "offer", icon: "fa-graduation-cap" },
  { value: "transferred", label: "Transferred", tone: "wait", icon: "fa-right-left" },
  { value: "withdrawn", label: "Withdrawn", tone: "closed", icon: "fa-door-open" },
  { value: "left", label: "Left", tone: "closed", icon: "fa-person-walking-arrow-right" },
];

export function isStudentStatus(value: string): value is StudentStatus {
  return STUDENT_STATUSES.some((status) => status.value === value);
}

export function studentStatusInfo(value: string | null | undefined) {
  return STUDENT_STATUSES.find((status) => status.value === value) ?? STUDENT_STATUSES[0];
}

/** Mirrors public.school_classes, so forms and filters don't need a round trip. */
export const SCHOOL_CLASSES = [
  { code: "RC", name: "Reception Class", section: "nursery", order: 1 },
  { code: "C2", name: "Baby Class", section: "nursery", order: 2 },
  { code: "C3", name: "Middle Class", section: "nursery", order: 3 },
  { code: "C4", name: "Top Class", section: "nursery", order: 4 },
  { code: "P1", name: "Primary One", section: "primary", order: 5 },
  { code: "P2", name: "Primary Two", section: "primary", order: 6 },
  { code: "P3", name: "Primary Three", section: "primary", order: 7 },
  { code: "P4", name: "Primary Four", section: "primary", order: 8 },
  { code: "P5", name: "Primary Five", section: "primary", order: 9 },
  { code: "P6", name: "Primary Six", section: "primary", order: 10 },
  { code: "P7", name: "Primary Seven", section: "primary", order: 11 },
] as const;

export type ClassCode = (typeof SCHOOL_CLASSES)[number]["code"];

export function isClassCode(value: string): value is ClassCode {
  return SCHOOL_CLASSES.some((entry) => entry.code === value);
}

export function className(code: string | null | undefined) {
  return SCHOOL_CLASSES.find((entry) => entry.code === code)?.name ?? code ?? "No class";
}

/** The class an application asked for ("Primary One") as a register code ("P1"). */
export function classCodeFromName(name: string | null | undefined) {
  const wanted = (name || "").trim().toLowerCase();
  return SCHOOL_CLASSES.find((entry) => entry.name.toLowerCase() === wanted || entry.code.toLowerCase() === wanted)?.code ?? "";
}

export const SECTIONS = [
  { value: "nursery", label: "Nursery" },
  { value: "primary", label: "Primary" },
] as const;

export const HOUSES = ["Bongo", "Eland", "Kudu", "Oryx"] as const;

/** Streams in use: A/B in nursery, named streams in primary. Staff can type a new one. */
export const STREAMS = ["A", "B", "JR", "LP", "PM", "TG"] as const;

export const CONTACT_RELATIONSHIPS = [
  "father", "mother", "guardian", "grandparent", "aunt", "uncle", "sibling", "driver", "friend", "helper", "teacher", "household", "other",
] as const;

export const LEAVING_ACTIONS = [
  { status: "transferred", label: "Transfer out", icon: "fa-right-left", reasonLabel: "School transferring to", verb: "Transferred" },
  { status: "withdrawn", label: "Withdraw", icon: "fa-door-open", reasonLabel: "Reason for withdrawal", verb: "Withdrew" },
  { status: "graduated", label: "Graduate", icon: "fa-graduation-cap", reasonLabel: "Note", verb: "Graduated" },
  { status: "left", label: "Mark as left", icon: "fa-person-walking-arrow-right", reasonLabel: "Reason", verb: "Marked as left" },
] as const;

// ---------------------------------------------------------------- helpers

export function cap(value: string) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

/** Matches scripts/import-students.mjs, so numbers typed in the office line up with imported ones. */
export function normalizePhone(raw: string | null | undefined) {
  const digits = (raw || "").replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (/^\+\d{11,13}$/.test(digits)) return digits;
  if (/^256\d{9}$/.test(digits)) return `+${digits}`;
  if (/^0\d{9}$/.test(digits)) return `+256${digits.slice(1)}`;
  if (/^[37]\d{8}$/.test(digits)) return `+256${digits}`;
  return digits;
}

export function phoneIsValid(raw: string | null | undefined) {
  return /^\+\d{11,13}$/.test(normalizePhone(raw));
}

/** +256772123456 reads as 0772 123 456. */
export function displayPhone(raw: string | null | undefined) {
  const phone = (raw || "").trim();
  const match = phone.match(/^\+256(\d{3})(\d{3})(\d{3})$/);
  return match ? `0${match[1]} ${match[2]} ${match[3]}` : phone;
}

export function telHref(raw: string | null | undefined) {
  const phone = normalizePhone(raw);
  return phone ? `tel:${phone}` : "";
}

export function studentAge(dob: string | null | undefined, now = new Date()) {
  if (!dob) return null;
  const birth = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  let years = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) years -= 1;
  return years >= 0 ? years : null;
}

/** Typical age on 1 January for each class, used to flag pupils who look out of place. */
export const CLASS_AGE: Record<string, number> = { RC: 3, C2: 3, C3: 4, C4: 5, P1: 6, P2: 7, P3: 8, P4: 9, P5: 10, P6: 11, P7: 12 };

export function ageOutlier(classCode: string | null | undefined, dob: string | null | undefined, now = new Date()) {
  if (!classCode || !dob || !(classCode in CLASS_AGE)) return null;
  const age = studentAge(dob, new Date(now.getFullYear(), 0, 1));
  if (age === null) return null;
  const diff = age - CLASS_AGE[classCode];
  if (Math.abs(diff) < 2) return null;
  return diff > 0 ? `${diff} years older than usual` : `${-diff} years younger than usual`;
}

/** Days until the next birthday, 0 when it's today. */
export function daysToBirthday(dob: string | null | undefined, now = new Date()) {
  if (!dob) return null;
  const [, month, day] = dob.split("-").map(Number);
  if (!month || !day) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), month - 1, day);
  if (next < today) next = new Date(now.getFullYear() + 1, month - 1, day);
  return Math.round((next.getTime() - today.getTime()) / 86_400_000);
}

/** Splits "Surname Given Names" the way the register stores names. */
export function splitName(fullName: string) {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  return { surname: words[0] ?? "", given: words.slice(1).join(" ") };
}

export function todayIso() {
  const now = new Date(Date.now() + 3 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}

/** School terms in Uganda run roughly Feb–Apr, May–Aug and Sep–Dec. */
export function termOf(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  const month = date.getMonth();
  const term = month <= 3 ? 1 : month <= 7 ? 2 : 3;
  return { year: date.getFullYear(), term, label: `${date.getFullYear()} Term ${term}` };
}

export function currentTermStart(now = new Date()) {
  const month = now.getMonth();
  const startMonth = month <= 3 ? 0 : month <= 7 ? 4 : 8;
  return new Date(Date.UTC(now.getFullYear(), startMonth, 1)).toISOString().slice(0, 10);
}

export function csvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvResponse(name: string, header: string[], rows: unknown[][]) {
  const body = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const date = new Date().toISOString().slice(0, 10);
  return new Response(`\uFEFF${body}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kja-${name}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * PostgREST puts the total in Content-Range (e.g. 0-24/120 or star-slash-total).
 * When the total is missing or "*", supabase-js sets count to NaN.
 * `count ?? 0` does not help — use this before showing summary tiles.
 */
export function exactCount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// ---------------------------------------------------------------- register filters

export const STUDENT_SORTS = [
  { value: "class", label: "Class, then name" },
  { value: "name", label: "Name A–Z" },
  { value: "number", label: "Student number" },
  { value: "newest", label: "Newest enrolments" },
  { value: "age", label: "Youngest first" },
] as const;

export const PAGE_SIZES = [25, 50, 100] as const;

export type StudentFilters = {
  q: string;
  status: string;
  section: string;
  class: string;
  stream: string;
  campus: string;
  house: string;
  sex: string;
  staff: boolean;
  medical: boolean;
  review: boolean;
  sort: (typeof STUDENT_SORTS)[number]["value"];
  size: number;
  page: number;
};

type Params = Record<string, string | string[] | undefined>;

export function pick(params: Params, key: string) {
  const value = params[key];
  return ((Array.isArray(value) ? value[0] : value) ?? "").trim();
}

export function parseStudentFilters(params: Params): StudentFilters {
  const status = pick(params, "status");
  const section = pick(params, "section");
  const cls = pick(params, "class");
  const sex = pick(params, "sex");
  const size = Number(pick(params, "size"));
  return {
    q: pick(params, "q").slice(0, 80),
    status: status === "all" || isStudentStatus(status) ? status : "active",
    section: SECTIONS.some((entry) => entry.value === section) ? section : "",
    class: isClassCode(cls) ? cls : "",
    stream: pick(params, "stream").slice(0, 20),
    campus: pick(params, "campus").slice(0, 40),
    house: pick(params, "house").slice(0, 30),
    sex: sex === "M" || sex === "F" ? sex : "",
    staff: pick(params, "staff") === "1",
    medical: pick(params, "medical") === "1",
    review: pick(params, "review") === "1",
    sort: STUDENT_SORTS.find((option) => option.value === pick(params, "sort"))?.value ?? "class",
    size: PAGE_SIZES.includes(size as (typeof PAGE_SIZES)[number]) ? size : 50,
    page: Math.max(1, Number.parseInt(pick(params, "page"), 10) || 1),
  };
}

export function studentFilterHref(filters: StudentFilters, changes: Partial<StudentFilters>, base = `${OFFICE}/students`) {
  const next = { ...filters, page: 1, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.status !== "active") params.set("status", next.status);
  if (next.section) params.set("section", next.section);
  if (next.class) params.set("class", next.class);
  if (next.stream) params.set("stream", next.stream);
  if (next.campus) params.set("campus", next.campus);
  if (next.house) params.set("house", next.house);
  if (next.sex) params.set("sex", next.sex);
  if (next.staff) params.set("staff", "1");
  if (next.medical) params.set("medical", "1");
  if (next.review) params.set("review", "1");
  if (next.sort !== "class") params.set("sort", next.sort);
  if (next.size !== 50) params.set("size", String(next.size));
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return `${base}${query ? `?${query}` : ""}`;
}

/** Safe text for PostgREST or() filters. */
export function searchNeedle(value: string) {
  return value.replace(/[%,()*\\:"']/g, " ").replace(/\s+/g, " ").trim();
}

/** The distinct words of a search, at most six of them. */
export function searchWords(value: string) {
  return [...new Set(searchNeedle(value).toLowerCase().split(" ").filter(Boolean))].slice(0, 6);
}

/** A PostgREST condition that holds when every word appears in at least one of the columns, in any order. */
export function everyWord(words: string[], columns: string[]) {
  const word = (text: string) => {
    const tests = columns.map((column) => `${column}.ilike.%${text}%`);
    return tests.length === 1 ? tests[0] : `or(${tests.join(",")})`;
  };
  return words.length === 1 ? word(words[0]) : `and(${words.map(word).join(",")})`;
}

/**
 * The register search as a PostgREST or() filter. Names match word by word in any order, so
 * "John Doe", "doe john" and "Jo Do" all find Doe John; the words must all belong to the
 * student, or all to one parent. Numbers, codes, emails and phones match as typed.
 */
export function studentSearchFilter(raw: string) {
  const needle = searchNeedle(raw);
  const words = searchWords(raw);
  if (!needle || !words.length) return "";
  const like = `%${needle}%`;
  const parts = [
    everyWord(words, ["full_name", "preferred_name"]),
    everyWord(words, ["father_name"]),
    everyWord(words, ["mother_name"]),
    everyWord(words, ["mailing_name", "home_area"]),
    `student_number.ilike.${like}`,
    `family_code.ilike.${like}`,
    `father_email.ilike.${like}`,
    `mother_email.ilike.${like}`,
  ];
  const digits = needle.replace(/\D/g, "");
  if (digits.length >= 6) {
    const tail = `%${digits.slice(-9)}%`;
    parts.push(`father_phone.ilike.${tail}`, `mother_phone.ilike.${tail}`);
  }
  return parts.join(",");
}

export function studentsQuery(
  supabase: SupabaseClient,
  filters: StudentFilters,
  columns = "*",
  options: { count?: "exact"; head?: boolean; campuses?: readonly string[] } = {},
) {
  let query = supabase.from("student_directory").select(columns, options.count ? { count: options.count, head: options.head } : {});
  if (filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.section) query = query.eq("section", filters.section);
  if (filters.class) query = query.eq("class_code", filters.class);
  if (filters.stream) query = query.eq("stream", filters.stream);
  const allowed = options.campuses;
  if (filters.campus && (!allowed || allowed.includes(filters.campus))) query = query.eq("campus", filters.campus);
  else if (allowed?.length) query = query.in("campus", allowed);
  if (filters.house) query = filters.house === "none" ? query.is("house", null) : query.eq("house", filters.house);
  if (filters.sex) query = query.eq("sex", filters.sex);
  if (filters.staff) query = query.eq("staff_child", true);
  if (filters.medical) query = query.not("medical_notes", "is", null);
  if (filters.review) query = query.eq("needs_review", true);
  const search = studentSearchFilter(filters.q);
  if (search) query = query.or(search);
  switch (filters.sort) {
    case "name":
      return query.order("full_name", { ascending: true }).order("id", { ascending: true });
    case "number":
      return query.order("student_number", { ascending: true }).order("id", { ascending: true });
    case "newest":
      return query
        .order("enrolled_on", { ascending: false, nullsFirst: false })
        .order("full_name", { ascending: true })
        .order("id", { ascending: true });
    case "age":
      return query.order("date_of_birth", { ascending: false, nullsFirst: false }).order("id", { ascending: true });
    default:
      return query
        .order("class_order", { ascending: true, nullsFirst: false })
        .order("stream", { ascending: true })
        .order("full_name", { ascending: true })
        .order("id", { ascending: true });
  }
}

/** Scope used by the Students summary tiles — ignores search, sort, page and quick toggles. */
export type StudentTileScope = {
  status: string;
  section: string;
  class: string;
  stream: string;
  house: string;
  campus: string;
  campuses?: readonly string[];
};

export type StudentTileCounts = {
  total: number;
  boys: number;
  girls: number;
  medical: number;
  staff: number;
  review: number;
};

const EMPTY_TILES: StudentTileCounts = { total: 0, boys: 0, girls: 0, medical: 0, staff: 0, review: 0 };

function asTileCounts(row: Record<string, unknown> | null | undefined): StudentTileCounts {
  if (!row) return EMPTY_TILES;
  return {
    total: exactCount(Number(row.total)),
    boys: exactCount(Number(row.boys)),
    girls: exactCount(Number(row.girls)),
    medical: exactCount(Number(row.medical)),
    staff: exactCount(Number(row.staff)),
    review: exactCount(Number(row.review)),
  };
}

function tileRpcArgs(scope: StudentTileScope) {
  const campus = scope.campus || null;
  const campuses =
    campus || !scope.campuses?.length ? null : [...scope.campuses];
  return {
    p_status: scope.status || "active",
    p_section: scope.section || null,
    p_class: scope.class || null,
    p_stream: scope.stream || null,
    p_house: scope.house || null,
    p_campus: campus,
    p_campuses: campuses,
  };
}

async function fetchStudentRegisterTiles(client: SupabaseClient, scope: StudentTileScope) {
  const { data, error } = await client.rpc("student_register_tiles", tileRpcArgs(scope));
  if (error) return { counts: null as StudentTileCounts | null, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  return { counts: asTileCounts(row as Record<string, unknown> | null), error: null };
}

function tileScopeKey(scope: StudentTileScope) {
  return [
    scope.status || "active",
    scope.section || "",
    scope.class || "",
    scope.stream || "",
    scope.house || "",
    scope.campus || "",
    [...(scope.campuses || [])].sort().join("\0"),
  ].join("|");
}

const TILE_CACHE_TTL_MS = 45_000;
const tileCountsCache = new Map<string, { at: number; counts: StudentTileCounts }>();

function readTileCache(key: string) {
  const hit = tileCountsCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TILE_CACHE_TTL_MS) {
    tileCountsCache.delete(key);
    return null;
  }
  return hit.counts;
}

function writeTileCache(key: string, counts: StudentTileCounts) {
  tileCountsCache.set(key, { at: Date.now(), counts });
  if (tileCountsCache.size > 100) {
    const oldest = tileCountsCache.keys().next().value;
    if (oldest) tileCountsCache.delete(oldest);
  }
}

/**
 * Summary tile tallies for the Students register. One RPC instead of six head counts.
 * Memoised ~45s on the tile scope (not search/sort/page) so typing in the finder
 * does not re-count. Uses the request client (RLS) — not the service role.
 */
export async function loadStudentRegisterTiles(
  supabase: SupabaseClient,
  scope: StudentTileScope,
): Promise<StudentTileCounts> {
  const key = tileScopeKey(scope);
  const cached = readTileCache(key);
  if (cached) return cached;

  const { counts, error } = await fetchStudentRegisterTiles(supabase, scope);
  if (counts) {
    writeTileCache(key, counts);
    return counts;
  }
  // Missing RPC, PostgREST cache lag, or Desktop offline — fall back quietly.
  if (
    error &&
    !/student_register_tiles|could not find the function|PGRST202|schema cache|offline|needs the network|failed to fetch|fetch failed|network/i.test(
      error,
    )
  ) {
    console.error("student_register_tiles:", error);
  }

  // Migration not applied yet — keep the register usable with six head counts.
  const filters: StudentFilters = {
    q: "",
    status: scope.status || "active",
    section: scope.section || "",
    class: scope.class || "",
    stream: scope.stream || "",
    campus: scope.campus || "",
    house: scope.house || "",
    sex: "",
    staff: false,
    medical: false,
    review: false,
    sort: "class",
    size: 50,
    page: 1,
  };
  const campusScope = { campuses: scope.campuses };
  const tally = (changes: Partial<StudentFilters>) =>
    studentsQuery(supabase, { ...filters, ...changes }, "id", { count: "exact", head: true, ...campusScope });
  const [inScope, boys, girls, medical, staff, review] = await Promise.all([
    tally({}),
    tally({ sex: "M" }),
    tally({ sex: "F" }),
    tally({ medical: true }),
    tally({ staff: true }),
    tally({ review: true }),
  ]);
  const fallback: StudentTileCounts = {
    total: exactCount(inScope.count),
    boys: exactCount(boys.count),
    girls: exactCount(girls.count),
    medical: exactCount(medical.count),
    staff: exactCount(staff.count),
    review: exactCount(review.count),
  };
  writeTileCache(key, fallback);
  return fallback;
}

/** Undici / proxy blips right after Desktop login often surface as this exact message. */
function isTransientFetchError(message: string) {
  return /fetch failed|failed to fetch|econnreset|econnrefused|etimedout|socket hang up|network|aborted|\b502\b|\b503\b|\b504\b/i.test(
    message,
  );
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Fetches every row of a query in pages, for exports and statistics on the whole register. */
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>, limit = 10000) {
  const size = 1000;
  const take = async (from: number) => {
    let lastMessage = "fetch failed";
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await build(from, from + size - 1);
      if (!error) return (data || []) as T[];
      lastMessage = error.message || lastMessage;
      if (!isTransientFetchError(lastMessage) || attempt === 2) break;
      await wait(120 * (attempt + 1));
    }
    throw new Error(lastMessage);
  };
  const first = await take(0);
  if (first.length < size || first.length >= limit) return first.slice(0, limit);

  // Remaining pages load in parallel batches so soft nav is not a long sequential waterfall.
  // Keep the batch modest - Desktop login already hydrates the proxy in parallel.
  const rows = [...first];
  const batch = 2;
  for (let from = size; from < limit; from += size * batch) {
    const offsets: number[] = [];
    for (let i = 0; i < batch && from + i * size < limit; i++) offsets.push(from + i * size);
    const pages = await Promise.all(offsets.map((offset) => take(offset)));
    for (const page of pages) {
      rows.push(...page);
      if (page.length < size) return rows.slice(0, limit);
    }
  }
  return rows.slice(0, limit);
}
