import { createClient, supabaseConfigured } from "@/lib/supabase/server";
import { getContent } from "@/lib/content";
import type {
  ApplicationRow,
  ChildRow,
  ClubRow,
  FeeRow,
  MessageRow,
  NoticeRow,
  ProfileRow,
  ReportRow,
  SignupRow,
} from "@/lib/account";
import type { Article } from "@/lib/types";

async function rows<T>(query: PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  try {
    const { data } = await query;
    return data ?? [];
  } catch {
    return [];
  }
}

export async function getSessionUser() {
  if (!supabaseConfigured()) return { user: null, supabase: null };
  const supabase = await createClient();
  if (!supabase) return { user: null, supabase: null };
  const { data: { user } } = await supabase.auth.getUser();
  return { user, supabase };
}

export async function ensureProfile(userId: string, email?: string | null, fullName?: string | null) {
  const supabase = await createClient();
  if (!supabase) return;
  await supabase.from("profiles").upsert({
    id: userId,
    role: "parent",
    email: email ?? null,
    full_name: fullName ?? null,
  }, { onConflict: "id", ignoreDuplicates: true });
}

export async function getPortal() {
  const { user, supabase } = await getSessionUser();
  if (!user || !supabase) {
    return {
      user: null,
      profile: null,
      children: [] as ChildRow[],
      applications: [] as ApplicationRow[],
      reports: [] as ReportRow[],
      fees: [] as FeeRow[],
      clubs: [] as ClubRow[],
      signups: [] as SignupRow[],
      messages: [] as MessageRow[],
      notifications: [] as NoticeRow[],
      events: [] as Article[],
      unread: 0,
    };
  }

  await ensureProfile(user.id, user.email, user.user_metadata?.full_name || user.user_metadata?.name);

  const [profileRes, children, applications, clubs, signups, messages, notifications, content] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    rows<ChildRow>(supabase.from("children").select("*").eq("user_id", user.id).order("full_name")),
    rows<ApplicationRow>(supabase.from("applications").select("*").eq("user_id", user.id).order("created_at", { ascending: false })),
    rows<ClubRow>(supabase.from("clubs").select("*").eq("published", true).order("title")),
    rows<SignupRow>(supabase.from("club_signups").select("*").eq("user_id", user.id)),
    rows<MessageRow>(supabase.from("parent_messages").select("*").eq("user_id", user.id).order("created_at", { ascending: false })),
    rows<NoticeRow>(supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false })),
    getContent(),
  ]);

  const childIds = children.map((child) => child.id);
  const reports = childIds.length
    ? await rows<ReportRow>(supabase.from("student_reports").select("*").in("child_id", childIds).order("issued_on", { ascending: false }))
    : [];
  const fees = childIds.length
    ? await rows<FeeRow>(supabase.from("fee_balances").select("*").in("child_id", childIds).order("due_on", { ascending: false }))
    : [];

  const events = [...content.events]
    .filter((event) => event.starts_on)
    .sort((a, b) => String(a.starts_on).localeCompare(String(b.starts_on)));

  return {
    user,
    profile: (profileRes.data as ProfileRow | null) ?? {
      id: user.id,
      role: "parent",
      full_name: user.user_metadata?.full_name || user.user_metadata?.name || "",
      email: user.email ?? "",
      phone: "",
      address: "",
    },
    children,
    applications,
    reports,
    fees,
    clubs,
    signups,
    messages,
    notifications,
    events,
    unread: notifications.filter((item) => !item.read).length,
  };
}
