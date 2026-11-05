/** Fixed loopback ports - baked into the desktop Next client bundle. */
export const PROXY_PORT = 47321;
export const NEXT_PORT = 47322;

export const PROXY_URL = `http://127.0.0.1:${PROXY_PORT}`;
export const NEXT_URL = `http://127.0.0.1:${NEXT_PORT}`;

export const DESKTOP_COOKIE = "kja-desktop=1";
export const SESSION_PARTITION = "persist:kja";

/** Cache is fresh for this long; older entries still serve immediately then refresh. */
export const CACHE_FRESH_MS = 30_000;

/**
 * While offline, keep serving the last /auth/v1/user payload even after JWT exp.
 * Staff desks stay usable for a long stretch after disconnect; online refresh still required to renew.
 */
export const OFFLINE_AUTH_GRACE_MS = 14 * 24 * 60 * 60 * 1000;

/** Skip caching response bodies larger than this (large marksheets / directories). */
export const MAX_CACHE_BYTES = 8 * 1024 * 1024;

/** Cap of distinct GET URLs replayed at boot for the signed-in user. */
export const BOOT_REPLAY_CAP = 320;

/** Parallel upstream fetches while warming the desktop cache. */
/** Keep post-login warm-up gentle so the desks host is not wedged under load. */
export const HYDRATE_CONCURRENCY = 4;

/**
 * Critical PostgREST paths warmed first (with the user JWT) so desks can work offline
 * for a long time after a signed-in session. Keep selects modest; deep pages still
 * fill from DeskWarmup + browsing into get_log.
 */
