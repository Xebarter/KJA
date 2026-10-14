import { AccountShell } from "@/components/account/Shell";
import { getPortal } from "@/lib/portal";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const portal = await getPortal();
  const name = portal.profile?.full_name || portal.profile?.email || "Parent";
  const role = portal.profile?.role;
  const staffLink = role === "admin"
    ? { href: "/admin", label: "Admin dashboard" }
    : role === "admissions" ? { href: "/admissions_office", label: "Admissions office" }
    : role === "accounts" ? { href: "/accounts", label: "Accounts office" } : null;
  return (
    <AccountShell name={name} unread={portal.unread} staffLink={staffLink}>
      {children}
    </AccountShell>
  );
}
