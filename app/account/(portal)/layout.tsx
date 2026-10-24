import { AccountShell } from "@/components/account/Shell";
import { isParentGuardian } from "@/lib/parent-access";
import { getPortal, getSessionUser } from "@/lib/portal";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const portal = await getPortal();
  const role = portal.profile?.role;

  const { supabase } = await getSessionUser();
  if (portal.user) {
    if (role === "student") redirect("/student");
    if (supabase && !(await isParentGuardian(supabase, portal.user.id, role))) {
      redirect("/account/unavailable");
    }
  }

  const name = portal.profile?.full_name || portal.profile?.email || "Parent";

  return (
    <AccountShell name={name} unread={portal.unread}>
      {children}
    </AccountShell>
  );
}