export const CRITICAL_HYDRATE_PATHS = [
  // Shared term / calendar
  "/rest/v1/fee_terms?select=id,year,term,label,starts_on,ends_on,is_current&is_current=eq.true",
  "/rest/v1/fee_terms?select=id,year,term,label,starts_on,ends_on,is_current&order=year.desc,term.desc&limit=12",
  "/rest/v1/academic_dates?select=id,term_id,kind,title,starts_on,ends_on,class_code&order=starts_on.asc&limit=400",
  // Academics / Teacher catalogue
  "/rest/v1/subjects?select=*&active=eq.true&order=sort_order.asc",
  "/rest/v1/teaching_staff?select=id,full_name,initials,title,campus,email,phone,active&active=eq.true&order=full_name.asc",
  "/rest/v1/grade_bands?select=*&order=section.asc,sort_order.asc",
  "/rest/v1/division_bands?select=*&order=track.asc,sort_order.asc",
  "/rest/v1/class_teachers?select=id,term_id,campus,class_code,stream,staff_id&order=class_code.asc",
  "/rest/v1/subject_teachers?select=id,term_id,campus,class_code,stream,subject_id,staff_id&order=class_code.asc",
  "/rest/v1/timetable_slots?select=*&order=weekday.asc,period.asc&limit=2000",
  // Register (columns used by Admissions Overview counts + lists)
  "/rest/v1/students?select=id,student_number,full_name,surname,given_names,sex,class_code,stream,house,campus,status,family_id,date_of_birth,enrolled_on,needs_review,medical_notes,staff_child,left_on,updated_at&status=eq.active&order=full_name.asc&limit=2500",
  "/rest/v1/students?select=id,student_number,full_name,sex,class_code,stream,status,left_on,family_id&status=neq.active&order=left_on.desc.nullslast&limit=800",
  "/rest/v1/student_directory?select=id,student_number,full_name,class_code,class_name,section,class_order,stream,house,campus,status,sex,family_id,family_code,date_of_birth,enrolled_on,needs_review,medical_notes,staff_child,left_on&status=eq.active&order=class_order.asc,full_name.asc&limit=2500",
  "/rest/v1/families?select=id,family_code,mailing_name,home_area,updated_at&order=mailing_name.asc&limit=1500",
  "/rest/v1/family_contacts?select=id,family_id,needs_check&needs_check=eq.true&limit=2000",
  "/rest/v1/student_activity?select=id,actor_id,kind,body,created_at,student_id&order=created_at.desc&limit=40",
  // Admissions pipeline snapshot (live while online; readable offline after hydrate)
  "/rest/v1/applications?select=id,child_name,parent_name,grade,campus,status,created_at,visit_at,student_id&order=created_at.desc&limit=800",
  "/rest/v1/application_activity?select=id,actor_id,kind,body,created_at,application_id&order=created_at.desc&limit=40",
  // Accounts fee setup + operational snapshots
  "/rest/v1/fee_items?select=*&order=sort_order.asc",
  "/rest/v1/fee_rates?select=id,term_id,item_id,class_code,campus,amount&order=class_code.asc&limit=4000",
  "/rest/v1/discount_rules?select=*&order=sort_order.asc",
  "/rest/v1/expense_categories?select=*&order=sort_order.asc",
  "/rest/v1/expenses?select=*&order=spent_on.desc.nullslast,created_at.desc&limit=800",
  "/rest/v1/invoices?select=*&order=issued_on.desc.nullslast,created_at.desc&limit=800",
  "/rest/v1/payments?select=*&order=paid_on.desc.nullslast,created_at.desc&limit=800",
  "/rest/v1/student_balances?select=student_id,full_name,student_number,class_code,stream,campus,status,balance,family_id,class_order&order=class_order.desc.nullslast&limit=2500",
  // Clubs desk
  "/rest/v1/clubs?select=id,title,campus,meeting,section,category,fee_amount,active,published,sort_order&order=sort_order.asc,title.asc",
  "/rest/v1/club_consents?select=id,club_id,student_id,consented_at,withdrawn_at&withdrawn_at=is.null&order=consented_at.desc&limit=2000",
  "/rest/v1/club_schedules?select=id,club_id,weekday,start_time,end_time,venue,campus,notes,active&active=eq.true&order=weekday.asc,start_time.asc&limit=1000",
  "/rest/v1/club_leaders?select=id,club_id,profile_id,role,phone,active&active=eq.true&limit=500",
  // Store / Library light catalogues
  "/rest/v1/store_categories?select=id,name,sort_order,active&order=sort_order.asc",
  "/rest/v1/store_items?select=id,sku,name,unit,qty_on_hand,reorder_level,active&active=eq.true&order=name.asc&limit=1500",
  "/rest/v1/library_titles?select=id,title,authors,category&order=title.asc&limit=1500",
  // Admin CMS + system trail
  "/rest/v1/campuses?select=id,slug,title,published&order=slug.asc",
  "/rest/v1/vacancies?select=id,title,published,closes_on&order=closes_on.desc&limit=100",
  "/rest/v1/news?select=id,slug,title,published,published_at&order=published_at.desc&limit=80",
  "/rest/v1/system_logs?select=id,source,kind,severity,body,created_at,actor_id&order=created_at.desc&limit=80",
] as const;

/**
 * Hard cap for `loadURL` of the staff gate when Next was already warm.
 * Keep-warm hosts that accept TCP but never finish SSR stuck the splash at 94%.
 */
export const DESK_LOAD_TIMEOUT_MS = 8_000;

/** First paint after a cold `next` start can compile the login route - allow longer. */
export const DESK_LOAD_COLD_TIMEOUT_MS = 45_000;

/**
 * Last-resort cap after navigation starts. Prefer waiting for real page content;
 * this only prevents an infinite splash if the gate never paints.
 */
export const SPLASH_WARMUP_CAP_MS = 10_000;

/** Path the desk opens on (staff sign-in gate). */
export const DESK_ENTRY_PATH = "/admin/login";

/**
 * Collaborative desks that must prefer live Supabase while online.
 * Last successful GETs are still snapshotted so the same URLs work offline.
 */
export const LIVE_REST_TABLES = new Set([
  "applications",
  "application_activity",
  "admission_payments",
]);
