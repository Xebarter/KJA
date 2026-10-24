import { AcademicsShell } from "@/components/academics/Shell";
import { loadShellAccess } from "@/lib/dashboard-guard";
import { EMPTY_ACADEMICS_BADGES } from "@/lib/academics-nav";

/** Shell paints with the signed-in person's pages. Badges still arrive on their own request. */
export default async function AcademicsLayout({ children }: { children: React.ReactNode }) {
  const access = await loadShellAccess("academics");
  return (
    <AcademicsShell
      person={{ name: "Academics office", email: "", role: "Academics officer" }}
      badges={EMPTY_ACADEMICS_BADGES}
      office
      pages={access.known ? access.pages : null}
      canSwitch={access.canSwitch}
      home={access.home}
    >
      {children}
    </AcademicsShell>
  );
}
