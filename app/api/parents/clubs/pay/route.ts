import { createClient } from "@supabase/supabase-js";
import { clubPaymentStatus, startClubPayment, type ClubCartItem } from "@/lib/payments/clubs";
import { parentsApiOptions, parentsJson } from "@/lib/parents-api-cors";
import { isUuid } from "@/lib/students";

export const runtime = "nodejs";

export function OPTIONS() {
  return parentsApiOptions();
}

function userClient(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const auth = request.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!url || !key || !token) return null;
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function sessionOf(request: Request) {
  const supabase = userClient(request);
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { user: data.user, supabase };
}

function parseItems(raw: unknown): ClubCartItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as { studentId?: unknown; clubId?: unknown };
      return { studentId: String(row.studentId || ""), clubId: String(row.clubId || "") };
    })
    .filter((entry): entry is ClubCartItem => Boolean(entry));
}

/** Start a club Mobile Money collection for the signed-in parent (Parents app). */
export async function POST(request: Request) {
  const session = await sessionOf(request);
  if (!session) return parentsJson({ error: "Sign in to pay for a club." }, { status: 401 });

  let body: { studentId?: string; clubIds?: unknown; items?: unknown; phone?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return parentsJson({ error: "Send the clubs and phone number." }, { status: 400 });
  }

  const clubIds = Array.isArray(body.clubIds) ? body.clubIds.map(String) : [];
  const result = await startClubPayment(
    {
      phone: String(body.phone || ""),
      items: parseItems(body.items),
      studentId: String(body.studentId || ""),
      clubIds,
    },
    session,
  );
  if ("error" in result) return parentsJson(result, { status: 400 });
  return parentsJson(result);
}

/** Check a club collection the parent started. */
export async function GET(request: Request) {
  const session = await sessionOf(request);
  if (!session) return parentsJson({ error: "Sign in to check this payment." }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id") || "";
  if (!isUuid(id)) return parentsJson({ error: "Choose a payment to check." }, { status: 400 });

  const result = await clubPaymentStatus(id, session);
  if ("error" in result) return parentsJson(result, { status: 400 });
  return parentsJson(result);
}
