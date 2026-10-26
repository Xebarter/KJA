import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  admissionFees,
  checkAdmissionPayment,
  startAdmissionPayment,
  type ApplicationDraft,
} from "@/lib/payments/admission";

export const runtime = "nodejs";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

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

function clean(value: unknown, max = 2000) {
  const text = String(value ?? "").trim().slice(0, max);
  return text === "" ? null : text;
}

/** Campus admission fees for the Parents app apply form. */
export async function GET(request: Request) {
  const session = await sessionOf(request);
  if (!session) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "";
  const token = url.searchParams.get("token") || "";
  if (!id) {
    const fees = await admissionFees();
    return NextResponse.json({ fees });
  }
  if (!token) return NextResponse.json({ error: "Choose a payment to check." }, { status: 400 });

  const result = await checkAdmissionPayment(id, token);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}

/** Start a sibling admission Mobile Money payment for the signed-in parent. */
export async function POST(request: Request) {
  const session = await sessionOf(request);
  if (!session) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  let body: {
    childName?: string;
    childDob?: string;
    campus?: string;
    grade?: string;
    message?: string;
    phone?: string;
    payPhone?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Send the child details and mobile money number." }, { status: 400 });
  }

  const { data: profile } = await session.supabase
    .from("profiles")
    .select("full_name, phone")
    .eq("id", session.user.id)
    .maybeSingle();

  const dob = clean(body.childDob, 10);
  const draft: ApplicationDraft = {
    user_id: session.user.id,
    parent_name: (profile?.full_name as string | null) || session.user.email || "Parent",
    email: session.user.email || "",
    phone: (profile?.phone as string | null) || clean(body.phone, 40),
    child_name: clean(body.childName, 200) || "",
    child_dob: dob && DATE.test(dob) ? dob : null,
    campus: clean(body.campus, 100) || "",
    grade: clean(body.grade, 100),
    message: clean(body.message),
  };

  if (!draft.parent_name) return NextResponse.json({ error: "Please enter the parent or guardian's name." }, { status: 400 });
  if (!draft.email || !EMAIL.test(draft.email)) return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  if (!draft.child_name) return NextResponse.json({ error: "Please enter the child's name." }, { status: 400 });
  if (!draft.campus) return NextResponse.json({ error: "Please choose the campus you are applying to." }, { status: 400 });

  const result = await startAdmissionPayment(draft, String(body.payPhone || body.phone || ""));
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
