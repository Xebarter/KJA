import type { SupabaseClient } from "@supabase/supabase-js";

const DAY = 24 * 3600 * 1000;
const WINDOW_DAYS = 14;
const ABANDONED_MS = 30 * 60 * 1000;
const COLUMNS =
  "id, child_name, payer_name, payer_email, campus, amount, phone, status, failure_reason, application_id, application, created_at";

/** waiting: parent hasn't approved yet · abandoned: never approved · failed: declined or errored · stuck: paid, application not created yet */
export type UnpaidState = "waiting" | "abandoned" | "failed" | "stuck";

export type UnpaidApplication = {
  id: string;
  child: string | null;
  parent: string | null;
  email: string | null;
  phone: string;
  campus: string;
  grade: string | null;
  amount: number;
  state: UnpaidState;
  reason: string | null;
  attempts: number;
  createdAt: string;
};

type Attempt = {
  id: string;
  child_name: string | null;
  payer_name: string | null;
  payer_email: string | null;
  campus: string;
  amount: number;
  phone: string;
  status: string;
  failure_reason: string | null;
  application_id: string | null;
  application: { grade?: string | null } | null;
  created_at: string;
  followed_up_at?: string | null;
};

/**
 * Admission applications whose fee hasn't been paid, one per parent and child.
 * `tracked` is false until 0009_payment_followups.sql has run, so follow-ups can't be recorded yet.
 */
export async function loadUnpaidApplications(
  supabase: SupabaseClient,
  now = Date.now(),
): Promise<{ items: UnpaidApplication[]; tracked: boolean }> {
  const since = new Date(now - WINDOW_DAYS * DAY).toISOString();
  const query = (columns: string) =>
    supabase.from("admission_payments").select(columns).gte("created_at", since).order("created_at", { ascending: false }).limit(500);

  let tracked = true;
  let result = await query(`${COLUMNS}, followed_up_at`);
  if (result.error?.code === "42703") {
    tracked = false;
    result = await query(COLUMNS);
  }
  if (result.error || !result.data) return { items: [], tracked };

  const groups = new Map<string, Attempt[]>();
  for (const row of result.data as unknown as Attempt[]) {
    const key = `${row.phone}|${(row.child_name ?? "").trim().toLowerCase()}`;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  const items: UnpaidApplication[] = [];
  for (const attempts of groups.values()) {
    if (attempts.some((row) => row.application_id)) continue;
    const paid = attempts.find((row) => row.status === "paid");
    const latest = paid ?? attempts[0];
    if (latest.followed_up_at) continue;
    const state: UnpaidState = paid
      ? "stuck"
      : latest.status === "failed"
        ? "failed"
        : now - new Date(latest.created_at).getTime() > ABANDONED_MS
          ? "abandoned"
          : "waiting";
    items.push({
      id: latest.id,
      child: latest.child_name,
      parent: latest.payer_name,
      email: latest.payer_email,
      phone: latest.phone,
      campus: latest.campus,
      grade: latest.application?.grade ?? null,
      amount: latest.amount,
      state,
      reason: state === "failed" ? latest.failure_reason : null,
      attempts: attempts.length,
      createdAt: latest.created_at,
    });
  }
  return { items, tracked };
}
