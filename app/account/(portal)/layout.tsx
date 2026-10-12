import { AccountShell } from "@/components/account/Shell";
import { getPortal } from "@/lib/portal";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const portal = await getPortal();
  const name = portal.profile?.full_name || portal.profile?.email || "Parent";
  return (
    <AccountShell name={name} unread={portal.unread}>
      {children}
    </AccountShell>
  );
}
