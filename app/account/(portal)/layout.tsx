import { AccountShell } from "@/components/account/Shell";
import { getPortal } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const portal = await getPortal();
  const name = portal.profile?.full_name || portal.profile?.email || "Parent";
  const role = portal.profile?.role;
  let staffLink = role === "admissions" ? { href: "/admissions_office", label: "Admissions office" }
    : role === "accounts" ? { href: "/accounts", label: "Accounts office" }
    : role === "academics" ? { href: "/academics_office", label: "Academics office" }
    : null;
  if (role === "staff" && portal.profile?.id) {
    const supabase = await createClient();
    const teacher = supabase
      ? await supabase.from("teaching_staff").select("id").eq("profile_id", portal.profile.id).eq("active", true).maybeSingle()
      : null;
    if (teacher?.data?.id) staffLink = { href: "/academics_office", label: "Academics office" };
  }
  return (
    <AccountShell name={name} unread={portal.unread} staffLink={staffLink}>
      {children}
    </AccountShell>
  );
}
